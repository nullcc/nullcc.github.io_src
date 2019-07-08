---
title: node.js中利用IPC和共享内存机制实现计算密集型任务转移
date: 2019-03-23
tags: [node]
categories: 编程语言
---

node.js是单进程单线程运行的，如果遇到一些计算密集型的操作应该怎么办呢？本文提供了一种思路。

<!--more-->

## 需求

最近在帮Web自动化测试开发小组编写一个日志插件，这里先简要介绍一下需求的上下文和这个插件的职责。

这个日志插件是基于一个现有的自研Web测试框架设计和开发的，每次跑一遍测试都称为一次Run，每个Run下有若干个test cases，每个test case下又有若干steps，且step是可以有sub steps的（就是嵌套step）。因此整个运行时的数据结构是一个树形结构，Run为根节点，test为非叶子节点，step可以为非叶子节点（有sub steps）或叶子节点（没有sub steps）。在Run级别，框架提供start run hook和end run hook两个钩子，在test case级别，框架也提供start test hook和end test hook两个钩子。针对steps则是需要用户提供一个针对log的监听函数以异步调用的方式提供给用户。另外测试的执行端由selenium grid控制，具体测试跑在各个slave上，并发数一般可以到60左右。

该日志插件的需求（只列出和本文关系密切的需求）：

1. 需要在每次Run的时候将test suites, test cases和steps整理出来。
2. 对于那些抛出异常的cases，需要判断其抛出的异常信息是否是known failure，如果是，需要在test的元数据中标明known failure issue name，并将test状态设置为Broken，否则设置为Failed。known failure是一个很长的正则表达式列表（如果转换成字符串大约有300KB+），程序需要遍历它来匹配异常信息判断是否是known failure。

整理一下上面列出的信息：

1. 所有log都是以异步事件的形式发送给用户提供的"onLogHandler"的。
2. 测试运行的并发数较大。
2. 检测known failure需要遍历一个很长的正则表达式列表，这属于计算密集型操作。

## 最初实践

最开始的解决方案相当简单粗暴，写一个方法，接受两个参数，一个是异常信息字符串，一个是known failure的正则数组。当某个test case抛出异常时，获取到它的异常信息字符串，直接调用这个方法去匹配。开发环境下因为跑的case不多，这么做完全没问题。到了测试环境压测时，发现仅仅30个并发下，很快就会OOM。开始以为是对node进程分配的内存太小了，于是调高了分配的内存，但这也仅仅只能延缓OOM出现的时间而已。

## 问题分析

之后详细分析了日志，发现OOM一般出现在大量case抛出异常之后，可以想到可能是由于正则匹配是计算密集型操作，node长时间执行CPU密集型操作时，是无法去执行其各个异步回调队列中的回调函数的。由于所有log都是以异步事件发送给框架，并调用我们的onLogHanlder去处理，在并发数比较高的时候，node进程被计算操作占用，时间一长node的异步回调事件队列中的回调函数得不到处理，队列长度疯狂增长，相当于把对异步回调事件的处理“饿死了”，时间一长，内存就不够用了。这里的知识点涉及node的异步回调处理模型。

## 解决方案

既然node主进程需要处理大量异步事件，那一个可行的办法就是将这些计算密集型操作从主进程中分离出去。可以考虑使用IPC的方式，利用其它进程来处理这部分计算工作。我们可以使用node的child_process模块fork出一个子进程出来执行这些消耗CPU的操作。由于这些子进程只负责处理计算，并不负责处理异步事件，所以不用担心之前在主进程中发生异步事件“被饿死”的问题。

上文中还有一个情况还未说明，上文提到的known failure rules是需要从某个外部HTTP API中获取，最开始的做法是在初始化测试框架的时候获取一次，作为参数传递给end run hook，在end run hook中调用检测函数进行匹配。很容易想到用child_process生成一个子进程，并将这个规则列表传递给子进程的方式。首先我们不可能在每个子进程中单独去获取，因为这效率太低了，那就只能从主进程向子进程传递这个列表了。但是对命令行来说，传递这么大的参数有些不太合适，而且就算能用命令行参数传递，每次都要为300KB+的数据进行一次内存申请和复制，效率也不高。

于是想到可以采用共享内存的方式，在主进程中开辟一块专用内存区域共享给子进程，这样每个子进程在获取known failure rules的时候实际上只需要读一块已经就绪的内存。主进程利用IPC的方式将这块内存的key传递给子进程，子进程接收到主进程发送过来的内存key时，将这块内存的值读出并解析，接着直接进行匹配就好了。

下面用主进程和子进程的两段代码进行说明：

主进程：
```ts
// master process
import * as shm from 'shm-typed-array';
import { fork, ChildProcess, ForkOptions } from 'child_process';

const KNOWN_FAILURE_RULES_API = '...';

const fetchKnownFailureRules = (endpoint: string): any[] => {
  // omit...
}

const promiseFork = (memoryKey, path: string, args: ReadonlyArray<string>, options?: ForkOptions): Promise<string | null> => {
  return new Promise<string | null>((resolve, reject) => {
    const child = fork(path, args, options);

    child.on('message', res => {
      child.kill();
      resolve(res);
    });

    child.on('error', err => {
      child.kill();
      reject(err);
    });

    child.stderr.on('data', data => {
      child.kill();
      reject(data.toString());
    });

    child.on('exit', (code, signal) => {
      child.kill();
      reject();
    });
    child.send(memoryKey);
  });
};

(async () => {
  const knownFailureRules = await fetchKnownFailureRules(KNOWN_FAILURE_RULES_API);
  // convert rules array to Uint16Array
  const arr = Uint16Array.from(Buffer.from(JSON.stringify(knownFailureRules)));
  // Create shared memory
  const data = shm.create(arr.length, 'Buffer');
  if (!data) {
    return;
  }
  // copy rules Uint16Array into shared memory
  for (let i = 0; i < data.length; i++) {
    data[i] = arr[i];
  }

  try {
    const issueName = await promiseFork(
      data.key,
      'match-known-failure.js', // match-known-failure.js is the script to match known failure
      ['test-name', 'error-message'] // as a demo, test name and error message are fake
      { silent: true }
    );
    console.log(issueName);
  } catch (err) {
    console.log(err);
  }
})();

```

子进程：
```js
// match-known-failure.js
const shm = require('shm-typed-array');

const matchKnownFailure = (testName, errorMessage, rules) => {
  // omit...
}

const testName = process.argv[2];
const errorMessage = process.argv[3];

process.on('message', async key => {
  // Get access to shared memory
  const data = shm.get(key, 'Buffer');
  if (data) {
    const rules = JSON.parse(data.toString());
    const res = matchKnownFailure(testName, errorMessage, rules);
    process.send(res);
  }
});
```

另外共享内存区域的大小也是有限制的，我们需要在程序结束时手动释放这部分内存，其中`sharedMemoryKey`是向操作系统申请共享内存时得到的一个唯一key值，代码如下：

```js
async clearSharedMemory(sharedMemoryKey) {
  return new Promise((resolve, reject) => {
    console.log('clear shared memory...');
    exec(`ipcrm -M ${sharedMemoryKey}`, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      }
      resolve();
    });
  });
}

// 在进程结束时清理shared memory
process.on('exit',  async () => {
  await knownFailureFinder.clearSharedMemory(sharedMemoryKey);
});
```

为了保持简单这里只列出了当'exit'事件发生的处理，其实在异常发生或者程序收到一些系统信号时也应该做这个清除处理。另外这个方案目前只在Linux和Mac OS X下测试通过，时间关系并未在Windows下做适配。

## 其他解决方案

针对node的计算密集型任务的处理方法，还有很多其他解决方案，以下列举几个：

1. 编写node的C++扩展来承担这部分计算工作。
2. 子进程部分可以改用child_process的exec或者spawn调用一些性能更好的语言写的外部程序，比如C++, Rust或者Go。
3. 将子进程替换为RPC调用外部服务，但是这种方式比较适合那些传参消耗小的计算任务。
