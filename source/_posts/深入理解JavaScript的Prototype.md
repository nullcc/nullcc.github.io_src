---
title: 深入理解JavaScript的Prototype
date: 2018-11-12
tags: [js]
categories: 编程语言
---

本文将展示常常令人迷惑和误解的JavaScript的Prototype到底是什么。

<!--more-->

## 面向对象编程中的类

在大部分面向对象编程语言中都可以看到“类”的身影，说到“类”，进而就会谈到“继承”、“封装”和“多态”。类是一种蓝图，描述了该类的实例应该具有的数据和行为，我们会调用类的构造函数（构造函数属于类）来`实例化`一个对象出来。这个实例化出来的对象拥有类所描述的特性和行为。子类继承自父类就相当于将父类复制一份到子类中，子类和父类是相对独立的，在子类中调用或者覆盖父类方法并不会对父类造成影响。因此，类的继承本质就是`复制`。多态建立在复制这个事实基础上，表面看上去多态是由于子类实例`引用`了父类方法，实质上多态并不表示子类和父类有关联，而只能说明子类得到了父类的一份副本。

也就是说，在传统面向对象的设计理念中，类体系的核心是复制。


## JavaScript中的prototype

### prototype的基本行为

下面的代码定义了一个对象obj，它本身拥有一个属性foo，使用`obj.foo`可以获取这个属性的值：

```javascript
// demo1.js
const obj = { foo: 1 };
console.log(obj.foo); // 1
```

这和prototype有什么关系呢？简单来说，在JavaScript中的某个对象上引用属性时，首先会查看这个对象本身是否拥有这个属性，如果有就返回这个属性的值。如果没有，就需要查看该对象的prototype链了。以下代码将obj的prototype关联到另一个对象上：

```javascript
// demo2.js
const obj1 = { foo: 1 };
const obj = Object.create(obj1);
console.log(obj.foo); // 1
console.log(Object.getPrototypeOf(obj) === obj1); // true
console.log(obj1.isPrototypeOf(obj)); // true
console.log(Object.getPrototypeOf(obj1) === Object.prototype); // true
console.log(Object.prototype); // {}
console.log(Object.getPrototypeOf(Object.prototype)); // null

```

`Object.create`会创建一个对象，并将这个对象的prototype关联到指定的对象。
`Object.getPrototypeOf`用来获取一个对象的prototype。
`isPrototypeOf`可以判断一个对象是否存在于另一个对象的prototype链上。

一般来说，普通对象的prototype链最终将指向`Object.prototype`，而Object.prototype的prototype是`null`。如下图所示：

![obj的prototype链](/assets/images/post_imgs/js-prototype1.png)

上面的代码中，obj本身并没有foo这个属性，所以调用obj.foo时会沿着obj的prototype链查找foo属性，最终在obj1上找到了。

```javascript
// demo3.js
const obj2 = { bar: 2 };
Object.defineProperty(obj2, 'baz', {
  value: 3,
  enumerable: false,
})
const obj1 = Object.create(obj2);
obj1.foo = 1;
const obj = Object.create(obj1);
obj.a = 0;

console.log(obj); // { a: 0 }
console.log(obj1); // { foo: 1 }
console.log(obj2); // { bar: 2 }

console.log(obj.foo); // 1
console.log(Object.getPrototypeOf(obj) === obj1); // true
console.log(Object.getPrototypeOf(obj1) === obj2); // true
console.log(Object.getPrototypeOf(obj2) === Object.prototype); // true
console.log(Object.prototype); // {}
console.log(Object.getPrototypeOf(Object.prototype)); // null

console.log(obj2.isPrototypeOf(obj1)); // true
console.log(obj1.isPrototypeOf(obj)); // true
console.log(obj2.isPrototypeOf(obj)); // true

for (const key in obj) {
  console.log(key);
}
```

运行上述代码，for循环部分会打印出：

a
foo
bar

可以发现遍历一个对象时会将其`本身`的属性(a)和它`prototype链上`的所有可枚举属性(foo和bar)都遍历出来。

如果只想遍历对象本身的属性，需要进行`hasOwnProperty`的判断：

```javascript
// demo4.js
const obj2 = { bar: 2 };
Object.defineProperty(obj2, 'baz', {
  value: 3,
  enumerable: false,
})
const obj1 = Object.create(obj2);
obj1.foo = 1;
const obj = Object.create(obj1);
obj.a = 0;

for (const key in obj) {
  if (obj.hasOwnProperty(key)) {
    console.log(key)
  }
}
```

这段代码的将打印出：

a

### JavaScript的“类”和“构造函数”

JavaScript中有new关键字，于是人们顺理成章地将它当做调用“构造函数”的标志：至少我们在Java/C++中是这么做的。

```javascript
// demo5.js
function Foo() {
  console.log(1);
}
const foo = new Foo();
console.log(foo); // Foo {}

function Bar(a) {
  this.a = a;
}
const bar = new Bar(1);
console.log(bar); // Bar { a: 1 }
```

可以发现，对函数使用new会返回一个对象，即使这个函数本身没有返回任何值（此时返回的是{}）。函数内部的`this.x = y`的赋值语句会使最终返回的对象具有相应的属性。正因为这样，人们认为Foo是一个类。再看下面的代码：

```javascript
// demo6.js
function Foo(name) {
  this.name = name;
}
const foo = new Foo('a');
console.log(foo); // Foo { name: 'a' }

console.log(Foo.prototype.constructor === Foo); // true
console.log(foo.constructor === Foo); // true
```

我们发现由new Foo()创建出来的foo有一个constructor属性，且`foo.constructor`指向`Foo`，所以人们更加笃定foo由Foo“构造”，foo是“Foo类”的一个实例。其实Foo和普调的函数并没有区别，只是JavaScript会让所有带有new的函数调用构造一个对象并返回它。

再来看看人们怎么处心积虑地在JavaScript模拟类的行为：

```javascript
// demo7.js
function Foo(name) {
  this.name = name;
}

Foo.prototype.getName = function() {
  return this.name;
}

const a = new Foo('a');
const b = new Foo('b');
console.log(Object.getPrototypeOf(a) === Foo.prototype); // true
console.log(a.getName()); // a
console.log(a.getName === b.getName); // true
console.log(a.getName === Foo.prototype.getName); // true
```

解释一下上面这段代码，由Foo“构造”出来的对象a有一个name属性，且a的prototype指向Foo.prototype。我们在Foo.prototype上添加一个方法getName，于是再a上执行getName()时，我们成功地通过prototype链找到Foo.prototype.getName，并调用它。接着我们又“构造”了一个对象b，然后我们发现a.getName、b.getName和Foo.prototype.getName指向的是同一个对象。

这就有点意思了，在传统的类理论中，子类会复制父类的信息，所以子类和父类的同名方法在内存中必然是两个完全不同的对象，我们知道JavaScript中的`===`是比较对象同一性的。上面的代码意味着不管“构造”出多少个“Foo类”的实例，所有实例的方法都指向Foo.prototype中的方法。这显然和传统面向对象的类理论相违背。

更神奇的是下面这段代码：

```javascript
// demo8.js
function Foo(name) {
  this.name = name;
}

console.log(Foo.prototype.constructor === Foo); // true
Foo.prototype = {};
console.log(Foo.prototype.constructor === Foo); // false
console.log(Foo.prototype.constructor === Object); // true
const a = new Foo('a');
console.log(a.constructor === Foo); // false
console.log(a.constructor === Object); // true
```

上面的代码中改变了Foo.prototype，这导致了后面a.constructor不再指向Foo。也就是说，Foo.prototype的constructor属性默认情况下指向该函数自身，但如果我们在创建新对象后改变了Foo.prototype的指向，那么新对象的constructor属性并不会保持原来的指向（因为是引用）。因此，你无法通过a.constructor来确切地知晓是谁“构造”了a。

### __proto__和prototype

先来看一段代码：

```javascript
// demo9.js
function Foo(name) {
  this.name = name;
}

Foo.prototype.getName = function() {
  return this.name;
};

const foo1 = new Foo('a');

console.log(Object.getPrototypeOf(foo1) === foo1.__proto__) // true, 对象的原型可以用Object.getPrototypeOf或者__proto__属性获得
console.log(Object.getPrototypeOf(Foo) === Foo.__proto__); // true, 函数也是对象，因此也可以用Object.getPrototypeOf或者__proto__属性获得其原型
console.log(foo1.prototype); // undefined, 只有函数对象才有prototype属性
console.log(Object.getPrototypeOf(foo1) === Foo.prototype); // true, 由函数“构造”出来的对象的原型默认指向该函数的prototype属性
console.log(foo1.constructor === Foo) // true, 由函数“构造”出来的对象的constructor属性默认指向函数本身
console.log(Foo.prototype.constructor === Foo) // true, 函数的prototype的constructor属性默认指向函数本身
```

这些错综复杂的关系可以用一张图（稍微清晰一点地）表示：

![构造函数中的原型链](/assets/images/post_imgs/js-prototype2.png)

### instanceof

看下面这段代码：

```javascript
// demo10.js
function Foo() {}

const foo = new Foo();

console.log(foo instanceof Foo); // true
```

人们往往希望使用`instanceof`来判断一个对象是否是某个“类”的实例，从字面意思看来这是很直白的。但instanceof回答的问题是，在foo的prototype链中是否有一个对象指向Foo.prototype。通过上面的图我们知道，通过调用`new Foo()`得到foo，因此foo的原型是Foo.prototype。所以这里结果是true。但是instanceof只能用于对象和函数之间，不能用于对象与对象之间。举个例子，如果是下面这样的代码，用instanceof是不行的：

```javascript
// demo11.js
const obj1 = { a: 1 };

const obj = Object.create(obj1);

console.log(obj instanceof obj1); // TypeError: Right-hand side of 'instanceof' is not callable
```

我们用Object.create创建了一个对象，并将该对象prototype指向obj1，如果要判断一个对象的prototype是否是另一个对象，需要使用`isPrototypeOf`：

```javascript
// demo12.js
function Foo() {}
const foo = new Foo();
console.log(Foo.prototype.isPrototypeOf(foo)); // true
const obj1 = { a: 1 };
const obj = Object.create(obj1);
console.log(obj1.isPrototypeOf(obj)); // true
```

仔细想想可以发现，实际上根本不存在我们以为的“x是y的实例”这种关系，也就是传统意义上的instanceof，对象间只有引用关系，如果要表示某个对象在另一个对象的prototype链上（不论是普通对象还是函数），最好使用isPrototypeOf。

### JavaScript对象间关系的本质——对象关联

通过上面的一些例子，我们发现JavaScript中根本不存在所谓的“类继承”机制。对象间是引用、关联的关系。理解了这个事实，很多JavaScript的“神奇”行为也很好解释了，很多人之所以会对JavaScript的“类继承”机制一头雾水，其实完全是因为以错误的方式去尝试理解它。现在再来思考`Object.create`带来了什么：

```javascript
// demo13.js
const obj1 = { 
  a: 1,
  foo: () => {
    return 2;
  }
};
const obj = Object.create(obj1);

console.log(obj.a); // 1
console.log(obj.foo()); // 2
```

obj的prototype是obj1，执行obj.a或者obj.foo()其实是在使用obj的prototype上的属性和方法，这其实是一种`委托`，而委托本质上是因为对象关联。为了避免属性屏蔽或者冲突，建议在对象上显式地使用委托：

```javascript
// demo14.js
const obj1 = { 
  a: 1,
  foo: () => {
    return 2;
  }
};
const obj = Object.create(obj1);
obj.doFoo = function() {
  return this.foo();
};
console.log(obj.a); // 1
console.log(obj.doFoo()); // 2
```

显式地使用委托也很简单，在对象上新建一个方法，在方法内部使用this来调用委托方法。
