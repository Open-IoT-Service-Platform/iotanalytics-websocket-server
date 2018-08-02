FROM node:6-alpine

RUN apk update; apk add ncurses make bash

ADD ./package.json /app/package.json
WORKDIR /app

RUN npm install

ADD . /app

EXPOSE 5000
