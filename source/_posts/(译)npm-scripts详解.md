---
title: (译)npm-scripts详解
date: 2017-05-10
tags: [node]
categories: 文档翻译
---

本文翻译了[npm-scripts](https://docs.npmjs.com/misc/scripts)。

<!--more-->

## 概述

npm在package.json中支持脚本属性，有以下几种脚本：

* prepublish：在包被发布前运行。(也会运行在无任何参数的本地npm install时)
* publish, postpublish：在包被发布后运行。
* preinstall：在包被安装前运行。
* install, postinstall：在包被安装后运行。
* preuninstall, uninstall：在被被卸载前运行。
* postuninstall：在包被卸载后运行。
* preversion, version：更改包版本前运行。
* postversion：更改包版本后运行。
* pretest, test, posttest：在运行npm test时会运行。
* prestop, stop, poststop：在运行npm stop时会运行。
* prestart, start, poststart：在运行npm start时会运行。
* prerestart, restart, postrestart在运行npm restart时会运行。注意，如果没有提供npm restart及脚本，npm restart会运行npm stop和npm start脚本。

而且，还可以使用npm run-script <pkg> <stage>来运行任意脚本。名字中带有pre和post的脚本也会在相应的脚本被运行前后被执行(例如premyscript, myscript, postmyscript这三个脚本会顺序被执行)。

## 一般用法

如果你需要在你的包被使用前执行一些操作，并且不依赖于操作系统或目标系统的架构，可以用一个prepublish脚本，在里面包含类似如下的操作：

* 把CoffeeScript源码编译成JavaScript。
* 创建JavaScript代码的压缩版本。
* 获取包需要用到的远端资源。

这么做的好处是，这些操作会在固定的时间执行一次，从而降低复杂性和可变现。而且这意味着，你可以把coffee-script作为一个devDependency，因此你的用户并不需要安装它。你不需要在包中包含压缩版本的代码，这可以减小包的大小。你不需要依赖于目标用户的机器支持curl或wget等系统工具。

## 默认值

npm会基于包内容设置一些默认值。

* "scripts": {"start": "node server.js"}

    如果包的根目录中有一个server.js，那么npm会用它来作为入口文件：运行node server.js。

* "install": "node-gyp rebuild":

    如果包的根目录中有一个binding.gyp文件，那么npm会在使用node-gyp编译时执行install命令。

## USER

如果用root权限使用npm，则会将uid变成root用户或者在用户配置中指定的值，默认是无用户。可以设置一个不安全标志来在使用root权限运行脚本时提示用户。

## ENVIRONMENT

在包脚本的运行环境中，会展示很多关于当前包安装状态和进度的信息。

## path

如果你的依赖包定义了可执行脚本，比如测试套件，那么这些可执行文件将会被加入到脚本执行路径中。所以，如果你的package.json中有这样的信息：

    {
        "name" : "foo",
        "dependencies" : { "bar" : "0.1.x" },
        "scripts": { "start" : "bar ./test" }
    }

那么你可以运行npm start来执行这个bar脚本，这个bar会在执行npm install时被导入到node_modules/.bin目录中去。

## package.json的变量

package.json中的字段会被附加上npm_package_前缀。举个例子，比如你的package.json中有{"name":"foo", "version":"1.2.5"}这样的信息，那么你的包脚本会包含值为"foo"的环境变量npm_package_name，而npm_package_version的值为"1.2.5"。

## 配置

配置参数都会被冠以npm_config_的前缀。比如环境变量npm_config_root存放的就是root配置。

## 特殊的package.json "config" 对象

package.json中的config字段可以被这种形式改写：<name>[@<version>]:<key>。举个例子，如果package.json中是这样的：

    {
        "name" : "foo",
        "config" : { "port" : "8080" },
        "scripts" : { "start" : "node server.js" }
    }

然后server.js是这样的：

    http.createServer(...).listen(process.env.npm_package_config_port)

那么用户可以用这种方式来改写：

    npm config set foo:port 80

## 当前生命周期事件

最后，环境变量npm_lifecycle_event会被设置成具体某个生命周期阶段。所以，你可以写一个在不同生命周期阶段执行不同操作的的脚本。

对象会被展平表示出来，比如package.json中有一个{"scripts":{"install":"foo.js"}}，那么你在脚本中可以这么写：

    process.env.npm_package_scripts_install === "foo.js"

## 退出

脚本是通过给sh传递参数来运行的。

如果脚本的退出代码不是0，那么sh会终止脚本进程。

注意这些脚本文件不需要一定要是nodejs或者javascript程序。它们只要是某种可执行文件即可。

## 钩子脚本

如果你想在所有包的特定生命周期事件中运行特定的脚本，那么你可以使用钩子脚本。

在node_modules/.hooks/{eventname}下放一个可执行文件，则该根目录下安装的所有包在到达包生命周期的这个事件阶段时会执行这个可执行文件。

钩子脚本的运行机制和package.json的脚本一样。它们会和上述环境运行在不同的子进程中。

## 最佳实践

* 如果不是非常需要请不要以一个非零错误码退出。除了卸载脚本，这么做会导致npm运行出错，而且可能会导致回滚。如果只是少数几个错误或者只是禁止使用某些可选特性，比较好的做法是打印一个警告并且安全退出。

* 不要写脚本去做那些npm本身能帮你做的事情。请通过查看package.json来确定所有那些你能通过简单指定和描述做的事情。一般来说，这更具有鲁棒性和一致性。

* 检查env来决定往什么地方安装东西。具体来说，如果环境变量npm_config_binroot被设置成了/home/user/bin，那么久不要尝试去安装可执行文件到/usr/local/bin。因为用户可能是为了某种原因才这么设置的。

* 不要用sudo来运行你的脚本命令。如果因为某种原因需要root权限，那么就报告一个错误，用户会转而用sudo来运行npm。

* 不要使用install脚本。请使用一个.gyp文件来编译，用prepublish做一些杂事。你不应该明确地设置一个preinstall或者install脚本。如果你正在这么做，请考虑一下是否有其他选项。install和preinstall脚本的唯一合法使用方式是在目标架构上进行编译。

参考资料

[npm-run-script](https://docs.npmjs.com/cli/run-script)
[package.json](https://docs.npmjs.com/files/package.json)
[npm-developers](https://docs.npmjs.com/misc/developers)
[npm-install](https://docs.npmjs.com/cli/install)
