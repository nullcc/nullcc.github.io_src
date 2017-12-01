---
title: 用Redis实现优先级队列
date: 2017-05-10
tags: [Redis]
categories: web后端
---

在最近在面试过程中，张先森遇到一个面试官这么问，如果一个并发很大的消息应用，想要根据请求的优先级来处理，该怎么做。我当时只是笼统地回答用redis，面试官点了点头，这个问题就此通过。

<!--more-->

那么用redis究竟如何解决这个问题呢，下面就简单说一下吧。

首先抓出问题里面几个关键字，一是并发量大，二是请求的优先级。

先谈谈并发量大，对于一个消息系统，服务端必然会接受很多客户端的请求，这些请求一般来说都是异步的，用户不必等待请求被处理。对于这类需求，我们需要有一个能缓存住大量消息请求的东西，用redis来做这个是非常合适的。基本上来说，redis能缓存住的消息数量只取决于内存大小，而且我们需要的只是队列最基本的操作：进队和出队，它们的时间复杂度都是O(1)，因此性能上很高。

具体来说，redis里面有一个list结构，我们可以利用list构造一个FIFO(先进先出)的队列，所有请求就在这个队列里面排队等待处理。redis的list有lpush,rpush,lpop和rpop这么几个常用的操作，如果我们要构造FIFO队列，可以用lpush和rpop(或者用rpush和lpop)，注意进队和出队方向相反即可。

第二个关键字，请求的优先级。我们先假设一个最简单的场景，有三个优先级：高中低三级。可以设置3个list结构，比如叫queue_h，queue_m，queue_l，分别对应三个优先级。我们的代码流程可以这样来写：

首先设置3个优先级的list。

写入端：

1. 根据请求的优先级往相应list里lpush数据。

读出端：

1. 可以采用定时轮询的方式，按序依次检查高、中、低三个list的长度(可以使用llen命令)，如果该list长度大于0，说明当前队列需要立即被处理。

2. 从这个list中rpop数据，然后处理数据。

需要注意的是，因为有分优先级，所以只有在高优先级的请求都被处理完以后才能去处理中低优先级的请求，这是一个大前提。

有人可能会问，如果我的优先级分类远大于3个呢，比如有1000个优先级怎么办，总不能设置1000个list吧，这样太蛋疼了。这种情况也不是完全没可能，也许有的系统就是这么多优先级呢。

这种需求我们可以结合分段来处理，比如0-99，100-199...900-999，先把优先级分成几个等分，然后在各个分段中使用有序集合，有序集合可以对集合内的元素排序，有序集合在插入一个元素的时候使用二分查找法，所以在比较大的数据量面前效率还是可以的，如果请求数实在太多，可以考虑进一步细分优先级的分段，以减少有序列表元素的数量。在一个请求进来时，首先确定它的优先级分段，把这个请求放到相应的有序集合中。在处理部分，需要有一个服务书按优先级高到低顺序遍历优先级的分段，然后直接取优先级最高的请求来处理(在有序集合中取最高或最低的元素时间复杂度都是O(1))。

下面是一些代码示例，用node.js编写，只分了三个优先级。

```js
// 生产者

var redisClient = require("./lib/redis");
var redisConf = require("./config/config.json").redis;

redisClient.config(redisConf);

var client = redisClient.client;

// 优先级队列,低中高三个等级
var priorityQueues = ["queue_h", "queue_m", "queue_l"];

function getRandomNum(min, max) {
    var range = max - min;
    var rand = Math.random();
    return(min + Math.round(rand * range));
}

// 每隔两秒产生10条数据
setInterval(function(){
    var count = 10;
    for (var i = 0; i < count; i++) {
        var idx = getRandomNum(0, 2);
        console.log("push: " + priorityQueues[idx]);
        client.lpush(priorityQueues[idx], "abc");
    }
}, 2000);
```

```js
// 消费者

var async = require("async");
var redisClient = require("./lib/redis");
var redisConf = require("./config/config.json").redis;

redisClient.config(redisConf);

var client = redisClient.client;

// 优先级队列,pushMessage低中高三个等级
var priorityQueues = ["queue_h", "queue_m", "queue_l"];

// 依次检查高中低三个优先级的list,遵循FIFO
function getMessage(){
    // 分别检查所有优先级队列中有没有数据
    async.parallel([
            function(callback){
                client.llen(priorityQueues[0], function(err, len){
                    callback(null, len);
                });
            },
            function(callback){
                client.llen(priorityQueues[1], function(err, len){
                    callback(null, len);
                });
            },
            function(callback){
                client.llen(priorityQueues[2], function(err, len){
                    callback(null, len);
                });
            }
        ],
        function(err, results){
            if (err) {
                console.log(err);
                return;
            }
            for (var i = 0; i < results.length; i++){
                if (results[i] > 0){
                    client.rpop(priorityQueues[i], function(err, res){
                        console.log("pop: " + priorityQueues[i] + " " + res);
                    });
                    return;
                }
                if (i == 2){
                    console.log('No message can be handled.');
                    return;
                }
            }
        });
}

// 每20ms获取一次数据
setInterval(function(){
    getMessage();
}, 20);
```

代码实现比较简单，主要实现了高中低三个优先级的情况。
