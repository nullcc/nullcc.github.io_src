---
title: OpenResty入坑笔记(2)——模板渲染
date: 2019-01-22
tags: [nginx, openresty]
categories: web后端
---

本文将简单演示如何使用OpenResty渲染HTML模板。

<!--more-->

## 项目结构

这个例子的项目结构在原来的基础上增加了两个目录`lualib`和`templates`，`lualib`用来存放第三方Lua库，`templates`用来存放模板文件：

```
template
|-- bin
|   |-- start.sh
|   |-- stop.sh
|-- config
|   |-- mine.types
|   |-- nginx.conf
|-- logs
|   |-- access.log
|   |-- error.log
|-- lua
|   |-- controller.lua
|   |-- init.lua
|-- lualib
|   |-- resty
|       |-- template
|           |-- template.lua
|-- templates
|   |-- view.html
```

## 重要目录和文件详解

先看nginx.conf：

```
worker_processes 1; # 工作进程个数，一般设置成和CPU核数相同。Nginx有两种进程，一种是主进程master process，另一种是工作进程

events {
	worker_connections  1024; # 单个工作进程允许同时建立的最大外部连接数量，一个工作进程在建立一个连接后会同时打开一个文件描述符，该参数受限于进程最大可打开文件数
}

http {
	include            mime.types;
	default_type       application/octet-stream;
	gzip               on;
	sendfile           on;
	keepalive_timeout  65;
	
	# log format
	log_format  main  '$remote_addr - $remote_user [$time_local] "$request" '
                  	'$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

	access_log logs/access.log  main;
	error_log  logs/error.log  error;

	# lua packages
	lua_package_path   "lualib/?.lua;;"; # Lua扩展库搜索路径，';;'是默认路径
	lua_package_cpath  "lualib/?.so;;";  # Lua C扩展库搜索路径，';;'是默认路径
	init_by_lua_file   "lua/init.lua";   # 当Nginx master进程（如果有）加载Nginx配置文件时，在全局Lua虚拟机上运行该指令指定的lua文件

	server {
    listen       8088;
    server_name  localhost;

		set $template_root  "templates"; # 设置模板文件的根目录

    location /lua {
      default_type text/html;
      lua_code_cache off;  # 控制是否缓存lua代码，生产环境中强烈建议打开，否则性能会下降，开发环境为了调试方便可以关闭
      content_by_lua_file  "lua/controller.lua";
    }
	}
}
```

controller.lua文件：

```lua
local template = require "resty.template.template"
template.render("view.html", { message = "Hello, World!!!" })
```

view.html文件：

```html
<!DOCTYPE html>
<html>
<body>
  <h1>{{message}}</h1>
</body>
</html>
```

访问`http://localhost:8088/lua`可以看到`Hello, World!!!`，这就是OpenResty最基本的模板应用。