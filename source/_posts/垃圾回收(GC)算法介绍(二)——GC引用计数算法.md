---
title: 垃圾回收(GC)算法介绍(二)——GC引用计数算法
date: 2017-11-11
tags: [垃圾回收]
categories: 编程语言
---

## GC引用计数法概述

由于GC会清除那些再也无法被引用到的对象，很自然地可以想到我们可以在对象上设置一个计数器来记录它被引用的次数，示意图如下：

![引用技术法中的对象](/assets/images/post_imgs/gc_1.png)

引用技术法的思想很简单，在创建对象和将对象赋值给某个变量时，将对象的引用计数加1，在移除对象和某个变量的引用关系时，将对象的运营计数减1，当对象的引用计数变为0时，递归地将该对象引用的子对象的引用计数器减1，并把该对象的内存块加入空闲链表中（没错，这里又出现了空闲链表）。在之前的标记-清除算法中，应用程序有一个明确且独立的GC过程来回收非活跃对象，引用计数法没有这样的独立的过程，它在通过增减对象的引用计数器来判别活跃对象和非活跃对象，然后在计数器值为0的时候回收对象，这种做法可以在对象不活跃的时候立即回收它。

先看一下在引用计数法下创建新对象的过程：

```Java
new_obj(size){
  obj = get_free_space($free_list, size)
  if(obj == NULL)
    return allocation_failed()
  else
    obj.ref_cnt = 1
    return obj
}
```

在引用计数法中创建新对象时，直接从空闲链表中查找可用内存块，如果找不到可用内存块，新对象创建直接就失败了，如果找到了，就将新对象的引用计数加1并返回这个对象。注意到`get_free_space`一旦失败，就说明空闲链表中没有合适的空间供分配了，因为在引用计数法中，除了空闲链表中的对象以外，堆上其他的对象都是活跃的。

然后是更新对象指针操作的过程：

```Java
update_obj_ptr(obj){
  incr_ref_cnt(obj)
  decr_ref_cnt(*ptr)
  *ptr = obj
}

incr_ref_cnt(obj){
  obj.ref_cnt++
}

decr_ref_cnt(obj){
  obj.ref_cnt--
  if(obj.ref_cnt == 0){
    for(child in obj.children){
      decr_ref_cnt(child)
    }
    add_to_free_list(obj)
  }
}
```

在将一个指针指向某个对象时，首先要将对象的引用计数加1，然后将原指针指向的对象的引用计数减1，再将这个指针指向这个对象。在`update_obj_ptr`中之所以先`incr_ref_cnt(obj)`再`decr_ref_cnt(*ptr)`是为了防止obj和*ptr是同一个对象，如果obj和*ptr是同一个对象，我们先`decr_ref_cnt(*ptr)`，这个对象的引用计数如果为0了，就被回收了，之后`incr_ref_cnt(obj)`就没用了。另外注意到`decr_ref_cnt`中当对象的`ref_cnt`减为0时，要先对它引用的所有对象递归执行`decr_ref_cnt`后再将其加入空闲链表中。

## 优点和缺点

引用计数法可以在对象不活跃时（引用计数为0）立刻回收其内存。因此可以保证堆上时时刻刻都没有垃圾对象的存在（先不考虑循环引用导致无法回收的情况）。

引用计数法的最大暂停时间短。由于没有了独立的GC过程，而且不需要遍历整个堆来标记和清除对象，取而代之的是在对象引用计数为0时立即回收对象，这相当于将GC过程“分摊”到了每个对象上，不会有最大暂停时间特别长的情况发生。

引用计数法也有一些问题，引用计数的增减开销在一些情况下会比较大，比如一些根引用的指针更新非常频繁，此时这种开销是不能忽视的。另外对象引用计数器本身是需要空间的，而计数器要占用多少位也是一个问题，理论上系统内存可寻址的范围越大，对象计数器占用的空间就要越大，这样在一些小对象上就会出现计数器空间比对象本身的域还要大的情况，内存空间利用率就会降低。还有一个问题是循环引用的问题，假设两个对象A和B，A引用B，B也引用A，除此之外它们都没有其他引用关系了，这个时候A和B就形成了循环引用，变成一个“孤岛”，且它们的引用计数都是1，按照引用计数法的要求，它们将无法被回收，造成内存泄漏。

## 优化方案

### 1. 延迟引用计数法

针对跟引用指针会有非常频繁的更新导致增减对象计数器的任务繁重这一问题，我们直接可以想到的一种方案是对根引用对象不维护计数器。非根引用对象更新指针时调用`update_ptr`，根引用对象直接使用`*$ptr = obj`，就绕过了这个问题。但这么做还是不行，因为根引用对象没有计数器值了，可能会被当成是垃圾回收掉。对此，可以使用一个ZCT（Zero Count Table），这个表专门用来记录那些计数器值经过`decr_ref_cnt`后变为0的对象，延迟引用计数法中，引用计数器值为0的对象不一定就是垃圾。如下图：

![延迟引用计数法_1](/assets/images/post_imgs/gc_2.png)

我们还需要修改`decr_ref_cnt`函数以适应这种方法：

```Java
decr_ref_cnt(obj){
  obj.ref_cnt--;
  if(obj.ref_cnt == 0){
    if(is_full($zct) == TRUE)
      scan_zct()
    push($zct, obj)
  }
}
```

在`decr_ref_cnt`函数中，减少对象的引用计数后，如果其引用计数为0，需要把该对象放到$zct中，如果此时$zct满了，执行`scan_zct`函数来清理对象。

还需要修改`new_obj`函数：

```Java
new_obj(size){
  obj = get_free_space($free_list, size)
  if(obj == NULL){
    scan_zct()
    obj = get_free_space($free_list, size)
    if(obj == NULL){
      allocation_failed()
    }
  }
  obj.ref_cnt = 1
  return obj
}
```

在`new_obj`函数中，当第一次内存分配失败时，调用`scan_zct`函数来清理对象，之后再次申请分配，如果还是失败，说明当前堆上没有可用内存块了，直接失败。

再来看看`scan_zct`函数：

```Java
scan_zct(){
  for(root_obj in $root)
    root_obj.ref_cnt++

  for(obj in $zct){
    if(obj.ref_cnt == 0){
      remove_from_zct($zct, obj)
      delete(obj)
    }
  }

  for(root_obj in $root)
    root_obj.ref_cnt--
}
```

`scan_zct`函数首先对所有根引用对象的引用计数加1，然后遍历$zct，将引用计数为0的对象（这些对象肯定不是根对象了）清除出$zct，然后调用`delete(obj)`删除它们，最后，很重要的一点，需要把所有根引用对象的引用计数减1。

最后看一下`delete`函数：

```Java
delete(obj){
  for (child in obj.children){
    child.ref_cnt--;
    if(child.ref_cnt == 0){
      delete(child)
    }
  }
  add_to_free_list(obj)
}
```

`delete`函数负责递归地将对象所引用的子对象的引用计数减1，并将对象加入到空闲链表中。
延迟引用计数法的优点就是可以大大减轻那些根引用对象指针被频繁更新导致计数器更新操作繁重的问题。它的缺点也很明显，由于在`scan_zct`中统一做垃圾回收，无法立即收回内存，而且`scan_zct`的开销和$zct的大小成正比，这会导致GC的最大暂停时间增加。当想要减少最大暂停时间时，势必要减小$zct的大小，但这样一来就需要更频繁地调用`scan_zct`了，导致吞吐量下降。

### 2. sticky引用计数法

之前提到的引用计数法有一个问题，需要确定给引用计数器分配多少空间。我们假设给它分配5 bits，计数范围0~31，当对象引用计数超过31时，计数器就会溢出。针对计数器溢出的情况，有两个办法，一是完全不理会，不再去增减计数器溢出对象的计数器的值。二是使用标记-清除算法。

针对第一种，已经有研究表明，绝大多数对象的引用计数只会在0和1之间变化，这些对象创建出来没多久就“死”了，很少有对象的引用计数会有非常大的值，如果有引用计数很大的对象则说明这些对象很重要，短期内不可能被销毁，因此再去操作它的引用计数意义不大。

第二种方法，使用标记-清除算法来处理：

```Java
mark_sweep_for_counter_overflow(){
  reset_all_obj_ref_cnt()
  mark_phase()
  sweep_phase()
}
```

首先要将堆上的所有对象引用计数设置为0。然后进入标记阶段和清除阶段。

```Java
mark_phase(){
  for(root_obj in $root)
    push(root_obj, $mark_stack)

  while(is_empty($mark_stack) == FALSE){
    obj = pop($mark_stack)
    obj.ref_cnt++
    if(obj.ref_cnt == 1){
      for(child in obj){
        push(child, $mark_stack)
      }
    }
  }
}
```

标记阶段，首先把所有根引用对象都放入$mark_stack，然后依次从$mark_stack中取出对象，将其引用计数加1。这里要注意只能对各个对象和它们的子对象进栈一次，以免造成死循环，其中`if(obj.ref_cnt == 1)`用来判断这种情况。当$mark_stack为空时结束标记阶段。

接下来是清除阶段：

```Java
sweep_phase(){
  sweeping = $heap_start
  while(sweeping < $heap_end){
    if(sweeping.ref_cnt == 0){
      add_to_free_list(sweeping)
      sweeping += sweeping.size
    }
  }
}
```

清除阶段遍历整个堆，将引用计数为0的对象加入空闲链表。

sticky引用计数法使用了一种标记-清除算法的变体，它可以清除循环引用。这是因为每次处理都会在最开始把所有堆上的对象的引用计数设为0，然后从根引用对象开始递归地将所有可以引用到的对象的计数器加1，很显然循环引用的对象在计数器设置为0后并不能在标记阶段被找到并设置引用计数，那么它们将在清除阶段被清除掉。

### 3. 1位引用计数法

1位引用计数法的计数器只有1位大小，只有0和1两个取值，分分钟会造成溢出。不过据调查显示，很少有对象的引用计数大于或等于2，大部分对象创建不就后就被回收了。我们可以用计数器的0值表示引用计数为1，计数器的1值表示引用计数大于或等于2。

由于计数器取值只有0和1两种，之前提到的引用计数法都是让对象持有计数器，在1位引用计数法中，我们让指针持有计数器。将计数器值0的指针称为`UNIQUE`指针，计数器值1的指针称为`MULTIPLE`指针。

在更新对象指针的时候，之前的做法是先增加对象的引用计数，然后减少原指针指向对象的引用计数，最后将这个指针指向对象。1位引用计数法由于将计数器保存在指针中而非对象中，因此使用的是“复制指针”操作而不是“更新指针”。

下面是1位引用计数法复制指针的示意图：

![1位引用计数法复制指针](/assets/images/post_imgs/gc_3.png)

最开始A中的指针指向C，现在要将A中的指针指向D，实际上可以将B中指向C的指针复制到A中完成这个操作，我们使用`copy_ptr`函数来执行这个过程，伪代码如下：

```Java
copy_ptr(dest_ptr, src_ptr){
  delete_ptr(dest_ptr)
  *dest_ptr = *src_ptr
  set_multiple_tag(dest_ptr)
  if(tag(src_ptr) == UNIQUE)
    set_multiple_tag(src_ptr)
}

delete_ptr(ptr){
  if(tag(ptr) == UNIQUE)
    add_to_free_list(*ptr)
}
```

1位引用计数法的优点是对象本身不需要保存计数器，只在指针中使用1位来保存计数器，计数器只有0和1两种取值，不会占用太多空间且有效利用指针的空间。另外一方面，由于只是复制指针，并不需要解引用指针获取对象，避免了内存寻址开销。1位引用计数法的缺点是引用计数器溢出的问题，当计数器的tag变成`MULTIPLE`后，是无法判断能否回收的，这里只有从`UNIQUE`指针到`MULTIPLE`指针的单向变化，无法从`MULTIPLE`指针变回`UNIQUE`指针，有些`MULTIPLE`指针引用的对象可能是需要回收的，但在这种场景下肯定是无法回收了。

### 4. 部分标记-清除算法

引用计数法的一大问题就是没办法清除循环引用的对象，我们知道在标记-清除算法不存在循环引用对象群无法被清除的问题。因此很容易想到正常情况下用引用计数法，在某个时刻使用标记-清除算法来处理。不过存在循环引用关系的对象是极少数，为了回收这么点垃圾就每次固定在某个时间点执行标记-清除算法成本有点高，会有很多无用功。改进的方式是只对“可能存在循环引用”的对象群进行标记-清除，这种方式被称为部分标记-清除算法。

那么我们就需要识别存在循环引用关系的对象，先来看看循环引用是怎么产生的：

![循环引用的产生](/assets/images/post_imgs/gc_4.png)

循环引用产生的条件：

1.一组对象互相引用构成闭环
2.删除所有外部到这组对象的引用

根据上图和循环引用产生的条件，我们可以做出一点假设：

**当移除一个对象的某个外部引用时，如果这个对象的引用计数递减后不为0，则它和它所引用的对象可能构成循环引用关系。**

由于一个对象可能存在多个外部引用，移除一个外部引用后引用计数不为0是完全可能的，因此在上述假设的基础上我们还需要做进一步判断。于是就有了部分标记-清除算法。

部分标记-清除算法寻找的是非活跃对象，这和之前讨论的标记-清除算法寻找活跃对象是不同的。部分标记-清除算法将对象分为四种颜色来管理：

1.黑(BLACK)：绝对不是垃圾的对象
2.白(WHITE)：绝对是垃圾的对象
3.灰(GRAY)：被搜索完毕的对象
4.阴影(HATCH)：可能是循环引用的垃圾对象

我们在对象头部分配2位的空间来保存这个信息，命名为`obj.color`，00~11可以表示这四种颜色。其中有一个$hatch_queue用来存放所有被标记为HATCH的对象。

我们构造一个堆，初始状态如下：

![示例堆初始状态](/assets/images/post_imgs/gc_5.png)

现在将root到A的引用删除，这会在内部调用一次`decr_ref_cnt`，首先来看`decr_ref_cnt`函数：

```Java
decr_ref_cnt(obj){
  obj.ref_cnt--
  if(obj.ref_cnt == 0)
    delete(obj)
  else if(obj.color != HATCH){
    obj.color = HATCH
    enqueue($hatch_queue, obj)
  }
}
```

这个`decr_ref_cnt`和以前有所不同，在递减对象的引用计数后，如果为0就回收对象，否则说明对象还被其他对象引用，有可能是循环引用对象群的一个成员，我们在标记它为`HATCH`后（如果已经是`HATCH`就说明对象已经在`$hatch_queue`中，此时什么也不做），将它入队`$hatch_queue`，之后要遍历`$hatch_queue`找出循环引用的对象，经过：

![示例堆删除root到A的引用之后](/assets/images/post_imgs/gc_6.png)

还需要修改`new_obj`函数：

```Java
new_obj(size){
  obj = get_free_space($free_list, size)
  if(obj != NULL){
    obj.ref_cnt = 1
    obj.color = BLACK
    return obj
  } else if (is_empty($hatch_queue) == FALSE){
    scan_hatch_queue()
    return new_obj(size)
  } else
    allocation_failed()
}
```

创建新对象时，`ref_cnt`初始为1，并且要把`color`设置为`BLACK`。对象创建失败时，需要扫描`$hatch_queue`尝试释放循环引用对象，然后递归调用`new_obj`，否则创建对象失败。

`scan_hatch_queue`函数搜索整个`$hatch_queue`，目的是找出循环引用的对象然后释放。

```Java
scan_hatch_queue(){
  obj = dequeue($hatch_queue)
  if(obj.color == HATCH){
    paint_gray(obj)
    scan_gray(obj)
    collect_white(obj)
  } else if(is_empty($hatch_queue) == FLASE){
    scan_hatch_queue()
  }
}
```

`scan_hatch_queue`函数每次从`$hatch_queue`中出队一个对象，如果对象颜色为`HATCH`，就执行`paint_gray`、`scan_gray`和`collect_white`，否则如果`$hatch_queue`不为空，递归调用`scan_hatch_queue`。

`paint_gray`函数递归地标识一个对象和它的所有子对象，将它们的`color`设置为`GRAY`，并：

```Java
paint_gray(obj){
  if(obj.color == BLACK || obj.color == HATCH){
    obj.color = GRAY
    for(child in obj.children){
      child.ref_cnt--
      paint_gray(child)
    }
  }
}
```

在理解`paint_gray`函数之前，我们需要理解一个规则，假设有A->B->C->A这样的引用关系：

![三个循环引用的对象](/assets/images/post_imgs/gc_7.png)

A、B、C三个对象互相引用，引用计数都是1。如果从A出发，标记它，然后递归地将它的子对象也标记且引用计数递减，直到能到达的所有对象都被标记完。最后的结果就是形成循环引用的那几个对象都被标记且引用计数都变成0。至于那些被在循环引用群里的对象引用的其他对象，有两种情况：

1.这个对象只被循环引用群里的对象所引用，在经过上面的过程后，这个对象的引用计数也会变成0而被回收。
2.这个对象除了被循环引用群里的对象所引用，还被其他对象引用到（假设有1个对象引用它），在经过上面的过程后，这个对象的引用计数大于0。

执行`paint_gray`时候的示例堆：

![示例堆paint_gray之后](/assets/images/post_imgs/gc_8.png)

因此我们可以得到，在经过`paint_gray`的过程后，引用计数为0的对象都是需要回收的，我们将它的`color`变为`WHITE`，引用计数大于0的对象将其`color`设置为`BLACK`，于是就有了`scan_gray`函数：

```Java
scan_gray(obj){
  if(obj.color == WHITE){
    if(obj.ref_cnt > 0)
      paint_black(obj)
    else {
      obj.color = WHITE
      for(child in obj.children)
        scan_gray(child)
    }
  }
}
```

执行`scan_gray`时候的示例堆：

![示例堆scan_gray之后](/assets/images/post_imgs/gc_9.png)

最后是`collect_white`函数：

```Java
collect_white(obj){
  if(obj.color == WHITE){
    for(child in obj.children){
      collect_white(child)
    }
    add_to_free_list(obj)
  }
}
```

![示例堆collect_white之后](/assets/images/post_imgs/gc_10.png)

调用`collect_white`之后，就回收了循环引用对象。

局部标记-清除算法的优点是可以发现并清除循环引用对象群。缺点也很明显，开销比较大，对于一个可能是循环引用的对象，需要执行`paint_gray`、`scan_gray`和`collect_white`，相当于遍历了三次这个对象的和它的子对象，如果需要检查的对象比较多，代价就太大了，并且也失去了引用计数法立即回收对象的这个优势。
