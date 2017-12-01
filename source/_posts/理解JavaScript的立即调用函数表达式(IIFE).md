---
title: 理解JavaScript的立即调用函数表达式(IIFE)
date: 2017-05-08
tags: [js]
categories: 编程语言
---

首先这是js的一种函数调用写法，叫立即执行函数表达式(IIFE，即immediately-invoked function expression)。顾名思义IIFE可以让你的函数立即得到执行(废话)。

<!--more-->

一般来说，IIFE有以下几种用途：

1. 创建只使用一次的函数，并立即执行它。
2. 创建闭包，保存状态，隔离作用域。
3. 作为独立模块存在(例子如jQuery)，防止命名冲突，命名空间注入(模块解耦)。

## 1.创建只使用一次的函数，并立即执行它

创建只使用一次的函数比较好理解，在需要调用函数的地方使用IIFE，类似内联的效果：

```js
(function(){
  var a = 1, b = 2;
  console.log(a+b); // 3
})();
```

还可以传入参数：

```js
(function(c){
  var a = 1, b = 2;
  console.log(a+b+c); // 6
})(3);
```

IIFE比较常见的形式是匿名函数，但是也可以是命名的函数：

```js
(function adder(a, b){
  console.log(a+b); // 7
})(3, 4);
```

在js中应该尽量使用命名函数，因为匿名函数在堆栈跟踪的时候会造成一些不便。

## 2.创建闭包，保存状态，隔离作用域

隔离作用域比较复杂一点，在ES6以前，JS没有块级作用域，只有函数作用域，作为一种对块级作用域的模拟就只能用function模拟一个作用域，比如如下代码：

```js
var myBomb = (function(){
  var bomb = "Atomic Bomb"
  return {
    get: function(){
      return bomb
    },
    set: function(val){
      bomb = val
    },
  }
})()

console.log(myBomb.get()) // Atomic Bomb
myBomb.set("h-bomb")
console.log(myBomb.get()) // h-bomb
console.log(bomb) // ReferenceError: bomb is not defined
bomb = "none"
console.log(bomb) // none   
```

可以看到一个比较奇特的现象，按照常理，一个函数执行完毕，在它内部声明的变量都会被销毁，但是这里变量bomb却可以通过myBomb.get和myBomb.set去读写，但是从外部直接去读和写却不行，这是闭包造成的典型效果。要清楚解释闭包到底是什么，这里有一篇文章学习[Javascript闭包（Closure）](http://www.ruanyifeng.com/blog/2009/08/learning_javascript_closures.html)，上面的代码已经用到了闭包。所有闭包都有一个特点，就是可以通过导出方法从函数外部改变函数内部变量的值，因此可以利用这个特点来隔离作用域，模拟一种“私有”的效果。

举一个IIFE保存变量的例子，我们要写入三个文件，先定义了一个内容数组，然后用for循环遍历这个数组写入文件，最后依次用for循环的下标打印出"File i is written."：

```js
var fs = require('fs');

var fileContents = ["text1", "text2", "text3"];
for (var i = 0; i < fileContents.length; i++) {
  fs.writeFile("file"+i+".txt", fileContents[i], function(err){
    if (err) {
      console.log(err)
    }
    console.log("File " + i + " is written.")
  })
}    
```

这段代码结果是：

File 3 is written.
File 3 is written.
File 3 is written.

很明显和我们的意愿相违背，打印了3次"File 3 is written."。
我们希望的是每个文件的下标索引打印一次。

原因在于写文件是个异步操作，在写完文件调用回调函数时，for循环已经遍历完毕，此时i=3。
要解决这个问题，可以使用IIFE：

```js
var fs = require('fs');

var fileContents = ["text1", "text2", "text3"];
for (var i = 0; i < fileContents.length; i++) {
  (function(index){
    var fileIndex = index;
    fs.writeFile("file"+fileIndex+".txt", fileContents[fileIndex], function(err){
      if (err) {
        console.log(err)
      }
      console.log("File " + fileIndex + " is written.")
    })
  })(i)
}
```

这次结果是正确的(尽管不是按序，这不在我们考虑范围内)：

File 1 is written.
File 2 is written.
File 0 is written.


可以看到这里用IIFE做了一个变量捕获，或者说保存。

再回到myBomb那个例子，这其中用到了一个模式，叫Module模式，很多js模块都是这么写，在IIFE中定义一些私有变量或者私有函数，然后在return的时候导出(一般用一个Object导出)需要暴露给外部的方法。另外在IIFE中定义的变量和函数也不会污染全局作用域，它们都通过统一的入口访问。

## 3.作为独立模块存在，防止命名冲突，命名空间注入(模块解耦)

可以使用以下代码为ns这个命名空间注入变量和方法：

```js
var ns = ns || {};

(function (ns){
  ns.name = 'Tom';
  ns.greet = function(){
    console.log('hello!');
  }
})(ns);
console.log(ns); // { name: 'Tom', greet: [Function] }
```

还可以扩展到更多的用途：

```js
(function (ns, undefined){
  var salary = 5000; // 私有属性
  ns.name = 'Tom'; // 公有属性
  ns.greet = function(){ // 公有方法
    console.log('hello!');
  }

  ns.externalEcho = function(msg){
    console.log('external echo: ' + msg);
    insideEcho(msg);
  }

  function insideEcho(msg){ // 私有方法
    console.log('inside echo: ' + msg);
  }
})(window.ns = window.ns || {});

console.log(ns.name); // Tom
ns.greet(); // hello
ns.age = 25;
console.log(ns.age); // 25
console.log(ns.salary); // undefined
ns.externalEcho('JavaScript'); // external echo: JavaScript/inside echo: JavaScript
insideEcho('JavaScript'); // Uncaught ReferenceError: insideEcho is not defined
ns.insideEcho('JavaScript'); // Uncaught TypeError: ns.insideEcho is not a function
```

在这里，命名空间可以在局部被修改而不重写函数外面的上下文，起到了防止命名冲突的作用。

注(如果不感兴趣可以直接忽略)：还需要解释一下上面IIFE中第二个参数undefined。在js中，undefined表示值的空缺，是预定义的全局变量，它并不是关键字：

```js
console.log(typeof a); // undefined
var a;
console.log(a); // undefined
```

undefined有多重含义，第一种是一个数据类型叫做undefined，另一种是表示undefined这个数据类型中的唯一值undefined。我们在js代码中看到的undefined一般是全局对象的一个属性，该属性的初始值就是undefined，另一种情况是，这个undefined是个局部变量，和普通变量一样，它的值可以是undefined，也可以是别的。

在ECMAScript 3中undefined是可变的，这意味着你可以给undefined赋值，但在ECMAScript 5标准下，无法修改全局的undefined：

```js
console.log(window.undefined); // undefined
window.undefined = 1;
console.log(window.undefined); // undefined
```

严格模式下则会直接报错：

```js
'use strict'

console.log(window.undefined); // undefined
window.undefined = 1;
console.log(window.undefined); // Uncaught TypeError: Cannot assign to read only property 'undefined' of object '#<Window>'
```

因此我们需要保护这个局部的undefined：

```js
(function (window, document, undefined) {
  // ...
})(window, document);
```

这时候就算有人给undefined赋值也没有问题：

```js
undefined = true;
(function (window, document, undefined) {
  // undefined指向的还是一个本地的undefined变量
})(window, document);
```

不过随着ECMAScript 5的普及(现在几乎没有哪款浏览器不支持ECMAScript 5了)，这种担忧基本没有必要了，jQuery也是为了最大程度的兼容性才这么做。

以上例子说明我们可以把命名空间作为参数传给IIFE，以对其进行扩展和装饰：


```js
(function (ns, undefined){
  var salary = 5000; // 私有属性
  ns.name = 'Tom'; // 公有属性
  ns.greet = function(){ // 公有方法
    console.log('hello!');
  }

  ns.externalEcho = function(msg){
    console.log('external echo: ' + msg);
    insideEcho(msg);
  }

  function insideEcho(msg){
    console.log('inside echo: ' + msg);
  }    
})(window.ns = window.ns || {});

(function (ns, undefined){
  ns.talk = function(){
    console.log(ns.name + ' says hello.');
    console.log(ns.name + ' says goodbye.');
    // 注意这里不能调用私有函数insideEcho，否则会报错，因为talk和insideEcho不在同一个闭包中
  }
})(window.ns = window.ns || {});

ns.talk(); // Tom says hello. Tom says goodbye.
```

### 命名空间注入

命名空间注入是IIFE作为命名空间的装饰器和扩展器的一个变体，使其更具有通用性。作用是可以在一个IIFE(这里可以把它理解成一个函数包装器)内部为一个特定的命名空间注入变量/属性和方法，并且在内部使用this指向该命名空间：

```js
var app = app || {};
app.view = {};

(function (){
  var name = 'main';
  this.getName = function(){
    return name;
  }
  this.setName = function(newName){
    name = newName;
  }
  this.tabs = {};
}).apply(app.view);

(function (){
  var selectedIndex = 0;
  this.getSelectedIndex = function(){
    return selectedIndex;
  }
  this.setSelectedIndex = function(index){
    selectedIndex = index;
  }
}).apply(app.view.tabs);

console.log(app.view.getName()); // main
console.log(app.view.tabs.getSelectedIndex()); // 0
app.view.tabs.setSelectedIndex(1);
console.log(app.view.tabs.getSelectedIndex()); // 1
```

我们还可以写一个模块构造器来批量生产模块：

```js
var ns1 = ns1 || {}, ns2 = ns2 || {};

var creator = function(val){
  var val = val || 0;
  this.getVal = function(){
    return val;    
  }
  this.increase = function(){
    val += 1;
  }
  this.reduce = function(){
    val -= 1;
  }
  this.reset = function(){
    val = 0;
  }
}
creator.call(ns1);
creator.call(ns2, 100);
console.log(ns1.getVal()); // 0
ns1.increase();
console.log(ns1.getVal()); // 1
console.log(ns2.getVal()); // 100
```

对某个私有变量，用API的形式对其进行读写，这其实就是OOP的一些思想在js的应用了。
