---
title: 用Jenkins实现自动化部署和测试
date: 2017-10-12
---

在日常开发和产品在测试环境和生产环境部署时，遇到的一个痛点就是如何高效地完成部署+测试这个环节。很多团队一直采用手工部署的方式，这在系统规模不大的情况下没问题，但是当系统发展到一定规模以后，手工对多服务和多机进行部署无疑是一个巨大的工作量，过程机械繁琐还容易出错。这时候就很有必要升级为自动化部署和测试。

自动化部署和测试的方案有很多，本文主要介绍如何使用Jenkins来实现自动化部署和测试。

[Jenkins](https://jenkins.io/)是一个Java开发的开源的持续集成工具(CI)，它提供了一个软件平台，主要用于实现软件的自动化构建、测试和部署。下面是系统配置：

操作系统：Ubuntu 16.04 LTS
Jenkins版本：Jenkins 2.73.2。

运行以下命令安装Jenkins：

```shell
wget -q -O - https://pkg.jenkins.io/debian/jenkins.io.key | sudo apt-key add -
sudo sh -c 'echo deb http://pkg.jenkins.io/debian-stable binary/ > /etc/apt/sources.list.d/jenkins.list'
sudo apt-get update
sudo apt-get install jenkins
```

安装完毕后，Jenkins会以守护进程的模式运行在后台，我们可以直接在浏览其中访问这台机器的8080端口，在我的机器上是http://172.16.130.130:8080/：

![Jenkins解锁](/assets/images/post_imgs/jenkins_1.png)

为了解锁Jenkins，我们需要访问`/var/lib/jenkins/secrets/initialAdminPassword`这个文件获取一个超级管理员的密码，这在每台机器上部署的密码是不一样的，找到以后填入即可。继续下一步后，Jenkins会进行一些系统初始化的工作，可能会耗费一点时间。然后进入下面的界面：

![Jenkins定制](/assets/images/post_imgs/jenkins_2.png)

我们选择`Install suggested plugins`，安装系统推荐的插件，作为演示案例已经足够了。

之后系统会自动安装一些插件，安装完毕后会跳转到下面的界面要求我们创建一个管理员账号：

![Jenkins创建管理员账号](/assets/images/post_imgs/jenkins_3.png)

创建后就可以进入Jenkins的管理界面了：

![Jenkins管理界面](/assets/images/post_imgs/jenkins_4.png)

点击`创建一个新任务`：

![Jenkins创建一个新任务](/assets/images/post_imgs/jenkins_5.png)

点击OK进入配置项目界面，有一些基础选项需要填写，我们把一个叫做`flask_demo`的示例程序放在Github上，可以利用Jenkins的Github Plugin来为我们自动拉取代码自动部署，配置如下：

通用配置：
![Jenkins新任务配置_通用](/assets/images/post_imgs/jenkins_6.png)

源码管理配置：
![Jenkins新任务配置_源码管理](/assets/images/post_imgs/jenkins_7.png)

构建触发器和构建环境配置（由于是示例，暂时不填）：
![Jenkins新任务配置_构建触发器和构建环境](/assets/images/post_imgs/jenkins_8.png)

构建和构建后操作配置：
![Jenkins新任务配置_构建和构建后操作](/assets/images/post_imgs/jenkins_9.png)

其中构建中的`Execute Shell`是一组shell命令，如下：

```shell
pwd
ps -ef|grep supervisord|grep -v grep|awk '{print $2}'|xargs kill -9
cd ..
sudo rm -r /home/nullcc/flask_demo
cp -r ./flask_demo /home/nullcc
cd /home/nullcc/flask_demo
virtualenv -p python3.5 --no-site-packages venv
. venv/bin/activate
pip install -r requirements.txt
deactivate
sudo supervisord -c /etc/supervisord.conf
```

主要的作用是把拉取的源码复制到部署目录下，并配置virtualenv，然后启动supervisor管理相应Python进程。上述shell代码只是一个很简单且不正式的例子，但是作为示例已经可以工作了。生产环境中的这部分shell脚本可能会非常复杂。也可以是用一些现成的自动化部署工具，比如Ruby的`Capistrano`、node的`shipit`等都是不错的自动化web部署工具，这些工具在多机部署时非常有用。

配置完后可以在Jenkins首页看到一个项目构建列表：

![Jenkins项目构建信息列表](/assets/images/post_imgs/jenkins_10.png)

这个列表展示了所有项目的构建情况，类似最近一次构建是失败还是成功，构建持续时间等。

构建项目时，在首页还可以看到一个构建进度指示：

![Jenkins项目构建进度条](/assets/images/post_imgs/jenkins_11.png)

Jenkins支持通过web hook触发自动构建，在Github等一些仓库的项目设置中可以进行配置。比如Github中的项目，可以在项目的Settings下的Webhooks选项下进行配置，具体的配置方法需要参考不同源码管理平台下的文档。

Jenkins还有很多强大的功能，比如按照日程表构建、构建后通过Email通知、和Github等平台的互操作等，有待进一步探索。
