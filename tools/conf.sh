#!/bin/bash

export LANGUAGE="utf-8"

# 项目名
PROJECT_NAME="www.demo.com"

# 线上机器，会部署代码到这里，多个服务器用空格分隔
online_clusters="192.168.1.1";

# 回归机器，会部署代码到这里，多个服务器用空格分隔
beta_clusters="192.168.1.1";

# 测试机器，会部署代码到这里，多个服务器用空格分隔
test_clusters="192.168.1.1";

# 项目部署根目录
ROOT_DEPLOY_DIR="/home/demo"

# 回归机网站根目录路径
LOCAL_WWW_ROOT="/home/wwwroot/beta.demo.com"

# 生产环境网站根目录路径
PRODUCTION_WWW_ROOT="/home/wwwroot/www.demo.com"

# 部署使用的账号 默认为 www-data
SSH_USER="www-data"

NODE_BIN="/usr/bin/node"
GULP_BIN="/usr/bin/gulp"

# 设置为1的时候， 会输出debug信息
UTILS_DEBUG=0

# 项目部署的目录
REMOTE_DEPLOY_DIR="$ROOT_DEPLOY_DIR/$PROJECT_NAME"

# 用于 diff 命令  打包时过滤 logs 目录
DEPLOY_BASENAME=`basename $REMOTE_DEPLOY_DIR`
TAR_EXCLUDE="--exclude $DEPLOY_BASENAME/logs --exclude $DEPLOY_BASENAME/src/www/thumb"


########## 不要修改 #########################

SUDO="sudo -u $SSH_USER"
SSH="sudo -u $SSH_USER ssh"
SCP="sudo -u $SSH_USER scp"

# 保存本地临时文件的目录
LOCAL_TMP_DIR="/tmp/deploy_tools/$USER"
# 上传代码时过滤这些文件
BLACKLIST='(.*\.tmp$)|(.*\.log$)|(.*\.svn.*)|(^diff$)'
# 线上保存临时文件的目录
ONLINE_TMP_DIR="/tmp"
# 备份代码的目录
ONLINE_BACKUP_DIR="$ROOT_DEPLOY_DIR/history/$PROJECT_NAME"
LOCAL_DEPLOY_HISTORY_DIR="$ROOT_DEPLOY_DIR/history/$PROJECT_NAME"
# 代码更新历史(本地文件）
DEPLOY_HISTORY_FILE="$LOCAL_DEPLOY_HISTORY_DIR/deploy_history"
DEPLOY_HISTORY_FILE_BAK="$LOCAL_DEPLOY_HISTORY_DIR/deploy_history.bak"

LOCAL_DEPLOY_SOURCE="$ROOT_DEPLOY_DIR/source"
