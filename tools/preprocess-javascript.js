'use strict';

var gutil = require('gulp-util');
var fs = require('fs');
var path = require('path');
var url = require('url');
var _ = require('lodash');
var htmlparser = require('htmlparser2');

var getShortString = module.parent.exports.getShortString;

module.exports = function(stream, file, param, content, options) {
  var filepath;
  var resultsArray = [];
  var mainPath = path.dirname(file.path);
  var urlObject;
  var comboContent = '';
  var readError = false;

  var elements = htmlparser.parseDOM(content);

  _(elements).forEach(function(value) {
    if (value.type !== 'script' || value.name !== 'script' || !_.isString(value.attribs.src)) {
      return;
    }

    filepath = value.attribs.src;

    urlObject = url.parse(filepath);

    filepath = unescape(urlObject.pathname);
    filepath = filepath.replace(/<+/g, '');

    if (urlObject.protocol) {
      // CDN资源
      filepath = path.resolve(file.base, 'static' + filepath);
    }
    else if (/^\/\//.test(filepath)) {
      // CDN资源
      filepath = filepath.replace(/^\/\/v1\.changbaimg\.com\//, 'static/').replace(/^\/\/cbshow\.cdn\.changbaimg\.com\//, 'static/');
      filepath = path.resolve(file.base, filepath);
    }
    else if (/^\//.test(filepath)) {
      filepath = path.resolve(file.base, filepath.slice(1));
    }
    else {
      filepath = path.resolve(mainPath, filepath);
    }

    resultsArray.push(path.relative(file.base, filepath));

    if (options.noNewFile) {
      return;
    }

    if (fs.existsSync(filepath)) {
      comboContent += String(fs.readFileSync(filepath)).trim() + ';';
    }
    else {
      console.error('read error: ' + file.path + ' (' + value.attribs.src + ')');
      readError = true;
    }
  });

  if (!resultsArray.length) {
    readError = true;
    console.warn('warning: ' + file.path + ' javascript files is empty!');
    return '';
  }

  var newFilename = getShortString(resultsArray.join('')) + '.js';

  if (!readError && !options.noNewFile) {
    stream.push(new gutil.File({
      base: file.base,
      cwd: file.cwd,
      path: file.base + 'static/js/com_cb_' + newFilename,
      contents: new Buffer(comboContent)
    }));
  }

  //console.log(resultsArray);

  return '<script src="/static/js/com_cb_' + newFilename + '"></script>\n';
};
