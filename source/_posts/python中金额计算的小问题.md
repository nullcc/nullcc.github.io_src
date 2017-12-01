---
title: Python中金额计算的小问题
date: 2017-05-10
tags: [Python]
categories: 编程语言
---

由于二进制对浮点运算存在精度问题，所以一些浮点计算经常会出现以下情况：

<!--more-->

```python
# -*- coding: utf-8 -*-

a = 1
b = 0.9
print(a-b)
```

结果：

```python
0.09999999999999998
```

我们期望的结果应该是0.1。为了解决这个问题，可以引入python的decimal库：

```python
# -*- coding: utf-8 -*-

from decimal import getcontext, Decimal

getcontext().prec = 10
a = 1
b = 0.9
print(Decimal(a)-Decimal(b))
```

结果：

```python
0.1000000000
```

getcontext().prec = 10把精度设置为10位，注意不是小数点后的位数，而是整个数字的位数。如果需要去掉后面的0，需要用float()转换一下。在具体的计算中，还需要用Decimal包装计算的所有数字。
