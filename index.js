const fs = require('fs');
const winston = require('winston');
var TelegramBot = require('node-telegram-bot-api');

winston.add(winston.transports.File, { filename: 'bot.log' });

const TOKEN = require('./token');
const GROUPS = require('./groups');

/// To ignore promise errors
const promise_error = function () { winston.warn('Noop: ', [].slice.call(arguments)); };

/// Get the list of groups text
const LIST_TEXT = (function () {
  if ( ! GROUPS.sigs.length )
    return 'No hay ningún grupo';

  return GROUPS.sigs.map(function(group) {
    return group.title + ' - ' + (group.description || 'Sin descripción');
  }).join('\n').trim();
} ());

/// The welcome message to send, with the group info
const WELCOME_MESSAGE = (function () {
  const template = fs.readFileSync('msg/welcome.txt', { encoding: 'UTF-8' });
  return template.replace(/\{\{sig_list\}\}/g, LIST_TEXT);
} ());

/// Help message
const HELP_MESSAGE = fs.readFileSync('msg/help.txt');

const findBy = function(ary, key, val) {
  var i = 0;
  for ( ; i < ary.length; ++ i )
    if ( typeof(ary[i]) === 'object' && ary[i][key] === val )
      return ary[i];

  return null;
}

/// Little helper to reply to messages
TelegramBot.prototype.replyTo = function(msg, text) {
    return this.sendMessage(msg.chat.id, text, { reply_to_message_id: msg.message_id })
               .catch(promise_error);
}

/// A command receives the original message and the text after the command
/// It's bound to the bot
const COMMANDS = {
  list: function (msg) {
    this.replyTo(msg, LIST_TEXT);
  },

  join: function (msg, group_title) {
    const group = findBy(GROUPS.sigs, 'title', group_title.toUpperCase());

    if ( ! group )
      return this.replyTo(msg, 'No encuentro el grupo');

    if ( group.id === msg.chat.id )
      return this.replyTo(msg, 'No soy tan tonto "-.-');

    if ( ! msg.from.username )
      return this.replyTo(msg, 'Ponte un @nombre de Telegram para poder ser añadido por los miembros del grupo');

    /// Here we should have or own telegram client using mtproto, but for now... Let's just ping the group
    this.sendMessage(group.id, 'Hey, @' + msg.from.username + ' ha solicitado entrar en el grupo! :)')
        .then(function () {
          this.replyTo(msg, 'Se ha avisado a ' + group_title + ' para que te añadan cuanto antes');
        }.bind(this))
        .catch(promise_error);
  },

  help: function (msg) {
    this.replyTo(msg, HELP_MESSAGE);
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
      this.replyTo(msg, 'No se qué hacer :S');
    }
  });

  /// Only welcome people to the main group,
  /// and only (of course) if the added user isn't the bot
  bot.on('new_chat_participant', function (msg) {
    if ( msg.new_chat_participant.id === bot_user.id )
      return;

    if ( msg.chat.id === GROUPS.main_group_id )
      this.sendMessage(msg.chat.id, WELCOME_MESSAGE.replace(/\{\{name\}\}/g, msg.new_chat_participant.first_name))
          .catch(promise_error);
  });
}
