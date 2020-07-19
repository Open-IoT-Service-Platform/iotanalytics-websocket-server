#!/usr/bin/env node
/**
 * Copyright (c) 2015 Intel Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

var websocket = require('websocket'),
    WebSocketServer = websocket.server,
    CloseReasons = websocket.connection,
    http = require('http'),
    fs = require('fs'),
    jwt = require('jsonwebtoken'),
    conf = require('./config'),
    logger = require('./lib/logger/winstonLogger'),
    cert = fs.readFileSync(__dirname + '/keys/public.pem'),
    msgBuilder = require('./errors'),
    heartBeat = require('./lib/heartbeat'),
    redisClient = require('./iot-entities').redisClient;

var authorizeDevice = function(token, deviceId, callback) {
    jwt.verify(token, cert, function(err, decoded) {
        if(!err) {
            if (deviceId === decoded.sub) {
                callback(decoded.accounts[0].id);
            } else {
                callback(false);
            }
        } else {
            logger.error('Unable to verify device token, error: ' + err);
            callback(false);
        }
    });
};

http.globalAgent.maxSockets = 1024;
var server = http.createServer(function(request, response) {
    logger.debug('Received unknown request for ' + request.url);
    response.writeHead(404);
    response.end();
});

server.listen(conf.ws.port, function() {
    logger.info('Server - ' + conf.ws.serverAddress +  ' is listening on port ' + conf.ws.port + '. Host externalIP: ' + conf.ws.externalAddress);
    heartBeat.start();
});

var clients = {};

var wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false
});

var parseMessage = function (msg, callback) {
    try {
        var messageObject = JSON.parse(msg);
        callback(null, messageObject);
    } catch (err) {
        callback('Wrong message format, msg: ' + msg);
    }
};

var buildActuation = function(content) {
    return JSON.stringify({code: 1024, content: content});
};

wsServer.on('request', function(request) {
    if (request.requestedProtocols.indexOf('echo-protocol') === -1) {
        request.reject();
        logger.error('Connection refused.');
    } else {
        var connection = request.accept('echo-protocol');
        logger.debug('Connection accepted from: ' + connection.remoteAddress);
        connection.on('message', function (message) {
            parseMessage(message.utf8Data, function parseResult(err, messageObject) {
                if (!err) {
                    if (messageObject.type === 'device') {
                        authorizeDevice(messageObject.deviceToken, messageObject.deviceId, function (accountId) {
                            if (accountId) {                             
                                logger.debug('Registration message received from ' + connection.remoteAddress + ' for device -  ' + messageObject.deviceId);
                                var channel = accountId + "/" + messageObject.deviceId;
                                if(clients[channel] && clients[channel].state !== 'closed') {
                                    logger.info('Closing previous connection to ' + clients[channel].remoteAddress + ' for device -  ' + messageObject.deviceId);
                                    clients[channel].close(CloseReasons.CLOSE_REASON_NORMAL);
                                }
                                clients[channel] = connection;
                                logger.info('Subscribing to ' + channel + ' channel');  

                                redisClient.subscribe(channel);
                                redisClient.onMessage(function (channel, message) {
                                    // nodejs pubsub redis client is not filtering the messages by channels.
                                    // That means: Every message arrives here, independent of the registered channel.
                                    // We have to check whether the message is meant for us
                                    if (message === undefined || message.body === undefined || message.body.content === undefined ||
                                      message.body.content.domainId === undefined || message.body.content.domainId !== accountId){
                                        return;
                                    }
                                    logger.info('Receiving Redis message for ' + channel + ' channel');
                                    if (message.type === 'actuation') {
                                        if (message.credentials.username === conf.ws.username && 
                                            message.credentials.password === conf.ws.password) {
                                            if(clients[channel]) {
                                                clients[channel].sendUTF(buildActuation(message.body));
                                                logger.info("Message sent to " + messageObject.deviceId);
                                            } else {
                                                logger.warn("No open connection to: " + messageObject.deviceId);
                                            }
                                        } else {
                                            logger.error("Invalid credentials in message");
                                        }
                                    }
                                    else  {
                                        logger.error("Invalid message object type - " + message.type);
                                    }
                                });  
                            } else {
                                logger.info("Unauthorized device " + messageObject.deviceId);
                                connection.sendUTF(msgBuilder.build(msgBuilder.Errors.InvalidToken));
                                connection.close(CloseReasons.CLOSE_REASON_POLICY_VIOLATION);
                            }
                        });
                    } 
                    else if (messageObject.type === 'ping') {
                        logger.info("Sending PONG");
                        connection.sendUTF(msgBuilder.build(msgBuilder.Success.Pong));
                    } else {
                        logger.error("Invalid message object type - " + messageObject.type);
                    }
                } else {
                    logger.error(err);
                    connection.sendUTF(msgBuilder.build(msgBuilder.Errors.WrongDataFormat));
                    connection.close(CloseReasons.CLOSE_REASON_UNPROCESSABLE_INPUT);
                }
            });
        });

        connection.on('close', function(reasonCode, description) {
            logger.info("Disconnected from client ");
            Object.keys(clients).some(function(channel) {
                if(clients[channel] === connection) {
                    redisClient.unsubscribe(channel);
                    delete clients[channel];
                    return true;
                }
                return false;
            });
            logger.debug('Peer ' + connection.remoteAddress + ' disconnected. Reason: ' + reasonCode + ' ' + description);
        });
    }
});
