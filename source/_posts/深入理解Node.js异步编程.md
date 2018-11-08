---
title: 深入理解Node.js异步编程
date: 2018-11-04
tags: [js, node]
categories: 编程语言
---

本文将深入解析node.js的异步世界（请准备好瓜子和可乐，本文比较长）。

<!--more-->


## 写在阅读之前

开发者需要注意区分JavaScript和JavaScript运行时（宿主环境）这两个概念。严格来说，JavaScript单纯指这门编程语言，没有其他附加的含义。对于宿主环境，如果是Web前端开发，默认是浏览器，如果是Node.js，则指的是node.js运行时。不同的宿主环境有很大区别，比如浏览器和node.js的事件循环机制就有所区别。另外像`console`这个对象（没错，就是你经常用的console.log的那个console）也是由宿主环境提供的，它并不是JavaScript的一部分。

本文主要探讨的是node.js中的异步编程，虽然浏览器或其他宿主环境中的异步编程和node.js有很多相似的地方，但是为了不产生歧义或误导这里还是明确指出具体的宿主环境。


## 并发模型和事件循环

由于JavaScript是单线程运行的，因此它天生是异步的。试想如果一个单线程的程序是同步执行的，一旦有调用阻塞线程，线程就挂起了。对应到现实中的会发现，浏览器因为一个HTTP请求而无法响应用户操作。在使用JavaScript时（不论在哪个宿主环境），都要牢记它是单线程运行的，这个概念非常重要。

大部分使用node.js的人都被它的“异步非阻塞”特性所吸引，一些I/O密集型的应用在使用异步非阻塞的实现后，性能可以有很大的提升，而且应用所占用的资源还比原来采用同步方式编程的低得多。在语言级别，由于是单线程运行，所以完全不存在线程间同步这种麻烦事。

Node.js的并发模型基于事件循环(Event Loop)。下面是一个最简单的事件循环模型：

```javascript
while (queue.waitForMessage()) {
  queue.processNextMessage();
}
```

这是一个无限while循环，当事件队列中有未处理的消息时，就取出一个消息来处理，否则就一直等待直到有队列中有消息。

为了解释Node.js的事件循环，这里直接引用我翻译的Node.js官方文档中对其事件循环的描述[(译)深入理解Node.js的事件循环、定时器和process.nextTick()](/2018/10/11/[译]深入理解Node.js的事件循环、定时器和process.nextTick/)。


## JavaScript异步编程的几种常见模式

### 回调函数(callback)

回调函数是最基本的一种异步调用模式，回调函数会在异步操作完成之后被调用。下面试一个简单的Node.js中异步读取文件的例子：

```javascript
// readFileCallback.js
const fs = require('fs');

fs.readFile('a.txt', (err, data) => {
  if (err) {
    throw err;
  }
  console.log(data.toString());
});

console.log('foo');
```

运行结果如下：

```shell
$ babel-node readFile.js
foo
file a content
```

`foo`被先打印出来，接着等文件读取完毕，打印出文件内容`file a content`，可以看到读取文件这个操作并不会阻塞当前进程。因为Node.js运行时直接从`fs.readFile`中返回，继续往下运行。

再看一个定时器的例子：

```javascript
// timerCallback.js
const fn = () => {
  console.log(1);
};

setTimeout(fn, 3000);
console.log(2);
```

运行这段代码会发现运行后控制台立即打印出2，接着在大约3000毫秒后，控制台打印出1。这个例子再次体现了Node.js的异步特性。

我们再来看看在同步模式中写代码的场景。假设用户想要读取一个文件，由于读取文件（内部是一个系统调用，需要陷入内核）是一个耗时操作（文件比较大或者使用机械硬盘的时候的尤其耗时），因此在同步模式下，这个读取操作会阻塞当前进程（假设目前没有使用多线程），当前进程将被挂起。当前进程的其他代码在该读取操作完成之前无法被执行，如果这个文件的读取需要耗费1秒，则当前进程就要被阻塞1秒，也就是说宝贵的CPU资源在程序运行的时候要被白白浪费1秒。不要小看这1秒，1秒的CPU资源在程序在运行的时候是非常宝贵的。

如果我们想要使用回调函数的方式`按顺序`读取两个文件，再打印出它们的内容就要嵌套使用回调函数了：

```javascript
// nestReadFileCallback.js
const fs = require('fs');

fs.readFile('a.txt', 'utf8', (err, data) => {
  console.log("a file content: " + data);
  fs.readFile('b.txt', 'utf8', (err, data) => {
    console.log("b file content: " + data);
  });
});
```

结果如下：

```shell
$ babel-node nestCallback.js
a file content: file a content
b file content: file b content
```

这里为了达到`异步串行`执行的目的，我们使用了嵌套回调。代码开始有点不清爽了，想象一下如果多个异步调用需要按一定顺序串行执行，例如后一次异步调用依赖前一次异步调用的数据，代码会是这个样子：

```javascript
// callback hell
doSomethingAsync1((err1, data1) => {
  doSomethingAsync2(data1, (err2, data2) => {
    doSomethingAsync3(data2, (err3, data3) => {
    	doSomethingAsync4(data3, (err4, data4) => {
    		doSomethingAsync5(data4, (err5, data5) => {
    		});
    	});
    });
  });
});
```

如果业务逻辑比较复杂，维护这种代码简直是噩梦，开发者把这种代码叫做callback hell（回调地狱）。那怎么办呢？我们可以使用Promise。

### Promise

ES 6中原生提供了Promise对象，Promise对象代表`某个未来才会知道结果的事件`(一般是一个异步操作)，换句话说，一个Pomise就是一个代表了异步操作最终完成或者失败的对象。Promise本质上是一个绑定了回调的对象，而不是像callback异步编程那样直接将回调传入函数内部。

Promise对外提供了统一的API，可供进一步处理。Promise的`最终`状态有两种：`fulfilled`和`reject`，`fulfilled`表示Promise处于完成状态，`reject`表示Promise处于被拒绝状态，这两种状态都是Promise的`已决议`状态，相反如果Promise还未被`决议`，它就处于`未决议`状态。

需要强调的一点是，Promise一经决议就无法改变其状态，这使得Promise和它的名字一样：君子一言驷马难追。

使用Promise对象可以用同步操作的流程写法来表达异步操作，避免了层层嵌套的异步回调，代码也更加清晰易懂，方便维护。用Promise重写读取文件的例子：

```javascript
// promiseReadSingleFile.js
const fs = require('fs')

const read = filename => {
  return new Promise((resolve, reject) => {
    fs.readFile(filename, 'utf8', (err, data) => {
    	if (err){
    		reject(err);
    	}
    	resolve(data);
    });
  });
}
    
read('a.txt')
.then(data => {
  console.log(data);
}, err => {
  console.error("err: " + err);
});
```

如果有多个异步操作需要串行执行，且后一个操作需要拿到前一个操作的结果，我们可以在Promise上使用链式调用(Promise chain)，下面是顺序读取两个文件的例子：

```javascript
// promiseReadMultiFiles.js
const fs = require('fs')

const read = filename => {
  return new Promise((resolve, reject) => {
    fs.readFile(filename, 'utf8', (err, data) => {
    	if (err){
    		reject(err);
    	}
    	resolve(data);
    });
  });
}

read('a.txt')
.then(data => {
  console.log(data);
  return read('b.txt'); // 注意这里：在then中返回一个Promise
}, err => {
  console.error("err: " + err);
})
.then(data => {
  console.log(data);
}, err => {
  console.error("err: " + err);
});
```

现在可以大致总结一下用Promise写串行异步程序的基本模式：

```javascript

func1()
.then(result1 => {
  return func2(result1);
})
.then(result2 => {
  return func3(result2);
})
.then(result3 => {
  return func4(result3);
})
.catch(err => {
  // handle error
})
```

then里的参数是可选的，这里的`.catch(errCallback)`其实是`then(null, errCallback)`的缩写形式。需要注意的是，如果想要在then的fulfilled中获取上一个Promise中的结果，上一个Promise中必要显式返回结果。

catch之后还可以继续链式调用：

```javascript
// catch1.js
new Promise((resolve, reject) => {
  console.log('Initial');
  resolve();
})
.then(() => {
  throw new Error('Something failed');
  console.log('Do something'); // never reach here!
})
.catch(() => {
  console.error('Catch error');
})
.then(() => {
  console.log('Do this whatever happened before');
});
```

运行结果如下：

```shell
$ babel-node catch1.js
Initial
Catch error
Do this whatever happened before
```

一个Promise链式调用在遇到错误时会立即停止，此时如果在该出错的then之后有catch（不管这个catch是否紧跟在出错then之后），这个catch里的errCallback都会被调用，出错then和catch中间的所有then都会被忽略：

```javascript
// catch2.js
new Promise((resolve, reject) => {
  console.log('Initial');
  resolve();
})
.then(() => {
  throw new Error('Something failed');
  console.log('Do this'); // never reach here!
})
.then(() => {
  console.log('Skip this'); // never reach here!
})
.catch(() => {
  console.error('Catch error');
})
.then(() => {
  console.log('Final');
})
```

运行结果如下：

```shell
$ babel-node catch2.js
Initial
Catch error
Final
```

在实际编程中，如果我们将一系列异步操作使用Promise链串行执行，意味着这一串操作是一个整体。一旦整体操作中的某个步骤出错，都不应该继续执行下去了。此时我们可以把catch放在Promise链的最后：

```javascript
// catch3.js
new Promise((resolve, reject) => {
  console.log('Initial');
  resolve();
})
.then(() => {
  console.log('Do something 1');
})
.then(() => {
  throw new Error('Do something 2 failed');
  console.log('Do something 2'); // never reach here!
})
.then(() => {
  console.log('Do something 3'); // never reach here!
})
.catch((err) => {
  console.error(`Catch error: ${err}`);
})
```

运行结果如下：

```shell
$ babel-node catche.js
Initial
Do something 1
Catch error: Error: Do something 2 failed
```

这么做的好处显而易见，这符合软件工程中的[Fail Fast](https://www.martinfowler.com/ieeeSoftware/failFast.pdf)。

#### 小练习

将setTimeout函数Promise化。

解析：

setTimeout是一个旧式的异步API，它接受一个回调和一个时间参数。在ES 6以后写异步代码，强烈不建议直接调用旧式的异步API，应该把这些API都包装成Promise，并且永远不要在业务代码中直接调用这些旧式异步API。为什么不建议这么做？一个很重要的原因对异常的捕获会有问题：

```javascript
// setTimeoutError.js
const fn = () => {
  throw new Error('This is an error!');
};

try {
  setTimeout(fn, 1000);
} catch (err) {
  console.error(err); // never reach here!
}
```

这里try/catch块无法捕获到`fn`中的异常。

参考代码：

```javascript
// timerPromise.js
const delay = time => {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, time);
  });
};

delay(5000)
.then(() => {
  console.log('here');
})

console.log('hello');
```

运行这段代码，`hello`会被立即打印，`here`会在大约5000毫秒后被打印：

```shell
$ babel-node timerPromise.js
hello
here
```

回到刚才说到的异常捕获问题，将setTimeout包装成Promise后，我们就可以捕获到异常了：

```javascript
// timerPromiseCatch.js
const delay = time => {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, time);
  });
};

delay(5000)
.then(() => {
  throw new Error('This is an error!');
})
.catch(err => {
  console.error(err); // Error: This is an error!
})
```

#### Promise API

##### Promise.resolve() 和 Promise.reject()

使用Promise.resolve()可以立即得到一个已经resolve的Promise，这里有两种情况，如果入参本身就是一个Promise，则Promise.resolve()原样返回这个Promise，如果入参是一个立即值（比如一个整型），那么Promise.resolve()会将这个立即值包装成Promise然后返回：

```javascript
// promiseResolve.js
const p1 = Promise.resolve(100);
console.log(p1); // Promise { 100 }

const p2 = new Promise((resolve, reject) => {
  resolve(200);
});
console.log(p2); // Promise { 200 }

const p3 = Promise.resolve(p2);
console.log(p3); // Promise { 200 }
console.log(p2 === p3); // true
```

使用Promise.reject()则是可以立即得到一个已经reject的Promise，其使用方式和Promise.resolve()类似。

##### Promise.all()

Promise.all()接受一个Promise的数组，而且会`并行地`处理数组中的所有Promise：

```javascript
// promiseAll.js
const fs = require('fs')

const read = filename => {
  return new Promise((resolve, reject) => {
    fs.readFile(filename, 'utf8', (err, data) => {
    	if (err){
    		reject(err);
    	}
    	resolve(data);
    });
  });
};

const p1 = read('a.txt');
const p2 = read('b.txt');

const results = Promise.all([p1, p2]);
results
.then(data => {
  console.log(data); // [ 'file a content', 'file b content' ]
})
```

Promise.all()会返回一个promise，这个promise会收到一个完成消息，这是一个由所有传入的promise的完成消息组成的数组，该数组中元素的顺序与传入时的元素顺序一致，与每个promise的完成时间无关。从Promise.all()返回的这个promise只有在所有的成员promise`完成`后才会完成。如果这些成员promise中有一个被拒绝的话，Promise.all()返回的promise就会立即被拒绝，并丢弃所有其他promise的全部结果。

看一个例子，如果其中某个promise决议后为拒绝状态：

```javascript
// promiseAllWithReject.js
const fs = require('fs')

const read = filename => {
  return new Promise((resolve, reject) => {
    fs.readFile(filename, 'utf8', (err, data) => {
    	if (err){
    		reject(err);
    	}
    	resolve(data);
    });
  });
};

const p1 = read('a.txt');
const p2 = read('b.txt');
const p3 = new Promise((resolve, reject) => {
  reject(new Error('This is an error!'));
});

const results = Promise.all([p1, p2, p3]);
results
.then(data => {
  console.log(data); // never reach here!
}, err => {
  console.error(err); // Error: This is an error!
});
```

请记住为每个promise都关联一个拒绝处理函数。

刚才提到只有Promise.all()中的所有成员promise都已完成，其返回的promise的状态返回是已完成。也就是说，Promise.all()调用的完成时间取决于最慢完成的那个promise。一个简单的例子：

```javascript
// promiseAllTime.js
const delay = time => {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, time);
  });
};

const p1 = delay(1000);
const p2 = delay(5000);

const start = new Date().getTime();
const p = Promise.all([p1, p2]);

p
.then(data => {
  const end = new Date().getTime();
  console.log(`Time consuming: ${end - start}ms`);
});
```

运行结果：

```shell
$ babel-node promiseAllTime.js
Time consuming: 5002ms
```

简而言之，Promise.all()会协调所有promise的运行。

##### Promise.race()

Promise.race()接收一个promise数组，这些promise之间是`竞争`关系，哪个先完成就返回哪个：

```javascript
// promiseRace.js
const delay = time => {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, time);
  });
};

const p1 = new Promise((resolve, reject) => {
  delay(1000).then(data => {
    return resolve(100);
  })
});

const p2 = new Promise((resolve, reject) => {
  delay(5000).then(data => {
    return resolve(200);
  })
});

const start = new Date().getTime();
const p = Promise.race([p1, p2]);

p
.then(data => {
  console.log(data); // 100
  const end = new Date().getTime();
  console.log(`Time consuming: ${end - start}ms`);
});
```

这里p1和p2各延迟了1000ms和5000ms，分别返回100和200，使用Promise.race()只会得到先完成的p1的值，而p2会被丢弃。

Promise.race()的一种典型用法就是为一个可能耗时较长的异步操作设置一个超时，如果我们希望针对某个异步操作设置一个超时时间，如果超时了，就拒绝这个异步操作的状态，可以这么处理：

```javascript
// promiseRaceTimeout.js
const delay = time => {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, time);
  });
};

const timeout = time => {
  return new Promise((resolve, reject) => {
    const err = new Error('Time out!');
    setTimeout(() => {
      reject(err);
    }, time);
  });
};

const p1 = new Promise((resolve, reject) => {
  delay(1000).then(data => {
    return resolve(100);
  })
});

const p2 = new Promise((resolve, reject) => {
  delay(5000).then(data => {
    return resolve(200);
  })
});

const p = Promise.race([p1, timeout(3000)]);
p
.then(data => {
  console.log(data); // 100
}, err => {
  console.error(err);
});

const p_ = Promise.race([p2, timeout(3000)]);
p_
.then(data => {
  console.log(data);
}, err => {
  console.error(err); // Error: Time out!
});
```

这里p1需要1000ms才能完成，p2需要5000ms，超时定时器统一设置成了3000ms，因此`Promise.race([p1, timeout(3000)])`会得到已经完成的p1的值（100），`Promise.race([p2, timeout(3000)])`会得到一个超时的结果，在then的reject中可以拿到这个异常。当然，如果在超时定时器超时之前已经有promise被拒绝的话，Promise.race()会直接变成拒绝状态。

Promise API还有其他几个变体：

* Promise.none() 和Promise.all()相反，要求所有promise都要被拒绝，然后将拒绝转化成完成值。
* Promise.any() 会忽略拒绝，只要有一个promise完成，整体的状态即为完成。
* Promise.first() 只要第一个promise完成，它就会忽略后续promise的任何完成和拒绝。
* Promise.last() 类似于Promise.first()，但条件变为只有最后一个promise完成胜出。

对这个四个Promise API有兴趣的可以自己做做实验，这里不再深入讲解。

##### then()和catch()

刚才已经提到过，使用then()和catch()可以形成Promise调用链，这里快速总结一下它们的使用方法：

* p.then(fulfilled);
* p.then(fulfilled, rejected);
* p.catch(rejected); // 等价于 p.then(null, rejected);

#### 包装旧式异步API

可能项目中有一些遗留代码还在使用旧式异步API，如果我们要将这部分代码Promise化，最好是有比较好用的工具，下面的polyfill可以帮助你Promise化旧式异步API：

```javascript
// promiseWrapper.js
const promiseWrapper = fn => {
  return function () {
    const args = [].slice.call(arguments); // convert arguments to a real array
    return new Promise((resolve, reject) => {
      const cb = (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      };
      fn.apply(null, args.concat(cb));
    });
  };
};
```

测试一下：

```javascript
// promiseWrapper.js
const fs = require('fs');

const read = promiseWrapper(fs.readFile);

read('a.txt', 'utf8')
.then(data => {
  console.log(data);
}, err => {
  console.error(err);
})
```

read是经过Promise化的fs.readFile，调用read会返回一个Promise，一切和我们想象的一致。不过这样用有一个前提条件，原来的旧式异步API必须是[error-first](http://nodejs.cn/api/errors.html#errors_error_first_callbacks)的，好消息是大多数Node.js核心API都是error-first的。

#### Promise的局限性

// todo


### Generator函数

// todo

## 常用的异步编程库

[async](https://github.com/caolan/async)
[bluebird](https://github.com/petkaantonov/bluebird)


## 更多信息

[(译)深入理解Node.js的事件循环、定时器和process.nextTick()](./(译)深入理解Node.js的事件循环、定时器和process.nextTick().md)
[Fail Fast](https://www.martinfowler.com/ieeeSoftware/failFast.pdf)
[error-first](http://nodejs.cn/api/errors.html#errors_error_first_callbacks)
