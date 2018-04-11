'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var gutil = require('gulp-util');
var through = require('through2');
var url = require('url');
var aliyun = require('aliyun-sdk');
var moment = require('moment');
var htmlparser = require("htmlparser2");
var _ = require('lodash');
var shortid = require('shortid');

var ossClient;
var ossOptions = {
  accessKeyId: '',
  secretAccessKey: '',
  endpoint: 'http://oss-cn-hangzhou.aliyuncs.com',
  apiVersion: '2013-10-15',
  bucket: 'demo'
};

var cdnCache = {};

RegExp.escape = function(s) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
};

function sha1(content) {
  return crypto.createHash('md5')
    .update(content)
    .digest('hex').substr(6, 7);
}

function getFullPath(rootPath, currentPath, filePath) {
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
}

function getCdnName(filePath, prefix) {
  var ext = path.extname(filePath);
  var name = path.basename(filePath, ext);
  var dir = path.dirname(prefix);
  var content = fs.readFileSync(filePath);

  var filename = (dir === '.' ? '' : dir + '/') + name + '.' + sha1(content) + ext;

  return filename;
}

function uploadFile(filePath, filename, cb) {
  var ext = path.extname(filePath);
  var content = fs.readFileSync(filePath);
  var contentType;
  var isSourceMap = false;

  var mimes = {
    '.js': 'application/x-javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.swf': 'application/x-shockwave-flash',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.woff': 'application/font-woff',
    '.woff2': 'application/font-woff2',
    '.svg': 'image/svg+xml',
    '.otf': 'application/x-font-opentype',
    '.ico': 'image/x-icon',
    '.gif': 'image/gif'
  };

  if (mimes[ext]) {
    contentType = mimes[ext];
  }
  else {
    contentType = 'application/octet-stream';
  }

  if (cdnCache[filename]) {
    cb();
    return filename;
  }

  if (!ossClient) {
    ossClient = new aliyun.OSS({
      accessKeyId: ossOptions.accessKeyId,
      secretAccessKey: ossOptions.secretAccessKey,
      endpoint: ossOptions.endpoint,
      apiVersion: ossOptions.apiVersion
    });
  }

  // console.log(ossClient.__proto__);

  if (fileExists(filePath + '.map')) {
    isSourceMap = true;
    var basename = path.basename(filename);

    content = Buffer.concat([
      content,
      new Buffer('\n' + (ext === '.css' ? '/*# sourceMappingURL=' + basename + '.map */' : '//# sourceMappingURL=' + basename + '.map'))
    ]);
  }

  ossClient.putObject({
    Bucket: ossOptions.bucket,
    Key: filename,
    Body: content,
    AccessControlAllowOrigin: '*',
    ContentType: contentType,
    CacheControl: 'max-age=315360000',
    //ContentDisposition: '',
    ServerSideEncryption: 'AES256',
    Expires: moment().add(10, 'years').unix()
  }, function(err) {
    if (err) {
      gutil.log('ERR:', gutil.colors.red(filename + "\t" + err));

      return cb();
    }
    else {
      cdnCache[filename] = true;
      gutil.log('OK:', gutil.colors.green(filename + "\tmime: " + contentType));

      if (isSourceMap) {

        ossClient.putObject({
          Bucket: ossOptions.bucket,
          Key: filename + '.map',
          Body: fs.readFileSync(filePath + '.map'),
          AccessControlAllowOrigin: '*',
          ContentType: 'application/json; charset=utf-8',
          CacheControl: 'max-age=315360000',
          ServerSideEncryption: 'AES256',
          Expires: moment().add(10, 'years').unix()
        }, function() {

          return cb();

        });

      }
      else {
        return cb();
      }
    }
  });

  return filename;
}

function fileExists(filepath) {
  try {
    return fs.statSync(filepath).isFile();
  }
  catch (e) {
    return false;
  }
}


module.exports = function(options) {
  options = options || {};

  var asset = options.asset || process.cwd();

  var reLink = /<link(?:\s+?[^>]+?\s+?|\s+?)href\s*?=\s*?".+?"(?:\s+?.+?\s*?|\s*?)>/ig;
  var reScript = /<script(?:\s+?[^>]+?\s+?|\s+?)src\s*?=\s*?"[^"]+?"(?:\s+?[^>]+?\s*?|\s*?)>\s*?<\/script>/ig;
  var reCssUrl = /url\(['"]?(.+?)['"]?\)/ig;
  var reImg = /<img(?:\s+?.+?\s+?|\s+?)src\s*?=\s*?".+?"(?:\s+?.+?\s*?|\s*?|\s*\/)>/ig;
  var reEmbed = /<embed(?:\s+?.+?\s+?|\s+?)src\s*?=\s*?".+?"(?:\s+?.+?\s*?|\s*?|\s*\/)>/ig;
  var reParam = /<param(?:\s+?.+?\s+?|\s+?)value\s*?=\s*?".+?"(?:\s+?.+?\s*?|\s*?|\s*\/)>/ig;
  var reObject = /<object(?:\s+?.+?\s+?|\s+?)data\s*?=\s*?".+?"(?:\s+?.+?\s*?|\s*?|\s*\/)>/ig;
  var reStyle = /<style(?:\s+?[^>]+?|[\s]*?)>([\s\S]*?)<\/style>/ig;
  var reCommon = new RegExp('["\'\\(]\\s*([\\w\\_/\\.\\-]+\\.(' + (options.exts ? options.exts.join('|') : 'jpg|jpeg|png|gif|cur|js|css|swf') + '))([^\\)"\']*)\\s*[\\)"\']', 'gim');

  var queue = [];

  try {
    cdnCache = _(cdnCache).merge(JSON.parse(fs.readFileSync(__dirname + '/cdn-manifest.json'))).value();
  }
  catch (e) {}


  return through.obj(function(file, enc, cb) {
    var contents, mainPath, extname, prefix, element, filePath, fullPath, cdnName;
    var urlObject;

    var stub = '[___nocdn~' + shortid.generate() + String((new Date()).getTime() + Math.floor(Math.random() * 9999)) + '___]';
    var reStub = new RegExp(RegExp.escape(stub), 'gi');

    if (file.isNull()) {
      cb();
      return;
    }

    if (!options.urlPrefix) {
      cb(new gutil.PluginError('CDN', 'urlPrefix not found!'));
      return;
    }

    if (file.isStream()) {
      cb(new gutil.PluginError('CDN', 'Streaming not supported'));
      return;
    }

    mainPath = path.dirname(file.path);
    extname = path.extname(file.path);

    //gutil.log(gutil.colors.green(file.path));

    contents = file.contents.toString();

    if (extname === '.css') {
      contents = contents.replace(reCssUrl, function(content, filePath) {
        var newFilePath = filePath.replace(/['"]*/g, "").trim();
        urlObject = url.parse(newFilePath);

        if (newFilePath.indexOf("base64,") > -1 || newFilePath.indexOf("about:blank") > -1 || newFilePath.indexOf("http://") > -1 || newFilePath === '/') {
          return content;
        }

        newFilePath = urlObject.pathname;

        fullPath = getFullPath(asset, mainPath, newFilePath);

        if (fileExists(fullPath)) {
          //gutil.log('replacing image ' + newFilePath + ' version in css file: ' + file.path);

          prefix = path.relative(asset, fullPath);

          cdnName = getCdnName(fullPath, prefix);
          queue.push({
            name: cdnName,
            path: fullPath
          });

          return 'url(' + options.urlPrefix + cdnName + _.toString(urlObject.hash) + ')';
        }
        else {
          return content;
        }
      });
    }
    else {
      contents = contents.replace(reLink, function(content) {
        element = htmlparser.parseDOM(content)[0];

        if (!element) {
          return content;
        }

        if (_.isString(element.attribs.nocdn)) {
          delete element.attribs.nocdn;
          element.attribs.href += stub;
          return htmlparser.DomUtils.getOuterHTML(element);
        }

        filePath = element.attribs.href || '';
        fullPath = getFullPath(asset, mainPath, filePath);

        if (fileExists(fullPath)) {
          prefix = path.relative(asset, fullPath);

          cdnName = getCdnName(fullPath, prefix);
          queue.push({
            name: cdnName,
            path: fullPath
          });
          element.attribs.href = options.urlPrefix + cdnName;

          return htmlparser.DomUtils.getOuterHTML(element);
        }
        else {
          //gutil.log(gutil.colors.red(fullPath));
          return content;
        }
      }).replace(reScript, function(content) {
        element = htmlparser.parseDOM(content)[0];

        if (!element) {
          return content;
        }

        if (_.isString(element.attribs.nocdn)) {
          delete element.attribs.nocdn;
          element.attribs.src += stub;
          return htmlparser.DomUtils.getOuterHTML(element);
        }

        filePath = element.attribs.src || '';
        fullPath = getFullPath(asset, mainPath, filePath);

        if (fileExists(fullPath)) {
          prefix = path.relative(asset, fullPath);

          cdnName = getCdnName(fullPath, prefix);
          queue.push({
            name: cdnName,
            path: fullPath
          });
          element.attribs.src = options.urlPrefix + cdnName;

          return htmlparser.DomUtils.getOuterHTML(element);
        }
        else {
          return content;
        }
      }).replace(reImg, function(content) {
        element = htmlparser.parseDOM(content)[0];

        if (!element) {
          return content;
        }

        if (_.isString(element.attribs.nocdn)) {
          delete element.attribs.nocdn;
          element.attribs.src += stub;
          return htmlparser.DomUtils.getOuterHTML(element);
        }

        filePath = element.attribs.src || '';

        fullPath = getFullPath(asset, mainPath, filePath);

        if (path.extname(fullPath) === '.php') {
          return content;
        }

        if (fileExists(fullPath)) {
          prefix = path.relative(asset, fullPath);

          cdnName = getCdnName(fullPath, prefix);
          queue.push({
            name: cdnName,
            path: fullPath
          });
          element.attribs.src = options.urlPrefix + cdnName;

          return htmlparser.DomUtils.getOuterHTML(element);
        }
        else {
          return content;
        }
      }).replace(reParam, function(content) {
        element = htmlparser.parseDOM(content)[0];

        if (!element) {
          return content;
        }

        if (_.isString(element.attribs.nocdn)) {
          delete element.attribs.nocdn;
          element.attribs.value += stub;
          return htmlparser.DomUtils.getOuterHTML(element);
        }

        filePath = element.attribs.value || '';
        fullPath = getFullPath(asset, mainPath, filePath);

        if (fileExists(fullPath)) {
          prefix = path.relative(asset, fullPath);

          cdnName = getCdnName(fullPath, prefix);
          queue.push({
            name: cdnName,
            path: fullPath
          });
          element.attribs.value = options.urlPrefix + cdnName;

          return htmlparser.DomUtils.getOuterHTML(element);
        }
        else {
          return content;
        }
      }).replace(reObject, function(content) {
        element = htmlparser.parseDOM(content)[0];

        if (!element) {
          return content;
        }

        if (_.isString(element.attribs.nocdn)) {
          delete element.attribs.nocdn;
          element.attribs.data += stub;
          // object 标签替换的返回值需要手动去掉 </object>
          return htmlparser.DomUtils.getOuterHTML(element).replace('</object>', '');
        }

        filePath = element.attribs.data || '';
        fullPath = getFullPath(asset, mainPath, filePath);

        if (fileExists(fullPath)) {
          prefix = path.relative(asset, fullPath);

          cdnName = getCdnName(fullPath, prefix);
          queue.push({
            name: cdnName,
            path: fullPath
          });
          element.attribs.data = options.urlPrefix + cdnName;

          // object 标签替换的返回值需要手动去掉 </object>
          return htmlparser.DomUtils.getOuterHTML(element).replace('</object>', '');
        }
        else {
          return content;
        }
      }).replace(reStyle, function(text) {
        return text.replace(reCssUrl, function(content, filePath) {
          var newFilePath = filePath.replace(/['"]*/g, "").trim();
          urlObject = url.parse(newFilePath);

          if (newFilePath.indexOf("base64,") > -1 || newFilePath.indexOf("about:blank") > -1 || newFilePath.indexOf("http://") > -1 || newFilePath === '/') {
            return content;
          }

          newFilePath = urlObject.pathname;

          fullPath = getFullPath(asset, mainPath, newFilePath);

          if (fileExists(fullPath)) {
            //gutil.log('replacing image ' + newFilePath + ' version in css file: ' + file.path);

            prefix = path.relative(asset, fullPath);

            cdnName = getCdnName(fullPath, prefix);
            queue.push({
              name: cdnName,
              path: fullPath
            });

            return 'url(' + options.urlPrefix + cdnName + _.toString(urlObject.hash) + ')';
          }
          else {
            return content;
          }
        });
      }).replace(reEmbed, function(content) {
        element = htmlparser.parseDOM(content)[0];

        if (!element) {
          return content;
        }

        if (_.isString(element.attribs.nocdn)) {
          delete element.attribs.nocdn;
          element.attribs.src += stub;
          return htmlparser.DomUtils.getOuterHTML(element);
        }

        filePath = element.attribs.src || '';

        fullPath = getFullPath(asset, mainPath, filePath);

        if (path.extname(fullPath) === '.php') {
          return content;
        }

        if (fileExists(fullPath)) {
          prefix = path.relative(asset, fullPath);

          cdnName = getCdnName(fullPath, prefix);
          queue.push({
            name: cdnName,
            path: fullPath
          });
          element.attribs.src = options.urlPrefix + cdnName;

          return htmlparser.DomUtils.getOuterHTML(element);
        }
        else {
          return content;
        }
      }).replace(reCommon, function(content, filePath, ext, other) {
        var fullPath;

        // 带 nocdn 标记的自动忽略
        if (reStub.test(other)) {
          return content.replace(reStub, '');
        }

        fullPath = getFullPath(asset, mainPath, filePath);

        if (fs.existsSync(fullPath)) {
          prefix = path.relative(asset, fullPath);

          cdnName = getCdnName(fullPath, prefix);
          queue.push({
            name: cdnName,
            path: fullPath
          });

          return content.replace(other, '').replace(filePath, options.urlPrefix + cdnName);
        }
        else {
          return content;
        }
      }).replace(reStub, '');


      //console.log(contents);
    }

    file.contents = new Buffer(contents);

    return cb(null, file);

  }, function(cb) {
    var len = 0;

    var run = function() {
      uploadFile(queue[len].path, queue[len].name, function() {
        len++;
        if (len >= queue.length) {
          fs.writeFileSync(__dirname + '/cdn-manifest.json', JSON.stringify(cdnCache, null, '  '));

          cb();
        }
        else {
          run();
        }
      });
    };

    if (queue.length > 0) {
      run();
    }
    else {
      return cb();
    }
  });
};
