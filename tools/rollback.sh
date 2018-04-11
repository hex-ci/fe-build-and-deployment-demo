#!/bin/bash

#   include lib
this_file=`readlink -f $0`

DEPLOY_TOOLS_DIR=`dirname $this_file`
. $DEPLOY_TOOLS_DIR/conf.sh
. $DEPLOY_TOOLS_DIR/utils.sh

if [[ $# < 2 ]]; then
  cecho "错误：缺少参数！" $c_error
  exit 1
fi

filename=$2

cecho "\n\t--- 开始回滚 ---\n" $c_notify

if [ ! -s "$LOCAL_DEPLOY_HISTORY_DIR/$filename-$PROJECT_NAME-bak.tgz" ]; then
  cecho "错误：回滚文件无效" $c_error
  exit 1
fi

tar xfz $LOCAL_DEPLOY_HISTORY_DIR/$filename-$PROJECT_NAME-bak.tgz -C $REMOTE_DEPLOY_DIR

cecho "\n === rsync ===" $c_notify

rsync -ap --stats --exclude=".*" --exclude=".*/" $REMOTE_DEPLOY_DIR/ $LOCAL_WWW_ROOT/

cecho "\n\t--- 完成 ---\n" $c_notify
