const fs = require('fs');
const crypto = require('crypto');

// 递归获取文件列表
const walk = (dir) => {
  let results = [];
  const list = fs.readdirSync(dir);

  list.forEach((file) => {
    file = dir + '/' + file;
    const stat = fs.statSync(file);

    if (stat && stat.isDirectory()) {
      // 递归进入子目录
      results = results.concat(walk(file));
    }
    else {
      results.push(file);
    }
  });

  return results;
};

const md5 = (str) => {
  return crypto.createHash('md5').update(str).digest('hex');
};


let path;

if (process.argv.length > 2) {
  path = process.argv[2];
}
else {
  path = './';
}

path = fs.realpathSync(path);

const files = walk(path);
const result = {};

files.forEach(file => {
  const fileContent = fs.readFileSync(file);
  const newFile = file.replace(path, '');

  result[newFile] = md5(fileContent);
});

fs.writeFileSync(__dirname + '/.deploy-manifest.json', JSON.stringify(result, null, '  '));
