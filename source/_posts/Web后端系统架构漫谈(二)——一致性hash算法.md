---
title: Web后端系统架构漫谈(二)——一致性hash算法
date: 2017-11-23
---

## 一致性hash算法使用场景

设想一个场景，有n个cache db，以key-value pair的形式存储数据，一个指定的key-value，我们首先对它的key计算哈希值，然后将这个哈希值对n取模，结果就是这个key-value被路由到的cache db。通过这种方式可以将所有的key-value pair路由到对应的cache db中。这个过程用伪代码表示为：

```Java
route_cache_db(key, value, cache_dbs, n){
  key_hash = hash_func(key)
  idx = key_hash % n
  cache_dbs[idx].set(key, value)
}
```

现在考虑两种情况，一是新增一台cache db，二是其中一台cache db宕机，会发生什么？

不管是哪一种情况，可用的cache db数量n都会发生改变，`route_cache_db`中入参n的变化会导致`key_hash % n`的结果发生变化，因此对任意一个key-value pair都会被路由到和之前不同的cache db中。这意味着一旦cache db的数量发生变化，所有key都需要重建。这无疑是一个巨大的开销，有的系统甚至无法承受这样的开销。并且如果只是使用上面这种算法，我们就无法平滑扩容或缩容这些cache db。

于是有人提出了一致性hash算法，一致性hash能大大缓解上述情况带来的副作用。先来看看什么是一致性hash。

设计一个圆环，假设其数值范围是0~2^32-1，有4个cache db节点。我们使用hash函数对这些cache db的某些信息（如IP、主机名或这些信息的组合）计算哈希值，然后对2^32取模运算，得到这些节点在圆环中的位置。当有key-value pair进来时，使用同样的hash函数计算key的哈希值，然后对2^32取模运算，得到这些key在圆环中的位置。然后按照顺时针方向（递增方向），寻找key在圆环上遇到的第一个cache db节点。示意图如下：

![一致性hash_1](/assets/images/post_imgs/web_arch_consistent_hashing_1.png)

回到刚才讨论的两种情况，新增一台cache db和其中一台发生宕机。

1. 一致性hash算法新增一台cache db的情况

新增一台cache db，在图中表示为node 5，落在node 3到node 5之间的key会被存储到node 5上，因此key 5需要被存储在node 5上。且并不会对其他节点的数据造成影响。如下图：

![一致性hash_2](/assets/images/post_imgs/web_arch_consistent_hashing_2.png)

2. 其中一台发生cache db宕机的情况

其中一台发生cache db宕机，假设node 3发生宕机，node 2到node 3之间的key会被存储到node 4上，因此key 3会被存储在node 4上。且并不会对其他节点的数据造成影响。如下图：

![一致性hash_3](/assets/images/post_imgs/web_arch_consistent_hashing_3.png)

## hash平衡性

当只有少数的cache db时，可能出现两个node在圆环上分布过于靠近的情况，这会导致hash不平衡的情况：

![一致性hash_4](/assets/images/post_imgs/web_arch_consistent_hashing_4.png)

上图这种情况下，node 2会比node 1接受更多的key，造成不平衡。

一种解决方法是，设置多个虚拟node，使node分布更为均匀。比如上图中的情况，我们给每个node都设置3个虚拟node:

1. node-1：node-1#1 node-1#2 node-1#3
2. node-2：node-2#1 node-2#2 node-3#3

这样就有6个node了。还需要设置这些虚拟node到真实node的对应关系，这在代码中都可以很方便地实现。设置虚拟node后结构如下：

![一致性hash_5](/assets/images/post_imgs/web_arch_consistent_hashing_5.png)
