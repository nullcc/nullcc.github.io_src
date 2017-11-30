---
title: Python中的魔术方法
date: 2017-06-12
---

本文将详细描述Python中的魔术方法，这些方法是Python中很有意思也很重要的一部分内容，掌握它们可以让你对Python的面向对象特性有更深的理解，也会让你的Python技能更上一层楼。

<!--more-->

## Python的魔术方法分类

我们会从几个大类来讨论Python的魔术方法：

1. 对象的构造和初始化
2. 用于比较和运算符的魔术方法
3. 打印对象的魔术方法
4. 控制对象属性访问的魔术方法
5. 可迭代对象和容器的魔术方法
6. 反射的魔术方法
7. 可调用的对象的魔术方法
8. 会话管理的魔术方法
9. 创建对象描述器的魔术方法
10. 拷贝的魔术方法
11. 对象的序列化和反序列化的魔术方法

### 1.对象的构造和初始化

| 方法名       | 含义         |
|:-------------|:------------------|
| \_\_new\_\_(cls, [,...])	    | 创建新的类实例 |
| \_\_init\_\_(self, [,...])    | 初始化类实例   |
| \_\_del\_\_(self)     | 在对象被垃圾回收时调用 |

来看下面这段代码：

```python
class ProgramLauguage(object):

    def __init__(self, name):
        print("in __init__ {}".format(self))
        self.name = name

    def __new__(cls, name, *args, **kwargs):
        print("in __new__ {}".format(cls))
        return object.__new__(cls, *args, **kwargs)

    def __del__(self):
        print("in __del__ {}".format(self.name))
        del self

d1 = dict()
d2 = dict()
d3 = dict()

d1["ruby"] = ProgramLauguage("Ruby")
d2["ruby"] = d1["ruby"]
d3["ruby"] = d1["ruby"]

print('del d1["ruby"]')
del d1["ruby"]

print('del d2["ruby"]')
del d2["ruby"]

print('del d3["ruby"]')
del d3["ruby"]

python = ProgramLauguage("Python")
```

运行上面的代码，会打印：

```python
in __new__ <class '__main__.ProgramLauguage'>
in __init__ <__main__.ProgramLauguage object at 0x10daf3080>
del d1["ruby"]
del d2["ruby"]
del d3["ruby"]
in __del__ Ruby
in __new__ <class '__main__.ProgramLauguage'>
in __init__ <__main__.ProgramLauguage object at 0x10daf3080>
in __del__ Python
```

从上面的输出可以看出，在实例化一个类时，将首先调用该类的`__new__`方法，在`__new__`方法中创建一个新对象，然后把实例化类时传入的参数原封不动地传递给`__init__`方法。在`__init__`方法内部，初始化这个实例。需要注意的是，`__new__`需要返回这个新创建的对象，而`__init__`不需要返回任何东西。因为`__new__`负责生成新实例，`__init__`负责初始化这个新实例。需要注意的是，如果`__new__`没有正确返回当前类cls的实例，那`__init__`是不会被调用的，即使是父类的实例也不行。

比较会让人迷惑的是`__del__`方法，乍一看会以为在调用`del obj`时调用对象的`__del__`，其实不是这样的，注意观察`d1`、`d2`和`d3`，这三个字典引用了同一个ProgramLauguage实例，在依次对这三个字典用引用的同一个实例调用`del`时，只有在`del d3["ruby"]`之后才打印了`in __del__ Ruby`。这就说明并不是`del obj`这个操作触发了`__del__`，准确地说，`__del__`会在对象被垃圾回收的时候被调用。因此我们可以把一些对象内部的清理操作放在`__del__`中。

### 2.用于比较和运算符的魔术方法

#### 用于比较的魔术方法

| 方法名       | 含义         |
|:-------------|:------------------|
| \_\_cmp\_\_(self, other)	  |   定义了大于、小于和等于的方法|
| \_\_eq\_\_(self, other)    |   定义了等号的行为, ==  |
| \_\_ne\_\_(self, other)    |   定义了不等号的行为, !=  |
| \_\_lt\_\_(self, other)    |   定义了小于号的行为， <  |
| \_\_gt\_\_(self, other)    |   定义了大于号的行为， > |
| \_\_le\_\_(self, other)    |   定义了小于等于号的行为， <= |
| \_\_ge\_\_(self, other)    |   定义了大于等于号的行为， >= |

来看下面这段代码：

```python
class Cat(object):

    def __init__(self, name, age, weight):
        self.name = name
        self.age = age
        self.weight = weight

    def __cmp__(self, other):
        if self.age < s.age:
            return -1
        elif self.age > s.age:
            return 1
        else:
            return 0

    def __eq__(self, other):
        return self.name == other.name and self.age == other.age and self.weight == other.weight

    def __ne__(self, other):
        return self.name != other.name or self.age != other.age or self.weight != other.weight

    def __lt__(self, other):
        return self.age < other.age

    def __gt__(self, other):
        return self.age > other.age

    def __le__(self, other):
        return self.age <= other.age

    def __ge__(self, other):
        return self.age >= other.age

cat1 = Cat('Mio', 1, 4)
cat2 = Cat('Mio', 1, 4)
cat3 = Cat('Lam', 2, 6)

print(cat1 == cat2)  # True
print(cat2 == cat3)  # False
print(cat2 != cat3)  # True
print(cat1 < cat3)  # True
print(cat1 <= cat3)  # True
print(cat3 > cat1)  # True
print(cat3 >= cat1)  # True
```

需要说明的是，`__cmp__`定义了大于、小于和等于的方法，当前对象大于、小于和等于另一个对象时，它的返回值分别大于0、小于0和等于0。其他几个用于比较的魔术方法的含义就如开头所述，很好理解。

#### 用于运算符的魔术方法

一元操作符和函数魔术方法

| 方法名       | 含义         |
|:-------------|:------------------|
| \_\_pos\_\_(self)	  |   实现+号的特性|
| \_\_neg\_\_(self)    |  实现-号的特性  |
| \_\_abs\_\_(self)    |   实现内置 abs() 函数的特性  |
| \_\_invert\_\_(self)    |   实现~符号的特性(取反) |

看下面这段代码：

```python
class Person(object):

    def __init__(self, name, age):
        self.name = name
        self.age = age

    def __pos__(self):
        self.age += 1

    def __neg__(self):
        self.age -= 1

    def __abs__(self):
        return abs(self.age)

    def __invert__(self):
        return ~self.age

p = Person('Jack', 20)
print(p.age)  # 20
+p
print(p.age)  # 21
-p
print(p.age)  # 20
print(abs(p)) # 20
print(~p) # -21
```

这段代码很简单，就不过多解释了。

普通算数操作符魔术方法

| 方法名       | 含义         |
|:-------------|:------------------|
| \_\_add\_\_(self, other)	  |   实现加法|
| \_\_sub\_\_(self, other)	  |   实现减法|
| \_\_mul\_\_(self, other)	  |   实现乘法|
| \_\_floordiv\_\_(self, other)	  |   实现地板除法(//)，即整数除法 |
| \_\_div\_\_(self, other)	  |   实现/符号的除法，只在py2生效 |
| \_\_truediv\_\_(self, other)	  |   实现真除法，用于py3|
| \_\_mod\_\_(self, other)  |   实现取模运算 |
| \_\_divmod\_\__(self, other)	  |   实现内置的divmod()函数 |
| \_\_pow\_\_(self, other)	  |   实现**指数运算 |
| \_\_lshift\_\_(self, other)	  |   实现使用 << 的按位左移位 |
| \_\_rshift\_\_(self, other)	  |   实现使用 >> 的按位右移位 |
| \_\_and\_\_(self, other)	  |   实现使用 & 的按位与 |
| \_\_or\_\_(self, other)	  |   实现使用 \| 的按位或 |
| \_\_xor\_\_(self, other)	  |   实现使用 ^ 的按位异或 |

我们来实现一个MyNumber类：

```python
class MyNumber(object):

    def __init__(self, num):
        self.num = num

    def __add__(self, other):
        """
        MyNumber(x) + MyNumber(y)
        """
        return self.__class__(self.num + other.num)

    def __sub__(self, other):
        """
        MyNumber(x) - MyNumber(y)
        """
        return self.__class__(self.num - other.num)

    def __mul__(self, other):
        """
        MyNumber(x) * MyNumber(y)
        """
        return self.__class__(self.num * other.num)

    def __floordiv__(self, other):
        """
        MyNumber(x) // MyNumber(y)
        """
        return self.__class__(self.num // other.num)

    def __div__(self, other):
        """
        [in py2] MyNumber(x) / MyNumber(y)
        """
        return self.__class__(self.num / other.num)

    def __truediv__(self, other):
        """
        [in py3] MyNumber(x) / MyNumber(y)
        """
        return self.__class__(self.num / other.num)

    def __mod__(self, other):
        """
        MyNumber(x) % MyNumber(y)
        """
        return self.__class__(self.num % other.num)

    def __pow__(self, other):
        """
        MyNumber(x) ** MyNumber(y)
        """
        return self.__class__(self.num ** other.num)

    def __lshift__(self, other):
        """
        MyNumber(x) << MyNumber(y)
        """
        return self.__class__(self.num << other.num)

    def __rshift__(self, other):
        """
        MyNumber(x) >> MyNumber(y)
        """
        return self.__class__(self.num >> other.num)

    def __and__(self, other):
        """
        MyNumber(x) & MyNumber(y)
        """
        return self.__class__(self.num & other.num)

    def __or__(self, other):
        """
        MyNumber(x) | MyNumber(y)
        """
        return self.__class__(self.num | other.num)

    def __xor__(self, other):
        """
        MyNumber(x) ^ MyNumber(y)
        """
        return self.__class__(self.num ^ other.num)

num1 = MyNumber(2)
num2 = MyNumber(3)

num3 = num1 + num2
num4 = num2 - num1
num5 = num1 * num2
num7 = num2 // num1
num8 = num2 / num1
num9 = num2 % num1
num10 = num2 ** num1
num11 = num2 << num1
num12 = num2 >> num1
num13 = num2 & num1
num14 = num2 | num1
num15 = num2 ^ num1

print(num3.num)  # 5 (2+3)
print(num4.num)  # 1 (3-2)
print(num5.num)  # 6 (2*3)
print(num7.num)  # 1 (3//2)
print(num8.num)  # 1.5 (3/2)
print(num9.num)  # 1 (3%2)
print(num10.num)  # 9 (3**2)
print(num11.num)  # 12 (3<<2)
print(num12.num)  # 0 (3>>2)
print(num13.num)  # 2 (3&2)
print(num14.num)  # 3 (3|2)
print(num15.num)  # 1 (3^2)
```

这部分代码也相对简单，就不解释了。

另外，普通算数操作符魔术方法均有相对应的反运算符魔术方法，即把两个操作数的位置对调，它们对应的反运算符魔术方法就是在方法名前`__`后加上`r`，比如`__add__`的反运算符魔术方法就是`__radd__`，其他的以此类推。

增量赋值魔术方法

| 方法名       | 含义         |
|:-------------|:------------------|
| \_\_iadd\_\_(self, other)	  |   实现赋值加法 +=|
| \_\_isub\_\_(self, other)	  |   实现赋值减法 -=|
| \_\_mul\_\_(self, other)	  |   实现赋值乘法 *=|
| \_\_ifloordiv\_\_(self, other)	  |   实现赋值地板除法(//=)，即整数除法 |
| \_\_idiv\_\_(self, other)	  |   实现/符号的赋值除法 /=|
| \_\_itruediv\_\_(self, other)	  |   实现赋值真除法，需要from __future__ import division|
| \_\_imod\_\_(self, other)	  |   实现赋值取模运算 %=|
| \_\_pow\_\_(self, other)	  |   实现指数赋值运算 **= |
| \_\_ilshift\_\_(self, other)	  |   实现使用 <<= 的赋值按位左移位 |
| \_\_irshift\_\_(self, other)	  |   实现使用 >>= 的赋值按位右移位 |
| \_\_iand\_\_(self, other)	  |   实现使用 &= 的赋值按位与赋值 |
| \_\_ior\_\_(self, other)	  |   实现使用 \|= 的赋值按位或 |
| \_\_ixor\_\_(self, other)	  |   实现使用 ^= 的赋值按位异或 |

这部分魔术方法的示例代码和上面的差不多，只是把相应的运算改成赋值运算而已，代码略。

类型转换魔术方法

| 方法名       | 含义         |
|:-------------|:------------------|
| \_\_int\_\_(self)	  |   实现整形的强制转换 |
| \_\_long\_\_self)	|   实现长整形的强制转换，long在py3中和int整合了 |
| \_\_float\_\_(self)	|   实现浮点型的强制转换 |
| \_\_complex\_\_(self)	|   实现复数的强制转换 |
| \_\_bin\_\_(self)	|   实现二进制数的强制转换 |
| \_\_oct\_\_(self)	  |   实现八进制的强制转换 |
| \_\_hex\_\_(self)	  |   实现十六进制的强制转换 |
| \_\_index\_\_(self)	  |   当对象是被应用在切片表达式中时，实现整形强制转换 |
| \_\_trunc\_\_(self)	  |   当使用 math.trunc(self) 的时候被调用，整数截断 |
| \_\_coerce\_\_(self, other)	  |   实现混合模式算数，只在py2有效|

### 3.打印对象的魔术方法

| 方法名       | 含义         |
|:-------------|:------------------|
| \_\_str\_\_(self) 	  |   定义当 str() 调用的时候的返回值(人类可读) |
| \_\_repr\_\_(self) 	  |   定义当 repr() 被调用的时候的返回值(机器可读) |
| \_\_unicode\_\_self) 	  |    定义当 unicode() 调用的时候的返回值，只在py2中有效|
| \_\_hash\_\_(self) 	  |   定义当 hash() 调用的时候的返回值，它返回一个整形 |
| \_\_nonzero\_\_(self) 	  |   定义当 bool() 调用的时候的返回值 |

示例代码如下：

```python
class MyNumber(object):

    def __init__(self, num):
        self.num = num

    def __str__(self):
        """
        str(MyNumber(x))
        """
        return str(self.num)

    def __repr__(self):
        """
        repr(MyNumber(x))
        """
        return "<{} {}>".format(__class__, str(self.num))

    def __unicode__(self):
        """
        [only in py2] unicode(MyNumber(x))
        """
        return str(self.num)

    def __hash__(self):
        """
        hash(MyNumber(x))
        """
        return hash(self.num)

    def __nonzero__(self):
        """
        [only in py2] nonzero(MyNumber(x))
        """
        return bool(self.num)

    def __bool__(self):
        """
        [only in py3] bool(MyNumber(x))
        """
        return bool(self.num)

num1 = MyNumber(123)
num2 = MyNumber(0)
print(str(num1))  # 123
print(repr(num1))  # <<class '__main__.MyNumber'> 123>
print(hash(num1))  # 123
print(bool(num1))  # True
print(bool(num2))  # False
```
### 4.控制对象属性访问的魔术方法

| 方法名       | 含义         |
|:-------------|:------------------|
| \_\_getattr\_\_(self, name)	  |   当用户试图访问一个根本不存在（或者暂时不存在）的属性时，你可以通过这个魔法方法来定义类的行为 |
| \_\_setattr\_\_(self, name, value)	  |   定义当试图对一个对象的属性赋值时的行为 |
| \_\_delattr\_\_(self, name)	  |   定义当试图删除一个对象的属性时的行为 |
| \_\_getattribute\_\_(self, name)	  |  __getattribute__ 允许你自定义属性被访问时的行为，只能用于新式类，而且很容易引起无限递归调用，可以用过使用父类的__getattribute__避免，建议不要使用  |

示例代码如下：

```python
class Person(object):

    def __init__(self, name):
        self.name = name

    def __getattr__(self, name):
        print('in __getattr__')
        return None

    def __setattr__(self, name, value):
        print('in __setattr__')
        self.__dict__[name] = value

    def __delattr__(self, name):
        print('in __delattr__')
        self.__dict__[name] = None

p = Person("Jack")  # in __setattr__
print(p.name) # Jack
print(p.no_exit_attr) # in __getattr__, None
p.name = "Smith" #  in __setattr__
print(p.name) # Smith
del p.name  # in __delattr__
print(p.name) # None
```

### 5.可迭代对象和容器的魔术方法

| 方法名       | 含义         |
|:-------------|:------------------|
| \_\_len\_\_(self)	  |  定义调用len()函数时的行为  |
| \_\_getitem\_\_(self, key)	  |  定义获取容器内容时的行为  |
| \_\_setitem\_\_(self, key, value)	  |  定义设置容器内容时的行为  |
| \_\_delitem\_\_(self, key)	  |  定义删除容器内容时的行为  |
| \_\_iter\_\_(self)	  |  定义迭代容器内容时的行为  |
| \_\_contains\_\_(self, item)	  |  定义对容器使用in时的行为  |
| \_\_reversed\_\_(self)	  |  定义对容器使用reversed()时的行为  |

示例代码如下：

```python

class MyDictIterator:
    def __init__(self, n):
        self.i = 0
        self.n = n

    def __iter__(self):
        return self

    def next(self):
        if self.i < self.n:
            i = self.i
            self.i += 1
            return i
        else:
            raise StopIteration()

class MyList(object):

    def __init__(self, list=[]):
        self.list = list

    def __len__(self):
        return len(self.list)

    def __getitem__(self, key):
        print('in __getitem__')
        return self.list[key]

    def __setitem__(self, key, value):
        print('in __setitem__')
        self.list[key] = value

    def __delitem__(self, key):
        print('in __delitem__')
        del self.list[key]

    def __iter__(self):
        print('in __iter__')
        return iter(self.list)

    def __contains__(self, item):
        print('in __contains__')
        return item in self.list

    def __reversed__(self):
        print('in __reversed__')
        return reversed(self.list)

list1 = MyList(["foo", "bar", "baz"])
print(len(list1))  # 3
print(list1[0])  # in __getitem__ foo
list1[0] = 'FOO'  # in __setitem__
print(list1[0])  # in __getitem__ FOO
del list1[0]  # in __delitem__
print(list1[0])  # in __getitem__ bar

for w in list1:
    print(w)  # in __iter__ bar baz

print("bar" in list1)  # in __contains__ True
print("BAR" in list1)  # in __contains__ False
print(reversed(list1)) # in __reversed__ <list_reverseiterator object at 0x110005128>
```

### 6.反射

| 方法名       | 含义         |
|:-------------|:------------------|
| \_\_instancecheck\_\_(self, instance)	  |  检查一个实例是否是你定义的类的一个实例（例如 isinstance(instance, class) ）  |
| \_\_subclasscheck\_\_(self, subclass)	  |  检查一个类是否是你定义的类的子类（例如 issubclass(subclass, class) ） |

### 7.可调用的对象的魔术方法

| 方法名       | 含义         |
|:-------------|:------------------|
| \_\_call\_\_(self, [args...]	  |  使对象可以像函数一样被调用  |

```python
class Point(object):

    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __call__(self, x, y):
        self.x = x
        self.y = y

p = Point(1, 0)
print("({}, {})".format(p.x, p.y))  # (1, 0)
p(2, 1)
print("({}, {})".format(p.x, p.y))  # (2, 1)
```

定义了`__call__`方法的类的实例可以像函数一样被调用。

### 8.会话管理的魔术方法

| 方法名       | 含义         |
|:-------------|:------------------|
| \_\_enter\_\_(self)	  |  定义了当会话开始的时候初始化对象的行为  |
| \_\_exit\_\_(self, exception_type, exception_val, trace)	  |  定义了当会话结束时的行为  |

Python可以通过`with`来开启一个会话控制器，会话控制器通过两个魔术方法来定义：`__enter__(self)`和`__exit__(self, exception_type, exception_val, trace)`。`__enter__`定义了当会话开始的时候初始化对象的行为，它的返回值会被`with`语句的目标或`as`后面的名字绑定。`__exit__`定义了当会话结束时的行为，它一般做一些清理工作，比如关键文件等。如果`with`代码块执行成功，`__exit__`的`exception_type`、`exception_val`和`trace`三个参数都会是None，如果执行失败，你可以在会话管理器内处理这个异常或将异常交由用户处理。如果要在会话管理器内处理异常，`__exit__`最后要返回`True`。

来看一个例子：

```python
class FileObject(object):

    def __init__(self, file):
        self.file = file

    def __enter__(self):
        return self.file

    def __exit__(self, exception_type, exception_val, trace):
        try:
            self.file.close()
        except:
            print('File close failed!')
            return True

with FileObject(open('./test.py')) as file:
    print(file)  # <_io.TextIOWrapper name='./test.py' mode='r' encoding='UTF-8'>
```

通过使用会话管理器，我们可以包装对象的打开和关闭操作，减少忘记关闭资源这种误操作。

### 9.创建对象描述器的魔术方法

| 方法名       | 含义         |
|:-------------|:------------------|
| \_\_get\_\_(self, instance, owner)	  |    |
| \_\_set\_\_(self, instance, value)	  |    |
| \_\_delete\_\_(self, instance)	  |    |

10. 拷贝的魔术方法

| 方法名       | 含义         |
|:-------------|:------------------|
| \_\_copy\_\_(self)	  |    |
| \_\_deepcopy\_\_(self, memodict=)	  |    |

### 11. 对象的序列化和反序列化的魔术方法

| 方法名       | 含义         |
|:-------------|:------------------|
| \_\_getinitargs\_\_(self)	  |    |
| \_\_getnewargs\_\_(self)	  |    |
| \_\_getstate\_\_(self)	  |    |
| \_\_setstate\_\_(self, state)  |    |
