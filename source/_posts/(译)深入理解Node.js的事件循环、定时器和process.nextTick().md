---
title: (译)深入理解Node.js的事件循环、定时器和process.nextTick()
date: 2018-10-11
tags: [node]
categories: 文档翻译
---

本文翻译自[The Node.js Event Loop, Timers, and process.nextTick()](https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick/)。

<!--more-->

## 事件循环是什么？

事件循环通过尽可能地将操作交给内核处理来允许Node.js执行非阻塞I/O操作 —— 尽管JavaScript是单线程的。

由于大多数现在内核都是多线程的，它们可以在后台执行多个操作。当其中一个操作执行完毕时，内核会通知Node.js，以便可以将相应的回调函数加入到轮询队列中等待最终被执行。稍后我们将在本主题中详细解释这一细节。


## 事件循环详解

当Node.js将在启动时初始化事件循环，处理输入脚本（或者进入REPL，不过这不在本文讨论范围内），在脚本中可能会异步调用API，调度定时器或者调用process.nextTick()，然后开始处理事件循环。

下图展示了事件循环的操作顺序的简化概述。

```
   ┌───────────────────────────┐
┌─>│           timers          │
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │     pending callbacks     │
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │       idle, prepare       │
│  └─────────────┬─────────────┘      ┌───────────────┐
│  ┌─────────────┴─────────────┐      │   incoming:   │
│  │           poll            │<─────┤  connections, │
│  └─────────────┬─────────────┘      │   data, etc.  │
│  ┌─────────────┴─────────────┐      └───────────────┘
│  │           check           │
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
└──┤      close callbacks      │
   └───────────────────────────┘
```

注意：每个方框都被称为事件循环中的一个“阶段”。

每个阶段都拥有一个FIFO队列来存放将要被执行的回调函数。虽然每个阶段都有自己独特的地方，但一般情况下，当事件循环进入一个给定的阶段时，它将执行该阶段的任何特定操作，然后从该阶段维护的回调函数FIFO队列中取回调函数来执行，直到队列为空或者达到回调函数执行的最大次数为止。当队列为空或者达到了回调函数的最大执行次数，事件循环将进入下一个阶段，一直这样重复下去。

由于这些操作中的任何一个都有可能再调度更多的操作，且新事件的处理在轮询阶段需要在内核中排队，轮询事件可以在处理轮询事件时排队。因此，长时间运行的回调可以使轮询阶段运行得比计时器的阈值长得多。关于这部分内容可以查阅[定时器](https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick/#timers)和[轮询](https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick/#poll)章节了解更多细节。

注意：事件循环在Windows和Unix/Linux实现上有一个微小的差异，但这在这里并不重要。本文将讲解上面展示的最重要的七到八个步骤。


## 阶段概述

- 定时器阶段： 该阶段将执行所有被`setTimeout()`和`setInterval()`调度的回调。
- 未解决的回调阶段：该阶段将执行那些被延迟到下一个事件循环迭代的回调。
- 空闲和准备阶段：该阶段只在内部被使用到
- 轮询阶段： 检索新的I/O事件；执行和I/O相关的回调（即除了关闭回调、被定时器调度的回调和被setImmediate()调度的回调以外的几乎所有回调）；Node.js将在适当的时候阻塞在此。
- 检查阶段：该阶段将执行被setImmediate()调度的回调。
- 关闭回调阶段：该阶段将执行一些关闭回调，比如socket.on('close', ...)中指定的回调。

在事件循环的每次运行的之间，Node.js会检查它是否在等待任何异步I/O或者定时器，如果没有，则彻底关闭。

## 事件循环中每个阶段的细节

### 定时器

一个定时器指定了执行所提供回调函数的时间阈值，而不是执行回调函数的确切时间。定时器回调会在所特定的时间过后尽可能早地被调度到。然而，操作系统的调度机制或者其他正在运行的回调可能会使这个行为被延迟。

注意：从技术上说，轮询阶段控制了定时器回调什么时候会被执行。

比如，假设你设置了一个回调函数在100毫秒后被调度执行，然后你的脚本执行了一个耗时95毫秒的异步的读文件操作：

```javascript
const fs = require('fs');

function someAsyncOperation(callback) {
  // Assume this takes 95ms to complete
  fs.readFile('/path/to/file', callback);
}

const timeoutScheduled = Date.now();

setTimeout(() => {
  const delay = Date.now() - timeoutScheduled;

  console.log(`${delay}ms have passed since I was scheduled`);
}, 100);


// do someAsyncOperation which takes 95 ms to complete
someAsyncOperation(() => {
  const startCallback = Date.now();

  // do something that will take 10ms...
  while (Date.now() - startCallback < 10) {
    // do nothing
  }
});
```

当事件循环进入轮询阶段时，队列是空的（因为fs.readFile()还未完成），因此事件循环将等待最快超时的那个定时器。当事件循环等待了95毫秒后，fs.readFile()读取文件完毕且将需要耗时10毫秒的回调函数添加到轮询队列中等待被执行。当回调函数执行完成，队列中已经没有其他回调需要被执行了，因此事件循环将看到距离当前时间最近的那个定时器的超时，然后回到定时器阶段以指定定时器回调。在这个示例中，你将看到定时器被调度和其回调被执行的间隔将是105毫秒。

注意：为了防止轮询阶段将事件循环饿死，libuv（实现Node.js事件循环和其他所有异步行为的C语言库）还有一个硬性的最大轮询时间限制（依赖于具体操作系统）。

### 未解决的回调阶段

该阶段执行一些和操作系统有关的回调，比如TCP错误。例如如果一个TCP socket在尝试建立连接时收到`ECONNREFUSED`错误，一些`*nix`操作系统会等待报告这个错误。这将会在未解决的回调阶段排队等待被执行。

### 轮询阶段

轮询阶段有两个主要的功能：

1. 计算事件循环应该被阻塞多长事件并且对I/O执行轮询。
2. 处理轮询队列中的事件。

当事件循环进入轮询阶段且此时没有定时器被调度时，将发生以下两件事中的其中一件：

* 如果轮询队列非空，事件循环将遍历轮询队列中的回调函数并同步地执行它们直到队列被耗尽，或者到达系统指定的硬性时间限制，结束轮询阶段。
* 如果队列为空，将发生以下两件事中的其中一件：
  * 如果程序被`setImmediate()`调度，事件循环将结束轮询阶段，直接进入检查阶段以执行这些调度程序。
  * 如果程序没有被s`etImmediate()`调度，事件循环将等待有回调函数被加入到轮询队列中，然后直接执行它们。

一旦轮询队列为空，事件循环将检查哪些定时器超时了。如果有一个或多个定时器就绪，事件循环将会回到定时器阶段来执行那些定时器回调。

### 检查阶段

该阶段允许允许用户在轮询阶段后立即执行回调。如果轮询阶段处于空闲状态且在程序中调用了`setImmediate()`，事件循环可以直接进入检查阶段而不是在轮询阶段中等待。

`setImmediate()`实际上是一个运行在事件循环的特殊阶段的定时器。它使用了一个libuv API以在轮询阶段完成后执行回调。

通常，当执行代码时，事件循环最终将到达轮询阶段，在该阶段它将等待传入的连接，请求等。然而，如果一个回调被`setImmediate()`调度且轮询阶段当前处于空闲状态时，轮询阶段将直接结束，立即进入检查阶段而不是继续等待和轮询事件。

### 关闭回调阶段

如果一个socket或者句柄被突然关闭（比如使用socket.destroy()），'close'事件将在这个阶段被发射出去。否则它将通过`process.nextTick()`被发射。

## setImmediate() vs setTimeout()

setImmediate和setTimeout()类似，但它们的行为方式取决于它们什么时候被调用。

* `setImmediate()`被设计成在当前轮询阶段结束时执行一段程序。
* `setTimeout()`则是在到达一个超时时间后执行一段程序。

这两个方法哪个先被调用依赖于它们被调用的上下文。如果它们两个都在主模块中被调用，调用的时机将会被进程的性能所约束（会受到同主机上其他应用程序的冲击）。

比如，如果我们在I/O循环之外（例如主模块）运行下列脚本，则这两个方法的定时器被执行的先后顺序是非确定性的，因为执行时机会受到进程性能的影响：

```javascript
// timeout_vs_immediate.js
setTimeout(() => {
  console.log('timeout');
}, 0);

setImmediate(() => {
  console.log('immediate');
});
```

运行：

```bash
$ node timeout_vs_immediate.js
timeout
immediate

$ node timeout_vs_immediate.js
immediate
timeout
```

然而，如果你将它们放在I/O循环中运行，则`setImmediate()`的回调将总是被先执行：

```javascript
// timeout_vs_immediate.js
const fs = require('fs');

fs.readFile(__filename, () => {
  setTimeout(() => {
    console.log('timeout');
  }, 0);
  setImmediate(() => {
    console.log('immediate');
  });
});
```

运行：

```bash
$ node timeout_vs_immediate.js
immediate
timeout

$ node timeout_vs_immediate.js
immediate
timeout
```

使用`setImmediate()`相比于`setTimeout()`的主要优势是，如果将其放入I/O循环中调度，`setImmediate()`的回调将总是在任何定时器之前被执行，而与有多少定时器无关。

## process.nextTick()

### 理解process.nextTick()

你可能已经注意到尽管`process.nextTick()`是异步API的一部分，但上面的图表中并没有出现`process.nextTick()`。这是因为从技术上来说`process.nextTick()`并不是事件循环的一部分。相反地，`nextTickQueue`将会早当前操作完成之后立即被处理，而不管当前处于事件循环的哪个阶段。

回顾一下上面的图表，任何时刻你在一个给定的阶段调用`process.nextTick()`，则所有被传入`process.nextTick()`的回调将在事件循环继续往下执行前被执行。这可能会导致一些很糟的情形，因为它允许用户递归调用`process.nextTick()`来饿死I/O进程，这会导致事件循环永远无法到达轮询阶段。

### 为了允许使用process.nextTick()？

为什么`process.nextTick()`这样的API会被允许出现在Node.js中呢？一部分原因是因为设计理念，Node.js中的API应该总是异步的，即使是那些不需要异步的地方。下面的代码片段展示了一个例子：

```javascript
function apiCall(arg, callback) {
  if (typeof arg !== 'string')
    return process.nextTick(callback, new TypeError('argument should be string'));
}
```

上面的代码检查参数，如果检查不通过，它将一个错误对象传给回调。API最近进行了更新以允许向`process.nextTick()`中传递参数来作为回调函数的参数，而不必写嵌套函数。

我们所做的就是将一个错误传递给用户，但这只允许在用户代码被执行完毕后执行。使用`process.nextTick()`我们可以保证`apiCall()`的回调总是在用户代码被执行后，且在事件循环继续工作前被执行。为了达到这一点，JS调用栈被允许展开，然后立即执行所提供的回调，该回调允许用户对`process.nextTick()`进行递归调用，而不会达到RangeError：即V8调用栈的最大值。

这种设计理念会导致一些潜在的问题，观察下面的代码片段：

```javascript
let bar;

// this has an asynchronous signature, but calls callback synchronously
function someAsyncApiCall(callback) { callback(); }

// the callback is called before `someAsyncApiCall` completes.
someAsyncApiCall(() => {
  // since someAsyncApiCall has completed, bar hasn't been assigned any value
  console.log('bar', bar); // undefined
});

bar = 1;
```

用户定义函数`someAsyncApiCall()`有一个异步签名，但实际上它是同步执行的。当它被调用时，提供给`someAsyncApiCall()`的回调函数会在与执行`someAsyncApiCall()`本身的同一个事件循环阶段被执行，因为`someAsyncApiCall()`实际上并未执行任何异步操作。结果就是，即使回调函数尝试引用变量`bar`，但此时在作用域中并没有改变量。因为程序还没运行到对`bar`赋值的部分。

通过将回调放到`process.nextTick()`中，程序依然可以执行完毕，且所有的变量、函数等都在执行回调之前被初始化。它还具有不会被事件循环打断的优点。这对于那些需要再事件循环继续往下执行之前报告一个错误的用户非常实用。以下是将上面的例子改用`process.nextTick()`的代码：

```javascript
let bar;

function someAsyncApiCall(callback) {
  process.nextTick(callback);
}

someAsyncApiCall(() => {
  console.log('bar', bar); // 1
});

bar = 1;
```

这里还有另一个现实中的例子：

```javascript
const server = net.createServer(() => {}).listen(8080);

server.on('listening', () => {});
```

当只传入一个端口号时，端口号被立即绑定。因此，可以立即调用'listening'回调。这里的问题是，`.on('listening')`回调将不会被设置。

为了绕过这个问题，'listening'事件被放入`nextTick() `的一个队列中，以允许程序运行至结束。这允许用户设置任何它们想要的事件处理程序。

## process.nextTick() vs setImmediate()

对于用户来说，这两个名字很相似，但它们的名字让人感到困惑。

* `process.nextTick()`中的回调在事件循环的当前阶段中被立即执行。
* `setImmediate()`中的回调在事件循环的下一次迭代或'tick'中被执行。

本质上，它们两个的名字应该互相调换一下。`process.nextTick()`的执行时机比`setImmediate()`要更及时，但这属于历史问题，现在已经不可改变。实施这项改变将导致很多npm包无法使用。每天都有很多新模块被加入，这意味着每等待一天，就会有更多潜在的破坏发生。虽然他们的名字相互混淆，但将它们调换名字这种事是不会发生的。

我们建议开发者在所有地方使用`setImmediate()`，因为它更容易理解（并且它可以使代码的兼容性更好，比如和浏览器环境的JS）。

## 为什么使用process.nextTick()？

有两个主要原因：

* 允许用户处理错误，清理任何不再需要的资源，或者在事件循环继续执行之前重试请求。
* 有时确实需要展开调用栈，并在事件循环继续执行之前执行回调。

看一个简单的例子：

```javascript
const server = net.createServer();
server.on('connection', (conn) => { });

server.listen(8080);
server.on('listening', () => { });
```

`listen()`在事件循环的开始被执行，但监听的回调却被放在`setImmediate()`中。除非传入主机名，否则端口绑定将立即发生。事件循环继续进行，将到达轮询阶段，这意味着连接成功事件有机会被处理。

另一个例子是执行函数构造函数，即，继承自`EventEmitter`且在构造函数中发射一个事件：

```javascript
const EventEmitter = require('events');
const util = require('util');

function MyEmitter() {
  EventEmitter.call(this);
  this.emit('event');
}
util.inherits(MyEmitter, EventEmitter);

const myEmitter = new MyEmitter();
myEmitter.on('event', () => {
  console.log('an event occurred!');
});
```

你无法在构造函数中立即发射一个事件，因为此时程序还未运行到将回调赋值给事件的的那段代码。因此，在构造函数内部，你可以使用`process.nextTick()`设置一个回调以在构造函数执行完毕后发射事件，下面的代码满足我们的预期：

```javascript
const EventEmitter = require('events');
const util = require('util');

function MyEmitter() {
  EventEmitter.call(this);

  // use nextTick to emit the event once a handler is assigned
  process.nextTick(() => {
    this.emit('event');
  });
}
util.inherits(MyEmitter, EventEmitter);

const myEmitter = new MyEmitter();
myEmitter.on('event', () => {
  console.log('an event occurred!');
});
```