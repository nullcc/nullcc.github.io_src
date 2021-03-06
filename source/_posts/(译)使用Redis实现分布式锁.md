---
title: (译)使用Redis实现分布式锁
date: 2018-02-25
tags: [Redis]
categories: 文档翻译
---

本文翻译自[Distributed locks with Redis](https://redis.io/topics/distlock)。

<!--more-->

在许多环境中，分布式锁是一个非常有用的原语，不同进程必须以互斥的方式对共享资源进行操作。

这里有一些库和博客文章描述了如何使用Redis实现一个DLM（分布式锁管理器），但每个库都是用不同的方式实现，和稍微复杂一些的设计实现相比，许多实现都过于简单以至于可靠性不高。

本文为试图使用Redis实现分布式锁提供了更加规范的算法。我们提出了一个算法，叫做`Redlock`，我们相信它实现的DML要比普通的实现更好。我们希望社区对它进行分析，提供反馈，并将其作为分布式锁的实现或成为更复杂设计替代品的起点。

## 各种实现

在描述算法之前，这里提供了一些可供参考的实现链接。

* [Redlock-rb](https://github.com/antirez/redlock-rb) (Ruby实现)。这里还有一个[redlock-rb的分支](https://github.com/leandromoreira/redlock-rb)提供了更简易的分布式特性。
* [Redlock-py](https://github.com/SPSCommerce/redlock-py)（Python实现）。
* [Aioredlock](https://github.com/joanvila/aioredlock)（异步的Python实现）。
* [Redlock-php](https://github.com/ronnylt/redlock-php)（PHP实现）。
* [PHPRedisMutex](https://github.com/malkusch/lock#phpredismutex)（进一步的PHP实现）。
* [cheprasov/php-redis-lock](https://github.com/cheprasov/php-redis-lock)（PHP的Redis锁库）。
* [Redsync.go](https://github.com/hjr265/redsync.go)（Go实现）。
* [Redisson](https://github.com/mrniko/redisson)（Java实现）。
* [Redis::DistLock](https://github.com/sbertrang/redis-distlock)（Perl实现）。
* [Redlock-cpp](https://github.com/jacket-code/redlock-cpp)（C++实现）。
* [Redlock-cs](https://github.com/kidfashion/redlock-cs)（C#/.NET实现）。
* [RedLock.net](https://github.com/kidfashion/redlock-cs)（C#/.NET实现）。包含异步和锁扩展的支持。
* [ScarletLock](https://github.com/kidfashion/redlock-cs)（包含可配置数据源的C#/.NET实现）。
* [node-redlock](https://github.com/kidfashion/redlock-cs)（NodeJS实现）。包含锁扩展支持。

## 安全性和活跃性保证

我们将使用三个属性来建模我们的设计，从我们的观点来看，这是以有效的方式使用分布式锁的最低保证。

1. 安全属性：互斥性。在任何时刻，只有一个客户端能持有锁。
2. 活跃性属性A：不会发生死锁。即使当持有锁的客户端崩溃或出现网络割裂，最终也可以获取一个锁。
3. 活跃性属性B：容错性。只要大多数Redis节点存活，客户端就可以获取和释放锁。

## 为什么基于故障转移的实现还不够？

要了解需要做哪些改进，先让我们分析一下当前大多数基于Redis的分布式锁代码库的情况。

使用Redis来对一个资源加锁最简单的方式是创建一个键。一般使用Redis的键过期功能对这个键设置一个生存时间，因此最终这个键将被释放（即在上个小节中提到的第二个属性）。当客户端要释放资源时，删除这个键即可。

从表面上看这种方式工作得很好，但这里有一个问题：在我们的架构中有一个单点失败的问题。当Redis主节点崩溃会发生什么？我们可以增加一个从节点！当主节点不可用时我们就使用从节点。不幸地是，这不可行。这样做我们无法实现互斥的安全属性，因为Redis的复制是异步进行的。

这个模型中有一个很明显的竞争条件：

1. 客户端A从主节点上获取锁。
2. 主节点在将键复制给从节点之前崩溃。
3. 从节点被提升为主节点。
4. 客户端B针对同一个资源获取了客户端A正在持有的锁。这是不安全的！

有时，在特殊情况下，比如在故障期间，多个客户端可以同时持有锁，这是非常好的。这种清下你可以使用基于复制的方案。否则我们建议你以本文档描述的方案进行实现。

## 单实例情况下的正确实现

在试图客服上面描述的单例情况的局限之前，让我们来看看如何正确处理这种简单的情况，因为在一些可以接受时不时出现竞态条件的应用中这是一种可行的解决方案，因为对单实例在执行对资源进行锁定是我们在这里描述的分布式算法的基础。

获取锁的方式如下：

    SET resource_name my_random_value NX PX 30000

上述命令将只在键不存在的情况下（使用NX选项）设置键，键过期时间为30000毫秒（使用PX选项）。键的值被设置为"myrandomvalue"。这个值必须在所有客户端和所有锁请求中都是唯一的。

基本上来说，键的随机值是用来用一种安全的方式来释放锁，使用一段脚本来告诉Redis：只有在键存在且键的值是我们期望的那个值的时候删除这个键。这可以使用下面的Lua脚本来完成：

    if redis.call("get",KEYS[1]) == ARGV[1] then
        return redis.call("del",KEYS[1])
    else
        return 0
    end

一件很重要的事情是避免移除一个由其他客户端创建的锁。比如一个客户端可能持有锁，并长时间阻塞在某个操作上，阻塞的时间超过了锁的有效时间（即那个键的过期时间），锁过期以后，由其他客户端持有，接着这个被阻塞的客户端又再次释放锁。仅仅使用`DEL`来释放锁是不安全的，因为这有可能会误移除掉其他客户端持有的锁。使用上面的脚本，每个锁都使用一个随机字符串进行“签名”，以便只有创建该锁的客户端可以释放它。

这个随机字符串应该是什么样子的？我们假设它是一个由/dev/urandom创建的20字节的字符串，但你可以使用开销更低的方式来使其足够唯一以适应你的任务。例如一个安全的选择是使用/dev/urandom的输出作为RC4加密算法的种子，并从中生成伪随机流。一个更简单的解决方案是使用UNIX的微秒级精度的时间，和客户端ID进行连接，这不是绝对安全的，但是大多数环境下都能完成任务。

我们使用的键有效期时间，被称为“锁有效时间”。它同时也是锁的自动释放时间，并且也是在另一个客户端可能再次获取到锁之前，当前客户端执行操作需要的时间，这在技术上可以保证互斥性，但这仅限于从获取锁的时刻开始到给定的窗口时间结束这段时间内。

因此我们现在有了一个获取和释放锁的好方法。可以推论得到，关于一个由单一实例组成的非分布式系统，这种方式总是可用的且安全的。让我们将这个概念扩展到没有这种保证的分布式系统中。

## Redlock算法

在该算法的分布式版本中我们假设我们有N个Redis主节点。这些节点是完全独立的，因此我们不适用复制或者任何隐式协调系统。我们已经描述了在一个单实例中如何安全地获取和释放锁。我们想当然地认为该算法使用这种方式在单个实例上获取和释放锁。在我们的例子中设置了N=5，这是一个合理的值，因此我们需要在不同的计算机或虚拟机上运行5个Redis主节点以确保它们的崩溃不会相互关联。

为了获取锁，客户端需要执行以下操作：

1. 以毫秒级精度获取当前时间。
2. 客户端尝试使用相同的key和相同的随机值从所有的N个Redis实例中依次获取锁。在步骤2中，当在每个实例上设置锁时，客户端使用一个比锁自动释放时间小的超时时间以便获取这个锁。例如如果锁的自动释放时间为10秒，超时是时间可以被设置在5~50毫秒这个范围内。这防止了客户端长时间阻塞在那些已经崩溃的节点上：如果一个Redis实例不可用，我们将尽快尝试和下一个实例建立连接。
3. 客户端通过用当前时间戳减去在步骤1中获取的时间戳计算获取锁所需的时间。仅当客户端能够从大多数Redis实例中（在本例中至少3个）获取锁时，并且获取锁花费的总时间比锁的有效时间短时，该锁才被认为是可以获取的。
4. 如果客户端获取了锁，它的有效时间将被设置为初始有效时间减去获取锁花费的时间，即在第3步中计算出来的时间。
5. 如果客户端由于某种原因获取锁失败（要么客户端无法从N/2+1个实例中获取锁，要么计算出的锁有效时间为负数），客户端将尝试释放在所有实例中的锁（即使是对那些它认为无法获取锁的实例）。

## 这个算法是异步的吗？

这个算法依赖于一个假设，即进程之间没有同步时钟，然而，每个进程内的本地时钟近似以相同的速率流逝，其误差小于锁的自动释放时间。这个假设很像现实世界中的计算机：每台计算机都有一个本地时钟且我们通常可以依赖不同的计算机来实现一个小的时钟漂移。

在这一点上我们需要更更好地指定我们的互斥原则：只有当持有锁的客户端在锁的有效期（即在步骤3中计算出的锁有效时间）减去一些时间（只需几毫秒，以补偿进程间的时钟漂移）内完成它的工作时，才能保证该算法的有效性。

有关需要绑定时钟漂移的类似系统的更多信息，本文是一个有趣的参考：租约：一种高效的分布式文件缓存容错机制。

## 失败重试

当一个客户端无法获取锁时，它应该尝试在一个随机延迟后再次获取锁以便尽量去同步多个客户端尝试在相同时间对相同资源获取锁（这引发导致脑裂状态导致没有任何一个客户端能获取到锁）。客户端越快去尝试在大部分Redis实例中获取锁，脑裂状态的窗口时间就越小（以及重试的必要性），因此在理想情况下，客户端应该尝试使用多路复用同时向N个Redis实例发送SET命令。

对于未能获取到大部分锁的客户端来说，非常重要的一点是，要尽快释放那些部分获取的锁，因此没有必要等锁过期后再一次获取锁（然而，如果发生了网络分区导致客户端再也无法和Redis实例通信，还有一个补救方案就是等待键过期）。

## 释放锁

释放锁很简单，只需释放所有Redis实例上的锁，不管客户端是否认为它能够成功锁定实例。

## 安全参数

这个算法安全吗？我们可以来试着理解看看在不同场景下会发生什么。

首先，让我们假设一个客户端可以在大部分Redis实例上获取锁。所有Redis实例都将包含相同生存时间的键。然而，所有键的设置时间不同，因此所有键的过期时间也不同。但是如果第一个键的过期时间为T1（即我们对第一台服务器采样得到的时间），最后一个键的过期时间为T2（即我们对最后一台服务器采样得到的时间），我们保证第一个键的过期时间至少不能小于`MIN_VALIDITY=TTL-(T2-T1)-CLOCK_DRIFT`。所有其他Redis实例上的键将在之后过期，因此我们保证至少在这段时间内，各个Redis实例上的键将被同时设置。

在这段时间内，大部分Redis实例上的键被设置了，另一个客户端将无法获取到这个锁，因为当N/2+1个键已经存在时，N/2+1 SET NX操作无法成功。所以如果一个锁被获取了，则不可能在同一时间再次被获取（这违反互斥性质）。

然而，我们也要确保多个客户端同时尝试过去同一个锁是无法成功的。

如果一个客户端以一个接近或大于锁最大有效期的时间锁定了大部分Redis实例（即我们在SET命令中使用的TTL），那么客户端将认为锁无效并释放所有已经获取的锁，因此我们只需要考虑客户端在小于锁有效期的时间内获取了大多数Redis实例的锁。在本例中提到的参数中，没有客户端可以在`MIN_VALIDITY`时间内重新获取锁。因此多个客户端同时（即在步骤2中提到的“时间”内）可以锁定N/2+1个Redis实例，除非锁定大多数Redis实例的时间都超过TTL（锁的过期时间），锁才无效。

你能提供一个和当前算法类似的算法的证明或者找到其中一个bug吗？如果有的话我们将非常感激。

## 活跃性参数

系统的活跃性基于三个主要特征：

1. 锁的自动释放（当键过期时）：最终键可以再次被锁定。
2. 事实上，当未获取到锁时，或者在获取到锁且工作结束时，客户端通常会合作删除锁，使我们不必等到键过期以后才能再次获取到锁。
3. 事实上，当一个客户端需要重新获取锁时，它会等待一段比获取大多数锁的时间大的时间，以便使造成脑裂条件的概率不可能存在。

然而，我们在网络分区上需要承受TTL的时间消耗，因此如果出现连续的网络分区，我们就要无限期地承受这个时间消耗。这在每次一个客户端获取到一个锁后且客户端释放锁之前出现网络分区时都会发生。

基本上如果有出现无限的连续网络分区，系统可能将永远不可用。

## 性能，崩溃恢复和fsync

许多用户使用Redis作为一个锁服务器需要高性能，即获取锁和释放锁的低延迟，和尽量高的每秒可能执行的获取/释放锁的操作次数。为了满足这些需求，减少和N个Redis服务器对话延迟的的策略一定是复用（或乞丐版复用，即让套接字工作在非阻塞模式下，一次性发送所有命令，并在稍后接受所有命令回复，这里假设了客户端和各个Redis实例之间的RTT是相似的）。

然而，如果我们要建立一个崩溃-恢复的系统模型，这里还要考虑关于持久化的问题。

为了发现问题所在，让我们假设Redis没有配置持久化。一个客户端在5个Redis实例中获取了3个锁。此时在客户端已经获取到锁的实例中有一个实例重启了，此时，又有三个实例可以对这个资源进行锁定，另一个客户端就可以再次锁定它，这违反了锁的互斥性安全属性。

如果我们开启AOF持久化，会有所改善。例如，我们可以通过发送SHUTDOWN命令重启更新一台服务器。因为Redis的过期时间在语义上的实现实际上不受服务器关机的影响，这满足我们所有的要求。然而，只要是正常的关机，一切都很好。如果是停电呢？如果Redis被配置成默认的每秒执行一次fsync刷数据到磁盘上，有可能出现重启机器后部分键丢失。从理论上讲，如果我们想要保证锁在任何机器重启的情况下的安全性，我们需要设置持久化为`fsync=always`。反过来，这将完全破坏系统的性能，使系统的性能和传统的用于实现安全分布式锁的中央处理系统处于同一水平。.

然而，事情要比乍看起来要好。基本上，只要实例崩溃后重新启动，算法安全性就保持不变，它不再参与任何当前活跃的锁，因此当实例重启后，客户端只会从除了重新加入系统以外的Redis实例中获取锁。

为了保证这一点，我们需要来看一个例子，在一个实例崩溃后，实例不可用的时间至少比我们使用的TTL长一点，也就是说，当实例崩溃时，当前存在的锁将在这个实例重启之后变得无效且被自动释放。

使用延迟重启基本上可以实现安全性甚至不需要任何形式的Redis持久化，然而请注意，这可能导致可用性问题。例如，如果大部分实例崩溃，系统将在TTL时间内变成全局不可用（这里的全局意味着没有任何资源能够这段时间内被锁定）。

## 使算法更可靠：扩展锁

如果客户端要执行的操作是由一些小步骤组成的，默认可以使用较小的锁有效时间，并扩展了实现锁扩展机制的算法。基本上对于客户端来说，如果在计算过程中锁的有效期快到了，此时可以在键存在的情况下通过向所有Redis实例发送一个Lua脚本来延长键的TTL，而键的值还是保持当时客户端获取锁时赋予的那个值。

客户端只应该在锁的有效期内（基本上使用的算法与获取锁时使用的算法非常类似），且可以对大多数Redis实例延长锁有效期的前提下考虑重新获取锁。

然而，这并没有在技术上改变算法，因此应该限制重新获取锁的尝试次数，否则会违反其中一条活跃性属性。

## 想帮忙吗？

如果你在研究分布式系统，我们将非常乐意听取你的观点和分析。如果能有其他语言的参考实现就更好了。

先说声谢谢了！

## 分析Redlock

Martin Kleppmann analyzed Redlock here. I disagree with the analysis and posted my reply to his analysis here.

Martin Kleppmann在[这里](http://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html)分析了Redlock。我并不同意这个分析，我把我对他的分析的回复放在[这里](http://antirez.com/news/101)。