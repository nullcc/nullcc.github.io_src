---
title: 垃圾回收(GC)算法介绍(四)——GC标记-压缩算法
date: 2017-11-30
---

GC标记-压缩算法是GC标记-清除算法和GC复制算法相结合的一种算法。

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

Lisp2算法的缺点也很明显，需要遍历四次堆：标记阶段一次、更新forwarding指针阶段一次、更新对象指针阶段一次、移动对象阶段一次。堆越大，该算法的成本越高，吞吐率也会下降。