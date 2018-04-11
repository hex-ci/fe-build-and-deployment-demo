'use strict';

import gulp from 'gulp';
import del from 'del';
import runSequence from 'run-sequence';
import gulpLoadPlugins from 'gulp-load-plugins';
import staticHash from 'gulp-resource-hash';
import nano from 'gulp-cssnano';
import path from 'path';

import assets from './tools/assets.js';
import preprocess from './tools/preprocess.js';
import cdn from './tools/cdn.js';
import inlineCompress from './tools/inline-compress.js';
import concat from './tools/concat.js';

import pkg from './package.json';

const $ = gulpLoadPlugins();
const isDebug = process.argv.slice(2)[0] === '-debug';

process.env.NODE_ENV = 'production';

// 复制文件
gulp.task('copy', () =>
  gulp.src([
    './src/www/**',
    '!./src/www/**/.svn'
  ], {
    dot: false
  }).pipe(assets.newer())
    .pipe(gulp.dest('output'))
    .pipe($.size({
      title: 'copy'
    }))
    .pipe($.if(isDebug, $.sizereport()))
);

// 优化图片
gulp.task('images', () =>
  gulp.src('./output/**/*.{png,jpg,jpeg,gif}')
    .pipe(assets.newer())
    .pipe($.imagemin({
      progressive: true,
      interlaced: true
    }))
    .pipe(gulp.dest('./output'))
    .pipe($.if(isDebug, $.sizereport()))
);

// 处理 CSS
gulp.task('styles', () => {
  return gulp.src([
    './output/**/*.css'
  ]).pipe(assets.newer())
    .pipe($.sourcemaps.init())
    // .pipe($.sass({
    //   precision: 10
    // }).on('error', $.sass.logError))
    .pipe($.autoprefixer({
      browsers: pkg.browserslist,
      remove: false
    }))
    .pipe(nano({
      autoprefixer: false,
      zindex: false,
      reduceIdents: false
    }))
    .pipe($.size({
      title: 'css'
    }))
    .pipe($.sourcemaps.write('.', {addComment: false}))
    .pipe(gulp.dest('./output'))
    .pipe($.if(isDebug, $.sizereport()));
});

gulp.task('scripts', () => {
  return gulp.src([
    './output/**/*.js'
  ]).pipe(assets.newer())
    .pipe($.sourcemaps.init())
    .pipe($.if('*.es.js', $.babel().on('error', function(err) {
      console.log(err);
    })))
    .pipe($.if('*.es.js', $.sourcemaps.write()))
    .pipe($.uglify({
      ie8: true,
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    }).on('error', function(err) {
      console.log(err);
    }))
    .pipe($.size({
      title: 'js'
    }))
    .pipe($.sourcemaps.mapSources(function(sourcePath) {
      return path.basename(sourcePath);
    }))
    .pipe($.sourcemaps.write('.', {addComment: false}))
    .pipe(gulp.dest('./output'))
    .pipe($.if(isDebug, $.sizereport()));
});

// JS 语法检查
gulp.task('lint', () =>
  gulp.src([
    './output/**/*.js'
  ]).pipe(assets.newer())
    .pipe($.eslint())
    .pipe($.eslint.format())
    .pipe($.eslint.failAfterError())
);

// 预处理 HTML 页面
gulp.task('html', () => {
  return gulp.src(pkg.buildConfig.sourceHtmlPath)
    .pipe(preprocess())
    // 检查新生成的文件
    .pipe(assets.checkAddition())
    .pipe(assets.newer())
    .pipe(gulp.dest('./output'))
    .pipe($.if(isDebug, $.sizereport()));
});

// 重新预处理 HTML 页面，但不生成新文件
gulp.task('redo-html', () => {
  return gulp.src(pkg.buildConfig.sourceHtmlPath)
    .pipe(preprocess({
      noNewFile: true
    }))
    .pipe(gulp.dest('./output'))
    .pipe($.if(isDebug, $.sizereport()));
});

gulp.task('add-version-for-html', () => {
  return gulp.src(pkg.buildConfig.destinationHtmlPath)
    .pipe(staticHash({
      asset: 'output',
      isAdditionExt: true,
      transformPath: function(pathname, hashURL) {
        var phpRegexp = /<\?=\s*?\$staticversion\s*?\?>/i;
        var nameRegexp = /<+?$/g;

        if (phpRegexp.test(decodeURIComponent(hashURL.path)) && nameRegexp.test(decodeURIComponent(hashURL.pathname))) {
          hashURL.pathname = hashURL.pathname.replace(nameRegexp, '');
          delete hashURL.query[''];
        }

        return hashURL;
      }
    }))
    .pipe(gulp.dest('./output'));
});

gulp.task('add-version-for-css', () => {
  return gulp.src('./output/**/*.css')
    .pipe(staticHash({
      asset: 'output',
      isAdditionExt: true
    }))
    .pipe(gulp.dest('./output'));
});

gulp.task('cdn-for-html', () => {
  return gulp.src(pkg.buildConfig.destinationHtmlPath)
    .pipe(cdn({
      asset: 'output',
      urlPrefix: '//cbshowhot.cdn.changbaimg.com/'
    }))
    .pipe(gulp.dest('./output'));
});

gulp.task('cdn-for-css', () => {
  return gulp.src('./output/**/*.css')
    .pipe(cdn({
      asset: 'output',
      urlPrefix: '//cbshowhot.cdn.changbaimg.com/'
    }))
    .pipe(gulp.dest('./output'));
});

gulp.task('inline-compress', () => {
  return gulp.src(pkg.buildConfig.destinationHtmlPath)
    .pipe(inlineCompress())
    .pipe(gulp.dest('./output'));
});

gulp.task('concat', () => {
  return gulp.src([
    './output/**/*.{js,css}'
  ]).pipe(assets.newer())
    .pipe(concat.make())
    .pipe(gulp.dest('./output'))
    .pipe($.if(isDebug, $.sizereport()));
});

gulp.task('check-newer', () => {
  return gulp.src('./src/www/**').pipe(assets.check());
});

gulp.task('make-assets', () => {
  return gulp.src('./src/www/**').pipe(assets.make());
});

// 清理
gulp.task('clean', () => del(['.tmp', 'output/*', '!output/.svn', 'tools/manifest.json', 'tools/.cache'], {
  dot: true
}));

// 开始构建
gulp.task('default', ['check-newer'], cb =>
  runSequence(
    'copy',
    'concat',
    'html',
    'lint',
    'images',
    'styles',
    'scripts',
    'redo-html',
    'cdn-for-css',
    'cdn-for-html',
    'add-version-for-css',
    'add-version-for-html',
    'inline-compress',
    'make-assets',
    cb
  )
);
