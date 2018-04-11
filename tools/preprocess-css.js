'use strict';

var gutil = require('gulp-util');
var fs = require('fs');
var path = require('path');
var url = require('url');
var _ = require('lodash');
var htmlparser = require('htmlparser2');

var getShortString = module.parent.exports.getShortString;

var getRealPath = function(basePath, currentPath, filePath) {
  var urlObject = url.parse(filePath);
  var fullPath;

  filePath = unescape(urlObject.pathname);
  filePath = filePath.replace(/<+/g, '');

  if (urlObject.protocol) {
    // CDN资源
    fullPath = '/static' + filePath;
  }
  else if (/^\/\//.test(filePath)) {
    // CDN资源
    filePath = filePath.replace(/^\/\/v1\.changbaimg\.com\//, '/static/').replace(/^\/\/cbshow\.cdn\.changbaimg\.com\//, '/static/');
  }
  else if (/^\//.test(filePath)) {
    fullPath = filePath.slice(1);
  }
  else {
    fullPath = path.relative(basePath, path.resolve(currentPath, filePath));
  }

  return fullPath;
};

var processPath = function(basepath, filepath, content) {
  content = content.replace(/url\(['"]?(.+?)['"]?\)/ig, function(text, filePath) {
    var newFilePath = filePath.replace(/['"]*/g, "").trim();
    var urlObject = url.parse(newFilePath);

    if (newFilePath.indexOf("base64,") > -1 || newFilePath.indexOf("about:blank") > -1 || newFilePath.indexOf("http://") > -1 || newFilePath === '/') {
      return text;
    }

    newFilePath = urlObject.pathname;

    var fullPath = getRealPath(basepath, filepath, newFilePath);

    return 'url(/' + fullPath + _.toString(urlObject.search) + _.toString(urlObject.hash) + ')';
  });

  return content;
};

module.exports = function(stream, file, param, content, options) {
  var filepath;
  var resultsArray = [];
  var mainPath = path.dirname(file.path);
  var urlObject;
  var comboContent = '';
  var readError = false;
  var cssContent = '';

  var elements = htmlparser.parseDOM(content);

  _(elements).forEach(function(value) {
    if (value.type !== 'tag' || value.name !== 'link' || !_.isString(value.attribs.href)) {
      return;
    }

    filepath = value.attribs.href;

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
      cssContent = String(fs.readFileSync(filepath)).trim();
      //console.log(filepath)
      // CSS 相对路径转绝对路径
      comboContent += processPath(file.base, path.dirname(filepath), cssContent);
    }
    else {
      console.error('read error: ' + filepath + ' (' + value.attribs.href + ')');
      readError = true;
    }

  });

  if (!resultsArray.length) {
    readError = true;
    console.warn('warning: ' + file.path + ' css files is empty!');
    return '';
  }

  var newFilename = getShortString(resultsArray.join('')) + '.css';

  if (!readError && !options.noNewFile) {
    stream.push(new gutil.File({
      base: file.base,
      cwd: file.cwd,
      path: file.base + 'static/css/com_cb_' + newFilename,
      contents: new Buffer(comboContent)
    }));
  }

  //console.log(resultsArray);

  return '<link rel="stylesheet" href="/static/css/com_cb_' + newFilename + '">\n';
};
