// Google calendar integration
const utils = require('./utils');
const winston = require('winston');
const fs = require('fs');
const readline = require('readline');
const google = require('googleapis');
const googleAuth = require('google-auth-library');

const GROUPS = require('../config/telegram-groups');

// If modifying these scopes, delete your previously saved credentials
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const TOKEN_PATH = 'config/calendar-token.json';

const UPCOMING_EVENT_MESSAGE = utils.loadMessage('new-event');
const UPCOMING_EVENTS_MESSAGE = utils.loadMessage('new-events');

// Yay, this is awful
var bot = null;

// Load client secrets from a local file.
module.exports = function init(_bot, bot_user) {
  bot = _bot;

  fs.readFile('config/calendar-client-secret.json', function (err, content) {
    if (err) {
      winston.log('calendar: Error loading client secret file: ' + err);
      throw err;
    }
    // Authorize a client with the loaded credentials, then call the
    // Google Calendar API.
    authorize(JSON.parse(content), realInit);
  });
}

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  const clientSecret = credentials.installed.client_secret;
  const clientId = credentials.installed.client_id;
  const redirectUrl = credentials.installed.redirect_uris[0];
  const auth = new googleAuth();
  const oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, function(err, token) {
    if (err) {
      getNewToken(oauth2Client, callback);
    } else {
      oauth2Client.credentials = JSON.parse(token);
      callback(oauth2Client);
    }
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });
  console.log('Authorize this app by visiting this url: ', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question('Enter the code from that page here: ', function(code) {
    rl.close();
    oauth2Client.getToken(code, function(err, token) {
      if (err) {
        winston.error('Error while trying to retrieve access token', err);
        throw err;
      }
      oauth2Client.credentials = token;
      storeToken(token);
      callback(oauth2Client);
    });
  });
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
  fs.writeFile(TOKEN_PATH, JSON.stringify(token));
  winston.log('calendar: Token stored to ' + TOKEN_PATH);
}

/**
 * Lists the next 10 events on the user's primary calendar.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function realInit(auth) {
  const calendar = google.calendar('v3');
  calendar.events.list({
    auth: auth,
    calendarId: 'primary',
    timeMin: (new Date()).toISOString(),
    maxResults: 10,
    singleEvents: true,
    orderBy: 'startTime'
  }, function(err, response) {
    if (err) {
      winston.error('calendar: The API returned an error: ' + err);
      return;
    }

    const events = response.items.map(function(event) {
      console.log(event);
      winston.log('calendar: ' + JSON.stringify(event));

      return utils.render(UPCOMING_EVENT_MESSAGE, {
        start: event.start.dateTime || event.start.date,
        summary: event.summary || 'Sin título'
      });
    });

    if (!events.length) {
      winston.log('calendar: No events found');
      return;
    }

    const message = utils.render(UPCOMING_EVENTS_MESSAGE, {
      count: events.length,
      events: events.join('\n\n'),
    });

    bot.sendMessage(GROUPS.main_group_id, message)
       .catch(utils.DEFAULT_PROMISE_ERROR_HANDLER);
  });
}
