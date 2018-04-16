---
title: docker常用命令
date: 2018-04-11
tags: [docker]
categories: docker
---

本文主要记录docker常用命令

<!--more-->

### 查看docker基本信息

`docker version`  当前docker版本的详细信息

`docker -v`       当前docker版本的简略（只显示版本号和发布号）

`docker info`     docker当前状态


### 容器

`docker ps`                 查看当前正在运行容器的状态

`docker ps -a`              查看所有容器的状态

`docker rm [container]`  删除指定容器

`docker diff [container]` 查看容器存储层的改动

`docker logs [container]` 查看容器的日志


### 镜像

`docker search [image]`  搜索镜像

`docker pull [image]`    pull镜像到本地

`docker push [image]`    push镜像到hub

`docker images`或`docker image ls`  列出所有本地顶层镜像

`docker images -a`或`docker image ls -a`  列出所有本地镜像（包括顶层镜像和中间层镜像）

`docker images [image]:[image tag]`或`docker image ls [image]:[image tag]`  列出本地所有指定的镜像名（tag为可选）

`docker rmi [image]`或`docker image rm [image]`  删除指定镜像（注意：删除某个镜像前必须将依赖该镜像的所有容器先删除，否则会报错）

`docker rmi $(docker image ls -q [image])`  删除指定的所有镜像

`docker history [image]` 查看镜像的历史记录


## 构建

`docker build -t [user]/[repo]:[version] .`  使用当前目录下的Dockerfile（默认，也可以用-f参数指定一个Dockerfile）构建一个名为[user]/[repo]:[version]的镜像，也可以不填用户名：`docker build -t [repo]:[version] .`

`docker build -t [git repo url] [user]/[repo]:[version]`  从git repo url构建


### 运行

`docker start [container]`      启动指定容器

`docker stop [container]`       停止指定容器

`docker restart [container]`    重启指定容器

`docker pause [container]`      暂停容器中所有的进程

`docker unpause [container]`    恢复容器中所有的进程

`docker attach [container]`     进入某个容器（使用exit退出后容器也会跟着停止运行）

`docker exec -ti [container]`   启动一个伪终端以交互式的方式进入某个容器（使用exit退出后容器不停止运行，当需要进入容器时推荐使用exec）

`docker run -it [image] /bin/bash`  运行镜像并运行在交互模式（-it是两个选项，-i表示运行在交互模式，-t表示终端），在容器bash中使用exit会退出并关闭容器，如果想退出交互模式但不关闭容器，可以使用ctrl+p ctrl+q，如果想在退出容器时删除容器以节省空间的话，可以带上--rm参数

`docker commit -m "[commit message]]" -a "[user name]" [container id] [user name]/[image]:[image tag]`  进入一个容器后做修改，可以进行commit来构建一个新的镜像以保存这些修改，之后如果有需要可以在新镜像的基础上继续构建。-m表示本次提交的附带信息，-a表示提交的用户

`docker run -d -p [host port]:[container port] -v [host dir]:[container dir] --name [container name] [image]:[image tag]`  -d表示以deamon模式运行容器，-p表示将宿主机端口(host port)映射到容器端口(container port)，-v表示将宿主机的目录(host dir)映射到容器目录(container dir)，之所以需要映射目录是因为容器一旦退出，容器层面上的存储就会消失，容器的存储层是无状态的，它本身不能用来持久化任何数据，所以需要将需要持久化的数据映射到宿主机上，--name表示容器名称，注意后面的镜像名(image name)和镜像标签(image tag)都要有