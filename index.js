const fs = require('fs');
const winston = require('winston');
const http = require('http');
const cheerio = require('cheerio');
const utils = require('./utils');

var TelegramBot = require('node-telegram-bot-api');

winston.add(winston.transports.File, { filename: 'bot.log' });

const TOKEN = require('./token');
const GROUPS = require('./groups');

/// To ignore promise errors
const promise_error = function () { winston.warn('Promise error: ', [].slice.call(arguments)); };

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
  return utils.render(template, { sig_list: LIST_TEXT });
} ());

/// Help message
const HELP_MESSAGE = fs.readFileSync('msg/help.txt', { encoding: 'UTF-8' });

/// New question message
const NEW_QUESTION_MESSAGE = fs.readFileSync('msg/new-question.txt', { encoding: 'UTF-8' });

/// Interval in milliseconds to poll for questions
const POLL_INTERVAL_MS = 5 * 60 * 1000;

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
    const group = utils.findBy(GROUPS.sigs, 'title', group_title.toUpperCase());

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

    if ( index === -1 )
      return;

    const full_command = msg.text.substring(index + 1).trim();
    var args = full_command.split(' ');
    const command = args.shift().trim();

    if ( COMMANDS.hasOwnProperty(command) && typeof(COMMANDS[command]) === 'function' ) {
      COMMANDS[command].call(this, msg, args.join(' '));
      return;
    }

    this.replyTo(msg, 'No se qué hacer :S');
  });

  /// Only welcome people to the main group,
  /// and only (of course) if the added user isn't the bot
  bot.on('new_chat_participant', function (msg) {
    if ( msg.new_chat_participant.id === bot_user.id )
      return;

    if ( msg.chat.id === GROUPS.main_group_id )
      this.sendMessage(msg.chat.id, utils.render(WELCOME_MESSAGE, { name: msg.new_chat_participant.first_name }))
          .catch(promise_error);
  });

  init_polling_for_questions(bot, bot_user);
}


function init_polling_for_questions(bot, bot_user) {
  const URL = 'http://usal.acm.org/preguntas/';

  var last_question_id = null;
  var poll_timer = null;
  var poll;

  const repoll = function () {
    if ( poll_timer )
      clearTimeout(poll_timer);

    poll_timer = setTimeout(poll, POLL_INTERVAL_MS);
  };

  winston.info('Start polling to ' + URL);
  poll = function() {
    winston.info('HTTP GET request to ' + URL);
    var request = http.request(URL);

    /// Always schedule a re-poll when the response ends
    request.on('response', function(response) {
      response.on('end', repoll);
    });

    /// Also on error
    request.on('error', function(err) {
      winston.error('Request to ' + URL + ' failed: ' + e.message);
      repoll();
    });

    request.on('response', function(response) {
      var chunks = [];

      if ( response.statusCode !== 200 ) {
        winston.warn('Request to ' + URL + ' returned status ' + response.statusCode);
        // The end event won't trigger until all data has been consumed
        response.on('data', function() {});
        return;
      }

      response.setEncoding('utf8');
      response.on('data', function(chunk) {
        chunks.push(chunk);
      });

      response.on('end', function() {
        const $ = cheerio.load(chunks.join(''));


        var newer_question_found = false;
        var new_questions = [];
        const previous_last_question_id = last_question_id;

        $('.questions-list > article').each(function() {
          const $this = $(this);
          const id = parseInt($this.attr('id').replace('question-', ''), 10);

          /// Don't send a message the first time
          if ( last_question_id === null ) {
            last_question_id = id;
            winston.info('First question registered: ' + id);
            return false;
          }

          /// Stop looping if we found the last previous question
          if ( previous_last_question_id === id )
            return false;

          /// Now here we're sure the question is new

          /// Update the last_question_id if this is a new question and
          /// no newer question was found
          if ( ! newer_question_found ) {
            newer_question_found = true;
            last_question_id = id;
          }

          winston.info('New question registered: ' + id);

          const link = $this.find('.dwqa-title');
          const question_url = link.attr('href');
          const question_title = link.text();
          const question_author = $this.find('.dwqa-author a').text();

          new_questions.push({
            id: id,
            author_name: question_author,
            question_title: question_title,
            question_url: question_url,
          });
        });

        if ( new_questions.length === 0 )
          winston.info('No new questions this time');
        else
          winston.info(new_questions.length + ' new questions');

	var message = 'Hay ' + new_questions + ' preguntas en ACM Respuestas:\n';
        new_questions.forEach(function(question) {
          message += utils.render(NEW_QUESTION_MESSAGE, question);
        });

	bot.sendMessage(GROUPS.main_group_id, message).catch(promise_error);
      });
    });

    request.end();
  };

  poll();
}
