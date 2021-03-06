---
title: 垃圾回收(GC)算法介绍(5)——分代垃圾回收
date: 2017-12-04
tags: [垃圾回收]
categories: 编程语言
---

本文介绍分代垃圾回收策略的基础。

<!--more-->

## 分代垃圾回收概述

在之前的垃圾回收算法介绍中，我们提到大部分对象创建后没多久就“死了”，也就是被垃圾回收掉了。因此很容易联想到可以将堆上的对象分为新生代对象和老年代对象，相应的区域就是新生代空间和老年代空间，针对不同区域执行不同的GC算法。可以说分代垃圾回收有一种分而治之的意思在里面。

在分代垃圾回收策略中，我们在每个对象上维护一个“年龄”域，在新生代区中每进行一次GC，那些没有被回收的对象的年龄就自增1。当对象的年龄达到一个上限后，将其移动到老年代空间。老年代空间里都是一些经历过多次GC而没有被回收的对象。

需要注意的一点是，分代垃圾回收并不是一种具体的GC算法，而是一种策略，在新生代空间和老年代空间中执行的GC算法还是之前讨论的那三种基本算法。

## 堆的结构

一个叫David Ungar的人提出了一种分代垃圾回收策略，这种策略在新生代空间中使用GC复制算法，在老年代空间使用标记-清除算法。

下面是对的结构示意图：

![分代垃圾回收中的堆](/assets/images/post_imgs/gc_44.png)

解释一下上图中几个空间的含义。其中生成空间就是创建新对象所在的空间。当生成空间满了的时候，会对新生代进行GC。有两个幸存空间，对应于GC复制算法的`from`空间和`to`空间，每次只利用其中的一个。当进行新生代GC时，会将生成空间和幸存`from`空间的活跃对象都复制到幸存`to`空间中。只有在一定次数的新生代GC过程中幸存下来的对象才会被复制到老年代空间中去。

## 记录集

上图中还有一个`$rs_set`，这是做什么的呢？现在考虑一个问题，当我们在新生代中执行GC时，要如何找到活跃对象？有两种方式，一是从根出发，寻找新生代中的根引用对象和其子对象，二是从老年代中的对象出发，查找那些位于新生代的对象。因为完全可能存在这样的新生代对象：既不是根直接引用的新生代对象，也不是根直接引用的新生代对象的子对象，这种对象是被老年代对象所引用的对象。如果想找到这些对象，最直接的办法是遍历一遍老年代空间，递归地判断它们的子对象是否是新生代对象。但是这样一来，GC新生代空间时还要去查看一遍老年代对象，效率很低。`$rs_set`就是用来保存那些引用了新生代对象的老年代对象的。

`$rs_set`一般可以是一个数组，其中保存了引用了新生代对象的老年代对象的指针。在新生代GC时只需要遍历一次`$rs_set`，找出那些新生代对象，对其做处理就可以了。

## 写入屏障

在更新一个对象的指针时，要判断对象是否是老年代对象，且指针指向的对象是否是新生代的对象，我们需要一个叫做“写入屏障”的东西。写入屏障会判断这种情况，并在条件为真时将该老年代对象加入`$rs_set`中，方便下次新生代GC时使用。下面是写入屏障的伪代码：

```Java
write_barrier(obj, field, new_obj){
    if(&obj >= $old_start && &new_obj < $old_start && obj.rememberd == FALSE){
        $rs[$rs_index] = obj
        $rs_index++
        obj.rememberd = TRUE
    }
    obj.field = new_obj
}
```

## 对象的结构

在Ungar的分代垃圾回收中，对象头需要包含三个信息：

1. age: 对象的年龄
2. forwarded：已经复制完成的标志
3. remembered：已经向记录集记录完毕的标志

这里age是记录新生代对象经历过的GC次数，当达到一定次数后就要被移动到老年代空间。forwarded用来标记是否已经完成复制，防止重复复制对象。remembered用来标记是否已经添加到记录集中，防止重复添加。

## 优点和缺点

分代垃圾回收使用了分而治之的方式，对存活时间不同的对象采用不同的处理方案，不需要每次GC都遍历整个堆空间，吞吐率得到了提高。

它的缺点是写入屏障会对指针更新操作带来额外的负担。另外如果一个程序中大部分对象存活时间都很长的话，会增加新生代GC的压力，并且导致老年代GC频繁地运行。