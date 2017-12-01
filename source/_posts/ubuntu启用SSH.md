---
title: ubuntu启用SSH
date: 2017-08-20
tags: [Linux]
categories: 其他
---

先安装ssh服务，执行命令：

    sudo apt-get install openssh-server

安装后可用一以下命令查看ssh服务的启用情况：

    sudo pe -e | grep ssh

如果ssh服务没有启用，可以执行：

    sudo service ssh start

来启动ssh服务，如果要关闭ssh服务，相应地输入：

    sudo service ssh stop

即可。

<!--more-->

然后用`ifconfig`命令查看本机IP，假设IP为`172.16.130.130`，在其他机器上执行：

    ssh nullcc@172.16.130.130 -p 22

再输入用户密码即可SSH到这台机器上进行操作。
