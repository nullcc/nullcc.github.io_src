---
title: CentOS7搭建FTP Server
date: 2018-03-15
tags: [环境配置]
categories: 环境配置
---

本文主要记录CentOS下FTP Server的安装和配置流程。

<!--more-->

## 安装vsftpd

    yum install -y vsftpd

## 启动vsftpd

    service vsftpd start

运行下面的命令：

    netstat -nltp | grep 21

我们可以看到vsftpd监听在21端口了：

![vsftpd监听在21端口](/assets/images/post_imgs/linux_ftp1.png)

此时直接访问`ftp://ip`（ip要换成你服务器的ip）就可以看到FTP的目录了：

![web上访问ftp](/assets/images/post_imgs/linux_ftp2.png)

## 创建ftp用户

创建一个用户：

    useradd ftpuser

对其设置密码：

    passwd ftpuser

限制该用户只能通过FTP访问服务器，而不能登录：

    usermod -s /sbin/nologin ftpuser

## ftp配置

vsftpd的配置目录为/etc/vsftpd。目录中文件含义如下：

    vsftpd.conf 为主要配置文件
    ftpusers 配置禁止访问 FTP 服务器的用户列表
    user_list 配置用户访问控制

创建一个欢迎文件：

    echo "Welcome to use FTP service." > /var/ftp/welcome.txt

设置目录权限：

    chmod a-w /var/ftp && chmod 777 -R /var/ftp/pub

设置该用户的主目录：

    usermod -d /var/ftp ftpuser

还需要关闭SELinux：

    setenforce 0

之后就可以通过FTP上传软件上传文件并访问了。