#!/bin/bash

# include lib
this_file=`readlink -f $0`

DEPLOY_TOOLS_DIR=`dirname $this_file`
. $DEPLOY_TOOLS_DIR/conf.sh
. $DEPLOY_TOOLS_DIR/utils.sh

if [[ $# < 1 ]]; then
  cecho "错误：缺少参数！" $c_error
  exit 1
fi

cecho "\n\t--- 开始部署 ---\n" $c_notify

for host in ${online_clusters}
do
  cecho "\n========= $host ==========\n" $c_notify

  rsync -apzh --stats --exclude=".*" --exclude=".*/" $REMOTE_DEPLOY_DIR/ $SSH_USER@$host:$PRODUCTION_WWW_ROOT/
done

cecho "\n\t--- 完成 ---\n" $c_notify
