---
title: 理解Scala类型系统中的型变
date: 2020-09-30
tags: [Scala, 类型系统, 设计模式]
categories: 编程语言
---

本文深入解析了Scala类型系统中的三种型变：协变、逆变和不变。

<!--more-->

Scala类型系统中的型变有三种形式：协变、逆变和不变。在深入理解型变之前，有必要回顾一下设计模式中的一个关键概念：里氏替换原则。

## 型变的核心：里氏替换原则

里式替换原则有两个关键点：

1. 任何使用父类的地方都可以用它的子类替换而不会产生任何异常，但反过来则不行。
2. 子类重载（注意不是重写）父类的方法的入参的限制要比父类的相应方法更宽松，但返回值要比父类更严格。

第一点比较好理解，即**父类知道的，子类都知道；子类知道的，父类未必知道**，就不赘述了。

关于第二点，先来看一个例子：

```scala
class SignalProcessor[+T] {
  def process(in: T): Unit = {
    println(in)
  }
}
```

这段代码无法通过编译：

```
covariant type T occurs in contravariant position in type T of value in
  def process(in: T): Unit = {
              ^
```

编译器给出的异常信息表明，SignalProcessor类的process方法的入参in是泛型类型T的逆变点，但我们给了一个协变的定义。初看这种报错基本上是一头雾水，要搞清楚根本原因我们需要具体分析一下这个SignalProcessor类。

有如下代码：

```scala
val anySignalProcessor = new SignalProcessor[AnyRef]
val stringSignalProcessor = new SignalProcessor[String]
```

考察SignalProcessor[AnyRef]和ignalProcessor[String]的类型关系，无非两种情况：

1. SignalProcessor[String]是SignalProcessor[AnyRef]的子类型。
2. SignalProcessor[AnyRef]是SignalProcessor[String]的子类型。

第一种假设，根据里式替换原则，出现SignalProcessor[AnyRef]的地方都要可以用SignalProcessor[String]来替换：

```scala
val foo: Integer = 1
anySignalProcessor.process(foo) // OK
stringSignalProcessor.process(foo) // Oops! Type mismatch, expected: String, actual: Integer
```

由于SignalProcessor[String]不能处理非String的入参，也就不能替换SignalProcessor[AnyRef]，假设一不成立。

第二种假设，根据里式替换原则，出现SignalProcessor[String]的地方都要可以用SignalProcessor[AnyRef]来替换：

```scala
val bar: String = "abc"
stringSignalProcessor.process(bar) // OK
anySignalProcessor.process(bar) // OK
```

因此假设二是成立的。

所以，**SignalProcessor[AnyRef]是SignalProcessor[String]的子类型**，process方法在子类的入参`AnyRef`也确实比父类的入参`String`更宽松。此时刚才提到的式替换原则的第二个关键点的上半句：“子类重载（注意不是重写）父类的方法的入参的限制要比父类的相应方法更宽松”就很好理解了。

回到刚才那段编译报错的代码，应该改为：

```scala
class SignalProcessor[-T] {
  def process(in: T): Unit = {
    println(in)
  }
}
```

由上可见，泛型类的**方法参数**导致了泛型类型在子类和父类关系上发生了逆转。因此，**方法参数的位置被称为逆变点(contravariant position)**。也可以说**泛型类在方法参数上是逆变的**。

再来看下半句“子类方法的返回值要比父类更严格”，如果process方法返回一个值，这个值一般会被process方法的调用方消费，比如作为另一个方法的参数：

```scala
class SignalProcessor[-T] {
  def process(): T = {
    null.asInstanceOf[T]
  }
}
```

这段代码也会报错，但报错信息和之前稍有不同：

```
error: contravariant type T occurs in covariant position in type (): T of method process
  def process(): T = {
      ^
```

意思是SignalProcessor类的process方法的出参是泛型类型T的协变点，但我们给了一个逆变的定义。

在这个例子中，对于泛型类在方法的泛型出参上的父子类型关系也无非两种情况：

1. SignalProcessor[AnyRef]的process方法的返回值类型是SignalProcessor[String]的process方法的返回值类型的子类型。
2. SignalProcessor[String]的process方法的返回值类型是SignalProcessor[AnyRef]的process方法的返回值类型的子类型。

为了使得之后使用process方法的返回值的调用符合里式替换原则，很显然SignalProcessor[String]的process方法的返回值必须得是SignalProcessor[AnyRef]的process方法的返回值的子类型。

SignalProcessor[String]的process的返回值在类型上确实需要比SignalProcessor[AnyRef]更严格。

由上可见，泛型类的**方法返回值**需要符合泛型类型的子类和父类的关系。因此，**方法返回值的位置被称为协变点(covariant position)**。也可以说，**泛型类在方法返回值上是协变的**。

因此上面这段代码应该改成：

```scala
class SignalProcessor[+T] {
  def process(): T = {
    null.asInstanceOf[T]
  }
}
```

论证完里式替换原则的两个关键点，Scala的型变就非常好理解了。

## 协变

假设A是B的子类型，另有泛型类Foo[+T]，则Foo[A]是Foo[B]的子类型，这被称为协变。例子：

```scala
class Material {}
class Liquid extends Material {}

class Container[+T] (private val item: T) {
  def get(): T = item
}

val liquidContainer = new Container[Liquid](new Liquid)
val materialContainer: Container[Material] = liquidContainer // OK
println(materialContainer.get()) // Main$$anon$1$Liquid@6035b93b
```

在需要`Container[Material]`的地方可以用`Container[Liquid]`替换，反之则不行：

```scala
class Material {}
class Liquid extends Material {}

class Container[+T] (private val item: T) {
  def get(): T = item
}

val materialContainer = new Container[Material](new Material)
val liquidContainer: Container[Liquid] = materialContainer // Oops!
```

这段代码会报错：

```
error: type mismatch;
found   : this.Container[this.Material]
required: this.Container[this.Liquid]
val liquidContainer: Container[Liquid] = materialContainer
```

协变很好理解，液体(Liquid)是一种物质(Material)，因此液体容器(Container[Liquid])是一种物质容器(Container[Material])。根据里式替换原则，这里我可以把使用Container[Material]类型对象的地方替换成使用Container[Liquid]类型的对象，获取到的是Liquid，这是可以的，因为Liquid是一种Material。

## 逆变

假设A是B的子类型，另有泛型类Foo[-T]，则Foo[B]是Foo[A]的子类型。例子：

```scala
class Animal {}
class Bear extends Animal {}

class Hunter[-T] {
  def hunt(t: T): Unit = {
    println("Caught " + t)
  }
}

val animalHunter = new Hunter[Animal]
val bearHunter: Hunter[Bear] = animalHunter
bearHunter.hunt(new Bear) // Caught Main$$anon$1$Bear@aa549e5
```

在需要`Hunter[Bear]`的地方可以用`Hunter[Animal]`替换，反之则不行：

```scala
class Animal {}
class Bear extends Animal {}

class Hunter[-T] {
  def hunt(t: T): Unit = {
    println("Caught " + t)
  }
}

val bearHunter = new Hunter[Bear]
val animalHunter: Hunter[Animal] = bearHunter // Oops!
```

这段代码会报错：

```
error: type mismatch;
 found   : this.Hunter[this.Bear]
 required: this.Hunter[this.Animal]
val animalHunter: Hunter[Animal] = bearHunter
```

逆变理解起来不如协变直观。根据逆变的逻辑，在这段代码中，熊(Bear)是一种动物(Animal)，那么动物猎人(Hunter[Animal])是一种猎熊者(Hunter[Bear])。这个逻辑好像有点违反常识，不是应该说猎熊者(Hunter[Bear])是一种动物猎人(Hunter[Animal])吗？但是如果套用里氏替换原则中的概念：在需要基类的地方，都可以用子类替换，但反过来则不行。

逆变的道理也是一样的，在需要Hunter[Bear]的地方，我们用一个Hunter[Animal]去替代是可以的，因为动物猎人掌握狩猎一切动物的技能，这当然也包括猎熊。但是反过来，在需要Hunter[Animal]的地方，我们无法用Hunter[Bear]去替代，因为动物猎人是全能的，猎熊者只知道如何狩猎熊，如果换成麋鹿，Hunter[Bear]就不灵了。

根据这个逻辑，不难得出Hunter[Animal]应该是Hunter[Bear]的子类型。

## 不变

如果一个泛型类在类型参数上不加任何修饰，那这个泛型类在这个类型参数上就是不变的，比如Foo[T]。不变也是很有用的，这里引用Scala官方文档中的一个例子：

```scala
abstract class Animal {
  def name: String
}
case class Cat(name: String) extends Animal
case class Dog(name: String) extends Animal

class Container[A](value: A) {
  private var _value: A = value
  def getValue: A = _value
  def setValue(value: A): Unit = {
    _value = value
  }
}

val catContainer: Container[Cat] = new Container(Cat("Felix"))
val animalContainer: Container[Animal] = catContainer
animalContainer.setValue(Dog("Spot"))
val cat: Cat = catContainer.getValue // 糟糕，这里会将一只狗赋值给一只猫！
```

还好这段代码无法通过编译，因为编译器会阻止我们这么做。
