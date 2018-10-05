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

var cfenvReader = require('./lib/cfenv/reader');
var postgres_credentials = cfenvReader.getServiceCredentials("mypostgres");
var websocket_credentials = cfenvReader.getServiceCredentials('websocket-ups');
var winston = require('winston');

var config = {
    postgres: {
        database: postgres_credentials.dbname,
        username: postgres_credentials.username,
        password: postgres_credentials.password,
        options: {
            host: postgres_credentials.hostname,
            port: postgres_credentials.port,
            dialect: 'postgres',
            pool: {
                max: 12,
                min: 0,
                idle: 10000
            }
        }
    },
    "ws": {
        "externalAddress": cfenvReader.getApplicationUri(),
        //Until TAP platform won't supper unsecure websocket connection, we can only use 443 port
        "externalPort": 5000,
        "serverAddress": cfenvReader.getHost(),
        "port": 5000,
        "username": websocket_credentials.username,
        "password": websocket_credentials.password
    },
    "logger": {
        format : winston.format.combine(
        	        winston.format.colorize(),
        	        winston.format.simple(),
        	        winston.format.timestamp(),
        	        winston.format.printf(info => { return `${info.timestamp}-${info.level}: ${info.message}`; })
        	     ),
        transports : [new winston.transports.Console()]                  
    }
};

if (process.env.NODE_ENV && (process.env.NODE_ENV.toLowerCase().indexOf("local") !== -1)) {
    config.ws.externalAddress = config.ws.serverAddress;
    config.ws.externalPort = config.ws.port;
}


module.exports = config;
