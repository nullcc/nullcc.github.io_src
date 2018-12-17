---
title: 使用nginx实现简单的负载均衡和高可用.md
date: 2018-11-27
tags: [高可用]
categories: web后端
---

本文将介绍如何用nginx实现后端服务集群的高可用的最简单方案。

<!--more-->

系统情况描述：

现在有两台部署在不同机器上的后端服务实例，想要将其组成一个服务集群统一对外提供服务，并且在其中一个实例失效的情况下，集群对外还能正常提供服务。最简单的做法是用一个nginx将这两个实例组合起来，并提供一定程度上的健康检查，如果发现某个实例不可用，就暂时不将请求转发给它，直到该实例通过健康检查为止。

先来看nginx的配置文件`nginx.conf`：

```conf
user  nginx;
worker_processes  1;

error_log  /var/log/nginx/error.log warn;
pid        /var/run/nginx.pid;


events {
    worker_connections  1024;
}


http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    log_format  main  '$remote_addr - $remote_user [$time_local] "$request" '
                      '$status $body_bytes_sent "$http_referer" '
                      '"$http_user_agent" "$http_x_forwarded_for"';

    access_log  /var/log/nginx/access.log  main;

    sendfile        on;
    #tcp_nopush     on;

    keepalive_timeout  65;

    #gzip  on;

    #include /etc/nginx/conf.d/*.conf;

    upstream backends {
        # 健康检查失败一次即认为实例失效，并在接下来的5s内不将请求转发到该失败实例上，其中backend1和backend2为后端服务器的地址
        server backend1 max_fails=1 fail_timeout=5s; 
        server backend2 max_fails=1 fail_timeout=5s;
    }

    server {
        listen 80;

        location / {
            proxy_pass http://backends;
        }
    }
}
```

在docker中运行nginx，并使用指定的配置文件：

```shell
docker run \
   -d \
   --net=host \
   -p 80:80 \
   --name nginx \
   -v ~/docker/nginx/nginx.conf:/etc/nginx/nginx.conf:ro \
   nginx
```

这样配置后，这台nginx的宿主机即作为反向代理，且能在一定程度上保证后端实例高可用。当然，这里存在一个nginx失败的单点问题，一旦这个nginx实例挂了，整个服务就挂了。这可以通过为这台nginx实例的机器配置keepalived，利用IP漂移来保证nginx本身的高可用。
