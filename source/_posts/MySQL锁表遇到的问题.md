---
title: MySQL锁表遇到的问题
date: 2017-08-25
tags: [MySQL]
categories: 数据库
---

今天在测试环境要更改一个表的结构，一个操作是把某个字段改成unique的，但是这个表中原来的数据这个字段有重复，于是在提交更改的时候就失败了。

<!--more-->

之后发现对这个表的查询全部超时，马上想到难道是表被锁定了。于是查了下查看表当前进程的命令：

    show processlist

发现了之前提交的更改表结构的语句，执行失败却把表锁定了，此时需要解除这种锁定，找到相应的id后执行：

    kill [锁表SQL的Id]

之后表锁解除，查询正常。
