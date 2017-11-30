---
title: Python中的generator和yield
date: 2017-10-16
---

Python中的generator(生成器)是一个很强大的概念，generator function(生成器函数)被调用后会返回一个生成器。需要注意的是，generator function在被调用时，并不会真正地执行，而是返回一个generator。要想执行这个generator，有两种方式：for循环或手动调用generator的next方法。

下面的代码创建了一个generator function，这是一个计数器，参数n表示要计数器的最大值：

```Python
def create_counter(n):
    print("in create_counter")
    i = 1
    while True:
        yield i
        i = i+1

counter = create_counter(100)
print(counter) # <generator object create_counter at 0x10e55a728>
print(counter.next()) # 1
print(counter.next()) # 2
print(counter.next()) # 3
```

调用`create_counter`并不会真正执行函数，因为调用`create_counter`时并没有立即运行`print("in create_counter")`这行代码。调用后，counter变成一个generator。接着不断调用`counter.next()`来获取计数器的结构。

在Python中，一个function内部如果有`yield`关键字，它就是一个generator function。那么generator function有什么用呢？

举个简单的例子，如果要生成一个1-1000000的数字列表，我们当然可以选择使用简单粗暴的方式，直接用：

```Python
mylist = [i for i in range(1000000)]
```

来获得这个数字列表。不过有个问题，如果你想要迭代这个列表，一次性生成这个列表的代价有点大，内存占用会很高，如果要生成1亿个数呢？此时使用生成器就比较有优势了：

```Python
for i in create_counter(1000000):
    print(i)
```

这么做会每次在迭代的时候生成一个数字，而不是一次性生成所有数字。

总结一下，对于generator function来说，在调用它的时候并不会实际执行函数内的代码，而是返回一个generator。我们通过调用它的`next()`方法来执行函数内部的代码。当遇到`yield`的时候，generator会返回`yield`后面表达式的值，然后就generator会“挂起”，直到下次调用它的`next()`方法，才继续在上次中断处往下执行。这是一种惰性求值的方式：在真正需要的时候才产生值，而不是一开始就产生所有值。
