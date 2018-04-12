---
title: docker常用命令
date: 2018-04-11
tags: [docker]
categories: docker
---

本文主要记录docker常用命令

<!--more-->

`docker version` 列出当前docker版本的详细信息
`docker -v`      列出当前docker版本的简略（只有版本号和发布号）

`docker ps`      查看当前运行容器的状态
`docker ps -a`   查看所有容器的状态

`docker search [image name]`  搜索镜像
`docker pull [image name]`    pull镜像到本地
`docker push [image name]`    push镜像到hub
`docker images`               列出所有本地镜像

`docker run -it ubuntu /bin/bash`
运行ubuntu这个镜像并运行在交互模式（-it表示运行在交互模式），在容器bash中使用exit会退出并关闭容器，如果想退出交互模式但不关闭容器，可以使用ctrl+p ctrl+q

`docker start [container id]`    启动指定容器
`docker stop [container id]`     停止指定容器
`docker restart [container id]`  重启指定容器
`docker attach [container id]`   进入某个容器（使用exit退出后容器也跟着停止运行）
`docker exec -ti [container id]` 启动一个伪终端以交互式的方式进入某个容器（使用exit退出后容器不停止运行）

进入一个容器后做修改，可以进行commit来构建一个新的镜像以保存这些修改：

`docker commit -m "ubuntu with test.txt" -a "ethan.zhang" 7ef8c8a89c70 ethan.zhang/ubuntu:test`
-m后面是本次提交的附带信息，-a后是提交的用户，7ef8c8a89c70是容器ID，ethan.zhang/ubuntu:test指定了目标镜像的用户名、仓库名和tag信息。制作新镜像后可以使用：docker run -it ethan.zhang/ubuntu:test /bin/bash用新构建的镜像启动的容器，确认之前的修改。

`docker rm [container id]`  删除指定容器
`docker rmi [image id]`:    删除指定镜像
注意：删除某个镜像前必须将依赖该镜像的所有容器先删除，否则会报错

`docker build -t [user]/[repo]:[version] .` 
使用当前目录下的Dockerfile创建一个名为[user]/[repo]:[version]的镜像，比如`docker build -t ethan.zhang/flask-demo:latest .`，也可以不填用户名，比如：`docker build -t flask-demo:latest .`

`docker run -d -p 5000:5000 --name flask_server flask_demo:latest`
以flask_demo:latest为镜像以守护模式运行容器（当然你必须事先构建这个镜像），容器名称为flask_server，并将本机5000端口映射到容器的5000端口，注意需要带上镜像tag