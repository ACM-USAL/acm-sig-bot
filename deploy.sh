#!/bin/sh

ssh deployer@178.62.105.89 <<EOF
  cd /home/deployer/acm-sig-bot
  git fetch origin
  git reset --hard origin/master
  npm install
  echo > bot.log
  forever stop index.js
  forever start index.js
EOF
