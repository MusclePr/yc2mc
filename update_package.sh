#!/bin/sh
yarn remove youtube-chat
cp -auv ../youtube-chat/youtube-chat-v2.2.0.tgz ./
yarn add file:./youtube-chat-v2.2.0.tgz
