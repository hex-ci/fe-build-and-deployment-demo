'use strict';

var through = require('through2');
var gutil = require('gulp-util');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var _ = require('lodash');
var concat = require('./concat.js');

var newerMap = {};
var manifest = {};
var manifestAddition = {};


function sha1(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

function isEmptyObject(obj) {
  var name;
  for (name in obj) {
    return false;
  }
  return true;
}


module.exports.check = function() {
  var hash;
  var filepath;

  var result;

  var pathMap = {};
  var sourValue;
  var destValue;

  var filebase;

  return through.obj(function(file, enc, cb) {
    if (file.isNull()) {
      cb();
      return;
    }

    if (file.isStream()) {
      cb(new gutil.PluginError('assets', 'Streaming not supported'));
      return;
    }

    //content = String(file.contents);
    hash = sha1(file.contents);
    //
    //console.log(file.path + ': ' + hash);
    filepath = path.relative(file.base, file.path);
    pathMap[filepath] = hash;

    filebase = file.base;

    //cb(null, file);
    cb();
  }, function(cb) {
    try {
      result = JSON.parse(fs.readFileSync(__dirname + '/manifest.json'));
      manifest = result.manifest;
      manifestAddition = result.addition;
    }
    catch (e) {}

    Object.keys(pathMap).forEach(function(key) {
      sourValue = pathMap[key];
      destValue = manifest[key];

      if (!destValue || (destValue && sourValue !== destValue)) {
        // 新文件 && 文件已修改
        newerMap[key] = sourValue;
      }
      else {
        var extname = path.extname(key);
        var files, mapKeys, isNew, concatSourValue, concatDestValue;

        if (extname === '.js') {
          files = concat.getJavascriptFiles(filebase, path.resolve(filebase, key));
          if (files.length) {
            mapKeys = [];
            isNew = false;
            concatSourValue;
            concatDestValue;

            _.forEach(files, function(value) {
              mapKeys.push(path.relative(filebase, value));
            });

            _.forEach(mapKeys, function(value) {
              concatSourValue = pathMap[value];
              concatDestValue = manifest[value];

              if (!concatDestValue || (concatDestValue && concatSourValue !== concatDestValue)) {
                // 新文件 && 文件已修改
                isNew = true;
                return false;
              }
            });

            if (isNew) {
              newerMap[key] = sourValue;
            }
          }
        }
        else if (extname === '.css') {
          files = concat.getCssFiles(filebase, path.resolve(filebase, key));
          if (files.length) {
            mapKeys = [];
            isNew = false;
            concatSourValue;
            concatDestValue;

            _.forEach(files, function(value) {
              mapKeys.push(path.relative(filebase, value));
            });

            _.forEach(mapKeys, function(value) {
              concatSourValue = pathMap[value];
              concatDestValue = manifest[value];

              if (!concatDestValue || (concatDestValue && concatSourValue !== concatDestValue)) {
                // 新文件 && 文件已修改
                isNew = true;
                return false;
              }
            });

            if (isNew) {
              newerMap[key] = sourValue;
            }
          }
        }
      }

    });

    cb();
  });
};

module.exports.newer = function(options) {
  var filepath;

  options = options || {};

  return through.obj(function(file, enc, cb) {
    if (file.isNull()) {
      cb(null, file);
      return;
    }

    if (file.isStream()) {
      cb(new gutil.PluginError('assets', 'Streaming not supported'));
      return;
    }

    filepath = path.relative(options.asset ? options.asset : file.base, file.path);

    if (newerMap[filepath]) {
      //console.log(filepath);
      cb(null, file);
    }
    else {
      cb();
    }
  });
};

module.exports.checkAddition = function() {
  var filepath;
  var hash;
  var value;
  var currentMap;
  var map = {};
  var tmp = {};

  if (isEmptyObject(manifest)) {
    currentMap = newerMap;
  }
  else {
    currentMap = manifest;
  }

  return through.obj(function(file, enc, cb) {
    if (file.isNull()) {
      cb(null, file);
      return;
    }

    if (file.isStream()) {
      cb(new gutil.PluginError('assets', 'Streaming not supported'));
      return;
    }

    filepath = path.relative(file.base, file.path);

    if (currentMap[filepath] || path.extname(filepath) === '.map') {
      cb(null, file);
      return;
    }

    hash = sha1(file.contents);

    value = manifestAddition[filepath];

    tmp[filepath] = hash;

    if (!value || value !== hash) {
      newerMap[filepath] = hash;
      map[filepath] = hash;
    }

    cb(null, file);
  }, function(cb) {
    Object.keys(map).forEach(function(key) {
      manifestAddition[key] = map[key];
    });

    Object.keys(manifestAddition).forEach(function(key) {
      if (!tmp[key]) {
        delete manifestAddition[key];
      }
    });


    cb();
  });
};

module.exports.make = function() {
  var filepath;

  return through.obj(function(file, enc, cb) {
    if (file.isNull()) {
      cb();
      return;
    }

    if (file.isStream()) {
      cb(new gutil.PluginError('assets', 'Streaming not supported'));
      return;
    }

    filepath = path.relative(file.base, file.path);

    if (newerMap[filepath] && !manifestAddition[filepath]) {
      manifest[filepath] = newerMap[filepath];
    }

    cb();
  }, function(cb) {
    fs.writeFileSync(__dirname + '/manifest.json', JSON.stringify({
      manifest: manifest,
      addition: manifestAddition
    }, null, '  '));

    cb();
  });
};

module.exports.test = function() {
  return through.obj(function(file, enc, cb) {
    if (file.isNull()) {
      cb(null, file);
      return;
    }

    if (file.isStream()) {
      cb(new gutil.PluginError('assets', 'Streaming not supported'));
      return;
    }

    console.log(file.path);

    cb(null, file);
  });
};
