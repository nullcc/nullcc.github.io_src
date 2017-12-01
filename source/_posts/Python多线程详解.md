---
title: Python多线程详解
date: 2017-10-11
tags: [Python]
categories: 编程语言
---

在Python中我们常用threading来处理多线程，我们先看一个例子：

<!--more-->

```Python
# 代码段1
import threading
from time import sleep

def counter(n):
    print("The current thread [%s] is running." % threading.current_thread().getName())
    for i in range(n):
        print(i)
        sleep(1)
    print("The current thread [%s] ended." % threading.current_thread().getName())

print("The current thread [%s] is running." % threading.current_thread().getName())

t = threading.Thread(target=counter, args=(5,))
t.start()
t.join()

print("The current thread [%s] ended." % threading.current_thread().getName())
```

输出如下：

```Python
The current thread [MainThread] is running.
The current thread [Thread-1] is running.
0
1
2
3
4
The current thread [Thread-1] ended.
The current thread [MainThread] ended.
```

分析一下上面代码的一些关键点：

1. `t = threading.Thread(target=counter, args=(5,))`创建了一个线程，传入的target参数是线程要执行的对象，这里是一个函数，args是给函数传递的参数。
2. `t.start()`启动线程。
3. `t.join()`会阻塞调用线程的那个线程直到被调用线程结束，所以我们看到`MainThread`在`Thread-1`退出后才退出。

再看下面一段代码：

```Python
# 代码段2
import threading
from time import sleep

def counter(n):
    print("The current thread [%s] is running." % threading.current_thread().getName())
    for i in range(n):
        print(i)
        sleep(1)
    print("The current thread [%s] ended." % threading.current_thread().getName())

print("The current thread [%s] is running." % threading.current_thread().getName())

t = threading.Thread(target=counter, args=(5,))
t.start()

print("The current thread [%s] ended." % threading.current_thread().getName())
```

上面这段代码唯一的区别是去掉了`t.join()`，输出如下：

```Python
The current thread [MainThread] is running.
The current thread [Thread-1] is running.
0
The current thread [MainThread] ended.
1
2
3
4
The current thread [Thread-1] ended.
```

我们发现`MainThread`没有等`Thread-1`执行就结束了，这之后`Thread-1`继续执行直到结束。这印证了刚才提到的一个事实：`t.join()`会阻塞调用线程的那个线程直到被调用线程结束。

接下来看另外一段代码：

```Python
# 代码段3
import threading
from time import sleep

def daemon():
    print("The current thread [%s] is running." % threading.current_thread().getName())
    while True:
        print('in daemon')
        sleep(1)
    print("The current thread [%s] ended." % threading.current_thread().getName())

def counter(n):
    print("The current thread [%s] is running." % threading.current_thread().getName())
    for i in range(n):
        print(i)
        sleep(1)
    print("The current thread [%s] ended." % threading.current_thread().getName())

print("The current thread [%s] is running." % threading.current_thread().getName())

t1 = threading.Thread(target=daemon)
t2 = threading.Thread(target=counter, args=(5,))
t1.setDaemon(True)
t2.setDaemon(False)
t1.start()
t2.start()

print("The current thread [%s] ended." % threading.current_thread().getName())
```

输出如下：

```Python
The current thread [MainThread] is running.
The current thread [Thread-1] is running.
in daemon
The current thread [Thread-2] is running.
0
The current thread [MainThread] ended.
in daemon
1
in daemon
2
in daemon
3
in daemon
4
in daemon
The current thread [Thread-2] ended.
```

在代码段3中，线程t1被我们设置成守护线程，里面是一个无限循环，线程t2是用户线程，从0计数到4，每秒计数一次。可以观察到，当t2结束时，t1也跟着结束。在`threading.py`中，有这么一段注释：
`The entire Python program exits when no alive non-daemon threads are left.`
也就是说，当一个Python进程中没有任何非守护线程时，这个进程就会退出。在一个进程中，守护线程主要是用来在后台做一些幕后工作，是为用户线程服务的，用户线程都退出了，守护线程也失去了守护对象，所以也退出了。
