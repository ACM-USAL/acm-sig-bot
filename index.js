const fs = require('fs');
const winston = require('winston');
const TelegramBot = require('node-telegram-bot-api');

winston.add(winston.transports.File, { filename: 'bot.log' });

const TOKEN = require('./token');
const GROUPS = require('./groups');

/// To ignore promise errors
const promise_error = function () { winston.warning('Noop: ', arguments); };

/// Get the list of groups text
const getListText = function () {
  if ( ! GROUPS.sigs.length )
    return 'No hay ningún grupo';

  return GROUPS.sigs.map(function(group) {
    return group.title + ' - ' + (group.description || 'Sin descripción');
  }).join('\n').trim();
}

/// The welcome message to send, with the group info
const WELCOME_MESSAGE = (function () {
  const template = fs.readFileSync('msg/welcome.txt', { encoding: 'UTF-8' });
  return template.replace(/\{\{sig_list\}\}/g, getListText());
} ());

const findBy = function(ary, key, val) {
  var i = 0;
  for ( ; i < ary.length; ++ i )
    if ( typeof(ary[i]) === 'object' && ary[i][key] === val )
      return ary[i];

  return null;
}

/// A command receives the original message and the text after the command
/// It's bound to the bot
const COMMANDS = {
  list: function (msg) {
    const text = getListText();
    this.sendMessage(msg.chat.id, text, { reply_to_message_id: msg.message_id }).catch(promise_error);
  },

  join: function (msg, group_title) {
    const group = findBy(GROUPS.sigs, 'title', group_title);
    if ( ! group ) {
      this.sendMessage(msg.chat.id, 'No encuentro el grupo', { reply_to_message_id: msg.message_id }).catch(promise_error);
      return;
    }

    if ( ! msg.from.username ) {
      this.sendMessage(msg.chat.id, 'Ponte un @nombre de Telegram para poder ser añadido por los miembros del grupo', { reply_to_message_id: msg.message_id }).catch(promise_error);
      return;
    }

    /// Here we should have or own telegram client using mtproto, but for now... Let's just ping the group
    this.sendMessage(group.id, 'Hey, @' + msg.from.username + ' ha solicitado entrar en el grupo! :)')
        .then(function () {
          this.sendMessage(msg.chat.id, 'Se ha avisado a ' + group_title + ' para que te añadan cuanto antes', { reply_to_message_id: msg.message_id }).catch(promise_error);
        }.bind(this))
        .catch(promise_error);
  }
}

const bot = new TelegramBot(TOKEN, { polling: true });

bot
  .getMe()
  .then(init)
  .catch(function(err) {
    winston.error('Token was not correct. Error:', err);
    process.exit(1);
  });

function init(bot_user) {
  winston.info('Token was correct! \\o/', bot_user);
  bot.on('text', function (msg) {
    winston.info('New message:', msg);

    /// If it's not a group and we haven't been @mentioned
    /// skip this
    if ( msg.chat.title !== undefined ) {
      if ( msg.text.split(/\s+/).indexOf('@' + bot_user.username) === -1 ) {
        return;
      }
    }
    const index = msg.text.indexOf('/');

    if ( index === -1 )
      return;

    const full_command = msg.text.substring(index + 1).trim();
    var args = full_command.split(' ');
    const command = args.shift().trim();

    if ( COMMANDS.hasOwnProperty(command) && typeof(COMMANDS[command]) === 'function' ) {
      COMMANDS[command].call(this, msg, args.join(' '));
    } else {
      this.sendMessage(msg.chat.id, 'No sé qué hacer \u1F615', { reply_to_message_id: msg.message_id }).catch(promise_error);
    }
  });

  /// Only welcome people to the main group,
  /// and only (of course) if the added user isn't the bot
  bot.on('new_chat_participant', function (msg) {
    if ( msg.new_chat_participant.id === bot_user.id )
      return;

    if ( msg.chat.id === GROUPS.main_group_id )
      this.sendMessage(msg.chat.id, WELCOME_MESSAGE.replace(/\{\{name\}\}/g, msg.from.first_name));
  });
}
