---
title: RxJS入坑笔记(一)——基础知识
date: 2019-01-01
tags: [RxJS]
categories: web前端
---

这是一个系列文章，主要记录我自己学习RxJS时的学习笔记和遇到的问题。本文关注RxJS实践环境的搭建和一些基础知识。

<!--more-->

## 搭建开发环境

学习一门编程技术最好的方式是一边看教程一边实践，RxJS也不例外。让我们快速搭建一个开发环境来写一些代码：

```bash
create-react-app rxjs-samples --scripts-version=react-scripts-ts
```

我们使用[create-react-app](https://github.com/facebook/create-react-app)这个脚手架来搭建一个React编程环境，并使用TypeScript来编写代码。

接着安装RxJS的一些依赖：

```bash
yarn add rxjs rxjs-compat --save
```

```bash
yarn add tslint --dev
```

现在可以直接运行下列命令在开发环境中运行我们的应用：

```bash
yarn start
```

看到一个旋转的React的Logo说明一切正常。


## 快速开始——使用GitHub API获取用户信息

这里并不打算从一个传统的"Hello world"例子开始，而是直接展示RxJS相较于传统事件响应编程的不同之处。这个示例很简单，提供一个输入框，用户在输入框中输入内容后，将使用输入内容在GitHub API中搜索用户信息，并将用户信息展示出来。这里面还有两个要求：

1. 控制1秒内只响应一次输入框的变化
2. 只有输入框的内容有变化时才调用API获取用户信息

如果使用传统的事件响应式编程，代码大概是下面这样的：

```javascript
const usernameInput = document.querySelector('#username');

let lastInputValue = '';
let lastInputTime = null;
let timer = null;

usernameInput.addEventListener('input', event => {
  if (!lastInputTime) {
    lastInputTime = new Date().getTime();
  }
  const now = new Date().getTime();
  const interval = now - lastInputTime;
  const inputValue = event['target']['value'];
  lastInputTime = now;

  if (interval < 1000) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (lastInputValue !== inputValue) {
        lastInputValue = inputValue;
        getUser(inputValue);
      }
      lastInputTime = null;
    }, 1000);
    return;
  } else {
    if (inputValue !== lastInputValue) {
      lastInputValue = inputValue;
      clearTimeout(timer);
      getUser(inputValue);
      return;
    }
  }
});

const getUser = username => {
  $.ajax({
    type: 'GET',
    url: `https://api.github.com/users/${username}`,
    success: data => {
      const pre = document.createElement('pre');
      pre.innerHTML = JSON.stringify(data);
      document.getElementById('results').appendChild(pre);
    }
  });
};
```

看了这段代码有何感想？我说几点我的感想，首先控制流对业务代码的侵入性高，不易扩展。且代码冗长不简洁，还需要引入一些外部变量。虽然也实现了想要的功能，但总感觉不是做这件事的最佳方式。

再来看看用RxJS的实现：

```typescript
const usernameInput = document.getElementById('username') as FromEventTarget<any>;
fromEvent(usernameInput, 'input')
  .map((event: any) => event.currentTarget.value)
  .debounceTime(1000)
  .distinctUntilChanged()
  .switchMap((username: string) => ajax(`https://api.github.com/users/${username}`))
  .map((data: any) => data.response)
  .subscribe(
    (val: any) => {
      const pre = document.createElement('pre');
      pre.innerHTML = JSON.stringify(val);
      const res = document.getElementById('results') as HTMLElement;
      res.appendChild(pre);
    },
    (err: Error) => {
      alert(err.message)
    }
  );
```

这段代码不但实现了我们想要的功能，而且还非常优雅美观。没错，这就是我们想要的。


## RxJS的基础概念

### 核心数据类型

下面是官方中文文档中对RxJS核心数据类型和Observable概念的简单说明：

RxJS有一个核心类型Observable，以及围绕Observable的一些其他类型：Observer、 Subscription、Subject和Operators。

- Observable（可观察对象）：可观察对象代表一个可观测的未来值或事件的集合。
- Observer（观察者）：一个回调函数的集合，负责处理由Observable发出的值。
- Subscription（订阅）：当一个Observable被订阅时才会真正得发出值。
- Operators（操作符）：是一些纯函数，我们使用函数式编程的方法来处理集合。

|  | 单个值 | 多个值
|:------------------|:------------------
| 拉取  | Function | Iterator
| 推送  | Promise | Observable

当调用一个函数时，实际上是主动地拉取一个值，而使用迭代器时我们可以主动地拉取多个值。在异步编程中，Promise一旦被创建出来就会立即执行，而后的then实际上是接受Promise决议后推送过来的值，且Promise至多只能推送一个值。Observable则可以同步或异步地推送多个值。

### 基本模式

// todo


## 操作符

### 创建操作符——Creation Operators

可以使用创建操作符来创建Observable，列出如下：

- create
- empty
- from
- fromEvent
- interval
- of
- range
- throwError
- timer

#### create操作符

```typescript
const observable = Observable.create(observer => {
  observer.next(1);
  observer.next(2);
  setTimeout(() => {
    observer.next(3);
    observer.complete();
    observer.next(5);
  }, 1000);
  observer.next(4);
});

const subscribe = observable.subscribe(
  val => {
    console.log(val);
  }
);
```

运行上面的代码会立即打印1、2和4，并在约1000毫秒后打印3，然后结束，并不会打印5。

我们可以使用create操作符很容易地创建一个Observable对象，然后随意地发出值。另外可以使用`observer.complete()`结束整个事件流。下面的例子是一个自然数发生器（周期时钟），每隔1000毫秒发出下一个自然数：

```typescript
const observable = Observable.create(observer => {
  let num = 0;
  setInterval(() => {
    observer.next(++num);
  }, 1000);
});

const subscribe = observable.subscribe(
  val => {
    console.log(val);
  }
);
```

#### empty操作符

empty操作符会直接使Observable直接结束：

```typescript
const observable = empty();

const subscribe = observable.subscribe({
  next: val => {
    console.log(val);
  },
  complete: () => {
    console.log('complete');
  }
})
```

直接打印出'complete'。


#### from操作符

from操作符可以从一个可迭代对象(Array, Map, Promise)中创建一个Observable对象：

```typescript
const observable = Observable.from([1, 2, 3, 4, 5, 6]);

const subscribe = observable.subscribe(
  val => {
    console.log(val);
  }
)
```

这段代码会依次打印1, 2, 3, 4, 5, 6

使用Map：

```typescript
const map = new Map();
map.set('foo', 1);
map.set('bar', 2);

const observable = Observable.from(map);

const subscribe = observable.subscribe(
  val => {
    console.log(val);
  }
)
```

这段代码会打印出：

["foo", 1]
["bar", 2]

使用Promise：

```typescript
const promise = new Promise((resolve, reject) => {
  resolve(100);
});

const observable = Observable.from(promise);

const subscribe = observable.subscribe(
  val => {
    console.log(val);
  }
)
```

这段代码直接打印出100。

#### fromEvent操作符

fromEvent操作符在“快速开始”一节中已经展示了，fromEvent接受一个`FromEventTarget`对象和一个event name。

#### interval操作符

interval操作符非常简单，接受一个以毫秒为单位的时间参数，每隔这个时间发出一个自增的数字：

```typescript
const observable = interval(1000);

const subscribe = observable.subscribe(
  val => {
    console.log(val);
  }
)
```

#### of操作符

of操作符接收不定个数的参数，并依次发射每个参数：

```typescript
const observable = Observable.of(1, 2, 3);

const subscribe = observable.subscribe(
  val => {
    console.log(val);
  }
)
```

打印出1, 2, 3。

还可以传入一些其他类型的参数：

```typescript
const observable = Observable.of(1, 2, 3, [4, 5], { a:1, b:2 }, function() { console.log(10); });

const subscribe = observable.subscribe(
  val => {
    console.log(val);
  }
)
```

这将依次打印出：

1
2
3
[4, 5]
{a: 1, b: 2}
ƒ () { console.log(10); }

#### range操作符

可以使用range操作符指定整数的起点和终点（闭区间），并依次发出这些数字：

```typescript
const observable = Observable.range(1, 10);

const subscribe = observable.subscribe(
  val => {
    console.log(val);
  }
)
```

将打印出1到10的整数。

#### throwError操作符

throw操作符发出一个异常：

```typescript
const observable = throwError('Got an error.');

const subscribe = observable.subscribe({
  next: val => {
    console.log(val);
  },
  complete: () => {
    console.log('complete');
  },
  error: err => {
    console.error(err);
  }
})
```

这段代码将打印错误："Got an error."。

#### timer操作符

timer操作符可以接受两个参数，第一个参数表示经过多长时间后发出一个值（从0开始自增），第二个参数表示之后每隔多长时间发出一个值：

```typescript
const observable = timer(1000);

const subscribe = observable.subscribe(
  val => {
    console.log(val);
  }
)
```

这段代码将在1000毫秒后发出1。

传入第二个参数的情况：

```typescript
const observable = timer(1000, 3000);

const subscribe = observable.subscribe(
  val => {
    console.log(val);
  }
)
```

这段代码将在1000毫秒后发出1，之后每隔3000毫秒发出自增的数字。

### 过滤操作符——Filtering Operators

#### debounceTime操作符

debounceTime操作符会丢弃所有在指定时间间隔内发出的值。在刚才通过GitHub API获取用户信息的例子中已经演示了如何使用，这里再看下面这个计数器的例子，我们限制了用户点击"+"和"-"的速度每秒不能超过一次：

```html
<div>
  <h1>Simple Counter</h1>
    <button id='decrBtn'>-</button>
    <button id='incrBtn'>+</button>
    <p id='counter'>0</p>
</div>
```

```typescript
const inceStream = document.querySelector('#incrBtn');
const decrStream = document.querySelector('#decrBtn');

const s1 = fromEvent(inceStream, 'click').mapTo(1);
const s2 = fromEvent(decrStream, 'click').mapTo(-1);

merge(s1, s2)
    .debounce(() => timer(1000))
    .startWith(0)
    .scan((acc, curr) => acc + curr)
    .subscribe(
      res => {
        const counter = document.getElementById('counter');
        counter.innerText = res.toString();
      }
    );
```

#### distinctUntilChanged操作符

distinctUntilChanged控制了只有在当前值和上一次值不同时才发出值，它经常和debounceTime操作符一起用来控制对事件流进行控制。比如我们将一个文本框的输入内容作为查询参数，构造请求发往后端。distinctUntilChanged和debounceTime配合使用可以简单有效地控制该文本框的输入事件触发发送HTTP请求的频率。GitHub API的例子很好地展示了这种用法。

下面这个例子只会发出连续相同的值序列中的第一个值：

```typescript
const observable = Observable.from([1, 1, 2, 1, 2, 3, 3]);

const subscribe = observable
  .distinctUntilChanged()
  .subscribe(
    val => {
      console.log(val);
    }
  );
```

打印出值如下：

1
2
1
2
3

#### filter操作符

filter操作符很好理解，给定一个过滤条件，只发出满足条件的值。下面的例子只会发出偶数值：

```typescript
const observable = Observable.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

const subscribe = observable
  .filter(num => num % 2 === 0)
  .subscribe(
    val => {
      console.log(val);
    }
  );
```

打印：

0
2
4
6
8

### take操作符

take操作符会发出序列的前n个值：

```typescript
const observable = Observable.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

const subscribe = observable
  .take(3)
  .subscribe(
    val => {
      console.log(val);
    }
  );
```

打印：

0
1
2

#### takeUntil操作符

takeUntil可以时在某个事件发生时，让一个observable直接发送complete信息：

```html
<button id='btn'>Stop!</button>
```

```typescript
const btn = document.querySelector('#btn');
const btnObservable = fromEvent(btn, 'click');

const intervalObservable = interval(1000);

const subscribe = intervalObservable
  .takeUntil(btnObservable)
  .subscribe({
    next: val => {
      console.log(val);
    },
    error: err => {
      console.error(err);
    },
    complete: () => {
      console.log('complete!');
    }
  });
```

运行上面的代码，一开始将以1000毫秒为间隔自增打印自然数，当按下"Stop!"按钮时，intervalObservable结束，并打印出"complete!"。

### 错误处理操作符——Error Handling Operators

// todo