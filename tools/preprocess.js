'use strict';

var through = require('through2');
var gutil = require('gulp-util');
var crypto = require('crypto');
var _ = require('lodash');


var lDelim = '[';
var rDelim = ']';
var commands = [
  'javascript',
  'css'
];
var commandMap = {};

var loadCommand = function() {
  _(commands).forEach(function(value) {
    commandMap[value] = require('./preprocess-' + value);
  });
};

var escapeRegExp = function(str) {
  return str.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
};

var parse = function(stream, file, enc, options) {
  var content = String(file.contents);
  var re;

  _(commands).forEach(function(value) {
    if (commandMap[value]) {
      re = new RegExp('<!--\\s*' + escapeRegExp(lDelim) + '(' + value + ')(?:\\s+?(.+?)|\\s*)' + escapeRegExp(rDelim) + '\\s*-->([\\s\\S]*?)<!--\\s*' + escapeRegExp(lDelim) + '/' + value + escapeRegExp(rDelim) + '\\s*-->\\n?', 'ig');
      content = content.replace(re, function(match, p1, p2, p3) {
        //var command = _.trim(p1);
        var p = _.trim(p2);
        var param = [];
        var result = match;
        var content = p3;

        if (p !== '') {
          param = p.split(/\s+/);
        }

        result = commandMap[value](stream, file, param, content, options);

        return result;
      });
    }
  });

  return content;
};

module.exports = function(options) {
  var content;

  var defaultOptions = {
    noNewFile: false
  };

  options = _.assign(defaultOptions, options);

  return through.obj(function(file, enc, cb) {
    if (file.isNull()) {
      cb();
      return;
    }

    if (file.isStream()) {
      cb(new gutil.PluginError('assets', 'Streaming not supported'));
      return;
    }

    content = parse(this, file, enc, options);

    //console.log(content);
    file.contents = new Buffer(content);
    cb(null, file);
  });
};

module.exports.getShortString = function(input) {
  var base32 = [
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
    'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p',
    'q', 'r', 's', 't', 'u', 'v', 'w', 'x',
    'y', 'z', '0', '1', '2', '3', '4', '5'
  ];

  var subHex, int, out, val;

  var hex = crypto.createHash('md5').update(input).digest('hex');
  var hexLen = hex.length;
  var subHexLen = hexLen / 8;
  var output = [];

  for (var i = 0; i < subHexLen; ++i) {
    subHex = hex.substr(i * 8, 8);
    int = 0x3FFFFFFF & (1 * ('0x' + subHex));
    out = '';

    for (var j = 0; j < 8; ++j) {
      val = 0x0000001F & int;
      out += base32[val];
      int = int >> 5;
    }

    output.push(out);
  }

  return output[0];
};

loadCommand();
