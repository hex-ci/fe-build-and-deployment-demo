#!/bin/bash

####################################################################################################
#   配置项

#   include lib
this_file=`readlink -f $0`

DEPLOY_TOOLS_DIR=`dirname $this_file`
. $DEPLOY_TOOLS_DIR/conf.sh
. $DEPLOY_TOOLS_DIR/utils.sh

this_path=$DEPLOY_TOOLS_DIR/..

if [[ $# < 1 ]]; then
  cecho "错误：缺少参数！" $c_error
  exit 1
fi

CURRENT_USER=$1

cd $this_path

init

####################################################################################################

CURRENT_TIME=$(now)

mkdir -p $REMOTE_DEPLOY_DIR >/dev/null 2>&1

if [[ -r $REMOTE_DEPLOY_DIR/.deploy_lock ]]; then
  lock=`cat $REMOTE_DEPLOY_DIR/.deploy_lock`

  if [[ $CURRENT_USER != $lock ]]; then
    echo "当前已被 $lock 锁定！"
    exit 1
  fi
fi

lock_local_project $CURRENT_USER

cecho "\n=== 更新代码 ===" $c_notify

# 更新 API 代码
svn up /home/wwwroot/api.changba.com > /dev/null

# 更新前端代码
svn up > /dev/null

# 更新错误，直接退出
if [ $? != 0 ]; then
 cecho "更新前端代码失败!" $c_error
 exit $?;
fi

cecho "\n=== 检查未部署的文件 ===" $c_notify

# 检查当前代码快照，用于比较哪些文件已上线。
ret=0
mkdir -p $this_path/temp
svn export ./src/www $this_path/temp --force > /dev/null
cp $REMOTE_DEPLOY_DIR/.deploy-manifest.json $this_path/tools >/dev/null 2>&1
if [ -f $this_path/tools/.deploy-manifest.json ]; then
  $NODE_BIN $this_path/tools/check-deploy-file.js $this_path/temp
  ret=$?;
  rm $this_path/tools/.deploy-manifest.json
fi
rm -rf $this_path/temp

if [[ $2 = "clean" ]]; then
  cecho "\n=== 清理 ===" $c_notify
  $NODE_BIN $GULP_BIN clean
  shift;
fi

cecho "\n=== 构建 ===\n" $c_notify

$NODE_BIN $GULP_BIN

# 编译错误，直接退出
if [ $? != 0 ]; then
 cecho "构建失败!" $c_error
 exit $?;
fi

# 源文件打包
src_tgz="$LOCAL_TMP_DIR/source.${PROJECT_NAME}-${CURRENT_TIME}.tgz"

# 开始发布代码

#记录当前的更新日志
backup_src_tgz="$LOCAL_DEPLOY_HISTORY_DIR/$CURRENT_TIME-$PROJECT_NAME-bak.tgz"
echo $backup_src_tgz $CURRENT_USER >> $DEPLOY_HISTORY_FILE

# 待上线的代码打包
cecho "\n=== 打包 "`basename $src_tgz`" ===" $c_notify

tar cvzf $src_tgz -C $this_path/output ./ > /dev/null 2>&1
if [ ! -s "$src_tgz" ]; then
  cecho "错误：文件打包失败" $c_error
  exit 1
fi

cecho "\n=== 备份 "`basename $backup_src_tgz`" ===" $c_notify

# 备份代码
backup_local_src $backup_src_tgz ./

# 清理已发布代码
rm -rf $REMOTE_DEPLOY_DIR/*

cecho "\n=== 发布到回归机 ===" $c_notify

# 上传需要更新的代码
upload_local_src $src_tgz

rsync -ap --stats --exclude=".*" --exclude=".*/" $REMOTE_DEPLOY_DIR/ $LOCAL_WWW_ROOT/

cecho "\n  --- 发布到回归机完毕，执行此命令恢复原始版本: sudo livetools rollback $CURRENT_TIME" $c_notify

cecho "\n  --- 请尽快验证效果后执行部署命令: sudo livetools deploy\n" $c_notify

unlock_local_project

# 生成当前代码快照，用于比较哪些文件已上线。
mkdir -p $this_path/temp
svn export ./src/www $this_path/temp --force > /dev/null
$NODE_BIN $this_path/tools/make-deploy-file.js $this_path/temp
cp $this_path/tools/.deploy-manifest.json $REMOTE_DEPLOY_DIR/ >/dev/null 2>&1
rm $this_path/tools/.deploy-manifest.json >/dev/null 2>&1
rm -rf $this_path/temp

clean
