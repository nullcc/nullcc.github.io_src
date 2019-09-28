---
title: JavaScript法术集
date: 2019-08-12
tags: [js]
categories: 编程语言
---

记录一下JavaScript常见的编程技巧。

<!--more-->

## 函数

### 1. 立即调用函数表达式IIFE (Immediately Invoked Function Expression)

在某些场合可能需要立即定义和调用一个函数，并得到其结果，可以使用IIFE：


### 2. 使用bind强制绑定this和进行函数柯里化

有时候我们为了防止函数的this绑定丢失，会将该函数的this强制绑定到某个对象上：

```javascript
const a = {
  value: 1,
};

const b = {
  value: 2,
};

function fn() {
  return this.value;
}

fn = fn.bind(a);

console.log(fn()); // 1
console.log(fn.call(b)); // 1
console.log(fn.apply(b)); // 1
```

需要注意的是，使用bind强制绑定后，无法再修改函数的this指向。

另外还可以利用bind进行函数柯里化，将某些参数固定到函数上：

```javascript
function add(num1, num2) {
  return num1 + num2;
}

const add3 = add.bind(null, 3);
console.log(add3(4)); // 7
```


### 3. 使用call和apply改变函数的this指向并调用函数

```javascript
const a = {
  value: 1,
};

const b = {
  value: 2,
};

function fn(num1, num2) {
  return this.value + num1 + num2;
}

console.log(fn.call(a, 1, 2)); // 4
console.log(fn.apply(a, [1, 2])); // 4
console.log(fn.call(b, 1, 2)); // 5
console.log(fn.apply(b, [1, 2])); // 5
```

call和apply的第一个参数指定了函数的this指向，call接受一个参数列表作为调用函数的实参，apply接受一个数组，数组的内容会依次作为调用函数的实参。除了调用方式的不同之外，call和apply几乎没有差别。call和apply在一些高阶函数中应用得比较多。



