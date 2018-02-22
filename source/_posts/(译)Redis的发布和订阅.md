---
title: (译)Redis的发布和订阅
date: 2018-02-22
tags: [Redis]
categories: 文档翻译
---

本文翻译自[Pub/Sub](https://redis.io/topics/pubsub)。

<!--more-->

`SUBSCRIBE`、`UNSUBSCRIBE`和`PUBLISH`实现了发布/订阅消息传递模式（这里引用维基百科），发送者（发布者）不需要编程就可以将消息发送给指定的接收者（订阅者）。相反，已发布的消息具有信道特性，发布者不需要知道有哪些订阅者（如果有的话）。订阅者关注一个或多个它感兴趣的信道，只接收它感兴趣的信道的信息，而不需要知道有哪些发布者（如果有的话）。这种对发布者和订阅者的解耦允许更大和更具动态性地网络拓扑结构，

例如为了订阅foo和bar两个信道，客户端发送一个`SUBSCRIBE`命令并提供信道的名称：

    SUBSCRIBE foo bar

其他客户端向这些信道发送的消息将会被Redis推送给所有订阅了这些信道的客户端。

一个订阅了一个或多个信道的客户端不应该发布命令，尽管它可以对其他信道执行订阅或取消订阅。订阅和取消订阅操作的回复信息都以消息的形式发送，以便客户端可以读取连贯的消息流，其中第一个元素指明了消息的类型。

在一个订阅了信道的客户端允许执行的命令有`SUBSCRIBE`、`PSUBSCRIBE`、`UNSUBSCRIBE`、`PUNSUBSCRIBE`、`PING`和`QUIT`。

请注意redis-cli在订阅模式下将不接受任何命令，此时只能用`Ctrl-C`退出订阅模式。

## 推送消息的格式

A message is a Array reply with three elements.

一个消息是一个具有三个元素的数组。

第一个元素是消息的类型：

subscribe：表示我们成功订阅了应答中第二个元素中指明的信道。第三个参数表示我们当前订阅的信道个数。

unsubscribe：表示我们成功退订了应答中第二个元素指明的信道。第三个参数表示我们当前订阅的信道个数。当最后一个参数是0时，我们不再订阅任何信道，此时客户端可以发布任何Redis命令了，因为我们已经退出了发布/订阅状态。

message：表示接收到一个从其他客户端使用`PUBLISH`命令发布的消息。第二个参数表示信道名称，第三个参数为实际的消息载荷。

## 数据库 & 作用域

发布/订阅和键空间无关。它不受任何东西的干扰，包括数据库编号。

在db 10上发布消息，可以被在db 1上的订阅者监听到。

如果你需要某种形式的作用域，可以使用环境名称（test、staging、production等等）作为信道的前缀。

## 协议示例
 
    SUBSCRIBE first second
    *3
    $9
    subscribe
    $5
    first
    :1
    *3
    $9
    subscribe
    $6
    second
    :2

此时，另一个客户端向信道second执行一个发布操作：

    > PUBLISH second Hello

下面是第一个客户端收到的：

    *3
    $7
    message
    $6
    second
    $5
    Hello

现在客户端使用不带额外参数的`UNSUBSCRIBE`命令退订所有已订阅的信道：

    UNSUBSCRIBE
    *3
    $11
    unsubscribe
    $6
    second
    :1
    *3
    $11
    unsubscribe
    $5
    first
    :0

## 模式匹配的订阅

Redis的发布/订阅实现支持模式匹配。客户端可以使用glob风格的模式匹配来订阅所有发送给名字匹配指定模式的信道。

比如：

    PSUBSCRIBE news.*

此时客户端将接收到所有发送到news.art.figurative、news.music.jazz等信道的的消息。所有glob风格的模式都是合法的，支持多个通配符。

    PUNSUBSCRIBE news.*

这个命令将是的客户端退订匹配news.*模式的所有信道。此调用不会影响其他信道的订阅。

因模式匹配而受到的消息以不同的格式发送：

* 消息的类型是`pmessage`：表示这是由其他客户端使用PUBLISH命令发布的消息，通过模式匹配了订阅。第二个元素是被匹配模式的原始形式，第三个参数是信道名称，最后一个参数是实际的消息载荷。

与`SUBSCRIBE`和`UNSUBSCRIBE`命令一样，`PSUBSCRIBE`和`PUNSUBSCRIBE`命令使用psubscribe和punsubscribe来表示命令类型，并使用与subscribe和unsubscribe信息相同的格式。

## 同时匹配模式和信道名的消息订阅

如果一条发布的消息匹配了多个已订阅的模式，同时匹配模式和信道名的消息订阅，客户端将多次收到同一条消息。如下面的例子所示：

    SUBSCRIBE foo
    PSUBSCRIBE f*

上例中，如果一条消息被发送到信道foo，客户端将收到两条消息：一条类型为message的消息和一条类型为pmessage的消息。

## 模式匹配订阅计数的含义

在subscribe、unsubscribe、psubscribe和punsubscribe消息类型中，最后一个参数表示当前仍在订阅的信道数量。这个数字实际上是客户端当前仍然订阅的信道和模式的总数。所以只有当退订所有信道和模式时，这个计数值变为0，客户端才会退出发布/订阅模式。

## 编程示例

Pieter Noordhuis提供了一个很好的例子，使用EventMachine和Redis构建一个[多用户高性能的网络聊天项目](https://gist.github.com/pietern/348262)。

## 客户端库实现的提示

由于所有收到的消息都包含原始的订阅信息，所以客户端可以使用一个哈希表保存已注册的回调函数，然后将原始的订阅信息（消息类型为message时为信道名，消息类型为pmessage时为匹配的模式）传递给回调函数（可以是匿名函数、块、函数指针）。

当接收到消息时，可以进行复杂度为O(1)的查找，以便将消息传递给已注册的回调函数。

