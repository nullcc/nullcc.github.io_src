---
title: 谈谈Python中的super
date: 2017-07-14
tags: [Python]
categories: 编程语言
---

先来看一段Python代码：

```python
class Base(object):

    def __init__(self):
        print("enter Base")
        print("leave Base")


class A(Base):

    def __init__(self):
        print("enter A")
        super(A, self).__init__()
        print("leave A")


class B(Base):

    def __init__(self):
        print("enter B")
        super(B, self).__init__()
        print("leave B")


class C(A, B):

    def __init__(self):
        print("enter C")
        super(C, self).__init__()
        print("leave C")


if __name__ == "__main__":
    c = C()
```

运行这段代码的结果是：

```python
enter C
enter A
enter B
enter Base
leave Base
leave B
leave A
leave C
```

继承关系为：

```python
      Base
      /  \
     /    \
    A      B
     \    /
      \  /
       C
```

`__init__`的调用顺序是C->A->B->Base。

我们可以用`C.mro()`看一下类的继承顺序：

```python
[<class '__main__.C'>, <class '__main__.A'>, <class '__main__.B'>, <class '__main__.Base'>, <class 'object'>]
```

所以这里`super(ClassName, self).__init__()`并不是仅仅表示对父类的调用，而是调用在继承链上位于ClassName后一个的类的`__init__`方法。
因此`super(C, self).__init__()`调用的是位于继承链上C的下一个类，也就是A，其他的调用类似。
