---
title: koa2中controller实现类似sleep的延迟功能
date: 2017-05-09
---

今天有同事问我如何在koa2中的controller中使用延迟执行的功能，他直接在controller中使用setTimeout，但是没效果。

<!--more-->

错误的代码类似下面这样：

```js
// 错误的方法
exports.test = async(ctx) => {
  setTimeout(async function(){
    await ctx.render('home/test.njk');
  }, 2000);
};
```

问题在于，这里的controller会直接返回，并不会返回给客户端任何信息。因此请求这个接口的路由会返回404。

要真正做到在controller处理请求时延迟执行某些操作，需要实现一个delay函数，这个函数返回一个Promise，在这个Promise中调用setTimeout，像下面这样：

```js
// 正确的实现
exports.test = async(ctx) => {
  async function delay(time) {
    return new Promise(function(resolve, reject) {
      setTimeout(function(){
        resolve();
      }, time);
    });
  };
  await delay(2000);
  await ctx.render('home/test.njk');
};
```

上面代码会在2000毫秒后再渲染模版并返回给客户端。
