module.exports = {
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
