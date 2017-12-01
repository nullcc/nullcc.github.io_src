---
title: MySQL主从复制详解
date: 2017-08-17
tags: [MySQL]
categories: 数据库
---

## 数据库主从复制的作用

  在保证系统高可用时，我们会想把数据库做成主-从的架构，这可以通过binlog，把主库的内容同步到从库，以备份数据。更进一步，如果主库挂了，从库可以顶上，保证系统的高可用性。

## 目标系统

  Ubuntu Server LTS 16.04.3 x64（两台，主从）

  master: 172.16.130.130（主）MySQL版本5.7.19

  backup: 172.16.130.131（从）MySQL版本5.7.19

## 安装

  安装MySQL：

    sudo apt-get install mysql-server

## 配置

  修改主服务的/etc/mysql/my.cnf文件，添加：

    [mysqld]
    server-id=1
    log_bin=master-bin
    binlog_format=mixed
    binlog_do_db=blog
    binlog_ignore_db=mysql

然后重启主服务器mysql：

    /etc/init.d/mysql restart

登录主服务器mysql，执行：

    grant replication slave on *.* to 'slave' @'172.16.130.131' identified by '123456';

然后刷新一下权限表：

    FLUSH PRIVILEGES;

然后登录主服务器mysql，执行：

  show master status;

可以看到如下结果：

![主服务器状态](/assets/images/post_imgs/mysql_master_slave_1.png)

接着修改从服务器的/etc/mysql/my.cnf文件，添加：

    [mysqld]
    server-id=2
    binlog_format=mixed
    binlog_do_db=blog
    binlog_ignore_db=mysql

然后重启从服务器mysql，执行：

    /etc/init.d/mysql restart

登录从服务器mysql，连接主服务器，执行：

    change master to
    master_host='172.16.130.130',
    master_port=3306,
    master_user='slave',
    master_password='123456',
    master_log_file='master-bin.000007',
    master_log_pos=1510

注意这里`master_host`为master的地址，`master_user`和`master_password`分别为之前master分配给slave的账号和密码，`master_log_file`是之前执行`show master status;`时File的值， `master_log_pos`是之前执行`show master status;`时Position的值。

然后启动slave数据同步：

    start slave;

查看slave状态：

    show slave status\G;

可以看到：

![从服务器状态](/assets/images/post_imgs/mysql_master_slave_2.png)

说明从服务器连接主服务器成功。

这时候主服务器上blog库的变化会同步给从服务器上的blog库。

## 遇到的问题

主从同步失败的可能原因如下：

1. 主从的/etc/mysql/my.cnf中server-id配置成一样的。
2. 主的MySQL不允许远程连接。
3. 从在执行`change master`时参数有问题。

相应的解决方案：

1. 主从/etc/mysql/my.cnf中server-id一定要不同。
2. 检查主的iptables，允许3306端口对外开放。
3. 从在执行`change master`时的参数一定要和主执行`show master status;`时的对应参数一致。
