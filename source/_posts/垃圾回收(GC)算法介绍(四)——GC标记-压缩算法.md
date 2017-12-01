---
title: 垃圾回收(GC)算法介绍(四)——GC标记-压缩算法
date: 2017-11-30
tags: [垃圾回收]
categories: 编程语言
---

GC标记-压缩算法是GC标记-清除算法和GC复制算法相结合的一种算法。

<!--more-->

## GC标记-压缩算法概述

GC标记-压缩算法有两个阶段：标记阶段和压缩阶段。

其中标记阶段和GC标记-清除算法的标记阶段完全相同。在压缩阶段中，将堆中的活跃对象按顺序移动到堆的一侧，消除对象之间的空闲区域，起到压缩的作用。

接下来将陆续介绍几种GC标记-压缩算法。

## Lisp2算法

Lisp2算法是Donald E. Knuth提出的，在该算法中，每个对象都有一个`forwarding`指针，初始值为NULL，每次GC结束后设置为空。这个指针保存在压缩阶段后每个活跃对象的新地址。下面是Lisp2算法中对象的示意图：

![Lisp2算法中的对象](/assets/images/post_imgs/gc_35.png)

下面通过几张示例图来了解Lisp2算法的基本过程，执行GC前堆的情况如下：

![Lisp2算法示例_执行GC前](/assets/images/post_imgs/gc_36.png)

标记阶段后：

![Lisp2算法示例_标记阶段后](/assets/images/post_imgs/gc_37.png)

压缩阶段后：

![Lisp2算法示例_压缩阶段后](/assets/images/post_imgs/gc_38.png)

可以看到，Lisp2算法将活跃对象移动到堆的一侧，且没有改变它们之间的相对顺序，另外对象之间的空闲空间也被压缩了，在执行GC标记-压缩算法后，对象和对象之间紧挨着的。

我们来看一下压缩阶段发生了什么，伪代码如下：

```Java
compaction_phase(){
    set_forwarding_ptr()
    update_obj_ptr()
    move_obj()
}
```

由于标记阶段和GC标记-清除算法相同（遍历堆找出所有活跃对象），我们只看压缩阶段，分为三个步骤：

1. 更新forwarding指针
2. 更新对象指针
3. 移动对象

### 阶段一——更新forwarding指针

forwarding指针用来标识压缩阶段后每个活跃对象的新地址，Lisp2算法在压缩阶段的一开始就需要为每个活跃对象标识出它们的新地址。做法很简单，以下是伪代码：

```Java
set_forwarding_ptr(){
    scan = new_address = $heap_start
    while(scan < $heap_end){
        if(scan.mark == TRUE){
            scan.forwarding = new_address
            new_address += scan.size
        }
        scan += scan.size
    }
}
```

执行`set_forwarding_ptr`前，堆的情况如下图：

![Lisp2算法示例_执行set_forwarding_ptr前](/assets/images/post_imgs/gc_39.png)

执行`set_forwarding_ptr`后，堆的情况如下图：

![Lisp2算法示例_执行set_forwarding_ptr后](/assets/images/post_imgs/gc_40.png)

每个对象中的红色箭头(forwarding指针)指向的位置就是该对象在GC后在堆中的位置。

### 阶段二——更新对象指针

伪代码如下：

```Java
update_obj_ptr(){
    for(obj in $root)
        obj = obj.forwarding

    scan = $heap_start
    while(scan < $heap_end){
        if(scan.mark == TRUE){
            for(child in scan.children)
                child = child.forwarding
        }
        scan += scan.size
    }
}
```

更新对象指针的步骤也很好理解，首先将根直接引用对象的指针更新为各自的forwarding指针，然后遍历堆，将所有活跃对象的子对象引用也更新为各自的forwarding指针。这就完成了活跃对象的指针更新。更新对象指针后堆的情况如下图：；

![Lisp2算法示例_更新对象指针后](/assets/images/post_imgs/gc_41.png)

### 阶段三——移动对象

该阶段会遍历堆，将所有活动对象移动到其forwarding指针指向的地址。伪代码如下：

```Java
move_obj(){
    scan = $free = $heap_start
    while(scan < $heap_end){
        if(scan.mark == TRUE){
            new_address = scan.forwarding
            copy_data(new_address, scan, scan.size)
            new_address.mark = FALSE
            new_address.forwarding = NULL
            $free += new_address.size
        }
        scan += scan.size
    }
}
```

注意在移动对象时，需要将新地址处对象的`mark`设为FALSE，`forwarding`设为NULL。`$free`是堆的空闲区域开始地址。

移动对象阶段后，堆的情况如下图：

![Lisp2算法示例_移动对象后](/assets/images/post_imgs/gc_42.png)

### 优点和缺点

Lisp2算法的优点是相比GC复制算法，堆的空间利用率提高了，因为不再需要区分`from`空间和`to`空间，压缩带来的好处是堆的已使用空间更加紧凑，内存分配效率高。

Lisp2算法的缺点也很明显，需要遍历四次堆：标记阶段一次、更新forwarding指针阶段一次、更新对象指针阶段一次、移动对象阶段一次。堆越大，该算法的成本越高，吞吐率也会下降。另外在Lisp2算法中每个对象都要有一个forwarding指针，不管对象有多大这个空间消耗都是固定的。

## Two-Finger算法

有人提出了一种叫Two-Finger的算法，这个算法的特点是所有对象的大小必须一致，在这种算法中也有forwarding指针，但不需要为每个对象专门准备forwarding指针，因为可以使用原对象的某个域充当forwarding指针。这个算法相比Lisp2算法的优势是只需要遍历两次堆，因此吞吐率比较高。

Two-Finger算法分为两个步骤：

1. 移动对象
2. 更新对象指针

刚才提到在Two-Finger算法中每个对象的大小必须一致，因此可以将活跃对象移动到非活跃对象的空间中，GC之后所有活跃对象就会集中在堆的一侧，空闲空间在另一侧。

![Two-Finger算法示例](/assets/images/post_imgs/gc_43.png)

如上图所示，从堆的末尾向前寻找活跃对象，将其填充到前面的非活跃对象空间内。

### 阶段一——移动对象

由于所有对象的大小都是一样的，假设这个大小为`OBJ_SIZE`，有一个`$free`指针从`$heap_start`开始，一个`live`指针从堆中最后一个对象处(`$heap_end` - OBJ_SIZE)开始。`$free`指针负责查找非活跃对象，`live`指针寻找活跃对象，并将其移动到`$free`指针指向的空间。另外需要在`live`指针指向的每个原对象处设置一个`forwarding`指针，将其指向移动后的那个对象。

伪代码如下：

```Java
move_obj(){
    $free = $heap_start
    live = $heap_end - OBJ_SIZE
    while(TRUE){
        while($free.mark == TRUE)  // 直到找到一个非活跃对象为止
            $free += OBJ_SIZE
        while(live.mark == FALSE)  // 直到找到一个活跃对象为止
            live -= OBJ_SIZE
        if($free < live){
            copy_data($free, live, OBJ_SIZE)
            live.forwarding = $free
            live.mark = FALSE
        } else {
            break
        }
    }
}
```

### 阶段二——更新对象指针

对象移动完毕后，堆中地址位于`$free`指针之前的对象应该都是活跃对象了，`$free`指针之后的对象则有两种可能：

1. 非活跃对象
2. 已经被移动的对象

非活跃对象我们已不关心，这里需要关注`已经被移动的对象`。

有了上面的信息我们就有一个判断准则：如果一个活跃对象（或其子对象）的地址位于`$free`之后，它已经已经被移动到了`$free`之前的某个位置，这个位置保存在这个对象的`forwarding`指针内。此时我们必须更新这个对象和所有其子对象的指针。

伪代码如下：

```Java
update_obj_ptr(){
    for(obj in $root){
        if(&obj >= $free){
            obj = obj.forwarding
        }
    }
    scan = $heap_start
    while(scan < $free){
        scan.mark = FALSE
        for(child in scan.children){
            if(&child >= $free){
                child = child.forwarding
            }
        }
        scan += OBJ_SIZE
    }
}
```

### 优点和缺点

Two-Finger算法的优点是只需要遍历两次堆，效率较高，吞吐率也比Lisp2算法好，且不需要专门为每个用户维护一个forwarding指针，不浪费空间。

Two-Finger算法的缺点也是相当明显的，它有一个明显的限制：所有对象大小必须一致，这是非常麻烦的一个限制，有一种缓解的方式是将堆分成几个部分，每个部分中的对象大小一致，然后各个部分使用Two-Finger算法做GC。另外一个问题是，Two-Finger算法移动对象时没有将有引用关系的对象放在同一个内存页内，导致无法利用高速缓存。