---
title: Linux下好用的命令收集
date: 2018-04-13
tags: [Linux]
categories: Linux
---

本文主要记录一些Linux下好用的命令，主要是个人在日常使用中经常使用的，此文会不断更新

<!--more-->

### 系统信息

arch 机器的处理器架构
uname -m 机器的处理器架构
uname -r 内核版本
cat /proc/cpuinfo 显示cpu info的信息
cat /proc/version 显示内核版本的详细信息
date 显示系统日期
cal 显示日历
cal [year] 显示具体年份的日历


### 系统启动、重启和关机

shutdown -h now 关闭系统
init 0 关闭系统
telinit 0 关闭系统 
shutdown -h hours:minutes & 按预定时间关闭系统 
shutdown -c 取消按预定时间关闭系统 
shutdown -r now 重启
reboot 重启
logout 注销 


### 文件和目录

cd .. 返回上一级目录
cd - 返回上次所在的目录
pwd 查看当前所在目录
ls -l 显示文件和目录的详细信息
ls -a 显示所有文件和目录(包括隐藏文件)
mkdir [dir] 创建一个目录
mkdir [dir1] [dir2] 创建多个目录
mkdir -p [path to dir] 创建一个目录树
rm -f [file] 删除一个文件
rm -rf [dir] 删除一个目录
mv [file1] [file2] 重命名文件file1为file2
cp [file1] [file2] 复制文件
cp -a [dir1] [dir2] 复制目录
cp -a [dir] . 复制一个目录到当前工作目录 
ln -s [file] [link] 创建一个指向文件或目录的软链接
ln [file] [link] 创建一个指向文件或目录的物理链接(硬链接)
scp /opt/soft/nginx-0.5.38.tar.gz root@10.10.10.10:/opt/soft/scptest 上传本地文件到远程机器指定目录
scp -r /opt/soft/mongodb root@10.10.10.10:/opt/soft/scptest 上传本地目录到远程机器指定目录
scp root@10.10.10.10:/opt/soft/nginx-0.5.38.tar.gz /opt/soft/ 从远程机器复制文件到本地
scp -r root@10.10.10.10:/opt/soft/mongodb /opt/soft/ 从远程机器复制目录到本地


### 文件查找

find / -name [file] 从/开始查找指定的文件
find / -user [user] 从/开始查找属于指定用户的文件或目录
find / -name \*.zip 从/开始查找以.zip结尾的文件
which cd 显示一个二进制文件或可执行文件的完整路径
whereis cd 显示一个二进制文件、源码和man的位置
grep -rnw [/path/to/folder] -e 'patten'  在指定目录下递归查找匹配模式

### 磁盘空间

df -h 显示已挂载的分区列表
du -sh * 查看当前目录下文件/文件夹的大小


### 用户和组

useradd [user] 创建一个新用户
passwd [user] 修改指定用户的密码(只有root用户可以运行)
groupadd [group] 创建一个新的用户组
groupdel [group] 删除指定用户组
groupmod -n [new group name] [old group name] 重命名一个用户组
useradd -G [group] [user] 创建一个新用户并把他加入指定用户组
id [user] 显示用户的用户ID(uid)和组ID(gid)


### 查看文件内容

cat [file] 从第一个字节开始正向查看文件内容
tac [file] 从最后一个字节开始反向查看文件内容
more [file] 查看长文件的内容(space显示下一屏，Enter显示下一行)
less [file] 和more很相似，但less允许用户向前后向后浏览文件(PageUp向上翻页，PageDown向下翻页)
head -2 [file] 查看一个文件的前两行
tail -2 [file] 查看一个文件的最后两行
tail -f [file] 实时查看被追加到指定文件的内容(常用来实时打印日志)


### 进程

ps -ef 以全格式显示所有进程
ps -ef | grep java 显示所有java进程
ps aux 和ps -ef类似，只不过ps aux是BSD风格，ps -ef是System V风格，且aux会截断command列，而-ef不会，一般推荐使用ps -ef
kill -9 [pid] 强制终止一个进程
pstree 树形显示进程
lsof -i:[port] 查看占用指定端口的进程


### 网络

ifconfig eth0 显示一个以太网卡的配置
ifup eth0 启用eth0网络设备
ifdown eth0 禁用eth0网络设备
nslookup [host] 查询host的IP地址


### I/O重定向

/dev/null 空设备文件
0 stdin标准输入
1 stdout标准输出
2 stderr标准错误

\> 标准输出重定向，覆盖原文件内容
\>> 标准输出重定向，不覆盖原文件内容，追加写入
2> 错误输出重定向，覆盖原文件内容
2>> 错误输出重定向，不覆盖原文件内容，追加写入
2>&1 将标准错误重定向到标准输出

### misc

!! 显示上一次执行的命令
cat /etc/shells 查看存在的shell
echo $SHELL 查看正在使用的shell
chsh -s /bin/${shell_type} 改变当前用户默认使用的shell类型