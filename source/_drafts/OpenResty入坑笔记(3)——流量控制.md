---
title: OpenResty入坑笔记(3)——流量控制
date: 2019-01-23
tags: [nginx, openresty]
categories: web后端
---

本文演示如何使用OpenResty做基本的流量控制。

<!--more-->

流量控制是Web生产环境中很常见的管理手段，为了保护后端服务器和数据库，对请求采取流控是必要的。使用OpenResty做流量控制非常方便。

