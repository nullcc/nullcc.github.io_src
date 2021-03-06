---
title: 深入理解JavaScript中的this关键字
date: 2017-05-08
tags: [js]
categories: 编程语言
---

如果你问js的初学者js中什么东西比较难懂，this关键字应该会是众多回答中的一个。对于不了解this绑定规则的人来说，this常常使他们感到费解：this到底指代什么？会使人产生这种迷惑感是因为this在不同场景下所指向的对象不同。这里将介绍四种this的绑定规则，理解了这四种绑定规则，就可以对this了如指掌。

<!--more-->

## 四种this绑定规则

* 默认绑定
* 隐式绑定
* 显式绑定
* new绑定

### 默认绑定

默认绑定是无法应用其他调用规则时的绑定方式，看如下代码：

```js
var a = 1;
function foo(){
    console.log(this.a);
}
foo(); // 1
```

```js
"use strict"

var a = 1;
function foo(){
    console.log(this.a);
}
foo(); // TypeError: Cannot read property 'a' of undefined
```

这是最基本的一个函数调用，在第一张图中，非严格模式下，this绑定到全局对象，因此this.a指向全局变量a。第二段代码中，严格模式下，全局对象无法使用默认绑定，因此this会绑定到undefined。

那么如何判断是默认绑定呢，其实很简单，我们观察foo的调用位置，这里foo是直接被调用的，foo没有被引用到任何其他对象或着被显式绑定到指定对象(显式绑定稍候会说明)，因此只能使用默认绑定规则。

### 隐式绑定

隐式绑定需要考虑调用位置是否有上下文对象，或者说是被某个对象包含或拥有，比如以下代码：

```js
function foo() {
  console.log(this.a);
}

const obj = {
  a: 1,
  foo: foo,
};

obj.foo(); // 1
```

在声明obj时，包含了foo，因此调用obj.foo()时，this绑定到obj，this.a就是obj.a。如果有多个层级的包含关系，this会绑定到最后一层的上下文对象上，比如以下代码：

```js
function foo() {
  console.log(this.a);
}

const obj2 = {
  a: 2,
  foo: foo,
};

const obj1 = {
  a: 1,
  obj2: obj2,
};

obj1.obj2.foo(); // 2
```

此时this会绑定到obj2上。

还有一种情况，叫隐式绑定丢失，看如下代码：

```js
function foo() {
  console.log(this.a);
}

const obj = {
  a: 1,
  foo: foo,
};

const a = 'global';
const bar = obj.foo;
bar(); // 严格模式下是undefined，非严格模式下是global
```

这里指定了bar为obj.foo的一个别名(或者说引用)，也就是说，这里bar实际上引用的是foo本身，所以这里调用bar()相当于一个默认绑定，适用于上面讲到的默认绑定规则。如果确实需要函数别名并且把this绑定到指定的对象上，可以使用显式绑定，比如bind、call、apply之类的，后面会陆续谈到。

隐式绑定丢失还会出现在传入回调函数的时候：

```js
function foo() {
  console.log(this.a);
}

function caller(func) {
  func();
}

const obj = {
  a: 1,
  foo: foo,
};

var a = 'global';
caller(obj.foo); // 严格模式下是undefined，非严格模式下是global
```

在前端的js编程中，由于是事件驱动的，调用回调函数经常发生在用户交互之后，由于绑定丢失，我们经常需要手动把this绑定到某个对象上：

```js
this.onClickBtn = this.onClickBtn.bind(this);
```

### 显式绑定

如果我们想在某个对象上强制调用函数，可以是用显式绑定。js中的函数的原型是Function对象，它提供了一些通用方法。就显式绑定来说，我们可以使用apply和call这两个方法，具体用法是：

```js
func.apply(obj, [arg1, arg2,...]);
func.call(obj, arg1, arg2,...);
```

apply和call只是在传参格式上不一样而已，其他方面完全一样。apply和call都是将func的this绑定到第一个参数obj上。看以下代码：

```js
function foo() {
  console.log(this.a);
}

const obj = {
  a: 1,
};

const a = 'global';
foo.call(obj); // 1
```

此时foo的this绑定到了obj上面。

apply和call的第一个参数也可以是null，即不绑定到任何对象，但实际上在非严格模式下这样做会绑定到全局对象：

```js
function foo() {
  console.log(this.a);
}

const obj = {
  a: 1,
};

const a = 'global';
foo.call(null); // 严格模式下是undefined，非严格模式下是global
```

虽然apply和call可以把this绑定到指定对象，但是还是没有解决回调函数的问题，因为apply和call都是立刻执行的，而回调函数的执行时间是不确定的。而且回调函数的上下文也是不确定的，在回调函数的上下文中可能很难获得我们想要的那个this绑定对象。

为了解决回调函数绑定丢失的问题，我们可以使用硬绑定bind。bind很有用，它可以对this强制绑定一个对象，而且绑定后无法修改。这对我们事件驱动的编程模型很有帮助，可以大量运用在回调函数中。另外bind在js的函数式编程中也是一项利器。看以下代码：

```js
function foo(){
  console.log(this.a);
}

const obj1 = {
  a: 1,
};

const obj2 = {
  a: 2,
};

const bar = foo.bind(obj1); // bar的this永远只会指向obj1
bar(); // 1
bar.call(obj2); // 1 因为无法改变bind后的this绑定，所以还是1
```

### new绑定

new绑定是使用new操作符对函数进行调用产生的绑定。js中的new和其他面向对象编程语言的new不同。一般的面向对象语言中new操作符会调用类的构造函数，生成一个全新的类实例。js中没有类，也没有构造函数，我们在ES 6中看到的`class`和`contructor`方法更多地还是使用js模仿传统OOP的构造对象的方式，实际情况大相径庭，这部分内容(prorotype)可以说是js中最具迷惑性也最多人误解的一件事，我将在之后的文章中详细解释prorotype。回到正题，实际上使用new操作符调用函数实际上做了以下4件事情：

(1) 创建一个全新的对象。

(2) 这个新对象会和它的原型对象进行连接。

(3) 这个新对象会被绑定到函数调用的this。

(4) 如果函数没有返回其他对象，那这个new表达式将自动返回这个新对象。

代码如下：

```js
function foo(a) {
  this.a = a;
}

const bar = new foo(1);
console.log(bar.a); // 1
```

## 总结

本文介绍了this的四种绑定情形。需要再次强调的是，判断this的绑定，不要看函数被定义的地方，而要看函数被调用的地方，或者说上下文。
