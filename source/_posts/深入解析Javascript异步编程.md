---
title: 深入解析Javascript异步编程
date: 2018-03-03
tags: [js]
categories: 编程语言
---

这里深入探讨下Javascript的异步编程技术。

<!--more-->

## Javascript异步编程简介

至少在语言级别上，Javascript是单线程的，因此异步编程对其尤为重要。

拿nodejs来说，外壳是一层js语言，这是用户操作的层面，在这个层次上它是单线程运行的，也就是说我们不能像Java、Python这类语言在语言级别使用多线程能力。取而代之的是，nodejs编程中大量使用了异步编程技术，这是为了高效使用硬件，同时也可以不造成同步阻塞。不过nodejs在底层实现其实还是用了多线程技术，只是这一层用户对用户来说是透明的，nodejs帮我们做了几乎全部的管理工作，我们不用担心锁或者其他多线程编程会遇到的问题，只管写我们的异步代码就好。

Javascript异步编程方法

ES 6以前：

* 回调函数
* 事件监听(事件发布/订阅)
* Promise对象

ES 6：

* Generator函数(协程coroutine)

ES 7:

* async和await

PS:如要运行以下例子，请安装node v0.11以上版本，在命令行下使用 node [文件名.js] 的形式来运行，有部分代码需要开启特殊选项，会在具体例子里说明。

### 1.回调函数

回调函数在Javascript中非常常见，一般是需要在一个耗时操作之后执行某个操作时可以使用回调函数。

example 1:

```js
//一个定时器
function timer(time, callback){
    setTimeout(function(){
    	callback();
    }, time);
}
    
timer(3000, function(){
    console.log(123);
})
```

example 2:

```js
//读文件后输出文件内容
var fs = require('fs');

fs.readFile('./text1.txt', 'utf8', function(err, data){
    if (err){
    	throw err;
    }
    console.log(data);
});   
```

example 3:

```js
//嵌套回调，读一个文件后输出，再读另一个文件，注意文件是有序被输出的，先text1.txt后text2.txt
var fs = require('fs');

fs.readFile('./text1.txt', 'utf8', function(err, data){
    console.log("text1 file content: " + data);
    fs.readFile('./text2.txt', 'utf8', function(err, data){
    	console.log("text2 file content: " + data);
    });
});
```

example 4:

```js
//callback hell
doSomethingAsync1(function(){
    doSomethingAsync2(function(){
    	doSomethingAsync3(function(){
    		doSomethingAsync4(function(){
    			doSomethingAsync5(function(){
    			});
    		});
    	});
    });
 });
```

通过观察以上4个例子，可以发现一个问题，在回调函数嵌套层数不深的情况下，代码还算容易理解和维护，一旦嵌套层数加深，就会出现“回调金字塔”的问题，就像example 4那样，如果这里面的每个回调函数中又包含了很多业务逻辑的话，整个代码块就会变得非常复杂。从逻辑正确性的角度来说，上面这几种回调函数的写法没有任何问题，但是随着业务逻辑的增加和趋于复杂，这种写法的缺点马上就会暴露出来，想要维护它们实在是太痛苦了，这就是“回调地狱(callback hell)”。

一个衡量回调层次复杂度的方法是，在example 4中，假设doSomethingAsync2要发生在doSomethingAsync1之前，我们需要忍受多少重构的痛苦。

回调函数还有一个问题就是我们在回调函数之外无法捕获到回调函数中的异常，我们以前在处理异常时一般这么做：

example 5:

```js
try{
    //do something may cause exception..
}
catch(e){
    //handle exception...
}	
```

在同步代码中，这没有问题。现在思考一下下面代码的执行情况：

example 6:

```js
var fs = require('fs');

try{
    fs.readFile('not_exist_file', 'utf8', function(err, data){
    	console.log(data);
    });
}
catch(e){
    console.log("error caught: " + e);
}
```

你觉得会输出什么？答案是undefined。我们尝试读取一个不存在的文件，这当然会引发异常，但是最外层的try/catch语句却无法捕获这个异常。这是异步代码的执行机制导致的。

Tips: 为什么异步代码回调函数中的异常无法被最外层的try/catch语句捕获?

异步调用一般分为两个阶段，提交请求和处理结果，这两个阶段之间有事件循环的调用，它们属于两个不同的事件循环(tick)，彼此没有关联。

异步调用一般以传入callback的方式来指定异步操作完成后要执行的动作。而异步调用本体和callback属于不同的事件循环。

try/catch语句只能捕获当次事件循环的异常，对callback无能为力。

也就是说，一旦我们在异步调用函数中扔出一个异步I/O请求，异步调用函数立即返回，此时，这个异步调用函数和这个异步I/O请求没有任何关系。

### 2.事件监听(事件发布/订阅)

事件监听是一种非常常见的异步编程模式，它是一种典型的逻辑分离方式，对代码解耦很有用处。通常情况下，我们需要考虑哪些部分是不变的，哪些是容易变化的，把不变的部分封装在组件内部，供外部调用，需要自定义的部分暴露在外部处理。从某种意义上说，事件的设计就是组件的接口设计。

example 7:

```js
//发布和订阅事件

var events = require('events');
var emitter = new events.EventEmitter();
    
emitter.on('event1', function(message){
    console.log(message);
});
    
emitter.emit('event1', "message for you");
```

这种使用事件监听处理的异步编程方式很适合一些需要高度解耦的场景。例如在之前一个游戏服务端项目中，当人物属性变化时，需要写入到持久层。解决方案是先写一个订阅方，订阅'save'事件，在需要保存数据时让发布方对象(这里就是人物对象)上直接用emit发出一个事件名并携带相应参数，订阅方收到这个事件信息并处理。

### 3.Promise对象

ES 6中原生提供了Promise对象，Promise对象代表了某个未来才会知道结果的事件(一般是一个异步操作)，并且这个事件对外提供了统一的API，可供进一步处理。

使用Promise对象可以用同步操作的流程写法来表达异步操作，避免了层层嵌套的异步回调，代码也更加清晰易懂，方便维护。

#### Promise.prototype.then()

Promise.prototype.then()方法返回的是一个新的Promise对象，因此可以采用链式写法，即一个then后面再调用另一个then。如果前一个回调函数返回的是一个Promise对象，此时后一个回调函数会等待第一个Promise对象有了结果，才会进一步调用。

example 8:

```js
//ES 6原生Promise示例
const fs = require('fs')

const read = function (filename){
  const promise = new Promise(function(resolve, reject){
    fs.readFile(filename, 'utf8', function(err, data){
    	if (err){
    		reject(err);
    	}
    	resolve(data);
    });
  });
  return promise;
}
    
read('a.txt')
.then(function(data){
  console.log(data);
}, function(err){
  console.log("err: " + err);
});
```

```shell
$ babel-node promise.js
file a content
```

以上代码中，read函数是Promise化的，在read函数中，实例化了一个Promise对象，Promise的构造函数接受一个函数作为参数，这个函数的两个参数分别是resolve方法和reject方法。如果异步操作成功，就是用resolve方法将Promise对象的状态从“未完成”变为“完成”(即从pending变为resolved)，如果异步操作出错，则是用reject方法把Promise对象的状态从“未完成”变为“失败”(即从pending变为rejected)，read函数返回了这个Promise对象。Promise实例生成以后，可以用then方法分别指定resolve方法和reject方法的回调函数。

上面这个例子，Promise构造函数的参数是一个函数，在这个函数中我们写异步操作的代码，在异步操作的回调中，我们根据err变量来选择是执行resolve方法还是reject方法，一般来说调用resolve方法的参数是异步操作获取到的数据(如果有的话)，但还可能是另一个Promise对象，表示异步操作的结果有可能是一个值，也有可能是另一个异步操作，调用reject方法的参数是异步回调用的err参数。

调用read函数时，实际上返回的是一个Promise对象，通过在这个Promise对象上调用then方法并传入resolve方法和reject方法来指定异步操作成功和失败后的操作。

example 9:

```js
//原生Primose顺序嵌套回调示例

var fs = require('fs')

var read = function (filename){
    var promise = new Promise(function(resolve, reject){
    	fs.readFile(filename, 'utf8', function(err, data){
    		if (err){
    			reject(err);
    		}
    		resolve(data);
    	})
    });
    return promise;
}
    
read('./text1.txt')
.then(function(data){
    console.log(data);
    return read('./text2.txt');
})
.then(function(data){
    console.log(data);
});
```

在Promise的顺序嵌套回调中，第一个then方法先输出text1.txt的内容后返回read('./text2.txt')，注意这里很关键，这里实际上返回了一个新的Promise实例，第二个then方法指定了异步读取text2.txt文件的回调函数。这种形似同步调用的Promise顺序嵌套回调的特点就是有一大堆的then方法，代码冗余略多。

### 异常处理

#### Promise.prototype.catch()

Promise.prototype.catch方法是Promise.prototype.then(null, rejection)的别名，用于指定发生错误时的回调函数。

example 9:

```js
var fs = require('fs')

var read = function (filename){
    var promise = new Promise(function(resolve, reject){
    	fs.readFile(filename, 'utf8', function(err, data){
    		if (err){
    			reject(err);
    		}
    		resolve(data);
    	})
    });
    return promise;
}
    
read('./text1.txt')
.then(function(data){
    console.log(data);
    return read('not_exist_file');
})
.then(function(data){
    console.log(data);
})
.catch(function(err){
    console.log("error caught: " + err);
})
.then(function(data){
    console.log("completed");
})
```

使用Promise对象的catch方法可以捕获异步调用链中callback的异常，Promise对象的catch方法返回的也是一个Promise对象，因此，在catch方法后还可以继续写异步调用方法。这是一个非常强大的能力。

如果在catch方法中发生了异常：

example 10:

```js
var fs = require('fs')

var read = function (filename){
    var promise = new Promise(function(resolve, reject){
    	fs.readFile(filename, 'utf8', function(err, data){
    		if (err){
    			reject(err);
    		}
    		resolve(data);
    	})
    });
    return promise;
}
    
read('./text1.txt')
.then(function(data){
    console.log(data);
    return read('not_exist_file');
})
.then(function(data){
    console.log(data);
})
.catch(function(err){
    console.log("error caught: " + err);
    x+1;
})
.then(function(data){
    console.log("completed");
})
```

在上述代码中，x+1会抛出一个异常，但是由于后面没有catch方法了，导致这个异常不会被捕获，而且也不会传递到外层去，也就是说这个异常就默默发生了，没有惊动任何人。

我们可以在catch方法后再加catch方法来捕获这个x+1的异常：

example 11:

```js
var fs = require('fs')

var read = function (filename){
    var promise = new Promise(function(resolve, reject){
    	fs.readFile(filename, 'utf8', function(err, data){
    		if (err){
    			reject(err);
    		}
    		resolve(data);
    	})
    });
    return promise;
}
    
read('./text1.txt')
.then(function(data){
	console.log(data);
	return read('not_exist_file');
})
.then(function(data){
	console.log(data);
})
.catch(function(err){
	console.log("error caught: " + err);
	x+1;
})
.catch(function(err){
	console.log("error caught: " + err);
})
.then(function(data){
	console.log("completed");
})
```

### Promise异步并发

如果几个异步调用有关联，但它们不是顺序式的，是可以同时进行的，我们很直观地会希望它们能够并发执行(这里要注意区分“并发”和“并行”的概念，不要搞混)。

Promise.all()

Promise.all方法用于将多个Promise实例，包装成一个新的Promise实例。

    var p = Promise.all([p1,p2,p3]);

Promise.all方法接受一个数组作为参数，p1、p2、p3都是Promise对象实例。

p的状态由p1、p2、p3决定，分两种情况：

1. 只有p1、p2、p3的状态都变成fulfilled，p的状态才会变成fulfilled，此时p1、p2、p3的返回值组成一个数组，传递给p的回调函数。

2. 只要p1、p2、p3之中有一个被rejected，p的状态就变成rejected，此时第一个被reject的实例的返回值，会传递给p的回调函数。

一个具体的例子：

example 12:

```js
var fs = require('fs')

var read = function (filename){
	var promise = new Promise(function(resolve, reject){
		fs.readFile(filename, 'utf8', function(err, data){
			if (err){
				reject(err);
			}
			resolve(data);
		})
	});
	return promise;
}
    
var promises = [1, 2].map(function(fileno){
	return read('./text' + fileno + '.txt');
});
    
Promise.all(promises)
.then(function(contents){
    console.log(contents);
})
.catch(function(err){
	console.log("error caught: " + err);
})
```

上述代码会并发执行读取text1.txt和text2.txt的操作，当两个文件都读取完毕时，输出它们的内容，contents是一个数组，每个元素对应promises数组的执行结果 (顺序完全一致)，在这里就是text1.txt和text2.txt的内容。

#### Promise.race()

Promise.race()也是将多个Promise实例包装成一个新的Promise实例：

```js
var p = Promise.race([p1,p2,p3]);
```

上述代码中，p1、p2、p3只要有一个实例率先改变状态，p的状态就会跟着改变，那个率先改变的Promise实例的返回值，就传递给p的返回值。如果Promise.all方法和Promise.race方法的参数不是Promise实例，就会先调用下面讲到的Promise.resolve方法，将参数转为Promise实例，再进一步处理。

example 13:

```js
var http = require('http');  
var qs = require('querystring');  
    
var requester = function(options, postData){
	var promise = new Promise(function(resolve, reject){
		var content = "";
		var req = http.request(options, function (res) {
			res.setEncoding('utf8');

			res.on('data', function (data) {
				onData(data);
			});

			res.on('end', function () {
				resolve(content);
			});

			function onData(data){
				content += data;
			}
		});

		req.on('error', function(err) {
			reject(err);
		});

		req.write(postData);
		req.end();
	});

	return promise;
}
    
var promises = ["柠檬", "苹果"].map(function(keyword){
	var options = {
		hostname: 'localhost',  
		port: 9200,  
		path: '/meiqu/tips/_search',
		method: 'POST'  
	};
    
	var data = {
		'query' : {
    		'match' : {
        		'summary' : keyword
    		}
		}
	};
	data = JSON.stringify(data);
	return requester(options, data);
});
    
Promise.race(promises)
.then(function(contents) {
	var obj = JSON.parse(contents);
	console.log(obj.hits.hits[0]._source.summary);
})
.catch(function(err){
	console.log(err); 
});
```

#### Promise.resolve()

有时候需将现有对象转换成Promise对象，可以使用Promise.resolve()。

如果Promise.resolve方法的参数，不是具有then方法的对象（又称thenable对象），则返回一个新的Promise对象，且它的状态为fulfilled。

如果Promise.resolve方法的参数是一个Promise对象的实例，则会被原封不动地返回。

example 14:

```js
var p = Promise.resolve('Hello');

p.then(function (s){
	console.log(s)
});
```

#### Promise.reject()

Promise.reject(reason)方法也会返回一个新的Promise实例，该实例的状态为rejected。Promise.reject方法的参数reason，会被传递给实例的回调函数。

example 15:

```js
var p = Promise.reject('出错了');

p.then(null, function (s){
	console.log(s)
});
```

上面代码生成一个Promise对象的实例p，状态为rejected，回调函数会立即执行。

## 3.Generator函数

Generator函数是协程在ES 6中的实现，最大特点就是可以交出函数的执行权（暂停执行）。

在node中需要开启--harmony选项来启用Generator函数。

整个Generator函数就是一个封装的异步任务，或者说是异步任务的容器。异步操作需要暂停的地方，都用yield语句注明。

协程的运行方式如下：

第一步：协程A开始运行。
第二步：协程A执行到一半，暂停，执行权转移到协程B。
第三步：一段时间后，协程B交还执行权。
第四步：协程A恢复执行。

上面的协程A就是异步任务，因为分为两步执行。

比如一个读取文件的例子：

example 16:

```js
function asnycJob() {
	// ...其他代码
	var f = yield readFile(fileA);
	// ...其他代码
}
```

asnycJob函数是一个协程，yield语句表示，执行到此处执行权就交给其他协程，也就是说，yield是两个阶段的分界线。协程遇到yield语句就暂停执行，直到执行权返回，再从暂停处继续执行。这种写法的优点是，可以把异步代码写得像同步一样。

看一个简单的Generator函数例子：

example 17:

```js
function* gen(x){
	var y = yield x + 2;
	return y;
}
    
var g = gen(1);
var r1 = g.next(); // { value: 3, done: false }
console.log(r1);
var r2 = g.next() // { value: undefined, done: true }
console.log(r2);
```

需要注意的是Generator函数的函数名前面有一个"*"。

上述代码中，调用Generator函数，会返回一个内部指针(即遍历器)g，这是Generator函数和一般函数不同的地方，调用它不会返回结果，而是一个指针对象。调用指针g的next方法，会移动内部指针，指向第一个遇到的yield语句，上例就是执行到x+2为止。

换言之，next方法的作用是分阶段执行Generator函数。每次调用next方法，会返回一个对象，表示当前阶段的信息（value属性和done属性）。value属性是yield语句后面表达式的值，表示当前阶段的值；done属性是一个布尔值，表示Generator函数是否执行完毕，即是否还有下一个阶段。

### Generator函数的数据交换和错误处理

next方法返回值的value属性，是Generator函数向外输出数据；next方法还可以接受参数，这是向Generator函数体内输入数据。

example 18:

```js
function* gen(x){
	var y = yield x + 2;
  	return y;
}
    
var g = gen(1);
var r1 = g.next(); // { value: 3, done: false }
console.log(r1);
var r2 = g.next(2) // { value: 2, done: true }
console.log(r2);
```

第一个next的value值，返回了表达式x+2的值(3)，第二个next带有参数2，这个参数传入Generator函数，作为上个阶段异步任务的返回结果，被函数体内的变量y接收，因此这一阶段的value值就是2。

Generator函数内部还可以部署错误处理代码，捕获函数体外抛出的错误。

example 19:

```js
function* gen(x){
	try {
  		var y = yield x + 2;
	}
	catch (e){
  		console.log(e);
	}
	return y;
}
    
var g = gen(1);
g.next();
g.throw('error!');  //error!
```

下面是一个读取文件的真实异步操作的例子。

example 20:

```js
var fs = require('fs');
var thunkify = require('thunkify');
var readFile = thunkify(fs.readFile);
    
var gen = function* (){
	var r1 = yield readFile('./text1.txt', 'utf8');
	console.log(r1);
	var r2 = yield readFile('./text2.txt', 'utf8');
	console.log(r2);
};
    
//开始执行上面的代码
var g = gen();
    
var r1 = g.next();
r1.value(function(err, data){
	if (err) throw err;
	var r2 = g.next(data);
	r2.value(function(err, data){
		if (err) throw err;
		g.next(data);
	});
});
```

这就是一个基本的Generator函数定义和执行的流程。可以看到，虽然这里的Generator函数写的很简洁，和同步方法的写法很像，但是执行起来却很麻烦，流程管理比较繁琐。

在深入讨论Generator函数之前我们先要知道Thunk函数这个概念。

求值策略(即函数的参数到底应该何时求值)

1. 传值调用
2. 传名调用

Javascript是传值调用的，Thunk函数是编译器“传名调用”的实现，就是将参数放入一个临时函数中，再将这个临时函数放入函数体，这个临时函数就叫做Thunk函数。

举个栗子就好懂了：

example 21:

```js
function f(m){
	return m * 2;
}
    
var x = 1;
    
f(x + 5);
    
//等同于
    
var thunk = function (x) {
	return x + 5;
};
    
function f(thunk){
	return thunk() * 2;
}
```

Thunk函数本质上是`函数柯里化(currying)`，柯里化进行参数复用和惰性求值，这个是函数式编程的一些技巧，在js中，我们可以利用高阶函数实现函数柯里化。

JavaScript语言的Thunk函数

在JavaScript语言中，Thunk函数替换的不是表达式，而是多参数函数，将其替换成单参数的版本，且只接受回调函数作为参数。

example 22:

```js
var fs = require('fs');

// 正常版本的readFile（多参数版本）
fs.readFile(fileName, callback);
    
// Thunk版本的readFile（单参数版本）
var readFileThunk = Thunk(fileName);
readFileThunk(callback);
    
var Thunk = function (fileName){
	return function (callback){
		return fs.readFile(fileName, callback);
	};
};
```

任何函数，只要参数有回调函数，就能写成Thunk函数的形式。以下是一个简单的Thunk函数转换器：

example 23:

```js
var Thunk = function(fn){
	return function (){
		var args = Array.prototype.slice.call(arguments);
		return function (callback){
  			args.push(callback);
  			return fn.apply(this, args);
		}
	};
 };
```

从本质上说，我们借助了Javascript高阶函数来抽象了异步执行流程。

使用上面的转换器，生成fs.readFile的Thunk函数。

example 24:

```js
var readFileThunk = Thunk(fs.readFile);
readFileThunk('./text1.txt', 'utf8')(function(err, data){
	console.log(data);
});
```

可以使用thunkify模块来Thunk化任何带有callback的函数。

我们需要借助Thunk函数的能力来自动执行Generator函数。

下面是一个基于Thunk函数的Generator函数执行器。

example 25:

```js
//Generator函数执行器
function run(fn) {
    var gen = fn();
    
	function next(err, data) {
		var result = gen.next(data);
		if (result.done) return;
		result.value(next);
	}

	next();
}
    
run(gen);
```

我们马上拿这个执行器来做点事情。

example 26:

```js
var fs = require('fs');
var thunkify = require('thunkify');
var readFile = thunkify(fs.readFile);
    
var gen = function* (){
	var f1 = yield readFile('./text1.txt', 'utf8');
	console.log(f1);
	var f2 = yield readFile('./text2.txt', 'utf8');
	console.log(f2);
    var f3 = yield readFile('./text3.txt', 'utf8');
	console.log(f3);
};
    
function run(fn) {
	var gen = fn();

	function next(err, data) {
		var result = gen.next(data);
		if (result.done) return;
		result.value(next);
	}

	next();
}
    
run(gen);  //自动执行
```

现在异步操作代码的写法就和同步的写法一样了。实际上，Thunk函数并不是自动控制Generator函数执行的唯一方案，要自动控制Generator函数的执行过程，需要有一种机制，自动接收和交还程序的执行权，回调函数和Promise都可以做到(利用调用自身的一些特性)。

### yield *语句

普通的yield语句后面跟一个异步操作，yield *语句后面需要跟一个遍历器，可以理解为yield *后面要跟另一个Generator函数，讲起来比较抽象，看一个实例。

example 27:

```js
//嵌套异步操作流
var fs = require('fs');
var thunkify = require('thunkify');
var readFile = thunkify(fs.readFile);
    
var gen = function* (){
	var f1 = yield readFile('./text1.txt', 'utf8');
	console.log(f1);

	var f_ = yield * gen1(); //此处插入了另外一个异步流程

	var f2 = yield readFile('./text2.txt', 'utf8');
	console.log(f2);
	
	var f3 = yield readFile('./text3.txt', 'utf8');
	console.log(f3);
};
    
var gen1 = function* (){
	var f4 = yield readFile('./text4.txt', 'utf8');
	console.log(f4);
	var f5 = yield readFile('./text5.txt', 'utf8');
	console.log(f5);
}
    
function run(fn) {
	var gen = fn();

	function next(err, data) {
		var result = gen.next(data);
		if (result.done) return;
		result.value(next);
	}

	next();
}
    
run(gen);  //自动执行
```

上面这个例子会输出：

    1

    4

    5

    2

    3

也就是说，使用yield *可以在一个异步操作流程中直接插入另一个异步操作流程，我们可以据此构造可嵌套的异步操作流，更为重要的是，写这些代码完全是同步风格的。

目前业界比较流行的Generator函数自动执行的解决方案是co库，此处也只给出co的例子。顺带一提node-fibers也是一种解决方案。

顺序执行3个异步读取文件的操作，并依次输出文件内容：

example 28:

```js
var fs = require('fs');
var co = require('co');
var thunkify = require('thunkify');
var readFile = thunkify(fs.readFile);
    
co(function*(){
	var files=[
    	'./text1.txt',
      	'./text2.txt',
      	'./text3.txt'
 	];
 	
 	var p1 = yield readFile(files[0]);
 	console.log(files[0] + ' ->' + p1);

 	var p2 = yield readFile(files[1]);
	console.log(files[1] + ' ->' + p2);

 	var p3 = yield readFile(files[2]);
 	console.log(files[2] + ' ->' + p3);
     	
    return 'done';
});
```

并发执行3个异步读取文件的操作，并存储在一个数组中输出(顺序和文件名相同)：

example 29:

```js
var fs = require('fs');
var co = require('co');
var thunkify = require('thunkify');
var readFile = thunkify(fs.readFile);

co(function* () {
	var files = ['./text1.txt', './text2.txt', './text3.txt'];
	var contents = yield files.map(readFileAsync);

	console.log(contents);
});
    
function readFileAsync(filename) {
	return readFile(filename, 'utf8');
}
```

co库和我们刚才的run函数有点类似，都是自动控制Generator函数的流程。

## ES 7中的async和await

async和await是ES 7中的新语法，新到连ES 6都不支持，但是可以通过Babel一类的预编译器处理成ES 5的代码。目前比较一致的看法是async和await是js对异步的终极解决方案。

async函数实际上是Generator函数的语法糖(js最喜欢搞语法糖，包括ES 6中新增的“类”支持其实也是语法糖)。

配置Babel可以看：配置Babel

如果想尝个鲜，简单一点做法是执行 sudo npm install --global babel-cli

readFile.js代码如下：

```js
var fs = require('fs');

var readFile = function (fileName){
	return new Promise(function (resolve, reject){
		fs.readFile(fileName, function(error, data){
  			if (error) reject(error);
  				resolve(data);
			});
	});
};
    
var asyncReadFile = async function (){
	var f1 = await readFile('./text1.txt');
	var f2 = await readFile('./text2.txt');
	console.log(f1.toString());
	console.log(f2.toString());
};
    
asyncReadFile();
```

接着执行：babel-node readFile.js

输出：

    1
    2

光是这个例子还不足以理解async/await，接下来稍微深入一点。首先要注意的一个问题是，await只能用在async函数中，但async函数中未必一定要有await。

按照上面实例的写法，asyncReadFile函数中读取了两个文件text1.txt和text2.txt，这里是顺序读取的，如果用回调的方式写，其实是这样的：

```js
var asyncReadFile = function(cb){
	var res = {};
	fs.readFile('./text1.txt', function(error, data){
  		if (error) {
  			return cb(err);
  		}
  		res.f1 = data;
  		fs.readFile('./text1.txt', function(error, data){
  			if (error) {
  				return cb(err);
  			}
  			res.f2 = data;
  			return cb (null, res);
  		});
  	});
}
    
asyncReadFile(function(err, data){
	console.log(data.f1.toString());
	console.log(data.f2.toString());
);
```

以上代码先读取text1.txt，然后读取text2.txt，最后再输出两个文件的内容。

不知不觉就写了两层嵌套，如果需要顺序执行的异步调用更多，这样的代码简直无法直视，后期改需求或者重构会很痛苦。

所以现在我们知道了，readFile.js中的这种写法的异步调用是顺序执行的。可以再来看一个更加直观的例子，写一个async函数，里面去请求几个远端的API，在API中故意写成延迟一段时间后再返回响应，这里只截取关键代码：

node koa中间层：

```js
// 顺序异步执行
await baseService.request('test/test1');	
await baseService.request('test/test2');
await baseService.request('test/test3');
    
 await ctx.render('blog/hi', {});
```

后端API：

```js
'use strict';

var test1 = function(req, res) {
	res.header("Access-Control-Allow-Origin", "*");
	setTimeout(function(){
    	return res.json({result: 1, message: 'msg1'});
	}, 1000);
};
    
var test2 = function(req, res) {
	res.header("Access-Control-Allow-Origin", "*");
	setTimeout(function(){
    	return res.json({result: 1, message: 'msg2'});
	}, 2000);
};
    
var test3 = function(req, res) {
	res.header("Access-Control-Allow-Origin", "*");
	setTimeout(function(){
    	return res.json({result: 1, message: 'msg3'});
	}, 5000);
};
    
module.exports = function (router) {
	router.get('/test1', test1);
	router.get('/test2', test2);
	router.get('/test3', test3);
};
```

这里的设计是这样的：

    浏览器 <----> node koa中间层 <----> 后端API

可以看一下node koa中间层具体返回的时间：

    GET /hi - 8170ms

大概是8000ms，大致等于test1,test2和test3接口响应时间之和。很显然，这里这种写法是异步顺序执行，这适用于后面的异步调用依赖于前面异步调用的情况。

那如果我们需要多个异步调用并发执行，也就是说这几个异步调用之间没有依赖关系，则需要使用Promise.all的帮助了，把node koa中间层变成这样：

node koa中间层：

```js
// 并发异步执行
await Promise.all([
	baseService.request('test/test1'),
 	baseService.request('test/test2'),
	baseService.request('test/test3')]
);
```

后端API代码不变，node koa中间层具体返回的时间：

    GET /hi - 5070ms

返回时间缩短为5000ms，这大致等于test1,test2和test3种响应时间最长的那个(test3接口)，那么就说明使用Promise.all可以让传入的异步调用变为并发执行的，互不干扰。

如果不想用Promise.all，还有一种写法也可以做到并发异步执行：

```js
// 并发异步执行
var res = [];
var tasks = [
    baseService.request('test/test1'),
    baseService.request('test/test2'),
    baseService.request('test/test3')
];
    
for (let task of tasks){
	res.push(await task);
}
```

  	
