---
title: OpenResty入坑笔记(1)——搭建基本的OpenResty开发环境
date: 2019-01-18
tags: [nginx, openresty]
categories: web后端
---

本文简单记录了一下搭建基本的OpenResty开发环境的过程，并展示了简单的统计endpoint访问次数的功能。

<!--more-->

## 安装

由于OpenResty基于Nginx，所以首先需要安装Nginx，这个步骤这里就不写了，网上可以找到很详细的安装过程。OpenResty的安装，可以参考[官方网站的安装文档](http://openresty.org/en/installation.html)，也非常容易。


## 项目结构

需要说明的是，由于本文是一个搭建教程，所以只会列出最基本的一些目录和文件，随着后续教程的深入，将添加更多的目录和文件。先来快速浏览一下这个demo中项目的文件结构：

```
openresty-basic-demo
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
```


## 重要目录和文件详解

`bin`目录下放置的是Nginx的启动和停止的shell脚本。

start.sh内容如下：

```sh
# start.sh
nginx_started=$(ps -ef | grep nginx | grep -v 'grep')

if [ -z "$nginx_started" ]; then
  # nginx is not started, start nginx
  echo 'Start Nginx...'
  nginx -t -p `pwd` -c config/nginx.conf
  nginx -p `pwd` -c config/nginx.conf
else
  # nginx is started, reload nginx
  echo 'Reload Nginx...'
  nginx -t -p `pwd` -c config/nginx.conf
  nginx -s reload -p `pwd` -c config/nginx.conf
fi
```

stop.sh内容如下：

```sh
# stop.sh
nginx -s quit
```

`config`目录下的`mime.types`文件是Nginx会用到`MIME Type`，这个文件的内容基本是固定的：

```
# mime.types
types {

  # Data interchange

    application/atom+xml                  atom;
    application/json                      json map topojson;
    application/ld+json                   jsonld;
    application/rss+xml                   rss;
    # Normalize to standard type.
    # https://tools.ietf.org/html/rfc7946#section-12
    application/geo+json                  geojson;
    application/xml                       xml;
    # Normalize to standard type.
    # https://tools.ietf.org/html/rfc3870#section-2
    application/rdf+xml                   rdf;


  # JavaScript

    # Servers should use text/javascript for JavaScript resources.
    # https://html.spec.whatwg.org/multipage/scripting.html#scriptingLanguages
    text/javascript                       js mjs;


  # Manifest files

    application/manifest+json             webmanifest;
    application/x-web-app-manifest+json   webapp;
    text/cache-manifest                   appcache;


  # Media files

    audio/midi                            mid midi kar;
    audio/mp4                             aac f4a f4b m4a;
    audio/mpeg                            mp3;
    audio/ogg                             oga ogg opus;
    audio/x-realaudio                     ra;
    audio/x-wav                           wav;
    audio/x-matroska                      mka;
    image/bmp                             bmp;
    image/gif                             gif;
    image/jpeg                            jpeg jpg;
    image/jxr                             jxr hdp wdp;
    image/png                             png;
    image/svg+xml                         svg svgz;
    image/tiff                            tif tiff;
    image/vnd.wap.wbmp                    wbmp;
    image/webp                            webp;
    image/x-jng                           jng;
    video/3gpp                            3gp 3gpp;
    video/mp4                             f4p f4v m4v mp4;
    video/mpeg                            mpeg mpg;
    video/ogg                             ogv;
    video/quicktime                       mov;
    video/webm                            webm;
    video/x-flv                           flv;
    video/x-mng                           mng;
    video/x-ms-asf                        asf asx;
    video/x-ms-wmv                        wmv;
    video/x-msvideo                       avi;
    video/x-matroska                      mkv mk3d;

    # Serving `.ico` image files with a different media type
    # prevents Internet Explorer from displaying then as images:
    # https://github.com/h5bp/html5-boilerplate/commit/37b5fec090d00f38de64b591bcddcb205aadf8ee

    image/x-icon                          cur ico;


  # Microsoft Office

    application/msword                                                         doc;
    application/vnd.ms-excel                                                   xls;
    application/vnd.ms-powerpoint                                              ppt;
    application/vnd.openxmlformats-officedocument.wordprocessingml.document    docx;
    application/vnd.openxmlformats-officedocument.spreadsheetml.sheet          xlsx;
    application/vnd.openxmlformats-officedocument.presentationml.presentation  pptx;


  # Web fonts

    font/woff                             woff;
    font/woff2                            woff2;
    application/vnd.ms-fontobject         eot;
    font/ttf                              ttf;
    font/collection                       ttc;
    font/otf                              otf;


  # Other

    application/java-archive              ear jar war;
    application/mac-binhex40              hqx;
    application/octet-stream              bin deb dll dmg exe img iso msi msm msp safariextz;
    application/pdf                       pdf;
    application/postscript                ai eps ps;
    application/rtf                       rtf;
    application/vnd.google-earth.kml+xml  kml;
    application/vnd.google-earth.kmz      kmz;
    application/vnd.wap.wmlc              wmlc;
    application/x-7z-compressed           7z;
    application/x-bb-appworld             bbaw;
    application/x-bittorrent              torrent;
    application/x-chrome-extension        crx;
    application/x-cocoa                   cco;
    application/x-java-archive-diff       jardiff;
    application/x-java-jnlp-file          jnlp;
    application/x-makeself                run;
    application/x-opera-extension         oex;
    application/x-perl                    pl pm;
    application/x-pilot                   pdb prc;
    application/x-rar-compressed          rar;
    application/x-redhat-package-manager  rpm;
    application/x-sea                     sea;
    application/x-shockwave-flash         swf;
    application/x-stuffit                 sit;
    application/x-tcl                     tcl tk;
    application/x-x509-ca-cert            crt der pem;
    application/x-xpinstall               xpi;
    application/xhtml+xml                 xhtml;
    application/xslt+xml                  xsl;
    application/zip                       zip;
    text/css                              css;
    text/csv                              csv;
    text/html                             htm html shtml;
    text/markdown                         md;
    text/mathml                           mml;
    text/plain                            txt;
    text/vcard                            vcard vcf;
    text/vnd.rim.location.xloc            xloc;
    text/vnd.sun.j2me.app-descriptor      jad;
    text/vnd.wap.wml                      wml;
    text/vtt                              vtt;
    text/x-component                      htc;

}
```

`nginx.conf`是本文讨论的重点：

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

  lua_shared_dict statistics 1m; # 声明了一个1M大小的共享字典，改数据结构在所有工作进程之间共享

	# lua packages
	lua_package_path   "lualib/?.lua;;"; # Lua扩展库搜索路径，';;'是默认路径
	lua_package_cpath  "lualib/?.so;;";  # Lua C扩展库搜索路径，';;'是默认路径
	init_by_lua_file   "lua/init.lua";   # 当Nginx master进程（如果有）加载Nginx配置文件时，在全局Lua虚拟机上运行该指令指定的lua文件

	server {
    listen       8088;
    server_name  localhost;

    location /lua {
      default_type text/html;
      lua_code_cache off;  # 控制是否缓存lua代码，生产环境中强烈建议打开，否则性能会下降，开发环境为了调试方便可以关闭
      content_by_lua_file  "lua/controller.lua"; # 作为内容处理程序，为每个请求执行该文件中的lua代码
    }
	}
}
```

`lua`目录下存放的都是lua脚本文件，`init.lua`文件用来存放一些在master进程启动并加载配置文件时执行的初始化操作，一般用来加载需要用到的第三方库，也可以用来初始化一些共享变量，下面的代码初始化了`statistics`这个共享变量中的`views`这个key的值为0，之后我们将用这个key来统计用户访问某个endpoint的次数：

init.lua:

```lua
# init.lua
local statistics = ngx.shared.statistics;
statistics:set("views", 0);
```

controller.lua:

```lua
# controller.lua
local statistics = ngx.shared.statistics;
statistics:incr("views", 1);
local views = statistics:get('views');
ngx.say('hello world ' .. views);
```

`controller.lua`中，每个请求都会递增`views`的值，并在结果中输出，需要特别说明的一点是，为了调试这个功能，我们必须把`lua_code_cache`设置为`on`。这是因为如果`lua_code_cache`为`off`，`init_by_lua`将在每个请求上执行，因为这种情况下，每个请求中都会去创建一个全新的Lua虚拟机而非共享同一个Lua虚拟机。在将`lua_code_cache`设置为`on`后，运行`sh bin/start.sh`，第一次访问`http://localhost:8088/lua`将输出：

```
hello world 1
```

第二次访问将输出：

```
hello world 2
```

每次访问都会将`statistics`共享变量中`views`的值递增1。这就实现了一个基本的统计endpoint访问次数的功能。如果后台需要统计所有的访问次数，我们只需要定期回写该值，并重置`statistics`共享变量中`views`的值为0即可。


## 总结

在阅读了本文后，读者应该对OpenResty的项目搭建有了一个大致的了解。我们只介绍了很少的一部分概念，写了几行Lua代码就实现了一个简单的访问计数器。在之后的文章中，我们将深入OpenResty的世界，了解OpenResty的运行机制，还有很长一段路要走。

值得一提的是，到现在为止我们的工作还没有涉及任何应用服务器。这就是OpenResty的作用所在：将和业务无关的事情剥离出整个应用服务层，应用服务层可以专注于做业务相关的事情。在之后还可以看到，我们可以使用Lua实现更多这类“公共功能”，比如读缓存、LRU Cache、写日志、应用防火墙、模板渲染、静态文件合并、负载均衡、流量控制等。