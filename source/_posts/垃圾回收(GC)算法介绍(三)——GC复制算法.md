---
title: 垃圾回收(GC)算法介绍(三)——GC复制算法
date: 2017-11-21
tags: [垃圾回收]
categories: 编程语言
---

## GC复制算法概述

GC复制算法的基本思想是将一个堆分成两个大小完全相等的两个空间：`from`和`to`。在分配内存时，总是从`from`空间中分配，当`from`空间满无法分配时，将`from`空间中的所有活动对象都复制到`to`空间中，复制完毕后回收`from`空间中的所有对象，最后交换`from`空间和`to`空间，如此往复下去。

![GC复制算法概要](/assets/images/post_imgs/gc_11.png)

将活跃对象从`from`复制到`to`中需要一个`copying`函数：

```Java
copying(){
  $free = $to_heap_start
  for(obj in $root)
    obj = copy(obj)

  swap($from_heap_start, $to_heap_start)
}
```

在`copying`函数中，`$free`是空闲空间的的头部，一开始被设置成`to`空间的头部。然后从根上遍历所有能从根引用到的对象，将其复制到`to`空间中，并递归地将它的所有子对象也复制到`to`空间中。注意`copy`函数的返回值是参数对象在`to`空间的新指针。最后交换`from`空间和`to`空间。

这里的核心在于`copy`函数：

```Java
copy(obj){
  if(obj.tag != COPIED){
    copy_data($free, obj. obj.size)
    obj.tag = COPIED
    obj.forwarding = $free
    $free += obj.size
  }

  for(child in obj.forwarding.children)
    child = copy(child)

  return obj.forwarding
}
```

我们为每个对象都设置了`tag`和`forwarding`域，`tag`用来标识`from`空间中的一个对象是否被复制过，`forwarding`是对象在`to`空间的对象指针。如果一个对象没有被复制过，我们将它复制到`to`空间中，并将其`tag`设为`COPIED`表示已复制，还需要将它的`forwarding`指向新空间的那个对象，之后更新`$free`空闲空间头部地址。此时这个对象的子对象的指针们可能还是指向`from`空间里的对象，需要递归地复制到`to`空间中，这里有一个关键点，因为`copy`函数会返回`to`空间中新对象的指针，所以：

```Java
for(child in obj.forwarding.children)
  child = copy(child)
```

这段代码不但把obj的子对象们复制过去，还将其指针也一并更新了。`copy`函数的最后返回obj在`to`空间中的指针。

我们可以借助示意图来更加直观地理解整个复制过程：

假设初始状态如下，现在需要将`from`空间的活跃对象都复制到`to`空间中。

![copy函数_初始状态](/assets/images/post_imgs/gc_12.png)

先将A复制到`to`空间，设置A的`tag`为`COPIED`，设置A的`forwarding`为`to`空间的对象：

![copy函数_1](/assets/images/post_imgs/gc_13.png)

然后递归调用`copy`函数，将A'的子对象C和D复制到`to`空间，同时设置其`tag`和`forwarding`，并将A'指向C和D的原指针更新为指向`to`空间的新的C'和D'：

![copy函数_2](/assets/images/post_imgs/gc_14.png)

当`from`空间的活动对象都被复制到`to`空间中后，`from`空间中的所有对象将被回收。

复制完毕后，回收`from`空间中所有对象并交换`from`空间和`to`空间：

![copy函数_3](/assets/images/post_imgs/gc_15.png)

在创建对象的时候，会有条件地执行GC复制算法：

```Java
new_obj(size){
  if($free + size > $from_start + HEAP_SIZE/2){
    copying()
    if($free + size > $from_start + HEAP_SIZE/2)
      allocation_failed()
  }

  obj = $free
  obj.size = size
  $free += size
  return obj
}
```

`new_obj`函数收首先检查`from`空间是否有足够的空间进行分配，如果没有就执行一次`copying`函数，然后再次判断是否有足够空间分配，若还是没有就内存分配失败。在实际分配阶段，直接取`$free`，顺序分配一块内存给新对象，并更新`$free`指针。这里需要注意，GC复制算法在分配内存时没有遍历空闲链表这种操作，因为可以直接从`from`空间顺序地划拨一块内存出来，在不执行`copying`的时候（`from`空间够），GC复制算法的内存分配效率相当高。

## 优点和缺点

GC复制算法从根出发寻找和复制活跃对象，和堆的大小无关，之和堆上活动对象的多少有关，因此其吞吐量很不错。它还可以实现高速内存分配，因为GC复制算法维护一个`from`空间可以进行顺序的内存分配，无须遍历空闲链表，因此内存分配效率很高。GC复制算法也不会造成堆的碎片化，因为经过一次GC之后，所有对象都被紧密得排列在堆上，一个对象引用的其他对象也会在堆上紧密排列，它们在内存上邻近，对高速缓存比较友好。

GC复制算法的缺点也很明显，堆使用效率低，只能利用堆的一半大小。另外由于需要移动对象到堆的其他位置，所以不兼容保守式GC。在`copy`函数内部，会对一个对象递归调用`copy`，这也是一种开销，如果对象的引用层次过深，可能有栈溢出的危险。

## 优化方案

### 1. GC广度优先复制算法

在概述中秒数的GC复制算法是深度优先的，它会优先对一个对象的所有子对象做复制，在`copy`函数中递归调用自身来完成，刚才说到这种方案可能引发递归层次过深导致栈溢出。于是有人提出了用迭代的方式替代递归，这样就可以避免递归层次过深导致的栈溢出的问题。伪代码如下：

```Java
copying(){
   scan = $free = $to_heap_start
   for(obj in $root)
    obj = copy(obj)

  while(scan != $free){
    for(child in scan.children){
      chile = copy(child)
    }
    scan += scan.size
  }
  swap($from_heap_start, $to_heap_start)
}

copy(obj){
  if(is_obj_in_heap(obj.forwarding, $to_heap_start, HEAP_SIZE/2) == FALSE){
    copy_data($free, obj, obj.size)
    obj.forwarding = $free
    $free += obj.size
  }
  return obj.forwarding
}
```

广度优先复制的思想也不难理解，首先找出所有从根直接引用的对象，将它们全部复制到`to`空间中。然后从`to`空间的头部开始遍历对象，将每个对象的子对象复制到`to`空间，直至`scan`指针和`$free`指针相等位置。`scan`指针指向`to`空间中当前搜索的对象，`$free`指针指向`to`空间中空闲块的头部。我们借助图示来理解这个过程，假设一个堆的初始状态如下：

![广度优先复制_初始状态](/assets/images/post_imgs/gc_16.png)

首先将所有从根直接引用的对象，将它们全部复制到`to`空间中：

![广度优先复制_复制从根直接引用的对象到to空间](/assets/images/post_imgs/gc_17.png)

所有根直接引用的对象都复制到`to`空间后，`scan`指针在`to`空间中进行遍历，首先移动A'的子对象到`to`空间中：

![广度优先复制_复制A'的子对象到to空间](/assets/images/post_imgs/gc_18.png)

注意在A'的子对象复制完毕后，`scan`指针指向B'，`$free`指针指向D'的后面，然后就需要移动B'的子对象到`to`空间中：

![广度优先复制_复制B'的子对象到to空间](/assets/images/post_imgs/gc_19.png)

复制完B'的子对象F'后，`scan`指针指向C',`$free`指针指向F'的后面。在这之后，继续将`scan`指针往前移动，遇到C'、D'和F'，由于这三个对象都没有子对象，不进行复制操作，最终`scan`指针和`$free`指针将指向同一处，接着交换`from`和`to`空间，复制结束：

![广度优先复制_复制结束](/assets/images/post_imgs/gc_20.png)

#### 优点和缺点

GC广度优先复制算法避免了GC深度优先复制算法可能造成过深的递归调用导致栈溢出的问题，如果仔细观察，会发现这个算法将`to`空间的堆当做一个队列在使用，这非常巧妙。

GC广度优先复制算法的缺点是不像GC深度优先复制算法是高速缓存友好的，GC深度优先复制算法会使一个对象和它的子对象们在堆上彼此相邻，但在广度优先的情况下就不是这样了。

### 2. GC近似深度优先搜索算法

由于广度优先搜索算法存在不能让有引用关系的对象在内存中相邻（或者说在同一个内存页内）的问题，有人开发了GC近似深度优先搜索算法。我们先来看一个示例堆：

![示例堆](/assets/images/post_imgs/gc_21.png)

假设这里的每个对象都是2个字，一个内存页6个字，也就是说一个内存页最多可以存放3个对象。如果使用广度优先搜索算法，堆上的内存分配情况如下：

![广度优先搜索复制中示例堆的内存情况](/assets/images/post_imgs/gc_22.png)

灰色矩形框代表内存页，它右上角的数字是内存页的编号，同一个编号的内存页是同一个内存页。通过观察可以发现，除了0号内存页中A和B、C具有引用关系以外，其他内存页中的对象都没有引用关系，因此无法很好地使用高速缓存。

GC近似深度优先搜索算法中有几个很重要的变量：

1. $page：我们将一个堆分割成一个个内存页，$page是这些内存页的数组，$page[i]表示堆上连续的第i个内存页。
2. $local_scan：每个内存页都有一个当前搜索指针，$local_scan是这些指针的数组，$local_scan[i]表示第i个内存页下一个要搜索的元素指针。
3. $major_scan：搜索尚未完成的内存页首地址的指针。
4. $free：空闲分块头部的指针。

下面详细了解一下GC近似深度优先搜索的执行过程。`to`空间的初始状态如下，此时`$local_scan[0]`、`$major_scan`和`$free`都指向$page[0]的头部：

![GC近似深度优先搜索_初始状态](/assets/images/post_imgs/gc_23.png)

第一步复制A，然后搜索A，将A的子对象B和C也一起复制过来，完成后`$local_scan[0]`指向B，表示当前内存页（`$page[0]`）下一个要搜索的对象是B，由于`$page[0]`还未搜索完成，所以`$major_scan`指针不变，`$free`指针也移动到了C之后，指向`$page[1]`的头部地址：

![GC近似深度优先搜索_1](/assets/images/post_imgs/gc_24.png)

现在由于`$page[0]`指向B，所以开始搜索B，先复制B引用的D：

![GC近似深度优先搜索_2](/assets/images/post_imgs/gc_25.png)

由于`$page[1]`已满，D会被复制到`$page[1]`中，另外`$page[0]`还未搜索完成，所以`$major_scan`指针不变，`$page[0]`中的B也还未所搜索完成，所以`$local_scan[0]`指针也不变，由于复制了D，`$free`指针要相应后移。在`$page[1]`中，还未开始搜索，所以`$local_scan[1]`指针指向D。

还有一个关键点，该算法在对象被复制到新的内存页时，会使用新页面的$local_scan来搜索，此时会暂停之前的内存页的搜索。

根据这个规则，接下来就要对D引用的对象H、I进行复制了：

![GC近似深度优先搜索_3](/assets/images/post_imgs/gc_26.png)

此时由于`$page[0]`还未搜索完成，所以`$major_scan`指针不变，`$page[0]`中的B也还未所搜索完成，所以`$local_scan[0]`指针也不变，由于复制了H和I，`$free`指针要相应后移。在`$page[1]`中，D已经搜索完毕，所以`$local_scan[1]`指针指向H。

接着往下，由于上一次复制过程中并没有对象被复制到新的内存页中，所以回到`$marjor_scan`指针指向的内存页`$page[0]`，此时`$local_scan[0]`指向B，轮到复制B引用的E对象了：

![GC近似深度优先搜索_4](/assets/images/post_imgs/gc_27.png)

此时由于`$page[0]`还未搜索完成，所以`$major_scan`指针不变，`$page[0]`B已经搜索完成，所以`$local_scan[0]`指针指向下一个对象C，因为复制了E，`$free`指针要相应后移。在`$page[1]`中，H尚未搜索完毕，所以`$local_scan[1]`指针不变。`$page[2]`中，E尚未被搜索，所以`local_scan[2]`指针指向E。

这一步中E被复制到了新的内存页`$page[2]`中，所以下一次搜索要从`$local_scan[2]`开始，复制J和K：

![GC近似深度优先搜索_5](/assets/images/post_imgs/gc_28.png)

此时由于`$page[0]`还未搜索完成，所以`$major_scan`指针不变，`$page[0]`C尚未搜索完成，所以`$local_scan[0]`指针指向对象C，因为复制了J和K，`$free`指针要相应后移。在`$page[1]`中，H尚未搜索完毕，所以`$local_scan[1]`指针不变。`$page[2]`中，E已经搜索完毕，所以`local_scan[2]`指针指向下一个对象J。

按照这个规则一直执行到最后，内存布局如下：

![GC近似深度优先搜索_6](/assets/images/post_imgs/gc_29.png)

GC近似深度优先搜索的内存布局树状图如下：

![GC近似深度优先搜索_内存布局树状图](/assets/images/post_imgs/gc_30.png)

可以看到互相引用的对象基本都在同一个内存页中了，这可以有效利用高速缓存。

### 3. 多空间复制算法

GC复制算法的一大缺点就是每次只能利用堆空间的一半，有一种算法的思想是这样的，将堆n等分，拿出2个等分的空间用来作为`from`空间和`to`空间，以执行GC复制算法，其他空间使用标记-清除算法处理。每次GC都会使`to`空间和`from`空间向后移动一个等分。让我们用图示来了解一下这个过程。我们将堆4等分，刚开始的时候，`to`空间为`$heap[0]`，`from`空间为`$heap[1]`：

![多空间复制算法_初始状态](/assets/images/post_imgs/gc_31.png)

执行第一次GC后，堆的布局如下：

![多空间复制算法_第一次GC后](/assets/images/post_imgs/gc_32.png)

将`$heap[1]`的活跃对象移动到`$heap[0]`中，其余空间使用标记-清除算法，将清除出来的空间链接到空闲链表中，之后`to`空间和`from`空间都向后移动一等分。

![多空间复制算法_第一次GC后，空间满](/assets/images/post_imgs/gc_33.png)

第一次GC后，程序继续执行，一段事件后可用空间又满了，执行第二次GC：

![多空间复制算法_第二次GC后](/assets/images/post_imgs/gc_4.png)

多空间复制算法的优点是将原来不能使用的空间从1/2降低到1/n，提高了堆的利用率。缺点是除了2/n部分使用GC复制算法，(n-2)/n的空间使用标记-清除算法处理，会降低分配速度（分配空间时要遍历空闲链表），而且还会造成堆的碎片化。
