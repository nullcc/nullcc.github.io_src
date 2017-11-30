---
title: Python中try-except-finally的问题
date: 2017-08-29
---

代码片段1：

```Python
    def func():
        try:
            print("In try")
            return True
        except:
            return False
        finally:
            print("In finally")

    res = func()
    print(res)
```

运行结果：

    In try
    In finally
    True

在try块中如果没有错误发生，运行顺序是这样的：

    try -> finally -> try return

代码片段2：

```Python
    def func():
        try:
            print("In try")
            raise Error()
            return True
        except:
            print("In except")
            return False
        finally:
            print("In finally")

    res = func()
    print(res)
```

运行结果：

    In try
    In except
    In finally
    False

在try块中如果有错误发生，运行顺序是这样的：

    try -> except -> finally- > except return

代码片段3：

```Python
    def func():
        try:
            print("In try")
            return True
        except:
            print("In except")
            return False
        finally:
            print("In finally")
            return "finally"

    res = func()
    print(res)
```

运行结果：

    In try
    In finally
    finally

在try块中如果没有错误发生，且finally块中有return，运行顺序是这样的：

    try -> finally -> finally return

代码片段4：

```Python
    def func():
        try:
            print("In try")
            raise Error()
            return True
        except:
            print("In except")
            return False
        finally:
            print("In finally")
            return "finally"

    res = func()
    print(res)
```

运行结果：

    In try
    In except
    In finally
    finally

在try块中如果有错误发生，且finally块中有return，运行顺序是这样的：

    try -> except -> finally -> finally return

从上面四个代码片段可以总结出try-except-finally的规律：

1. 在finally块中没有return语句的情况下，在try或except块返回之前，都会先运行finally块，然后再返回到try或except块结束整个执行流。
2. 在finally块中有return语句的情况下，在try或except块返回之前，都会先运行finally块，然后直接返回，此时不会再返回到try或except块。
