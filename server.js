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
    connectionBindings = require('./iot-entities').connectionBindings,
    db = require('./iot-entities'),
    kafka = require('kafka-node'),
    redis = require('redis'),
    heartBeat = require('./lib/heartbeat');

var serverAddress = conf.ws.externalAddress + ':' + conf.ws.externalPort;

var authorizeDevice = function(token, deviceId, callback) {
    jwt.verify(token, cert, function(err, decoded) {
        if(!err) {
            if (deviceId === decoded.sub) {
                callback(true);
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


// TODO REMOVE SQL stuff
var dbconnect = function () {
    db.connect()
        .then(function() {
            server.listen(conf.ws.port, function() {
                logger.info('Server - ' + conf.ws.serverAddress +  ' is listening on port ' + conf.ws.port + '. Host externalIP: ' + conf.ws.externalAddress);
                heartBeat.start();
            });
        }).catch(function(err) {
            logger.error('An exception is thrown while connecting to database: ' + err + '\n Waiting 3 seconds to reconnect...');
            setTimeout(dbconnect, 3000);
        });
};

dbconnect();

// TODO read from config
// TODO error handling
var redisClient = redis.createClient(6379, 'redis');

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
                        authorizeDevice(messageObject.deviceToken, messageObject.deviceId, function (verified) {
                            if (verified) {
                                logger.info('Registration message received from ' + connection.remoteAddress + ' for device -  ' + messageObject.deviceId);
                                if(clients[messageObject.deviceId] && clients[messageObject.deviceId].state !== 'closed') {
                                    logger.info('Closing previous connection to ' + clients[messageObject.deviceId].remoteAddress + ' for device -  ' + messageObject.deviceId);
                                    clients[messageObject.deviceId].close(CloseReasons.CLOSE_REASON_NORMAL);
                                }
                                clients[messageObject.deviceId] = connection;

				redisClient.set('ws_' + messageObject.deviceId, serverAddress , function(err, reply) {
                                        if (err) {
                                            logger.error("Unable to update record in Redis for device - " + messageObject.deviceId + ', error: ' + JSON.stringify(err));
                                            connection.sendUTF(msgBuilder.build(msgBuilder.Errors.DatabaseError));
                                            connection.close(CloseReasons.CLOSE_REASON_NORMAL);
                                        } else {
                                            logger.debug("Record in Redis update for device - " + messageObject.deviceId);
                                            connection.sendUTF(msgBuilder.build(msgBuilder.Success.Subscribed));
                                        }
				});
                            } else {
                                logger.info("Unauthorized device " + messageObject.deviceId);
                                connection.sendUTF(msgBuilder.build(msgBuilder.Errors.InvalidToken));
                                connection.close(CloseReasons.CLOSE_REASON_POLICY_VIOLATION);
                            }
                        });
                    } else if (messageObject.type === 'actuation') {
                        logger.info("Received actuation from dashboard " + JSON.stringify(messageObject));
                        if (messageObject.credentials.username === conf.ws.username && messageObject.credentials.password === conf.ws.password) {
                            var deviceId = messageObject.body.content.deviceId;
                            if(clients[deviceId]) {
                                clients[deviceId].sendUTF(buildActuation(messageObject.body));
                                logger.info("Message sent to " + deviceId);
                            } else {
                                logger.warn("No open connection to: " + deviceId);
                            }
                        } else {
                            logger.error("Invalid credentials in message");
                        }
                    } else if (messageObject.type === 'ping') {
                        logger.debug("Sending PONG");
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
            Object.keys(clients).some(function(deviceId) {
                if(clients[deviceId] === connection) {
		    redisClient.del('dummyvalue', function(err, response) {
			if (response == 1) {
			    console.log("Removed " + deviceId + "from Redis upon disconnect.");
			} else{
                            logger.error("Cannot remove " + deviceId + " from database.");
			}
		    });
		    return true;
                }
                return false;
            });
            logger.debug('Peer ' + connection.remoteAddress + ' disconnected. Reason: ' + reasonCode + ' ' + description);
        });
    }
});
