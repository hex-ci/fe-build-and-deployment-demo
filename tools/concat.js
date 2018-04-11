'use strict';

var through = require('through2');
var gutil = require('gulp-util');
var fs = require('fs');
var path = require('path');
var url = require('url');
var _ = require('lodash');
var stripCssComments = require('strip-css-comments');
var stripJsComments = require('strip-comments');

var reImport = /@import\s+?url\(([^)]+?)\)\s*;/ig;
var reImport2 = /@import\s+?["'](.+?)["']\s*;/ig;
var reScript = /document\.write\s*?\(\s*?'<script\s+?src="(.+?)"><\\\/script>'\s*?\)\s*?;/ig;
var reVar = /var\s+?srcPath\s*?=\s*?['"](.+?)['"]\s*;/ig;
var reFunction = /^\s*\(\s*?function\s*?\(\s*?\)\s*{\s*?var\s+?srcPath\s*?=\s*?['"].+?['"]\s*;/ig;

var getFullPath = function(rootPath, currentPath, filePath) {
  var urlObject = url.parse(filePath);
  var fullPath;

  filePath = unescape(urlObject.pathname);
  filePath = filePath.replace(/<+/g, '');

  if (urlObject.protocol) {
    // CDN资源
    fullPath = path.resolve(rootPath, 'static' + filePath);
  }
  else if (/^\/\//.test(filePath)) {
    // CDN资源
    filePath = filePath.replace(/^\/\/v1\.changbaimg\.com\//, 'static/').replace(/^\/\/cbshow\.cdn\.changbaimg\.com\//, 'static/');
    fullPath = path.resolve(rootPath, filePath);
  }
  else if (/^\//.test(filePath)) {
    fullPath = path.resolve(rootPath, filePath.slice(1));
  }
  else {
    fullPath = path.resolve(currentPath, filePath);
  }

  return fullPath;
};

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

var fileExists = function(filepath) {
  try {
    return fs.statSync(filepath).isFile();
  }
  catch (e) {
    return false;
  }
};

module.exports.make = function() {
  var contents, mainPath, extname;

  // var defaultOptions = {
  //   noNewFile: false
  // };

  //options = _.assign(defaultOptions, options);

  return through.obj(function(file, enc, cb) {
    if (file.isNull()) {
      cb();
      return;
    }

    if (file.isStream()) {
      cb(new gutil.PluginError('assets', 'Streaming not supported'));
      return;
    }

    mainPath = path.dirname(file.path);
    extname = path.extname(file.path);

    contents = file.contents.toString();

    if (extname === '.css') {
      if (reImport.test(contents) || reImport2.test(contents)) {
        contents = stripCssComments(contents);

        contents = contents.replace(reImport, function(content, filePath) {
          var newFilePath = filePath.replace(/['"]*/g, "").trim();
          var urlObject = url.parse(newFilePath);

          newFilePath = urlObject.pathname;

          var fullPath = getFullPath(file.base, mainPath, newFilePath);

          if (fileExists(fullPath)) {
            var cssContent = String(fs.readFileSync(fullPath)).trim();

            cssContent = processPath(file.base, path.dirname(fullPath), cssContent);

            return cssContent;
          }
          else {
            return content;
          }
        });

        contents = contents.replace(reImport2, function(content, filePath) {
          var newFilePath = filePath.replace(/['"]*/g, "").trim();
          var urlObject = url.parse(newFilePath);

          newFilePath = urlObject.pathname;

          var fullPath = getFullPath(file.base, mainPath, newFilePath);

          if (fileExists(fullPath)) {
            var cssContent = String(fs.readFileSync(fullPath)).trim();

            cssContent = processPath(file.base, path.dirname(fullPath), cssContent);

            return cssContent;
          }
          else {
            return content;
          }
        });

        file.contents = new Buffer(contents);
      }
    }
    else if (extname === '.js') {
      if (reFunction.test(contents)) {
        var files = [];
        // 获取 srcPath

        reVar.lastIndex = 0;
        reScript.lastIndex = 0;

        contents = stripJsComments(contents);

        var srcPath = reVar.exec(contents)[1];
        var myArray;
        var newContents = '';

        while ((myArray = reScript.exec(contents)) !== null) {
          files.push(myArray[1].replace(/'\s*?\+\s*?srcPath\s*?\+\s*?'/ig, srcPath));
        }

        _.forEach(files, function(value) {
          var fullPath = getFullPath(file.base, mainPath, value);
          //console.log(fullPath);

          if (fileExists(fullPath)) {
            newContents += String(fs.readFileSync(fullPath)).trim() + '\n';
          }
          else {
            console.log('file not found. ' + fullPath);
          }
        });

        file.contents = new Buffer(newContents);
      }
    }

    return cb(null, file);
  });
};

module.exports.getJavascriptFiles = function(filebase, fullPath) {
  var contents = String(fs.readFileSync(fullPath)).trim();
  var result = [];

  if (reFunction.test(contents)) {
    var files = [];
    // 获取 srcPath
    reVar.lastIndex = 0;
    reScript.lastIndex = 0;

    contents = stripJsComments(contents);

    var srcPath = reVar.exec(contents)[1];
    var myArray;
    var file;

    while ((myArray = reScript.exec(contents)) !== null) {
      file = myArray[1].replace(/'\s*?\+\s*?srcPath\s*?\+\s*?'/ig, srcPath);
      file = getFullPath(filebase, filebase, file);
      files.push(file);
    }

    result = files;
  }

  return result;
};

module.exports.getCssFiles = function(filebase, fullPath) {
  var contents = String(fs.readFileSync(fullPath)).trim();
  var result = [];

  if (reImport.test(contents) || reImport2.test(contents)) {
    var files = [];
    // 获取 srcPath
    reImport.lastIndex = 0;
    reImport2.lastIndex = 0;

    contents = stripCssComments(contents);

    var myArray, newFilePath, urlObject;

    while ((myArray = reImport.exec(contents)) !== null) {
      newFilePath = myArray[1].replace(/['"]*/g, "").trim();
      urlObject = url.parse(newFilePath);

      newFilePath = urlObject.pathname;

      files.push(getFullPath(filebase, path.dirname(fullPath), newFilePath));
    }

    while ((myArray = reImport2.exec(contents)) !== null) {
      newFilePath = myArray[1].replace(/['"]*/g, "").trim();
      urlObject = url.parse(newFilePath);

      newFilePath = urlObject.pathname;

      files.push(getFullPath(filebase, path.dirname(fullPath), newFilePath));
    }

    result = files;
  }

  return result;
};
