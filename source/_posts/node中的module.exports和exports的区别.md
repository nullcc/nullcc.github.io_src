---
title: node中的module.exports和exports的区别
date: 2017-07-19
---

对于做node.js开发的同学来说，肯定经常要与`module.exports`和`exports`这两个东西打交道，似乎在它们都可以用于导出模块。
不过为何要设置两种方式来导出模块呢？我们就来研究一下`module.exports`和`exports`的关联和区别。

我们先来看看在一个模块中，`module.exports`和`exports`的值分别是什么。

```js
// a.js
console.log(module.exports);  // {}
console.log(exports);  // {}
console.log(module.exports === exports);  // true
```

运行上述代码，我们发现`module.exports`和`exports`的初始值都是`{}`，更重要的一点是初始状态下，`module.exports`和`exports`指向的是同一个对象。
也就是说，初始状态下，`module.exports`就是`exports`。这个信息对我们很重要，接着往下看。

分别运行下面两段代码：

```js
// a.js
module.exports = function(name, age) {
  this.name = name;
  this.age = age;
  this.say = function() {
    console.log("My name is " + name + ", I\'m " + age + " yeas old.")
  }
}

console.log(module.exports);             // [Function]
console.log(exports);                    // {}
console.log(module.exports === exports); // false
```

```js
// b.js
var Person = require("./a.js");

console.log(Person); // [Function]

jack = new Person("Jack", 30); // My name is Jack, I'm 30 yeas old.
jack.say();
```

`a.js`中对`module.exports`进行赋值，在`b.js`中`require`了`a.js`，`a.js`通过`module.exports`导出了一个`function`。

我们再运行下面两段代码：

```js
// a.js
exports = function(name, age) {
  this.name = name;
  this.age = age;
  this.say = function() {
    console.log("My name is " + name + ", I\'m " + age + " yeas old.")
  }
}

console.log(module.exports);             // {}
console.log(exports);                    // [Function]
console.log(module.exports === exports); // false
```

```js
// b.js
var Person = require("./a.js");

console.log(Person); // {}

jack = new Person("Jack", 30); // TypeError: Person is not a function
jack.say();
```

运行结果和之前完全不同，首先在`a.js`中，`module.exports`的值是`{}`，`exports`则被赋值了一个`[Function]`，此时`module.exports`和`exports`
不再是同一个东西，它们各有所指。在`b.js`中，从`a.js`中导出的对象是`{}`，因此调用`jack = new Person("Jack", 30);`会报错。
这说明了一个很重要的事实：在node中从模块中导出都是通过`module.exports`，它是模块和外界交互的一个接口。

再来：

```js
// a.js
exports.Person = function(name, age) {
  this.name = name;
  this.age = age;
  this.say = function() {
    console.log("My name is " + name + ", I\'m " + age + " yeas old.")
  }
}

console.log(module.exports);             // { Person: [Function] }
console.log(exports);                    // { Person: [Function] }
console.log(module.exports === exports); // true
```

```js
// b.js
var Person = require("./a.js").Person;

console.log(Person); // [Function]

jack = new Person("Jack", 30); // My name is Jack, I'm 30 yeas old.
jack.say();
```

这里并没有直接覆盖`exports`，而是对它的一个属性进行赋值，此时`module.exports`和`exports`还是指向同一个对象。

上述几个代码片段的结果引出了以下三个结论：

1. `module.exports`的初始值是`{}`。
2. 初始状态下，`exports`是`module.exports`的引用，如果对`exports`赋值（而不是对它的属性赋值），`exports`就不再指向`module.exports`。
3. node使用`module.exports`导出模块。
