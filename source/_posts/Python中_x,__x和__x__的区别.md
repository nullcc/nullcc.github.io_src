---
title: Python中_x,__x和__x__的区别
date: 2017-06-12
tags: [Python]
categories: 编程语言
---

Python中_x,\_\_x和\_\_x\_\_的区别很多人不甚了解，本文将做一个全面介绍。

<!--more-->

假设有一个类：

```python
class EncryptedFile():

  """
  加密文件类
  """

  def __init__(self, name, content):
    self.name = name
    self.content = content

  def get_encrypted_content(self):
    return self._encrypt()

  def _encrypt(self):
    # encrypt the file content here

```

上述代码中出现了`__init__`和`_encrypt`两个方法，`__init__`是一个Python的魔术方法，它是内建的方法，这个方法负责初始化Python类的实例，还有很多魔术方法，比如`__len__`、`__new__`等等。`_encrypt`是一个私有的方法，实际上Python并没有Java那种真正私有的方法，Python在规范中说明了私有方法或私有变量以单个`_`开头。

再看一个类继承的情况：

```python
class A():
  def __init__(self, name):
    self.__name = "a_name"

class B():
  def __init__(self, name):
    self.__name = "b_name"

class C(A, B):
  def __init__(self, name):
    A.__init__(self, name)
    B.__init__(self, name)
    self.__name = name

c = C("c_name")
print(c.__dict__)  # {'_A__name': 'a_name', '_B__name': 'b_name', '_C__name': 'c_name'}
print(c.__name)    # AttributeError: 'C' object has no attribute '__name'
```

上面代码中定义了两个类A和B，且类C多继承于A和B，A、B和C三个类都有一个同名的实例变量`__name`。由于在继承体系中可能存在同名的变量，因此需要加以区分：我们在代码中引用`c.__name`的时候会报错。注意观察可以发现，在类继承中，以`__开头`，至多一个`_`结尾的变量在子类中会被改写为`_{class_name}__{variable_name}`。在上例中，类A的`__name`在子类C中被改写为`_A__name`，类B的`__name`在子类C中被改写为`_B__name`，类C的`__name`在子类C中被改写为`_C__name`。这样做可以有效避免类继承的情况下同名变量无法被区分的情况。

总结一下：

|        | \_\_x\_\_       | \_x         | \_\_x或者\_\_x\_|
|:-------------|:------------------|--------|---|
| 含义	    | Python内建魔术方法或魔术变量 | 约定的私有变量命名规范 | 为了避免在继承中命名冲突而起的变量名，将被改写为`_{class_name}__{variable_name}`
