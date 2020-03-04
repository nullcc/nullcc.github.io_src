---
title: 利用OpenResty做代理实现到STF的请求转发和自定义权限校验
date: 2020-02-28
tags: [OpenResty]
categories: web后端
---

本文将介绍一种在两个独立系统之间搭建中间层来做请求转发和权限校验的方案。

<!--more-->

## 需求

在详细介绍架构设计之前必须先陈述一下需求。这是在我现实工作场景中遇到的事情，在我们团队中，需要对app做自动化测试。我们有大约50台真机(iOS + Android)，这些设备分布在很多台主机上。每天我们都需要在这些真机（还有模拟器，但模拟器在这里不是重点）上执行很多测试用例。于是之前我们设计了一个系统（代号device-spy）来主动扫描分布在这些主机上的所有设备的信息，并以一定的策略对外提供服务。客户端通过调用API来向device-spy申请符合某种条件的设备并锁定它，然后直接使用这个设备执行测试用例。当测试用例执行完毕，客户端调用device-spy的API将设备解除占用。当测试运行时，appium会对每一个会话生成session，device-spy系统采用定时轮询的方式检测每个设备对应的session的存在性。如果session消失，device-spy将主动将设备解除占用。另外，客户端崩溃也会导致appium session消失，进而device-spy就会检测到并将相应设备解除占用。我们就是用这种方式来管理这些设备，关于device-spy的情况就先介绍这么多。

最近，我们团队希望使用STF来实现Android手机设备的远程控制，STF是针对Android设备远程控制的一套比较成熟的开源方案。我们想对device-spy和STF做一个集成，只有在device-spy上申请对某个Android的远程控制后（这会锁住设备使它无法被其他人或者测试脚本使用），才能在STF上真正地去远程控制。任何试图直接在STF上实行远程控制的操作都将被禁止。这个需求的主要目的是不想让用户在STF上对Android设备的操作影响到自动化测试脚本的执行。

## 设计思路

在了解了需求后，可以发现这里有两个完全独立的系统：device-spy和STF，我们的目标实际上是要针对这两个系统设计一套鉴权和请求转发方案。从设计方案的最开始，我们需要明确几条原则：

1. 不对STF的代码做任何改动。
2. 对device-spy只能做尽量少的改动，最好是只增加新功能不修改现有功能。
3. 设计要尽量简单可靠。

计算机科学领域有一句名言：“计算机科学领域的任何问题都可以通过增加一个间接的中间层来解决”。

这个需求也完全可以靠增加一个中间层来解决。既然要求不修改STF，还能达到控制对它API的访问的要求。很直接地可以想到在STF前面加一层反向代理来负责转发所有到STF的请求（HTTP和Websocket）。还可以在这个中间层上做一些鉴权的逻辑用来控制用户浏览器对STF的访问。

思路很明确，理论上完全可行。剩下的就是技术选型和架构设计。

技术选型方面，一般来说Web后端做反向代理的组件最常用的就是nginx了。nginx性能强悍且有很好的可扩展性，比如可以使用ngx_lua_module做扩展，允许用户在请求的生命周期的不同阶段实现自己的逻辑。OpenResty又是这方面很好的一个技术方案，于是我把目光投向OpenResty。

OpenResty是基于nginx和Lua的高性能Web平台，开发者可以在OpenResty的请求处理流程的各个阶段中设置自己的逻辑。下面是OpenResty处理请求流程图：

![OpenResty处理请求的流程图](/assets/images/post_imgs/openresty_phases.png)

可以不必深究这张图的所有细节，目前重点只需要关注"access_by_lua"和"content_by_lua"两个阶段。在access_by_lua阶段，我们还没有开始处理任何实际的业务逻辑，一般在这个阶段都是处理一些和权限有关的事情，因此这里可以设置鉴权逻辑，当鉴权成功就转发请求到upstream的STF服务，失败则返回一个403 Forbidden。content_by_lua阶段一般用来放置一些实际的操作，我们可以设计一些API用来实现设备注册、用户浏览器授权和设备注销。device-spy将会直接和这些API做集成来为鉴权逻辑做准备。

至此，思路我们已经准备好了。

## 架构设计

思路有了，还需要设计详细架构才能开始编码。这个中间层系统我把他命名为`midway`。下图有助于清晰地理解整个流程：

![midway架构设计](/assets/images/post_imgs/midway_architecture.png)

详细解释一下各个步骤的行为：

1. 用户在device-spy上申请对某台安卓机器的控制，并指定timeout。
2. device-spy锁定这台设备，并生成一个code（为了安全性这个code是有需要加密的，在midway端会解密，防止伪造，但简单起见可以先不实现）
3. device-spy向midway注册设备（携带参数code, timeout，device_ip和adb_port）
4. midway用uuid生成一个session key，并在redis里存放code:session（设置timeout过期时间）和device:session（设置timeout过期时间）
5. device-spy重定向浏览器到midway的/auth?code=xxx上
6. midway验证这个code，如果这个code已经注册，就把对应的session key作为cookie设置在浏览器端。
7-10. midway会反向代理所有到STF的HTTP和Websocket请求。特别地，只有当浏览器访问STF的/api/v1/devices/{device_ip}:{adb_port})这个API时，midway才会做权限校验，看看用户session是否有权限操作这台设备，如果不可以就返回403，验证通过则直接proxy_pass到STF，最后返回响应。只对这个API做权限校验就可以了，因为这个远程操控制某台设备之前必须请求该API获取相关信息后建立websocket连接。
8. (11) 用户在device-spy上主动注销设备，device-spy会请求midway的注销设备API。

## 实现

在实现阶段，我们需要依照上面的架构设计打通所有节点之间的连接，形成功能闭环。由于device-spy上的实现无非就是增加几个API调用不难理解，所以这里我将只讨论midway的详细实现。

OpenResty是基于nginx的，所以一个nginx.conf是少不了的。nginx.conf这个文件非常重要，它描述了我们的所有请求将如何被nginx处理：

```nginx.conf
worker_processes  1;

error_log logs/error.log;

events {
    worker_connections 1024;
}

# declare environment variables
env STF_IP;
env STF_SSH_USER;
env STF_SSH_PASSWORD;

http {
    map $http_upgrade $connection_upgrade {
        default upgrade;
        ''      close;
    }

    # lua packages
    lua_package_path   "lualib/?.lua;/usr/local/openresty/nginx/lualib/?.lua;;";
    lua_package_cpath  "lualib/?.so;/usr/local/openresty/nginx/lualib/?.so;;";
    init_by_lua_file   "lua/init.lua";

    upstream stf_app {
        server ${STF_IP}:21000;
    }

    upstream stf_websocket {
        server ${STF_IP}:7110;
    }

    init_worker_by_lua_block {
        local uuid = require "resty.jit-uuid"
        uuid.seed()
    }

    # STF app
    server {
        listen 21000;
        server_name kamino.lab.rcch.ringcentral.com;
        resolver 127.0.0.11;

        # device-spy requests this API to register device with:
        # 1. code
        # 2. timeout (unit: second)
        # 3. device (ip:adb_port)
        # 
        # Sample:
        #   method: POST
        #   content-type: application/json
        #   data: {
        #       "code": "xyz",
        #       "timeout": 3600,
        #       "device": "${DEVICE_IP}:7500"
        #   }
        location /register-device {
            proxy_ssl_name $host;
            lua_code_cache on;
            content_by_lua_file  "lua/register.lua";
        }

        # device-spy requests this API to deregister device:
        # Sample:
        #   method: POST
        #   content-type: application/json
        #   data: {
        #       "device": "${DEVICE_IP}:7500"
        #   }
        location /deregister-device {
            proxy_ssl_name $host;
            lua_code_cache on;
            content_by_lua_file  "lua/deregister.lua";
        }

        # Client requests this API to authenticate with code in query string, e.g. /auth?code=xxx
        # OpenResty will set cookie in client if success
        location ~ ^/auth$ {
            proxy_ssl_name $host;
            lua_code_cache on;
            content_by_lua_file  "lua/auth.lua";
        }

        # OpenResty verifies permission before proxying this request to STF app
        location ~ ^/api/v1/devices/(.+)$ {
            access_by_lua_file "lua/access.lua"; # verify permission by lua script
            proxy_pass http://stf_app;
        }

        # OpenResty injects JS code to STF index page to redirect browser to '/' after timeout
        location ~ ^/$ {
            proxy_ssl_name $host;
            lua_code_cache on;
            content_by_lua_file "lua/index.lua";
        }

        # Other http requests will be proxied to STF directly
        location / {
            proxy_pass http://stf_app;
        }
    }

    # STF websocket
    server {
        listen 7110;
        server_name kamino.lab.rcch.ringcentral.com;
        resolver 127.0.0.11;

        # STF websocket requests will be proxied to STF websocket service directly
        location /socket.io/ {
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header Host $host;

            proxy_pass http://stf_websocket;

            # enable WebSockets
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
    }

    # STF websocket providers (ports 7400-7499)
    server {
        # can use "listen 7400-7499;" when OpenResty be upgraded to nginx 1.15.10 later
        listen 7400;
        listen 7401;
        listen 7402;
        listen 7403;
        listen 7404;
        listen 7405;
        listen 7406;
        listen 7407;
        listen 7408;
        listen 7409;
        listen 7410;
        listen 7411;
        listen 7412;
        listen 7413;
        listen 7414;
        listen 7415;
        listen 7416;
        listen 7417;
        listen 7418;
        listen 7419;
        listen 7420;
        listen 7421;
        listen 7422;
        listen 7423;
        listen 7424;
        listen 7425;
        listen 7426;
        listen 7427;
        listen 7428;
        listen 7429;
        listen 7430;
        listen 7431;
        listen 7432;
        listen 7433;
        listen 7434;
        listen 7435;
        listen 7436;
        listen 7437;
        listen 7438;
        listen 7439;
        listen 7440;
        listen 7441;
        listen 7442;
        listen 7443;
        listen 7444;
        listen 7445;
        listen 7446;
        listen 7447;
        listen 7448;
        listen 7449;
        listen 7450;
        listen 7451;
        listen 7452;
        listen 7453;
        listen 7454;
        listen 7455;
        listen 7456;
        listen 7457;
        listen 7458;
        listen 7459;
        listen 7460;
        listen 7461;
        listen 7462;
        listen 7463;
        listen 7464;
        listen 7465;
        listen 7466;
        listen 7467;
        listen 7468;
        listen 7469;
        listen 7470;
        listen 7471;
        listen 7472;
        listen 7473;
        listen 7474;
        listen 7475;
        listen 7476;
        listen 7477;
        listen 7478;
        listen 7479;
        listen 7480;
        listen 7481;
        listen 7482;
        listen 7483;
        listen 7484;
        listen 7485;
        listen 7486;
        listen 7487;
        listen 7488;
        listen 7489;
        listen 7490;
        listen 7491;
        listen 7492;
        listen 7493;
        listen 7494;
        listen 7495;
        listen 7496;
        listen 7497;
        listen 7498;
        listen 7499;
        server_name kamino.lab.rcch.ringcentral.com;
        resolver 127.0.0.11;

        # Requests to STF providers will be proxied to STF providers directly
        location / {
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header Host $host;

            proxy_pass http://${STF_IP}:$server_port;

            # enable WebSockets
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
    }
}
```

注意，需要把这个文件中的${STF_IP}换成实际的STF的IP，这里做展示用因此隐藏了这个IP。

这个nginx.conf内容比较多，我们从上往下看。

1. 10-12行声明了三个环境变量，环境变量需要在docker-compose.yml中事先声明好。需要说明的是，我在STF的启动命令里使用了`--allow-remote`，以允许用Wi-Fi远程控制设备。所以每次控制设备之前需要手动在STF所在服务器上调用`adb connect {device_ip}:{adb_port}`来确保STF服务器和设备处于已连接状态。这三个环境变量将在Lua脚本中被使用，之后会提到。
2. 15-18行是用来将HTTP 1.1升级成Websocket协议的。
3. 21-23行声明了Lua package的查找路径。`*.lua`表示文本格式的Lua脚本文件，`*.so`表示的是C动态链接库。
4. 25-32行声明了STF的一些服务作为upstream，`stf_app`是给HTTP API用的，`stf_websocket`是给Websocket用的。
5. 33-36行是Lua的一个第三方库`jit-uuid`要求的声明，初始化uuid seed。
6. 39行开始是STF App部分的声明块，声明了`/register-device`, `/deregister-device`, `/auth`, `/api/v1/devices/(.+)`和所有其他HTTP API的处理方式。在`/register-device`, `/deregister-device`和`/auth`的声明中，`content_by_lua_file`后的Lua脚本会负责处理这个API的行为。对`/api/v1/devices/(.+)`，会先用`access_by_lua_file`指定的Lua脚本检查用户是否有权限请求这个STF API，然后根据检查结果，若是验证通过就转发至STF，否则返回权限不足。其余所有HTTP请求都直接转发至STF。
7. 104-121行是STF Websocket部分的声明块，指定了当API为`/socket.io/`时，应该将HTTP 1.1升级到Websocket，并直接转发Websocket请求到STF Websocket service。
8. 124-241行中有一长串的listen声明，这主要是因为在远程控制Android设备时，STF会启动provider来提供Websocket服务（注意和刚才题到的STF Websocket service相区别），可以在STF启动命令中使用`--provider-min-port {port}`和`--provider-max-port {port}`来指定，这里我的参数是`--provider-min-port 7400 --provider-max-port 7499`，所以就需要有100个listen声明。值得一提的是，nginx在1.15.10中可以在listen中使用一个端口范围，详情参见[nginx listen](http://nginx.org/en/docs/stream/ngx_stream_core_module.html#listen)。不过当前最新的OpenResty基于的Nginx版本是1.15.8，所以不支持。之后如果OpenResty更新后，可以直接使用`listen 7400-7499;`这种更简洁的方式。对于provider，所有请求都应该被直接转发。

完成nginx.conf后，就轮到设计各个Lua脚本文件了。这里不打算给出所有Lua脚本的详细代码，只说大致做法。

### 设备注册

midway的`/register-device`API的行为（参数code、 timeout和device）：

1. 在Redis中设置hash，key: code, value: session，并设置过期时间为timeout。
2. 在Redis中设置hash，key: device, value: session，并设置过期时间为timeout。
3. 在Redis中设置hash，key: session, value: 1。
4. SSH到STF的服务器上（会使用nginx.conf文件中声明的那三个环境变量），然后执行`adb connect {device_ip}:{adb_port}`。

### 用户浏览器授权

midway的`/auth?code=xxx`API的行为：

1. 在Redis中以code为key获取session。
2. 如果能获取到，就移除key: code。然后设置浏览器的Cookie："midwaysid={session}; Max-Age={timeout}; path=/"。最后重定向浏览器到midway的根路径下（对应STF的首页）。
3. 如果获取不到session，返回400 Invalid code。

### 设备注销

midway的`/register-device`API的行为（参数device）：

1. 在Redis中移除key: device。

### 设备信息获取

midway的`/api/v1/devices/(.+)`API的行为：

1. 使用device做为key在Redis中查询它所对用的session。
2. 将浏览器Cookie中的key为midwaysid的value和第一步查到的session对比，二者相等则认为验证通过，并直接转发请求到STF。
3. 第二步中验证不通过将会导致返回403 Permission denied。

下面这个块是针对一个特殊的行为的，下面会详细说明：

```
# OpenResty injects JS code to STF index page to redirect browser to '/' after timeout
location ~ ^/$ {
    proxy_ssl_name $host;
    lua_code_cache on;
    content_by_lua_file "lua/index.lua";
}
```

## 使用时遇到的一个问题

在实现了上述的所有细节后，实际使用时我发现一个问题。当用户进入到STF的设备远程控制页面后，之后的大部分操作都不再需要请求设备信息获取接口了，只需要Websocket连接就够了。由于目前我们只针对设备信息获取的API做了鉴权，假如用户一直停留在某个设备的远程控制页面不出来，就算timeout过了，还是可以继续使用的。

由于STF是一个单页Web应用，针对这个问题，我想到的最简单的方案是在用户浏览器初次请求STF首页的时候，在其中注入一段特定的JS代码。这段代码是由midway生成并插入到STF的首页响应文本中的。当然，如果session不存在或者为空，则不需要注入JS代码。这段JS代码大致是这样的：

```javascript
<script>setTimeout(function(){alert('Remote control timeout!');location.href = '/';}, ${session-ttl})</script>
```

`${session-ttl}`是session在Redis中的TTL，midway会负责填入这个值，这个TTL将随着用户刷新页面的时间的不同而不同。这段代码的主要目的是在TTL时间后，弹框提示用户之前为申请远程设备控制的timeout已经到了，并强制跳转到`/`。这样就把用户带离了设备控制页面，由于此时session已过期，用户就无法再次直接进入到STF的设备控制页面了。如果想要继续控制设备，就必须去device-spy再做一次申请。

我把对这个行为的控制放到`lua/index.lua`中。

## 部署

既可以将STF和midway分别部署在两台独立的服务器上，也可以将它们部署在同一台服务器上。在初次访问STF时会有一个验证步骤，浏览器会被重定向到启动STF的命令中`--public-ip`所指向的地址。如果是分开部署，由于我们的目的是让midway反向代理STF的所有流量，因此`--public-ip`的值应该是midway的地址。
