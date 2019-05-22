/**
 * Copyright (c) 2018 Intel Corporation
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
var Kafka = require('kafka-node'),
    logger = require('../lib/logger/winstonLogger'),
    kafka_config = require('../config').kafka,
    kafkaProducer = null,
    heartBeatInterval = null;

var heartBeat = function() {
    if ( kafkaProducer != null) {
        try {
            console.log("Sending heartbeat ...");
            kafkaProducer.send([
                {
                    topic: kafka_config.topicsHeartbeatName,
                    partition: 0,
                    messages: "websocket-server"
                }
            ], function (err) {
                if (err) {
                    logger.error("Error when sending heartbear message to Kafka: " + JSON.stringify(err));
                }
            });
        } catch(exception) {
            logger.error("Exception occured when sending heartbear message to Kafka: " + exception);
        }
    }
};

exports.start = function () {
    if ( kafkaProducer === null ) {
        var kafkaClient;
        try {
            kafkaClient = new Kafka.KafkaClient({kafkaHost: kafka_config.uri});
        } catch (exception) {
            logger.error("Exception occured creating Kafka Client: " + exception);
        }
        try {
            kafkaProducer = new Kafka.HighLevelProducer(kafkaClient, {
                requireAcks: 1, // 1 = Leader ack required
                ackTimeoutMs: 500
            });
        } catch (exception) {
            logger.error("Exception occured creating Kafka Producer: " + exception);
        }
    }

    heartBeat();
    heartBeatInterval = setInterval( function () {
        heartBeat();
    }, parseInt(kafka_config.topicsHeartbeatInterval));
};

exports.stop = function () {
    if ( heartBeatInterval != null ) {
        clearInterval(heartBeatInterval);
    }
};
