const fs = require('fs');
const winston = require('winston');
const utils = require('./utils');
const emoji = require('node-emoji').emoji;

var TelegramBot = require('node-telegram-bot-api');

winston.add(winston.transports.File, { filename: 'bot.log' });

const TOKEN = require('../config/telegram-token');
const GROUPS = require('../config/telegram-groups');

// Other integrations
const poll_acm_respuestas = require('./poll-acm-respuestas');
const calendar = require('./calendar');

/// Get the list of groups text
const LIST_TEXT = (function () {
  if ( ! GROUPS.sigs.length )
    return 'No hay ningún grupo';

  return GROUPS.sigs.map(function(group) {
    return group.title + ' - ' + (group.description || 'Sin descripción');
  }).join('\n').trim();
} ());

// NOTE: This uses relative paths from the root of the package.
//
// It's intended to be run as:
//    node src/main.js
// The welcome message to send, with the group info
const WELCOME_MESSAGE = (function () {
  const template = utils.loadMessage('welcome');
  return utils.render(template, { sig_list: LIST_TEXT });
} ());

// Help message
const HELP_MESSAGE = utils.loadMessage('help');

/// Expressions to say thanks to the bot
const THANKS_REG = /\b(gracias|grax|thx|thanks)\b/i;

/// Little helper to reply to messages
TelegramBot.prototype.replyTo = function(msg, text) {
    return this.sendMessage(msg.chat.id, text, { reply_to_message_id: msg.message_id })
               .catch(utils.DEFAULT_PROMISE_ERROR_HANDLER);
}

/// A command receives the original message and the text after the command
/// It's bound to the bot
const COMMANDS = {
  list: function (msg) {
    this.replyTo(msg, LIST_TEXT);
  },

  join: function (msg, group_title) {
    const group = utils.findBy(GROUPS.sigs, 'title', group_title.toUpperCase());

    if ( ! group )
      return this.replyTo(msg, 'No encuentro el grupo ' + emoji.confused);

    if ( group.id === msg.chat.id )
      return this.replyTo(msg, 'No soy tan tonto ' + emoji.wink);

    if ( ! msg.from.username )
      return this.replyTo(msg, 'Ponte un @nombre de Telegram para poder ser añadido por los miembros del grupo');

    const is_known_group = msg.chat.id === GROUPS.main_group_id ||
                           msg.chat.id === GROUPS.offtopic_group_id ||
                           GROUPS.sigs.some(function(sig) { return sig.id === msg.chat.id; });

    if (!is_known_group)
      return this.replyTo(msg, 'Es necesario usar el comando desde uno de los grupos de ACM para que funcione');

    /// Here we should have or own telegram client using mtproto, but for now... Let's just ping the group
    this.sendMessage(group.id, 'Hey, @' + msg.from.username + ' ha solicitado entrar en el grupo! ' + emoji.relaxed)
        .then(function () {
          this.replyTo(msg, 'Se ha avisado a ' + group_title + ' para que te añadan cuanto antes');
        }.bind(this))
        .catch(utils.DEFAULT_PROMISE_ERROR_HANDLER);
  },

  help: function (msg) {
    this.replyTo(msg, HELP_MESSAGE);
  },

  events: function (msg) {
    calendar.list_next_events(function(text) {
      this.replyTo(msg, text)
          .catch(utils.DEFAULT_PROMISE_ERROR_HANDLER);
    }.bind(this))
  }
}

const bot = new TelegramBot(TOKEN, { polling: true });

bot
  .getMe()
  .then(init)
  .catch(function(err) {
    winston.error('Token was not correct or other error ocurred, aborting. Error:', err);
    process.exit(1);
  });

function init(bot_user) {
  winston.info('Token was correct! \\o/', bot_user);
  bot.on('text', function (msg) {
    winston.info('New message:', msg);

    /// If it's not a group and we haven't been @mentioned
    /// skip this
    if ( msg.chat.title !== undefined &&
         msg.text.toLowerCase().split(/\s+/).indexOf('@' + bot_user.username.toLowerCase()) === -1 )
      return;

    const index = msg.text.indexOf('/');

    if ( index !== -1 ) {
        const full_command = msg.text.substring(index + 1).trim();
        var args = full_command.split(' ');
        const command = args.shift().trim();

        if ( COMMANDS.hasOwnProperty(command) && typeof(COMMANDS[command]) === 'function' ) {
          COMMANDS[command].call(this, msg, args.join(' '));
          return;
        }
    }

    if ( THANKS_REG.test(msg.text) ) {
      this.replyTo(msg, 'Oinss... ' + emoji.kissing_heart);
      return;
    }

    this.replyTo(msg, 'No se qué hacer ' + emoji.pensive + '.\n\n'
                      + 'No obstante, puedes hacer una PR para que lo haga '
                      + emoji.stuck_out_tongue_winking_eye + ':\n'
                      + 'https://github.com/ACM-USAL/acm-sig-bot');
  });

  /// Only welcome people to the main group,
  /// and only (of course) if the added user isn't the bot
  bot.on('new_chat_member', function (msg) {
    if ( msg.new_chat_member.id === bot_user.id )
      return;

    if ( msg.chat.id === GROUPS.main_group_id )
      this.sendMessage(msg.chat.id, utils.render(WELCOME_MESSAGE, { name: msg.new_chat_member.first_name }))
          .catch(utils.DEFAULT_PROMISE_ERROR_HANDLER);
  });

  poll_acm_respuestas(bot, bot_user);
  calendar.init();
}
