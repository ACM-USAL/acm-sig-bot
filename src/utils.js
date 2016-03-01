const fs = require('fs');
const winston = require('winston');

module.exports = {
  DEFAULT_PROMISE_ERROR_HANDLER: function() {
    winston.warn('Promise error: ', [].slice.call(arguments));
  },

  loadMessage: function(name) {
    return fs.readFileSync('msg/' + name + '.txt', { encoding:
      'UTF-8' });
  },

  findBy: function(ary, key, val) {
    var i = 0;
    for ( ; i < ary.length; ++ i )
      if ( typeof(ary[i]) === 'object' && ary[i][key] === val )
        return ary[i];

    return null;
  },
  render: (function() {
    var regex_cache = {};

    return function(template, replacements) {
      return Object.keys(replacements).reduce(function(template, key) {
        var regex;
        if (regex_cache[key]) {
          regex = regex_cache[key];
        } else {
          regex = new RegExp('\\{\\{' + key + '\\}\\}', 'g');
          regex_cache[key] = regex;
        }

        return template.replace(regex, replacements[key]);
      }, template);
    };
  }())
};
