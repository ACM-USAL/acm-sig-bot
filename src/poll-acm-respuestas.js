const winston = require('winston');
const http = require('http');
const cheerio = require('cheerio');
const utils = require('./utils');
const GROUPS = require('../config/telegram-groups');

/// New question message
const NEW_QUESTION_MESSAGE = utils.loadMessage('new-question');
const NEW_QUESTIONS_MESSAGE = utils.loadMessage('new-questions');
/// Interval in milliseconds to poll for questions
const POLL_INTERVAL_MS = 5 * 60 * 1000;


module.exports = function(bot, bot_user) {
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
      winston.error('Request to ' + URL + ' failed: ' + err.message);
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

        if ( new_questions.length === 0 ) {
          winston.info('No new questions this time');
        } else {
          winston.info(new_questions.length + ' new questions');

          const questions = new_questions.map(function(question) {
            return utils.render(NEW_QUESTION_MESSAGE, question);
          });

          const message = utils.render(NEW_QUESTIONS_MESSAGE, {
            count: questions.length,
            questions: questions.join('\n\n'),
          });

          bot.sendMessage(GROUPS.main_group_id, message)
             .catch(utils.DEFAULT_PROMISE_ERROR_HANDLER);
        }
      });
    });

    request.end();
  };

  poll();
}
