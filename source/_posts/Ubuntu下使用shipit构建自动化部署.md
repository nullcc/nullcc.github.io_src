---
title: Ubuntu下使用shipit构建自动化部署
date: 2017-08-24
tags: [Linux, 自动化部署]
categories: 自动化部署
---

## 安装

先安装node，执行：

    sudo apt-get update
    sudo apt-get install nodejs

然后安装node版本管理工具nvm：

    wget -qO- https://raw.githubusercontent.com/creationix/nvm/v0.33.0/install.sh | bash

然后运行：

    nvm install node

可以安装最新版本的node。

<!--more-->

## 安装shipit-deploy

接下来安装shipit-deploy，执行：

    sudo npm install shipit-cli -g
    npm install shipit-deploy

## 配置

新建shipitfile.js文件：

    module.exports = function (shipit) {
      require('shipit-deploy')(shipit);

      shipit.initConfig({
        default: {
          workspace: '/home/nullcc/workspace',
          deployTo: '/home/nullcc/deploy/koa2_demo',
          repositoryUrl: 'https://github.com/nullcc/koa2_demo.git',
          ignores: ['.git', 'node_modules'],
          keepReleases: 2,
          deleteOnRollback: false,
          // key: '/path/to/key',
          shallowClone: true
        },
        staging: {
          servers: 'nullcc@172.16.130.130'
        }
      });
    };

运行：
    shipit staging deploy

## 备注

需要注意，为了使整个部署过程完全自动化不需要输入密码，需要把加入ssh-key，具体步骤如下（在你的home目录下）：

    ssh-keygen # 新建密钥对
    cd .ssh
    cat id_rsa.pub >> authorized_keys
    chmod 600 authorized_keys
    chmod 700 ~/.ssh

然后编辑/etc/ssh/sshd_config文件：

    RSAAuthentication yes
    PubkeyAuthentication yes
    PermitRootLogin yes

保存后重启SSH服务：

    service sshd restart

之后再运行`shipit staging deploy`就不用输入密码了。
