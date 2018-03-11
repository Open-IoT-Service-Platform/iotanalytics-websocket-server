FROM node:4.8.3

WORKDIR /app

RUN npm cache clean
RUN npm install

EXPOSE 5000
