/**
 * Copyright (c) 2014 Intel Corporation
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

"use strict";

var redis = require('redis'),
    config = require('../../config'),
    logger = require('../../lib/logger/winstonLogger');

function RedisClient(conf) {
    var me = this;
    me.host = conf.host;
    me.port = conf.port;
    me.retryTime = conf.retryTime || 3000;
    me.retriesLimit = conf.retriesLimit || 10;
    me.connected = false;
    me.attempts = 0;

    me.connect = function() {
        if(!me.connected) {
            logger.info("Trying to establish a connection with redis server... (attempt = " + (me.attempts++) + ")");

            me.client = redis.createClient(me.port, me.host, {
                enable_offline_queue : true
            });

            me.client.on('error', function() {
                logger.error("Redis Client cannot connect.");
            });

            me.client.on('end', function() {
                logger.error("Redis Client disconnected.");
                me.connected = false;
            });

            me.client.on('connect', function(){
                logger.info('Redis Client connected on port: ' + me.port);
                me.connected = true;
            });
        }
    };

    me.subscribe = function(channel) {
        if(!me.connected) {
            if(me.attempts < me.retriesLimit) {
                me.connect();
                setTimeout(function() {
                    me.subscribe(channel);
                }, me.retryTime);
            } else {
                logger.error('Cannot connect to redis server - ' + me.host + ':' + me.port + '. Actuation cannot be sent');
            }
        } else {
            me.attempts = 0;
            logger.info('Subscribing to channel => ' + channel + ' channel');
            me.client.subscribe(channel);
        }
    };

    me.onMessage = function(callback) {
        if ( callback ) {
            me.client.on('message', function (channel, message) {
                callback(channel, JSON.parse(message));
            });
        }
    };

    return me;
}


var client = null;
exports.redisClient = function () {
    if ( !client ) {
        client = new RedisClient(config.redis, logger);
    }
    return client;
};
