'use strict';

var path = require('path');
var gutil = require('gulp-util');
var through = require('through2');
var htmlparser = require("htmlparser2");
var _ = require('lodash');
var cssnano = require('cssnano');
var uglify = require('uglify-js');
var crypto = require('crypto');
var fs = require('fs');
var babel = require('babel-core');
var sass = require('node-sass');

var getHash = function(str) {
  return crypto.createHash('md5').update(str).digest('hex');
};

var getStub = function(seed) {
  return '___inline_code$$$' + getHash(seed) + '$$$___';
};

RegExp.escape = function(s) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
};

const babelrc = JSON.parse(fs.readFileSync(__dirname + '/../.babelrc'));

if (!fs.existsSync(__dirname + '/.cache')) {
  fs.mkdirSync(__dirname + '/.cache');
}

module.exports = function() {
  //options = options || {};

  //var asset = options.asset || process.cwd();

  var reScript = /<script(?:\s+?[^>]+?|[\s]*?)>[\s\S]*?<\/script>/ig;
  var reStyle = /<style(?:\s+?[^>]+?|[\s]*?)>[\s\S]*?<\/style>/ig;
  var rePhp = /<\?php\s+[\s\S]+?(?:\?>|$)/ig;
  var reShortPhp = /<\?=\s*[\s\S]+?\?>/ig;
  // 注意这个正则和上面的 getStub 函数相关联
  var reInlineCode = /___inline_code\$\$\$[a-z0-9]{32}\$\$\$___/;

  return through.obj(function(file, enc, cb) {
    var contents;
    var element;
    var queue = [];
    var phpQueue = [];

    if (file.isNull()) {
      cb();
      return;
    }

    if (file.isStream()) {
      cb(new gutil.PluginError('Inline', 'Streaming not supported'));
      return;
    }

    //gutil.log(gutil.colors.green(file.path));

    contents = file.contents.toString();

    if (path.extname(file.path) === '.php') {
      // 过滤 PHP 代码
      contents = contents.replace(rePhp, function(content) {
        var name = getStub(content);
        phpQueue.push({
          name: name,
          text: content
        });

        //console.log(name);

        return name;
      }).replace(reShortPhp, function(content) {
        var name = getStub(content);
        phpQueue.push({
          name: name,
          text: content
        });

        //console.log(name);
        //console.log(content);

        return name;
      });
    }

    contents = contents.replace(reScript, function(content) {
      element = htmlparser.parseDOM(content)[0];

      if (!element || _.isString(element.attribs.src) || !element.children.length || (_.isString(element.attribs.type) && element.attribs.type != 'text/javascript')) {
        return content;
      }

      if (_.isString(element.attribs.nocompress)) {
        delete element.attribs.nocompress;
        return htmlparser.DomUtils.getOuterHTML(element);
      }

      if (element.children.length == 0) {
        return content;
      }

      var js = element.children[0].data;
      var result;

      js = js.trim();

      //console.log(js);

      var compressOptions;

      if (reInlineCode.test(js)) {
        compressOptions = {
          sequences: false,
          evaluate: false,
          drop_console: true,
          warnings: true
        }
      }
      else {
        compressOptions = {
          drop_console: true,
          warnings: true
        }
      }

      // 生成签名
      var hash = getHash(js);
      var cacheContent;
      var cacheFilename = __dirname + '/.cache/' + hash + '.js';

      if (fs.existsSync(cacheFilename)) {
        cacheContent = fs.readFileSync(cacheFilename);

        if (cacheContent) {
          element.children[0].data = cacheContent;
        }
        else {
          return content;
        }
      }
      else {
        try {
          try {
            var compileResult = babel.transform(js, {
              babelrc: false,
              compact: false,
              presets: babelrc.presets
            });

            if (compileResult.code) {
              js = compileResult.code;
            }
          }
          catch (e) {
          }

          result = uglify.minify(js, {
            ie8: true,
            compress: compressOptions
          });

          if (result.code) {
            element.children[0].data = result.code;
          }
          else {
            return content;
          }
        }
        catch (e) {
          return content;
        }

        if (result.code) {
          fs.writeFileSync(cacheFilename, result.code);
        }
      }

      return htmlparser.DomUtils.getOuterHTML(element);
    }).replace(reStyle, function(content) {
      element = htmlparser.parseDOM(content)[0];

      if (!element) {
        return content;
      }

      if (_.isString(element.attribs.nocompress)) {
        delete element.attribs.nocompress;
        return htmlparser.DomUtils.getOuterHTML(element);
      }

      if (element.children.length == 0) {
        return content;
      }

      var needCompile = (element.attribs.type == 'text/sass' || element.attribs.type == 'text/scss');
      var isSass = (element.attribs.type == 'text/sass');

      var css = element.children[0].data;

      css = css.trim();

      var hash = getHash(css);
      var cacheContent;
      var cacheFilename = __dirname + '/.cache/' + hash + '.css';

      var name = getStub(content);

      if (needCompile) {
        try {
          var sassResult = sass.renderSync({
            data: css,
            indentedSyntax: isSass,
            outputStyle: 'expanded'
          });

          if (sassResult.css) {
            element.attribs.type = 'text/css';
            css = sassResult.css;
          }
        }
        catch (e) {
        }
      }

      if (fs.existsSync(cacheFilename)) {
        cacheContent = fs.readFileSync(cacheFilename);

        if (cacheContent) {
          element.children[0].data = cacheContent;
        }
        else {
          queue.push({
            name: name,
            text: css
          });

          element.children[0].data = name;
        }
      }
      else {
        queue.push({
          name: name,
          text: css
        });

        element.children[0].data = name;
      }

      //console.log(htmlparser.DomUtils.getOuterHTML(element));

      return htmlparser.DomUtils.getOuterHTML(element);
    });


    var len = 0;
    var run = function() {
      cssnano.process(queue[len].text, {
        autoprefixer: {
          add: true
        },
        zindex: false,
        reduceIdents: false
      }).then(function(result) {
        contents = contents.replace(new RegExp(RegExp.escape(queue[len].name), 'g'), result.css);

        var hash = getHash(queue[len].text);
        var cacheFilename = __dirname + '/.cache/' + hash + '.css';

        // 写入缓存
        if (result.css) {
          fs.writeFileSync(cacheFilename, result.css);
        }

        len++;
        if (len >= queue.length) {

          // 还原 PHP 代码
          _.forEach(phpQueue, function(value) {
            contents = contents.replace(new RegExp(RegExp.escape(value.name), 'g'), value.text);
          });

          file.contents = new Buffer(contents);

          return cb(null, file);
        }
        else {
          run();
        }
      }, function() {
        contents = contents.replace(new RegExp(RegExp.escape(queue[len].name), 'g'), queue[len].text);

        len++;
        if (len >= queue.length) {

          // 还原 PHP 代码
          _.forEach(phpQueue, function(value) {
            contents = contents.replace(new RegExp(RegExp.escape(value.name), 'g'), value.text);
          });

          file.contents = new Buffer(contents);

          return cb(null, file);
        }
        else {
          run();
        }
      });
    };

    if (queue.length > 0) {
      return run();
    }
    else {
      // 还原 PHP 代码
      _.forEach(phpQueue, function(value) {
        contents = contents.replace(new RegExp(RegExp.escape(value.name), 'g'), value.text);
      });

      file.contents = new Buffer(contents);

      return cb(null, file);
    }
  });
};
