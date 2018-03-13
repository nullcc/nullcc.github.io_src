---
title: CentOS7下常用软件安装
date: 2018-03-13
tags: [环境配置]
categories: 环境配置
---

本文主要记录CentOS7下常用软件安装的流程。

<!--more-->

## 安装基础编译工具：

    yum install gcc gcc-c++


## 安装Git：

    yum install -y git

## 安装Redis：

    wget http://download.redis.io/releases/redis-4.0.8.tar.gz # 版本号可根据需要改变
    tar xzf redis-4.0.8.tar.gz
    cd redis-4.0.8
    make
    make install

上述命令执行后，会在`/usr/local/bin`目录下生成下面几个可执行文件，它们的作用分别是：

    redis-server：Redis服务器端启动程序 
    redis-cli：Redis客户端操作工具
    redis-benchmark：Redis性能测试工具 
    redis-check-aof：AOF文件修复工具 
    redis-check-dump：检查导出工具

接着我们把Redis的配置文件拷贝到/etc下，/etc目录在UNIX-like系统中一般用来放各种配置文件。执行：

    cp redis.conf /etc/

之后修改配置文件将Redis设置为守护进程启动：

    vim /etc/redis.conf

修改如下：

    daemonize yes

然后使用刚才修改过的配置文件启动Redis：

    redis-server /etc/redis.conf

最后检查Redis运行情况：

    ps -ef | grep redis

看到类似输出表示Redis启动没毛病：

    root     26935     1  0 11:02 ?        00:00:00 redis-server 127.0.0.1:6379

如果想将Redis添加到开机启动项，将其添加到rc.local文件即可：

    echo "/usr/local/bin/redis-server /etc/redis.conf" >>/etc/rc.local

## 安装MySQL 5.7

下载MySQL yum源安装包：

    wget http://dev.mysql.com/get/mysql57-community-release-el7-8.noarch.rpm

安装MySQL yum源：

    yum localinstall mysql57-community-release-el7-8.noarch.rpm

安装：

    yum install mysql-community-server

启动MySQL：

    systemctl start mysqld

加入开机启动：

    systemctl enable mysqld
    systemctl daemon-reload

MySQL安装后，在`/var/log/mysqld.log`为root用户生成了一个默认密码，我们需要修改root密码：

    grep 'temporary password' /var/log/mysqld.log # 获取root默认密码
    mysql -uroot -p                               # 进入MySQL
    ALTER USER 'root'@'localhost' IDENTIFIED BY 'your_root_password'; # 设置root用户的密码

## 安装Docker：

    sudo yum update
    sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    yum list docker-ce --showduplicates | sort -r
    sudo yum install docker-ce
    
启动docker并加入开机启动项：

    sudo systemctl start docker
    sudo systemctl enable docker

验证docker安装成功：

    docker version

### 在docker下安装nginx：

我们使用官方镜像来安装：

    docker pull nginx

启动nginx：

    docker run -p 80:80 --name mynginx  -v $PWD/conf/nginx.conf:/etc/nginx/nginx.conf -v /var/www/hexo:/opt/nginx/www -v $PWD/log:/opt/nginx/log -d nginx

解释一下参数：

1. -p 80:80：容器的80端口映射到本机的80端口（左边是本机，右边是容器）
2. --name mynginx：容器名称，可以自定义
3. -v $PWD/conf/nginx.conf:/etc/nginx/nginx.conf：表示将本机当前目录下的nginx.conf映射到容器的/etc/nginx/nginx.conf
4. -v /var/www/hexo:/opt/nginx/www：表示将本机的/var/www/hexo目录映射到容器的/opt/nginx/www，注意这里其实是把一个静态文件目录映射到容器内，这个静态文件目录可以自己定义
5. -v $PWD/log:/opt/nginx/log：表示将本机当前目录下的/log目录映射到容器的/opt/nginx/log，作为存放日志的地方

## 安装nvm：

根据[nvm在GitHub页面](https://github.com/creationix/nvm)的README.md来安装：

    curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.8/install.sh | bash

然后编辑你所使用的shell的profile，加入：

    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" # This loads nvm

之后source一下profile，假设使用bash，运行：

    source ~/.bashrc

验证安装：

    nvm --version

## 安装JDK

列出JDK1.8的列表：

    yum list java-1.8*

从列表中选择`java-1.8.0-openjdk.x86_64`这项，安装JDK1.8：

    yum install java-1.8.0-openjdk.x86_64

验证JDK安装：

    java -version

## 安装Jenkins

下载依赖：

    sudo wget -O /etc/yum.repos.d/jenkins.repo https://pkg.jenkins.io/redhat-stable/jenkins.repo

导入密钥：

    sudo rpm --import https://pkg.jenkins.io/redhat-stable/jenkins.io.key

安装：

    yum install jenkins

查看Jenkins安装路径：

    rpm -ql jenkins

输出：

    /etc/init.d/jenkins
    /etc/logrotate.d/jenkins
    /etc/sysconfig/jenkins
    /usr/lib/jenkins             # Jenkins安装目录，war包在此
    /usr/lib/jenkins/jenkins.war # war包在此
    /usr/sbin/rcjenkins
    /var/cache/jenkins
    /var/lib/jenkins             # 默认的JENKINS_HOME
    /var/log/jenkins             # Jenkins日志文件存放处

Jenkins的配置文件存放在`/etc/sysconfig/jenkins`，我们通过可以修改`JENKINS_PORT`配置项来修改端口号，默认是8080。s

最后以守护模式启动Jenkins，也可以在命令中指定端口号：

    nohup java -jar /usr/lib/jenkins/jenkins.war --httpPort=8080 &

之后在web上做一些配置即可。
