---
title: (译)Redis键空间通知
date: 2018-03-02
tags: [Redis]
categories: 文档翻译
---

本文翻译自[Redis Keyspace Notifications](https://redis.io/topics/notifications)。

<!--more-->

`重要`：键空间通知是从Redis 2.8.0起才有的功能。

## 功能概述

键空间通知允许客户端订阅发布/订阅信道来接收以某种方式影响Redis数据集的事件。

可以接收的事件示例如下：

* 影响给定键的所有命令。
* 键接收到LPUSH操作。
* 键在0号数据库中过期。

事件使用普通Redis的发布/订阅层来，因此实现了发布/订阅功能的客户端可以在不修改的情况下使用这个功能。

由于Redis的发布/订阅当前是发后即忘模式的，因此如果你的应用需要可靠的事件通知，则无法满足，也就是说，如果你的发布/订阅客户端断开连接并在稍后重连，客户端断开的这段时间内的所有事件通知都会丢失。

在未来有计划实现更加可靠的事件通知，但是这可能会在更一般的层面上解决，这也可能给发布/订阅本身带来可靠性，或允许使用Lua脚本拦截发布/订阅消息来执行类似将事件加入到一个列表中这样的操作。

## 事件的类型

键空间通知被实现成对每个影响Redis数据集的操作发送两个不同类型的事件。例如，一个在0号数据库中对名称为mykey的键执行DEL操作将触发推送两条消息，相当于执行了下面两条`PUBLISH`命令：

    PUBLISH __keyspace@0__:mykey del
    PUBLISH __keyevent@0__:del mykey

很容易看出一个信道可以监听所有针对键mykey的事件，另一个信道允许获取对所有键执行删除操作的信息。

第一类事件，以`keyspace`为前缀的信道被称为键-空间通知，第二类事件，以`keyevent`为前缀的信道被称为键-事件通知。

In the above example a del event was generated for the key mykey. What happens is that:

上面的例子中针对键mykey生成了一个删除事件。具体如下：

* 键-空间信道以消息的方式接收事件名称。
* 键-事件信道以消息的方式接收键名称。

仅提供我们感兴趣的事件子集的其中一种类型的通知是可能的。

## 配置

默认情况下，键空间事件通知是被禁用的，因为这个功能会消耗一些CPU，默认打开是不明智的。可以在redis.conf文件中使用`notify-keyspace-events`或`CONFIG SET`命令启用它。

将参数设置为空字符串会禁用通知。为了启用该功能，必须使用一个非空字符串作为参数，参数由多个字符组成，每个字符都有特别的含义，如下表所示：

    K     键空间事件，以__keyspace@<db>__为前缀发布消息
    E     键事件事件，以__keyevent@<db>__为前缀发布消息
    g     通用命令（非特定类型），例如 DEL、 EXPIRE、 RENAME等
    $     字符串命令
    l     列表命令
    s     集合命令
    h     哈希命令
    z     有序集合命令
    x     键过期事件（每次当一个键过期时生成的事件）
    e     键淘汰事件（当一个键由于内存超量导致被淘汰时生成的事件）
    A     参数g$lshzxe的别名，因此"AKE"字符串表示所有的事件

K或E至少有一个应该出现在参数字符串中，否则，无论字符串的其他部分是什么，都不会推送事件。

例如，为了只针对列表开启键-空间事件，配置参数必须设置为`Kl`，以此类推。

字符串`KEA`可以用来开启任何可能的事件。

## 由不同命令生成的事件

不同的命令会生成不同类型的事件，如下面的列表：

* `DEL`命令会对每一个被删除的键生成一个`del event`。
* `RENAME`命令会生成两个事件，对源键生成一个`rename_from`事件，对目标键生成一个`rename_to`事件。
* `EXPIRE`命令在对一个键设置过期时间时生成一个`expire event`，或在每次使用正数时间对一个键设置过期时间后导致键因过期被删除时生成一个`expired event`（查看[EXPIRE](https://redis.io/commands/expire)的文档来获取更多信息）。
* `SORT`命令在使用`STORE`设置一个新建时会生成一个`sortstore event`。如果结果列表为空，并使用了`STORE`选项，且相同的键名已经存在，结果就是这个键被删除，因此这种情况下会生成一个`del event`。
* `SET`和它的左右变种(SETEX、SETNX、GETSET)会生成`set events`。然而`SETEX`同时还会生成一个`expire events`。
* `MSET`会对每个键生成一个独立的`set event`。
* `SETRANGE`命令生成一个`setrange event`。
* `INCR`、`DECR`、`INCRBY`、`DECRBY`命令都会生成`incrby events`。
* `INCRBYFLOAT`命令会生成一个`incrbyfloat events`。
* `APPEND`命令会生成一个`append event`。
* `LPUSH`和`LPUSHX`命令会生成一个单一的`lpush event`，即使是在复杂情况下。
* `RPUSH`和`RPUSHX`命令会生成一个单一的`rpush event`，即使是在复杂情况下。
* `RPOP`命令会生成一个`rpop event`。如果列表中的最后一个元素被弹出，还会额外生成一个`del event`。
* `LPOP`命令会生成一个`lpop event`。如果列表中的第一个元素被弹出，还会额外生成一个`del event`。
* `LINSERT`命令会生成一个`linsert event`。
* `LSET`命令会生成一个`lset event`。
* `LREM`命令会生成一个`lrem event`，如果结果列表为空且键被删除将额外生成一个`del event`。
* `LTRIM`命令会生成一个`ltrim event`，如果结果列表为空且键被删除将额外生成一个`del event`。
* `RPOPLPUSH`和`BRPOPLPUSH`命令会生成一个`rpop event`和一个`lpush event`。在这两种情况下，顺序都是有保证的（lpush event将总是在rpop event之后被推送）。如果结果列表长度为0且键被删除将额外生成一个`del event`。
* `HSET`、`HSETNX`和`HMSET`都会生成一个单一的`hset event`。
* `HINCRBY`命令会生成一个`hincrby event`。
* `HINCRBYFLOAT`命令会生成一个`hincrbyfloat event`。
* `HDEL`命令会生成一个单一的`hdel event`，如果结果哈希为空且键被删除将额外生成一个`del event`。
* `SADD`命令会生成一个单一的`sadd event`，即使是在复杂情况下。
* `SREM`命令会生成一个单一的`srem event`，如果结果集合为空且键被删除将额外生成一个`del event`。
* `SMOVE`命令会对源键生成一个`srem event`，且对目标键生成一个`sadd event`。
* `SPOP`命令会生成一个`spop event`，如果结果集合为空且键被删除将额外生成一个`del event`。
* `SINTERSTORE`、`SUNIONSTORE`、`SDIFFSTORE`会分别生成`sinterstore event`、`sunionostore event`、`sdiffstore event`。在集合为空且被存储的键已经存在的特殊情况下，由于key会被删除会生成一个`del event`。
* `ZINCR`命令会生成一个`zincr event`。
* `ZADD`命令会生成一个单一的`zadd event`，即使有多个元素一次性被添加。
* `ZREM`命令会生成一个的那一的`zrem event`，即使有多个元素一次性被删除。当结果有序集合为空且键被删除，会生成一个额外的`del event`。
* `ZREMBYSCORE`命令会生成一个单一的`zrembyscore event`。当结果有序集合为空且键被删除，会生成一个额外的`del event`。
* `ZREMBYRANK`命令会生成一个单一的`zrembyrank event`。当结果有序集合为空且键被删除，会生成一个额外的`del event`。
* `ZINTERSTORE`和`ZUNIONSTORE`会分别生成`zinterstore event`和`zunionstore event`。在有序集合为空且被存储的键已经存在的特殊情况下，由于key会被删除会生成一个`del event`。
* 每次由于键的过期时间到导致键被从数据集中删除时，会生成一个`expired event`。
* 每次由于Redis超过最大内存限制，使用`maxmemory policy`释放内存导致一个键从数据集中被淘汰时，会生成一个`evicted event`。

`重要`：只有在目标键真正被修改时，所有命令才会生成事件。例如一个`SREM`命令从一个集合中删除了一个不存在的元素，这实际上不会对键造成改变，因此不会生成任何事件。

如果对给定命令如何生成事件存有疑问，最简单的做法就是自己测试一下：

    $ redis-cli config set notify-keyspace-events KEA
    $ redis-cli --csv psubscribe '__key*__:*'
    Reading messages... (press Ctrl-C to quit)
    "psubscribe","__key*__:*",1

此时在另一个终端中使用redis-cli发送命令给Redis服务器并观察事件的生成：

    "pmessage","__key*__:*","__keyspace@0__:foo","set"
    "pmessage","__key*__:*","__keyevent@0__:set","foo"
    ...

Timing of expired events

## 过期事件计时

有生存时间的键在Redis中过期有两种方式：

* 当键被一个命令访问且发现键已过期。
* 通过在后台系统中运行定时任务增量地查找过期键，这样能够收集到那些从未被访问键。

当一个键被访问且被上述两种方法之一发现已过期时会生成`expired events`，这就会导致一个结果，Redis服务器将无法保证在键的生存时间变为0时立即生成`expired events`。

如果没有命令不断地访问键，且有很多的键被设置了生存时间，则在键的生存时间下降到0和生成`expired events`这之间会有一个显著的延迟。

基本上来说，Redis服务器是在删除过期键时，而不是在键的生存时间理论上变为0时生成`expired events`。