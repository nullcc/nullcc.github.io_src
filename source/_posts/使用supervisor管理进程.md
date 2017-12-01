---
title: 使用supervisor管理进程
date: 2017-10-13
tags: [supervisor]
categories: 自动化部署
---

生产环境中经常使用`supervisor`来管理和监控服务器进程，它可以把一个应用进程变成一个daemon，常驻后台运行，还能监控进程状态，重启、停止所管理的进程。supervisor是一个用Python写成的工具，但它不支持Python 3.x。因此真正在用它的时候，一般用Python 2.7（也是很多Linux发行版默认安装的Python版本）来启动supervisor。

<!--more-->

Ubuntu下直接执行下面的命令安装supervisor：

```shell
apt-get install supervisor
```

先使用`echo_supervisord_conf`命令生成配置文件：

```shell
echo_supervisord_conf > /etc/supervisord.conf
```

然后在`[supervisord]`配置节点下，把

```shell
logfile=/tmp/supervisord.log
```
改成
```shell
logfile=/var/log/supervisord.log
```

把
```shell
pidfile=/var/run/supervisord.pid
```
改成
```shell
pidfile=/var/run/supervisord.pid
```

在`[supervisorctl]`配置节点下，把

```shell
serverurl=unix:///tmp/supervisor.sock
```
改成
```shell
serverurl=unix:///var/run/supervisor.sock
```
并把该节点下的注释符号`;`都删除。

最后在文件末尾追加下面的配置：

```shell
[program:flask_demo]
command=/bin/bash -c 'source /home/nullcc/flask_demo/venv/bin/activate && gunicorn -w 4 -b :8082 index:app' ; supervisor启动命令
directory=/home/nullcc/flask_demo/                                          ; 项目的文件夹路径
startsecs=0                                                                 ; 启动时间
stopwaitsecs=0                                                              ; 终止等待时间
autostart=false                                                             ; 是否自动启动
autorestart=false                                                           ; 是否自动重启
stdout_logfile=/home/nullcc/flask_demo/log/gunicorn.log                     ; log 日志
stderr_logfile=/home/nullcc/flask_demo/log/gunicorn.err                     ; 错误日志
```

可以用下面的命令来启动supervisor，`-c`参数表示让supervisord使用指定的配置文件。

```shell
supervisord -c /etc/supervisord.conf
```

启动supervisor后，可以在本地的9001端口看到supervisor的web监控界面：

![supervisor_web监控界面](/assets/images/post_imgs/supervisor_1.png)

## 开机启动Supervisord

默认情况下，Supervisord没有被安装成一个服务，我们需要进行一些配置，以Ubuntu为例：

```shell
# 下载脚本
sudo su - root -c "sudo curl https://gist.githubusercontent.com/howthebodyworks/176149/raw/d60b505a585dda836fadecca8f6b03884153196b/supervisord.sh > /etc/init.d/supervisord"
# 设置该脚本为可以执行
sudo chmod +x /etc/init.d/supervisord
# 设置为开机自动运行
sudo update-rc.d supervisord defaults
# 试一下，是否工作正常
service supervisord stop
service supervisord start
```

这个脚本下载下来以后，需要检查里面的一些配置，比如配置文件的地址，pid文件地址等，把它们配置成我们需要的样子以后就可以了。
