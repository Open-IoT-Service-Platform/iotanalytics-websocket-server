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

// Gets the config for the configName from the OISP_WEBSOCKET_SERVER_CONFIG environment variable
// Returns empty object if the config can not be found
var getOISPConfig = (function () {
    if (!process.env.OISP_WEBSOCKET_SERVER_CONFIG) {
        console.log("Root config environment variable (OISP_WEBSOCKET_SERVER_CONFIG) is missing...");
        return function () { return {}; };
    }
    var websocketServerConfig = JSON.parse(process.env.OISP_WEBSOCKET_SERVER_CONFIG);

    var resolveConfig = function (config, stack) {
        if (!stack) {
            stack = ["OISP_WEBSOCKET_SERVER_CONFIG"];
        }
        for (var property in config) {
            if (typeof config[property] === "string" &&
					(config[property].substring(0,2) === "@@" || config[property].substring(0,2) === "%%")) {
                var configName = config[property].substring(2, config[property].length);
                if (!process.env[configName]) {
                    console.log("Config environment variable (" + configName + ") is missing...");
                    config[property] = {};
                } else if (stack.indexOf(configName) !== -1) {
                    console.log("Detected cyclic reference in config decleration: " + configName + ", stopping recursion...");
                    config[property] = {};
                } else {
                    config[property] = JSON.parse(process.env[configName]);
                    stack.push(configName);
                    resolveConfig(config[property], stack);
                    stack.pop();
                }
            }
        }
    };

    resolveConfig(websocketServerConfig);

    return function(configName) {
        if (!websocketServerConfig[configName])
        {return {};}
        else {
            console.log(configName + " is set to: " + JSON.stringify(websocketServerConfig[configName]));
            return websocketServerConfig[configName];
        }
    };
})();

var websocketUser_config = getOISPConfig("websocketUserConfig"),
    kafka_config = getOISPConfig("kafkaConfig"),
    redis_config = getOISPConfig("redisConfig"),
    uri = getOISPConfig("uri"),
    keycloak_config = getOISPConfig("keycloakConfig"),
    winston = require('winston'),
    os = require('os');

var config = {
    redis:{
        host: redis_config.hostname,
        password: redis_config.password,
        port: redis_config.port
    },
    kafka: {
        uri: kafka_config.uri,
        topicsHeartbeatName: kafka_config.topicsHeartbeatName,
        topicsHeartbeatInterval: kafka_config.topicsHeartbeatInterval
    },
    ws: {
        externalAddress: uri,
        //Until TAP platform won't supper unsecure websocket connection, we can only use 443 port
        externalPort: 5000,
        serverAddress: os.hostname(),
        port: 5000,
        username: websocketUser_config.username,
        password: websocketUser_config.password
    },
    logger: {
        format : winston.format.combine(
        	        winston.format.colorize(),
        	        winston.format.simple(),
        	        winston.format.timestamp(),
        	        winston.format.printf(info => { return `${info.timestamp}-${info.level}: ${info.message}`; })
        	     ),
        transports : [new winston.transports.Console()],
        level: process.env.DEBUG || "info"
    },
    keycloak: {
        realm: keycloak_config.realm,
        "auth-server-url": keycloak_config["auth-server-url"],
        "bearer-only": true,
        resource: keycloak_config["websocket-server-id"],
        credentials: {
            secret: keycloak_config["websocket-server-secret"]
        },
        "ssl-required": keycloak_config["ssl-required"],
        "confidential-port": 0,
        "verify-token-audience": true
    }
};

config.ws.externalPort = config.ws.port;
config.ws.externalAddress = config.ws.serverAddress + '.websocket-server';

module.exports = config;
