---
title: Python性能测试基础
date: 2018-02-22
tags: [Python, 测试]
categories: 测试
---

本文中我们来看看在Python中如何做基本的性能测试。

<!--more-->

在编程领域中对于性能这个词，有很多评估的角度，比如CPU时间、内存消耗、磁盘I/O、网络带宽等，本文将从CPU时间和内存消耗两个方面来介绍如何对Python程序进行性能分析。

首先我们需要一段测试代码，我们使用Fibonacci数列来做测试，这是一段CPU密集型的代码，使用的是递归版本：

```Python
def fib(n):
    result = 0
    if(n < 1):
        print("错误的n值！")
        return -1
    else:
        if(n == 1 or n == 2):
            return 1
        else:
            return fib(n-1) + fib(n-2)
```

需要注意的是，Fibonacci数列的递归实现在递归层次过深的情况下会非常耗时，如果想提高性能，还是要用迭代的方式。

## 使用装饰器测量函数运行时间

代码如下：

```Python
from functools import wraps
import time

def timeit(fn):
	@wraps(fn)
	def timeit_(*args, **kwargs):
		t1 = time.time()
		res = fn(*args, **kwargs)
		t2 = time.time() 
		print(fn.__name__ + " took " + str(t2-t1) + " seconds")
		return res
	return timeit_

@timeit
def test():
	l1 = [0] * 1000000
	l2 = [0] * 10000000
	l3 = [0] * 100000000

if __name__ == "__main__":
    res = test()
```

执行后输出：

```
test took 0.7034409046173096 seconds
```

使用装饰器是比较方便的做法，不过装饰器也只能打印整个函数的执行时间，测试粒度较粗。

## 使用timeit模块测试一段代码的CPU时间

直接看代码：

```Python
#!/usr/bin/python
#coding=utf-8

import timeit

def fib(n):
    result = 0
    if(n < 1):
        print("错误的n值！")
        return -1
    else:
        if(n == 1 or n == 2):
            return 1
        else:
            return fib(n-1) + fib(n-2)

def fn():
	return fib(38)

if __name__ == "__main__":
	t = timeit.timeit(stmt=fn, number=1)
	print(t)
```

我们使用递归方式计算Fibonacci数列的第38项（选择第38项是因为使用递归方式计算这项的时间尚可接受，再往后耗时就很长了），结果如下：

    14.778004587991745

在我的Mac机器上计算fib(38)耗时将近15秒。执行期间如果你打开活动监视器会发现该Python进程占用的CPU内核使用率达到99%以上，因为fib是CPU密集型的。

timeit模块还有很多用法，具体信息可以查阅相关文档。

使用timeit模块来测量一段代码能直观地获得执行这段代码的总耗时，这是比较粗粒度的测量，我们无法得知其中每行代码的耗时占比。因此这种方式只能在前期粗略地帮我们搜集一些代码整体执行时间的数据，如果要深入分析还是要想其他办法。

## 使用UNIX的time命令进行简单的计时

类UNIX操作系统提供了time命令来对一个程序的执行进行计时，我们把代码修改成下面这样：

```Python
#!/usr/bin/python
#coding=utf-8

import timeit

def fib(n):
    result = 0
    if(n < 1):
        print("错误的n值！")
        return -1
    else:
        if(n == 1 or n == 2):
            return 1
        else:
            return fib(n-1) + fib(n-2)

if __name__ == "__main__":
    res = fib(38)
```

我们在shell中执行（注意要使用`/usr/bin/time`来引用time命令，否则会引用到shell内建的time命令，后者对我们的性能测试意义不大）：

```shell
/usr/bin/time -p python fib.py
```

获得如下输出：

    real        14.76
    user        14.59
    sys          0.07

`time`命令输出了三行，其中`real`表示总耗时，`user`表示CPU花费在实际任务上的时间，这其中不包括陷入内核中执行的时间，`sys`表示陷入内核执行的时间。

需要注意的是，上例中`/usr/bin/time`记录的时间包括了启动Python解释器的时间。

## 使用cProfile模块

python -m cProfile profile.stats fib.py

下面的命令使用cProfile模块对fib.py进行分析：

```shell
python -m cProfile -s cumulative fib.py
```

输出如下：

```
(env360) ➜  test python -m cProfile -s cumulative fib.py
         78176340 function calls (4 primitive calls) in 22.402 seconds

   Ordered by: cumulative time

   ncalls  tottime  percall  cumtime  percall filename:lineno(function)
        1    0.000    0.000   22.402   22.402 {built-in method builtins.exec}
        1    0.000    0.000   22.402   22.402 fib.py:4(<module>)
78176337/1   22.402    0.000   22.402   22.402 fib.py:4(fib)
        1    0.000    0.000    0.000    0.000 {method 'disable' of '_lsprof.Profiler' objects}
```

输出结果中每列的含义：

* ncalls：函数被调用了总次数
* tottime：函数执行的总时间（不包括其下的子函数）
* percall：函数单次执行的时间（不包括其下的子函数），即tottime/ncalls
* cumtime：函数执行的总时间（包括其下的子函数）
* percall：函数单次执行的时间（包括其下的子函数），即cumtime/ncalls
* filename:lineno(function)：函数的基本信息

## 使用line_profile对代码进行逐行分析

先安装`line_profile`：

```
pip install line_profiler
```

这次我们使用另一端代码，这段代码主要是创建了3个列表，列表长度分别是一百万、一千万和一亿，并且对要测试的函数`line_test`加上`@profile`装饰器：

```Python
#!/usr/bin/python
#coding=utf-8

@profile
def line_test():
	l1 = [0] * 1000000
	l2 = [0] * 10000000
	l3 = [0] * 100000000

if __name__ == "__main__":
    line_test()
```

下面的命令使用line_profile模块对line_test.py进行分析：

```shell
kernprof -l -v line_test.py
```

你可能会奇怪我们并没有手动引入`profile`怎么能运行，其实当执行kernprof时，kernprof会自动将`profile`注入到`__builtins__`命名空间中。

输出结果如下：

```
Wrote profile results to line_test.py.lprof
Timer unit: 1e-06 s

Total time: 0.582631 s
File: line_test.py
Function: line_test at line 6

Line #      Hits         Time  Per Hit   % Time  Line Contents
==============================================================
     6                                           @profile
     7                                           def line_test():
     8         1       3440.0   3440.0      0.6  	l1 = [0] * 1000000
     9         1      54167.0  54167.0      9.3  	l2 = [0] * 10000000
    10         1     525024.0 525024.0     90.1  	l3 = [0] * 100000000
```

来看看上面输出结果中每列的含义：

* Line #：代码行号，这里的代码行号和源代码文件中的行号是完全一致的
* Hits：代码行的执行次数
* Time：该代码行的总执行时间
* Per Hit：该代码行每次执行的时间
* % Time：代码行执行时间占整个程序执行时间的比率
* Line Contents：具体代码行

这些输出信息非常直观，比如你会发现第10行创建长度为一亿的列表占用了90%的时间，当你对你自己的代码做line_profile时，根据这些信息很容易发现哪部分代码执行时间比较长，可以着重优化。

## 使用memory_profile诊断内存使用量

先安装`memory_profile`：

```
pip install memory_profiler
```

这次我们使用另一端代码，这段代码主要是创建了3个列表，列表长度分别是一百万、一千万和一亿，并且对要测试的函数`memory_test`加上`@profile`装饰器：

```Python
#!/usr/bin/python
#coding=utf-8

from memory_profiler import profile

@profile
def memory_test():
	l1 = [0] * 1000000
	l2 = [0] * 10000000
	l3 = [0] * 100000000

if __name__ == "__main__":
    memory_test()
```

下面的命令使用memory_profile模块对memory_test.py进行分析：

```shell
python -m memory_profiler memory_test.py
```

输出如下：

```
Filename: memory_test.py

Line #    Mem usage    Increment   Line Contents
================================================
     6     34.2 MiB     34.2 MiB   @profile
     7                             def memory_test():
     8     41.8 MiB      7.6 MiB   	l1 = [0] * 1000000
     9    118.1 MiB     76.3 MiB   	l2 = [0] * 10000000
    10    881.0 MiB    762.9 MiB   	l3 = [0] * 100000000
```

输出结果中每列的含义：

* Line #：代码行号，这里的代码行号和源代码文件中的行号是完全一致的
* Mem usage：当前程序使用的总内存大小
* Increment：内存增长的大小，即和上一行代码相比，执行本行代码导致的内存增量
* Line Contents：具体代码行

memory_profile的输出结果也很好理解，可以依据代码行来观察具体的内存增量，比如上例中第10行代码创建了长度为一亿的列表，占用了比较多的内存，其Increment是762.9 MiB。需要注意的是，MiB表示的是2^20字节，这和MB有所区别。

## 用heapy调查堆上的对象

先安装依赖:

```
pip install guppy
```

需要注意的是heapy不支持Python 3.x，所以我们在Python 2.7上测试。

测试代码如下：

```Python
#!/usr/bin/python
#coding=utf-8

def heapy_test():
	l1 = [0] * 1000000
	from guppy import hpy
	hp = hpy()
	h = hp.heap()
	print h
	print

	l2 = [0] * 10000000
	h = hp.heap()
	print h
	print

	l3 = [0] * 100000000
	h = hp.heap()
	print h
	print

if __name__ == "__main__":
    heapy_test()
```

输出结果如下：

```
Partition of a set of 26265 objects. Total size = 11526656 bytes.
 Index  Count   %     Size   % Cumulative  % Kind (class / dict of class)
     0    178   1  8152080  71   8152080  71 list
     1  11976  46   985344   9   9137424  79 str
     2   5969  23   481488   4   9618912  83 tuple
     3    323   1   277448   2   9896360  86 dict (no owner)
     4     69   0   219768   2  10116128  88 dict of module
     5   1653   6   211584   2  10327712  90 types.CodeType
     6    200   1   211136   2  10538848  91 dict of type
     7   1615   6   193800   2  10732648  93 function
     8    200   1   177912   2  10910560  95 type
     9    124   0   135328   1  11045888  96 dict of class
<90 more rows. Type e.g. '_.more' to view.>

Partition of a set of 26274 objects. Total size = 95415008 bytes.
 Index  Count   %     Size   % Cumulative  % Kind (class / dict of class)
     0    179   1 92038232  96  92038232  96 list
     1  11978  46   985472   1  93023704  97 str
     2   5968  23   481424   1  93505128  98 tuple
     3    329   1   279128   0  93784256  98 dict (no owner)
     4     69   0   219768   0  94004024  99 dict of module
     5   1653   6   211584   0  94215608  99 types.CodeType
     6    200   1   211136   0  94426744  99 dict of type
     7   1614   6   193680   0  94620424  99 function
     8    200   1   177912   0  94798336  99 type
     9    124   0   135328   0  94933664  99 dict of class
<90 more rows. Type e.g. '_.more' to view.>

Partition of a set of 26275 objects. Total size = 900721480 bytes.
 Index  Count   %     Size   % Cumulative  % Kind (class / dict of class)
     0    180   1 897344672 100 897344672 100 list
     1  11978  46   985472   0 898330144 100 str
     2   5968  23   481424   0 898811568 100 tuple
     3    329   1   279128   0 899090696 100 dict (no owner)
     4     69   0   219768   0 899310464 100 dict of module
     5   1653   6   211584   0 899522048 100 types.CodeType
     6    200   1   211136   0 899733184 100 dict of type
     7   1614   6   193680   0 899926864 100 function
     8    200   1   177912   0 900104776 100 type
     9    124   0   135328   0 900240104 100 dict of class
<90 more rows. Type e.g. '_.more' to view.>
```

上面的结果是按照在堆上分配内存的大小来排序的。