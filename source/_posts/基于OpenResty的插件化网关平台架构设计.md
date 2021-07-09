---
title: 基于 OpenResty 的插件化网关平台架构设计
date: 2021-07-09
tags: [OpenResty, 插件]
categories: Web后端
---

本文详述了如何基于 OpenResty 设计一个插件化的架构。

<!--more-->

## 概述

OpenResty是一个基于 Nginx 与 Lua 的高性能 Web 平台，它在请求和响应的生命周期设计方面给我们提供了一种基于现有开源方案开发自己的插件化可扩展网关平台的可能性。

## 需求

我们不仅需要请求被正确地路由到相应的 upstream （这也是nginx作为反向代理最常用的一种方式），有时还关心请求和响应的一些细节。例如拒绝处理来自IP黑名单的请求、请求限流、鉴权、安全、动态加载SSL证书、日志收集、给请求的 header 打上 request id 以便追踪、请求/响应变换、mock、动态代理等等。甚至在一些测试场景中还会产生定制性很高的需求。

这些需求五花八门，如果能找到一种相对统一且优雅的处理方案，将提高开发和测试的效率。

## ngx-lua-module 中的请求生命周期

在真正描述我们的设计之前，需要了解 OpenResty 对请求生命周期的基本设计。ngx-lua-module 是 OpenResty 的一个核心 module 。它对一个 HTTP 请求的生命周期做了划分：

![ngx-lua-module中的请求生命周期](/assets/images/post_imgs/luna-ngx-lua-module.png)

图中的星星和右边的一些图示是我自己加的，它们涉及到插件化的设计，之后会详细介绍。在划分出请求的生命周期后，我们获得了面向切编程(AOP)的能力，这是插件化的基础。

我们来具体看看图中请求生命周期的各个阶段（指令）。

### init_by_lua*

当 Nginx master 进程（如果有）加载 Nginx 配置文件时，在全局的 Lua 虚拟机上执行我们指定的代码。一般可以在这个阶段做一些全局性的工作。在我们等一下要讨论的插件化架构设计中，会在这个阶段读取应用程序配置文件以及注册插件。

### init_worker_by_lua*

当 Nginx 开启 master 进程模式时， Nginx worker 进程启动时会执行指定的代码。如果关闭 master 模式，将在 init_by_lua_* 后直接运行。在这个阶段中可以创建一些定时器任务。

### ssl_certificate_by_lua*

这个阶段用来动态地加载SSL证书。这允许我们可以在建立连接前才设置证书和私钥，因此我们可以结合 SNI，针对不同的请求域名动态设置不同的证书和私钥。

### set_by_lua*

这个阶段允许我们使用 Lua 定义一些变量供后面的阶段使用。

### rewrite_by_lua*

在重写阶段，我们可以修改对请求数据，比如修改URI、请求体和请求头等等。

### access_by_lua*

这个阶段一般用来检查请求的准入性，比如通过查询一些黑白名单来对请求进行拒绝和放行。

### content_by_lua*

这个阶段负责响应内容的生成，这个阶段可以说是灵活性最大的阶段。

### balancer_by_lua*

这个阶段负责处理负载均衡相关事宜。

### header_filter_by_lua*

我们可以在这个阶段过滤响应头，比如动态地加入 Request ID。

### body_filter_by_lua*

我们可以在这个阶段过滤响应体。需要注意的是，在进入这个阶段时，响应头已经全部发送给客户端，因此无法在该阶段修改响应头。

### log_by_lua*

日志阶段，可用供我们记录一些必要的信息。

关于这些指令的详细描述可以参考[lua-nginx-module](https://github.com/openresty/lua-nginx-module)，此处不再赘述。

## 基本设计

从一个比较高的视角来看，有了请求生命周期的阶段划分，我们可以将刚才描述的每个需求对应到一个或多个处理阶段中去。在实现时，针对每种需求（通用需求或特定需求都可以）设计一个插件，该插件只关心它需要关心的阶段。在网关收到针对某个 hostname 的请求时，框架应该先检查是否有针对该 host 的插件被注册，接着在请求的每个阶段一一调用这些插件中对应的指令方法（如果有的话）。

现在思路就比较明确了，我们来按顺序理一下整个过程：

1. [**init_by_lua***] Nginx master 进程加载 `nginx.conf` 启动并初始化，在 `init` 阶段读取插件配置，注册插件。
2. [**init_worker_by_lua***] Nginx worker 进程启动并初始化，有些插件会在这个阶段注册定时器，定期执行某些操作。
3. [**ssl_certificate_by_lua***] 如果是 HTTPS 请求，框架会调用与当前 hostname 关联的插件的 `ssl_certificate` 方法动态设置证书。
3. [**set_by_lua***] 框架会调用与当前 hostname 关联的插件的 `set` 方法设置一些变量。
4. [**rewrite_by_lua***] 框架会调用与当前 hostname 关联的插件的 `rewrite` 方法重写请求的数据。
5. [**access_by_lua***] 框架会调用与当前 hostname 关联的插件的 `access` 方法判断请求准入性。
6. [**content_by_lua***] 框架会调用与当前 hostname 关联的插件的 `content` 方法生成响应内容。
7. [**balancer_by_lua***] 框架会调用与当前 hostname 关联的插件的 `balancer` 方法将请求转发到 upstream 。
8. [**header_filter_by_lua***] 框架会调用与当前 hostname 关联的插件的 `header_filter` 方法过滤 response headers 。
9. [**body_filter_by_lua***] 框架会调用与当前 hostname 关联的插件的 `body_filter` 方法过滤 response body 。至此，响应已经完全发送给客户端。
9. [**log_by_lua***] 框架会调用与当前 hostname 关联的插件的 `log` 方法做一些日志相关的操作。

## 实现

### 指令

需要让这套逻辑生效，首先需要处理的是 `nginx.conf` 文件：

```
# user  openresty;
worker_processes  auto;
worker_cpu_affinity auto;

error_log  logs/error.log;
pid        logs/nginx.pid;

worker_rlimit_nofile 65535;

events {
  use epoll;
  worker_connections  65535;
  multi_accept on;
}

# environment variables
env MYSQL_HOST;
env MYSQL_PORT;
env MYSQL_DB;
env MYSQL_USER;
env MYSQL_PASSWORD;

http {
  include    mime.types;
  include    proxy.conf;
  include    ../sites-enabled/*.conf;
  include    ../sites-enabled/*/*.conf;
  include    ../sites-enabled/*/*/*.conf;

  resolver 8.8.8.8;

  log_format   main '$remote_addr - $remote_user [$time_local] $status '
  '"$request" $body_bytes_sent "$http_referer" '
  '"$http_user_agent" "$http_x_forwarded_for"';
  access_log   logs/access.log  main;

  sendfile     on;
  tcp_nopush   on;
  tcp_nodelay on;

  keepalive_timeout  65;
  keepalive_disable none;

  gzip on;
  gzip_min_length 1k;
  gzip_buffers 4 16k;
  gzip_http_version 1.0;
  gzip_comp_level 4;
  gzip_types text/plain application/x-javascript text/css application/xml application/json;
  gzip_vary on;

  lua_socket_log_errors off;

  # lua packages
  lua_package_path   "lualib/?.lua;/usr/local/openresty/nginx/lua/?.lua;/usr/local/openresty/nginx/plugins/?.lua;/usr/local/openresty/nginx/lualib/?.lua;;";
  lua_package_cpath  "lualib/?.so;/usr/local/openresty/nginx/lualib/?.so;;";
  
  lua_shared_dict ngx_cache 128m;
  lua_shared_dict plugin_registry 4m;

  lua_ssl_trusted_certificate "/etc/ssl/certs/ca-bundle.crt";

  init_by_lua_file         "lua/directives/init.lua";
  init_worker_by_lua_file  "lua/directives/init_worker.lua";
}
```

这里只解释几个关键的地方：

1. 几个 MySQL 相关的环境变量用来连接数据库加载插件配置。
2. 几个 `include ../sites-enabled/*.conf` 声明了 Nginx 启动时需要加载的具体站点的 conf 文件。
3. `lua_package_path` 声明了搜索 lua 包的路径。
4. `lua_package_cpath` 声明了搜索 so 库的路径。
5. `lua_shared_dict plugin_registry 4m;` 声明了一个4M大小的共享内存，用来存放插件数据。
6. `init_by_lua_file` 指定了在 `init` 阶段要调用的 Lua 脚本。
7. `init_worker_by_lua_file` 指定了在 `init_worker` 阶段要调用的 Lua 脚本。

`lua/directives/init.lua` 负责加载插件配置，这里是从 MySQL 读取。

```lua
-- lua/directives/init.lua
local runtime = require "core.runtime"
local constants = require "core.constants"

local app_plugins = runtime.load_app_plugin_conf_from_db()
runtime.register_plugins(constants.PLUGIN_DIR, app_plugins)
```

`lua/directives/init_worker.lua` 中 `plugin_dispatch` 方法的第一个参数为 `nil`，意思是调用所有插件的 `init_worker` 方法。这里需要说明一下，除了 init 做初始化不涉及插件调用以及 init_worker 调用所有插件的 init_worker 方法以外，其他所有阶段都会调用 `runtime.plugin_dispatch` 方法来调用插件的相关方法，第一个参数为当前请求的 server name，第二个参数为当前的请求阶段。

```lua
-- lua/directives/init_worker.lua
local phases = require "core.phases"
local runtime = require "core.runtime"
local uuid = require "resty.jit-uuid"

uuid.seed()

runtime.plugin_dispatch(nil, phases.INIT_WORKER)
```

共用的 nginx.conf 文件只需要描述这么多，在继续往下之前，我们先来看一个具体站点的 conf 文件：

```
server {
  listen       80;
  listen       443 ssl;
  server_name  api.foo.com;
        
  ssl_certificate      certs/test.crt;
  ssl_certificate_key  certs/test.key;

  ssl_certificate_by_lua_file "lua/directives/ssl_certificate.lua";

  location / {
    lua_code_cache on;
    resolver 127.0.0.11;

    rewrite_by_lua_file "lua/directives/rewrite.lua";
    access_by_lua_file "lua/directives/access.lua";
    content_by_lua_file "lua/directives/content.lua";
    header_filter_by_lua_file "lua/directives/header_filter.lua";
    body_filter_by_lua_file "lua/directives/body_filter.lua";
    log_by_lua_file "lua/directives/log.lua";
  }
}
```

上面这个 server block 声明了一些信息：

1. 因为我们用到了 `ssl_certificate_by_lua_file` 来动态加载SSL证书，所以`ssl_certificate` 和 `ssl_certificate_key` 被设置成了一个基本的 crt 和 key 文件，如果不设置会报错。
2. 在 `location /` block 中声明了各种 `*_by_lua_file` 对应的脚本。

现在可以继续看其他指令的脚本文件了。

`lua/directives/ssl_certificate.lua`:

```lua
local ssl = require "ngx.ssl"
local phases = require "core.phases"
local runtime = require "core.runtime"

local server_name, err = ssl.server_name()
runtime.plugin_dispatch(server_name, phases.SSL_CERTIFICATE)
```

`lua/directives/rewrite.lua`:

```lua
-- lua/directives/rewrite.lua
local phases = require "core.phases"
local runtime = require "core.runtime"

runtime.plugin_dispatch(ngx.var.server_name, phases.REWRITE)
```

`lua/directives/set.lua`:

```lua
-- lua/directives/set.lua
local phases = require "core.phases"
local runtime = require "core.runtime"

return runtime.plugin_dispatch(ngx.var.server_name, phases.SET)
```

`lua/directives/access.lua`:

```lua
-- lua/directives/access.lua
local phases = require "core.phases"
local runtime = require "core.runtime"

runtime.plugin_dispatch(ngx.var.server_name, phases.ACCESS)
```

`lua/directives/content.lua`:

```lua
-- lua/directives/content.lua
local phases = require "core.phases"
local runtime = require "core.runtime"

runtime.plugin_dispatch(ngx.var.server_name, phases.CONTENT)
```

`lua/directives/balancer`:

```lua
-- lua/directives/balancer
local phases = require "core.phases"
local runtime = require "core.runtime"

runtime.plugin_dispatch(ngx.var.server_name, phases.BALANCER)
```

`lua/directives/header_filter`:

```lua
-- lua/directives/header_filter
local phases = require "core.phases"
local runtime = require "core.runtime"

runtime.plugin_dispatch(ngx.var.server_name, phases.HEADER_FILTER)
```

`lua/directives/body_filter`:

```lua
-- lua/directives/body_filter
local phases = require "core.phases"
local runtime = require "core.runtime"

-- Should concat response body chunk if it's not the end of response stream

local chunk = ngx.arg[1]
local end_of_resp_stream = ngx.arg[2]

if end_of_resp_stream == false then
  if ngx.ctx.response_body == nil then
    ngx.ctx.response_body = chunk
  else
    ngx.ctx.response_body = ngx.ctx.response_body .. chunk
  end
else
  ngx.ctx.end_of_resp_stream = true
end

runtime.plugin_dispatch(ngx.var.server_name, phases.BODY_FILTER)
```

关于 body_filter 阶段需要特别说明一下，由于 Nginx 从 updtream 获取 response body 并不是一次获取所有，而是分块 (chunked) 获取。并且每取得一个分块，Nginx 都会触发一次 body_filter 。为了灵活性最大化，这里设置了一个 `ngx.ctx.end_of_resp_stream` 上下文变量来让插件判断当前的响应数据传输是否已经结束。这样不管是想处理每个分块还是按照整体来处理整个响应的插件都可以工作。

`lua/directives/log`:

```lua
-- lua/directives/log
local phases = require "core.phases"
local runtime = require "core.runtime"

runtime.plugin_dispatch(ngx.var.server_name, phases.LOG)
```

### 运行时

之前提到 init 指令会调用 `runtime.register_plugins` 注册插件，其他指令会调用 `runtime.plugin_dispatch` 触发插件相应阶段的指令方法。

先来看注册、加载和卸载插件的代码：

```lua
-- lua/core/runtime.lua
local _M = {
  _VERSION = '0.0.1',
  _plugins = {}
}

function _M.register_plugins(plugin_dir, app_plugins)
  for _, app_plugin in ipairs(app_plugins) do
    local ok, err = _M.load_plugin(plugin_dir, app_plugin.server_name, app_plugin.plugin_name, app_plugin.args or {})
      if not ok then
        ngx.log(ngx.ERR, string.format("[rumtime] failed to load plugin: %s, err: %s", app_plugin.plugin_name, err))
      end
  end
end

function _M.load_plugin(plugin_dir, server_name, plugin_name, args)
  local plugin_path = string.format("%s/%s.lua", plugin_dir, plugin_name)
  local plugin_module, err = loadfile(plugin_path)
  if plugin_module == nil then
    return false, error(string.format("[runtime] plugin not found, plugin: %s, error: %s", plugin_name, err))
  end
  local plugin = plugin_module()
  plugin.init_plugin(args)
  local key = string.lower(server_name)
  if _M._plugins[key] == nil then
    _M._plugins[key] = {}
  end
  table.insert(_M._plugins[key], plugin)
  ngx.log(ngx.ERR, string.format("[runtime] plugin \"%s\" for server name \"%s\", args: %s loaded", plugin_name, key, cjson.encode(args)))
  return true, nil
end

function _M.unload_plugin(server_name, plugin_name)
  local plugins = _M._plugins[server_name]
  if plugins ~= nil then
    for i, v in ipairs(plugins) do
      if plugin_name == v._NAME then
        table.remove(plugins, i)
        ngx.log(ngx.ERR, string.format("[runtime] plugin \"%s\" for server name \"%s\" unloaded", plugin_name, server_name))
        break
      end
    end
  end
end
```

`register_plugins` 注册插件，它在内部调用 `load_plugin` 执行具体的注册操作。`load_plugin` 调用 `loadfile` 从指定的目录加载并用参数初始化插件，然后插入到 `_plugins` 这个 table 中，注意这里把 `_plugins` 当成一个字典来用，键是 server name，值是插件数组。`unload_plugin` 用来卸载指定 hostname 下的指定插件。`load_plugin` 和 `unload_plugin` 可以结合一套插件管理 API 来动态加载/卸载 API 。

接下来是指令调用插件的代码：

```lua
-- lua/core/runtime.lua
function _M.plugin_dispatch(server_name, phase)
  ngx.log(ngx.ERR, server_name, ", ", phase)
  local plugins = _M.get_plugins(server_name)
  if plugins ~= nil then
    for _, plugin in ipairs(plugins) do
      if plugin[phase] ~= nil then
        local ok, ret = pcall(plugin[phase])
        if not ok then
          ngx.log(ngx.ERR, string.format("[rumtime] dispatch error, plugin name: %s, phase: %s, err: %s", plugin._NAME, phase, ret))
        end
      end
    end
  end
end

function _M.get_plugins(server_name)
  if server_name == nil then
    local plugins = {}
    for _, server_plugins in pairs(_M._plugins) do
      for _, plugin in ipairs(server_plugins) do
        table.insert(plugins, plugin)
      end
    end
    return plugins
  end
  local key = string.lower(server_name)
  return _M._plugins[key]
end
```

`plugin_dispatch` 首先使用 server name 调用 `get_plugins` 来获取和 server name 相关联的所有插件。这里如果 server name 为 `nil` 则会将返回所有插件，之前在 init_worker 指令中见到了这种用法。在获得插件列表后，`plugin_dispatch` 会遍历插件列表，使用 `pcall` 调用 `plugin[phase]`。`pcall` 的意思是 `protected call`，也就是一种保护模式调用，这个调用中如果出现错误，会以返回码的方式告诉调用方而不会导致请求处理直接挂掉。

### 插件

刚才我们一直围绕插件展开讨论，但插件究竟是个什么东西我们一直没提。插件其实就是一个 Lua table，里面有一些数据和指令相关的方法。下面是插件的基本定义：

```lua
-- lua/core/plugin.lua
local _M = {}

function _M.init_plugin(...)
  local plugin, args = ...
  for key, value in pairs(args) do
    plugin[key] = value
  end
  if type(plugin._init_plugin) == "function" then
    plugin._init_plugin()
  end
end

return {
  __index = function(table, key)
    local value = _M[key]
    if type(value) == "function" then
      return function(...)
        return value(table, ...)
      end
    end
    return value
  end
}
```

我们已经知道 runtime 在调用插件方法时的调用链是这样的：

1. `runtime.plugin_dispatch(server_name, phase)`
2. `runtime.get_plugins(server_name)`
3. `pcall(plugin[phase])`

在第三步 `pcall(plugin[phase])` 中，runtime 会先获取 `plugin[phase]`。这里要注意，pcall 的参数是一个函数（或者说闭包），但我们之前说过，每个插件只会实现它关心的指令，因此这里 `plugin[phase]` 有可能是 `nil`，即没有实现。所以我们在 `pcall(plugin[phase])` 之前需要先判断 `plugin[phase]` 是否存在。

`plugin.lua` 中还用到了 `metatable.__index`，这里需要解释一下为什么这么写。大部分插件会有一些初始化参数需要在加载时赋值给插件，另外插件可能自己也有一些初始化逻辑，如果每个插件都写一遍参数初始化的代码很麻烦。Lua 中 metatable的工作机制是，当通过键来访问 table 的时候，如果这个键没有值，那么 Lua 就会查找该 table 的 metatable（如果有的话）中的 __index 。如果__index 是一个 table，Lua会在表格中查找相应的键。如果 __index 是一个函数，Lua 就会用 table 和键调用那个函数。这个机制有点类似 JavaScript 中的 prototype 。

由于 `plugin.lua` 返回的 table 包含一个 `__index`，且 `__index` 是一个函数。那么只要具体的插件把这个 table 设置为自己的 metatable，当在这个插件上调用一个不存在的方法时，Lua 就会去它的 metatable 中调用 `__index` 键对应的函数。于是像初始化插件这样的通用操作就可以放在 `plugin.lua` 中实现了。

### 一个具体的插件

上面说了这么多，我们还没有见过真正可以用的插件长什么样。这里展示一个叫做 `request-id` 的插件，它可以给所有 response headers 加上一个指定的header，其中键可以由插件参数指定，值是一个UUID。

```lua
-- plugins/request-id.lua

--- request-id
-- Add request-id in HTTP response headers
-- @module request-id
-- @license MIT
-- @release 0.0.1
-- @phases init_worker, header_filter

local uuid = require "resty.jit-uuid"
local meta_plugin = require "core.plugin"

local _M = {
  _VERSION = "0.0.1",
  _NAME = "request-id",

  -- args
  key = ""
}

setmetatable(_M, meta_plugin)

function _M.init_worker()
  uuid.seed()
end

function _M.header_filter()
  ngx.header[_M.key] = uuid()
end

return _M
```

`request-id` 插件只有一个参数 key，每个插件都必须调用 `setmetatable(_M, meta_plugin)` 来讲上面说的基础插件设置成自己的 metatable，以便自动获得初始化函数（如果有其他需要在插件之间共享的函数也可以加进去）。这个插件涉及的指令只有 `init_worker` 和 `header_filter`，在 init_worker 中为 uuid 库初始化了随机数种子，在 header_filter 中将一个 key 为 ）_M.key，值为 uuid 的 header 设置到 response headers 中，就这么简单。

还有一些更复杂的插件，由于篇幅所限无法全部展示出来。不过一旦理解了基本原理和设计，要创建新的插件也不是什么难事。

## 实现原则

有一个实现原则是，不同插件之间不应该产生关联，比如共享状态或者对调用顺序有任何假设。这是因为如果插件之间存在关联，则运行时的效果可能是不可预知的。举个比较刻意的例子，假设对 www.foo.com 我们注册有 A 和 B 两个插件，A 在设置了 ngx.ctx.foo = "a" 并在之后读取了 ngx.ctx.foo，B 设置了 ngx.ctx.foo = "b" 并在之后读取了 ngx.ctx.foo。由于框架对插件的调用顺序和他们被注册的顺序一致（一般来说这样设计没问题，因为框架本身并不关心插件的被调用顺序，只是按序遍历插件列表逐个调用罢了。）且 A 在 B 之前被注册，则实际结果是 A 在读取 ngx.ctx.foo 时期望读到的是 "a"，但读到的却是 "b"，因为 ngx.ctx.foo 这个变量在 A 和 B 之间是共享的且 B 比 A 晚执行覆盖了这个变量。

插件间不应产生关联虽说是原则，但从技术上我们无法阻止有人编写存在关联的插件，只能尽量避免。一个比较好的实践是：在插件内如果有需要用到 `ngx.ctx` 这种请求相关的上下文变量时，给他一个前缀以降低和其他插件冲突的风险。nginx 内部还有一种范围更广共享方式是使用 `lua_shared_dict`，这种方式是全局的，可以被所有 worker 共享，使用这种共享内存需要特别小心。如果把视角放到 nginx 之外，产生关联方式就更多了：数据库、缓存、文件等等，其实道理都是一样的，插件间的关联会产生不确定性。

## 更多

还可以继续完善这套系统，加入插件管理 API，这部分内容以上面的描述为基础，限于篇幅这里就不展开说了。
