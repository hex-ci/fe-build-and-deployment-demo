#!/bin/bash

###########################################################################
# 公共库

# print colored text
# $1 = message
# $2 = color

# 格式化输出
export black='\E[0m\c'
export boldblack='\E[1;0m\c'
export red='\E[31m\c'
export boldred='\E[1;31m\c'
export green='\E[32m\c'
export boldgreen='\E[1;32m\c'
export yellow='\E[33m\c'
export boldyellow='\E[1;33m\c'
export blue='\E[34m\c'
export boldblue='\E[1;34m\c'
export magenta='\E[35m\c'
export boldmagenta='\E[1;35m\c'
export cyan='\E[36m\c'
export boldcyan='\E[1;36m\c'
export white='\E[37m\c'
export boldwhite='\E[1;37m\c'
export EXPORT_LANGUAGE="echo -n"

c_notify=$boldcyan
c_error=$boldred


cecho()
{
  if [ $LANGUAGE = "utf-8" ]
  then
    message=$1
  else
    echo $1 > /tmp/deploy_tools_tmp
    message=`iconv -f "utf-8" -t $LANGUAGE /tmp/deploy_tools_tmp`
    rm -f /tmp/deploy_tools_tmp
  fi

  color=${2:-$black}

  echo -e "$color"
  echo -e "$message"
  tput sgr0 # Reset to normal.
  echo -e "$black"

  return
}

decho()
{
  if [ $LANGUAGE = "utf-8" ]
  then
    message=$1
  else
    echo $1 > /tmp/deploy_tools_tmp
    message=`iconv -f "utf-8" -t $LANGUAGE /tmp/deploy_tools_tmp`
    rm -f /tmp/deploy_tools_tmp
  fi

  if [ $UTILS_DEBUG -eq 1 ]
  then
    color=${2:-$black}

    echo -e "$color"
    echo -e "$message"
    tput sgr0 # Reset to normal.
    echo -e "$black"
  fi
}

cread()
{
  color=${4:-$black}

  echo -e "$color"
  read $1 "$2" $3
  tput sgr0 # Reset to normal.
  echo -e "$black"

  return
}

# 确认用户的输入
deploy_confirm()
{
  if [ $LANGUAGE = "utf-8" ]
  then
    message=$1
  else
    echo $1 > /tmp/deploy_tools_tmp
    message=`iconv -f "utf-8" -t $LANGUAGE /tmp/deploy_tools_tmp`
    rm -f /tmp/deploy_tools_tmp
  fi
  while [ 1 = 1 ]
  do
    cread -p "$message [y/n]: " CONTINUE $c_notify
    if [ "y" = "$CONTINUE" ]; then
      return 1;
    fi

    if [ "n" = "$CONTINUE" ]; then
      return 0;
    fi
  done

  return 0;
}

error_confirm()
{
  if [ $LANGUAGE = "utf-8" ]
  then
    message=$1
  else
    echo $1 > /tmp/deploy_tools_tmp
    message=`iconv -f "utf-8" -t $LANGUAGE /tmp/deploy_tools_tmp`
    rm -f /tmp/deploy_tools_tmp
  fi
  while [ 1 = 1 ]
  do
    cread -p "$message [y/n]: " CONTINUE $c_error
    if [ "y" = "$CONTINUE" ]; then
      return 1;
    fi

    if [ "n" = "$CONTINUE" ]; then
      return 0;
    fi
  done

  return 0;
}

#  获取当前的时间
now()
{
  date +%Y%m%d%H%M%S;
}

########################################
# 检查参数数量是否正确
# check_args_num function_name expect_num achieved_num
########################################
function check_args_num()
{
  if [ $# -ne 3 ]
  then
    echo "function check_args_num  expect 3 args, but achieved $? args.";
    exit 1;
  fi

  local func_name=$1;
  local expect_num=$2;
  local achieve_num=$3;

  if [ $expect_num -ne $achieve_num ]
  then
    echo "function $func_name expect $expect_num args, but achieved $achieve_num args.";
    exit 1;
  fi
}


####################################################################################################

function get_os()
{
  uname -s
}

function init()
{
  mkdir -p $LOCAL_TMP_DIR;
  chmod 777 $LOCAL_TMP_DIR > /dev/null 2>&1
  chmod 777 $LOCAL_TMP_DIR/.. > /dev/null 2>&1
  mkdir -p $LOCAL_DEPLOY_HISTORY_DIR
  chmod 777 $LOCAL_DEPLOY_HISTORY_DIR > /dev/null 2>&1
  touch $DEPLOY_HISTORY_FILE
  chmod 777 $DEPLOY_HISTORY_FILE > /dev/null 2>&1
}

function clean()
{
  rm -rf $LOCAL_TMP_DIR
}

function upload_local_src()
{
  check_args_num $FUNCNAME 1 $#
  src_tgz=$1
  realdst=$REMOTE_DEPLOY_DIR
  #   上传源文件
  uploaded_src_tgz="$LOCAL_DEPLOY_HISTORY_DIR/$CURRENT_TIME-$PROJECT_NAME-up.tgz"
  cp $src_tgz $uploaded_src_tgz
  test -s $uploaded_src_tgz
  if [ 0 -ne $? ]; then
    cecho "\t错误：文件上传失败" $c_error
    exit 1
  fi

  tar xzf $uploaded_src_tgz -C $realdst

  if [ 0 != $? ]
  then
    cecho "\t错误：部署文件失败" $c_error
    exit 1;
  fi
}

function backup_local_src()
{
  check_args_num $FUNCNAME 2 $#
  backup_src_tgz=$1
  files=$2
  backup_dir=`dirname $backup_src_tgz`
  mkdir -p $backup_dir
  tar czf ${backup_src_tgz} -C $REMOTE_DEPLOY_DIR $files
  decho "\t 备份文件路径: ${backup_src_tgz}"
  test -s $backup_src_tgz
  if [ 0 -ne $? ]; then
    cecho "\t错误：原始文件备份失败" $c_error
    exit 1
  fi
}

function ssh_run()
{
  check_args_num $FUNCNAME 2 $#
  host=$1
  cmd=$2
  $SSH $host "$EXPORT_LANGUAGE;$cmd"
  result=$?
  if [ $result -ne 0 ]
  then
    cecho "FAILED $SSH $host $cmd" $c_error
  fi

  return $result
}

function sudo_ssh_run()
{
  check_args_num $FUNCNAME 2 $#
  host=$1
  cmd=$2
  if [ -z $sudo_password ]
  then
    cread -p "input your sudo_password for sudo_ssh_run command:    " sudo_password $c_notify
  fi
  ssh -t $host "echo $sudo_password | sudo -S $cmd"
  result=$?
  if [ $result -ne 0 ]
  then
    cecho "FAILED:  ssh -t $host sudo -p $sudo_password $cmd" $c_error
    return $result
  fi
}

function check_succ()
{
  check_args_num $FUNCNAME 2 $#
  if [ $1 -ne 0 ]
  then
    error_confirm "$2"
    if [ 1 != $? ]; then
      exit 1;
    fi
  fi
}

function lock_local_project()
{
  check_args_num $FUNCNAME 1 $#

  lock_user=$1

  rm -rf $REMOTE_DEPLOY_DIR/.deploy_lock > /dev/null
  echo $lock_user > $REMOTE_DEPLOY_DIR/.deploy_lock
}

function unlock_local_project()
{
  rm -rf $REMOTE_DEPLOY_DIR/.deploy_lock > /dev/null
}
