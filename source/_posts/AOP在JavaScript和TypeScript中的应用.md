---
title: AOP在JavaScript和TypeScript中的应用
date: 2019-01-11
tags: [js, aop]
categories: 编程语言
---

本文将简单聊聊AOP在JavaScript和TypeScript中的应用。本文是之前一篇文章<AOP_in_JavaScript_and_TypeScript>的中文版。

<!--more-->

## AOP概览

Aspect Oriented Programming (AOP)，中文意思是“面向切面编程”。AOP的作用用一句话概括就是将业务逻辑和非业务逻辑的代码分开，减少它们的耦合性。

这么说比较抽象，我们具体点说，在使用selenium-webdriver做一些web自动化测试时，我们经常需要执行一些辅助的操作，比如记录日志、截屏保存等。这些操作本身和测试的业务逻辑没有强关联性，毕竟没有记录日志的操作我们的自动化测试代码也能运行，但是我们大部分时候也确实需要这些辅助操作。我们希望在业务建模阶段不需要考虑这些辅助函数的事情。

还有一个例子比如我们要在自动化测试的每个步骤后截屏保存，并记录每个步骤的耗时。最简单的做法就是把截屏代码和计算耗时的代码嵌入到每个步骤中。但这么做的问题也显而易见，step多了以后代码难以维护。AOP则可以优雅地解决这类问题。

## AOP和OOP的对比

大部分人对面向对象编程(OOP)比较熟悉。当我们获得一个需求时，首先要分析需求，然后抽取出一些领域模型。每个领域模型都有它的属性和方法。人们使用封装、组合、继承、多态和设计模式来以OOP的方式构建软件。

如果你有过用OOP的方式构建软件的经历就会发现OOP是对静态事物建模的。换句话说，OOP是比较擅长的领域是对名词建模。比如，我们有一个Employee类，它有如下属性：age、title和department，还有一些方法：work、takeABreak和loginAdminSystem。属性用来描述对象的特征，方法则决定了对象能够执行什么样的操作。我们可以写出下面这样的面向对象代码：

```typescript
class Employee {
  private name: string;
  private age: number;
  private title: string;
  private department: string;

  constructor(name: string, age: number, title: string, department: string) {
    this.name = name;
    this.age = age;
    this.title = title;
    this.department = department;
  }

  public work() {
    // code for working...
  }

  public takeABreak() {
    // code for taking a break...
  }

  public loginAdminSystem() {
    // code for logining admin system, it's a sensitive operation
  }
}

const employee = new Employee('Bob', 35, 'Software Development Engineer', 'Devlopment');
employee.work();
employee.takeABreak();
```

上面的代码都是和Employee类强关联的业务逻辑，毫无疑问，OOP非常适合做这类描述对象和其行为的事情。

但有时我们希望能加入更多“动态”东西，比如我们希望在用户执行一些敏感操作的时候记录日志。如果使用OOP来实现，就必须修改相关敏感操作的代码，加入记录日志的代码：

```typescript
...
public loginAdminSystem() {
  // added: code for logging some information
  // code for logining admin system
}
...
```

这段代码可以工作，但并不优雅。实际上这种做法违反了OCP(开闭原则)。记录日志的操作和这个敏感操作并无强关联性，它只是辅助性的代码。因此最好不要为了加入一个记录日志的辅助功能而去修改业务逻辑代码。

如何处理这种情况？可以尝试下AOP。简单来说，可以在特定操作前后暴露两个切面：一个在特定操作前，另一个在特定操作后，然后再运行时动态地将其他辅助性函数织入进去。因此AOP实际上是针对动词的。通过将OOP和AOP相结合，我们的代码将变得更加优雅，且有良好的扩展性。

下面是一个简单的例子：函数包装。假设我们有一个函数"op"，我们将一些日志操作加入其前后：

```typescript
let op = () => {
  console.log('executing op...');
};

let oriOp = op;

op = () => {
  console.log('before op...');
  oriOp();
  console.log('after op...');
}
```

这次我们不是修改原函数而是包装它。

上面的例子只是一种非常简单的情形，实际项目中的AOP代码要比上面的示例复杂得多。一般来说我们需要一些“元编程”技术来实现AOP。但基本原则和本质和上面的代码是相似的。值得一提的是，AOP是一种编程理念，并不局限于某种编程语言，大部分编程语言都可以以AOP的方式来编程。

下面将针对之前提到的，在Web自动化测试中加入如记录日志、截图保存和计算步骤耗时等辅助性功能，给出几个具体的实现来详细说明如何在JavaScript和TypeScript中实现AOP。

## 解决方案1 —— 简单的方法钩子

看过上面的介绍后，最直接的想法就是，可以将那些业务方法用前置/后置处理器一一包装起来，也就是加入方法钩子。解决方案1使用方法钩子（前置/后置动作）来将原方法包装成一个新方法，我们把辅助性功能放在钩子中。

代码在[base driver](https://github.com/nullcc/ts-aop-example/blob/master/src/driver/methodHook/base.ts)和[method hook driver](https://github.com/nullcc/ts-aop-example/blob/master/src/driver/methodHook/methodHook.ts).

这种方案有一个明显的缺点：如果前置方法和后置方法之间有关联，将难以处理。比如如果要记录一个步骤的耗时，前置方法和后置方法是这样的：

```typescript
// before action
const recordStartTime = async () => {
  const start = new Date().getTime();
  return start;
};

// after action
const recordEndTime = async start => {
  const end = new Date().getTime();
  const consume = end - start;
  console.log(`time consume: ${consume}ms`);
};
```

且其中需要用到一个"registerHooksForMethods"方法：

```typescript
public registerHooksForMethods(
    methods: string[],
    beforeAction: Function,
    afterAction: Function
  ) {
    const self = this;
    methods.forEach(method => {
      const originalMethod = self[method]; // original method reference
      if (originalMethod) {
        self[method] = async (...args) => { // wrap original method
          const beforeActionRes = await beforeAction();
          const methodRes = await originalMethod.call(self, ...args);
          await afterAction(beforeActionRes, methodRes);
          return methodRes;
        };
      }
    });
  }
```

registerHooksForMethods方法接受三个参数，用来将一组原方法分别使用前置/后置处理器包装一组对应的新方法。这种实现其实是比较不优雅的，而且很难扩展。因此我们需要继续寻找更好的方案。

## 解决方案2 ——— 静态洋葱模型

静态洋葱模型受到[Koa](https://koajs.com/)的启发，这个模型很有意思，对一个方法的执行流程就像一个箭头通过一整颗洋葱：

![Koa middileware onion model](/assets/images/post_imgs/koa_onion.png)

代码在[base driver](https://github.com/nullcc/ts-aop-example/blob/master/src/driver/staticOnion/base.ts) and [static onion driver](https://github.com/nullcc/ts-aop-example/blob/master/src/driver/staticOnion/staticOnion.ts).

洋葱内部每一层都被上面一层所完全包裹，我们将业务方法置于洋葱的最内部，到达业务方法和离开业务方法都将穿越其外层，而且除了业务方法之外，每层都会被穿越两次。每一层都是一个"中间件"。

静态洋葱模型比刚才的钩子方法要好不少，这里使用装饰器方法来实现它：

```typescript
// decorator
export const webDriverMethod = () => {
  return (target, methodName: string, descriptor: PropertyDescriptor) => {
    const desc = {
      value: "webDriverMethod",
      writable: false
    };
    Object.defineProperty(target[methodName], "__type__", desc);
  };
};

// in BaseWebDriver class, a web driver method
@webDriverMethod()
public async findElement(
  by: By,
  ec: Function = until.elementLocated,
  timeout: number = 3000
) {
  await this.webDriver.wait(ec(by), timeout);
  return this.webDriver.findElement(by);
}
```

调用`use`方法来增加一个中间件：

```typescript
public use(middleware) {
  const webDriverMethods = this.getWebDriverMethods();
  const self = this;
  for (const method of webDriverMethods) {
    const originalMethod = this[method];
    if (originalMethod) {
      this[method] = async (...args) => {
        let result;
        const ctx = {
          methodName: method,
          args
        };
        await middleware(ctx, async () => {
          result = await originalMethod.call(self, ...args);
        });
        return result;
      };
      // check this: we must decorate new method every time when adding a middleware
      this.decorate(this[method]); 
    }
  }
}

private decorate(method) {
  const desc = {
    value: "webDriverMethod",
    writable: false
  };
  Object.defineProperty(method, "__type__", desc);
}
```

静态洋葱模型有个小缺点：每增加一个中间件，都必须手动在相关函数上面增加一个装饰器。为了偷懒，我们还可以实现得更动态一些，这就有个方案3。

## 解决方案3 —— 动态洋葱模型

代码在[base driver](https://github.com/nullcc/ts-aop-example/blob/master/src/driver/dynamicOnion/base.ts) and [dynamic onion driver](https://github.com/nullcc/ts-aop-example/blob/master/src/driver/dynamicOnion/dynamicOnion.ts).

```typescript
export class DynamicOnionWebDriver extends BaseWebDriver {
  protected webDriver: WebDriver;
  private middlewares = [];

  constructor(webDriver) {
    super(webDriver);
    const methods = this.getWebDriverMethods();
    const self = this;
    for (const method of methods) {
      const desc = {
        enumerable: true,
        configurable: true,
        get() {
          if (methods.includes(method) && this.compose) {
            const ctx = { // put some information in ctx if necessary
              methodName: method,
            }
            const originFn = async (...args) => {
              return this.methodMap[method].call(self, ...args);
            };
            const fn = this.compose();
            return fn.bind(null, ctx, originFn.bind(self));
          }
          return this.methodMap[method].bind(this);
        },
        set(value) {
          this[method] = value;
        }
      };
      Object.defineProperty(this, method, desc);
    }
  }

  public use(middleware) {
    if (typeof middleware !== "function") {
      throw new TypeError("Middleware must be a function!");
    }
    this.middlewares.push(middleware);
  }

  private compose() {
    const middlewares = this.middlewares;
    const self = this;
    return async (ctx, next, ...args) => {
      let res;
      const dispatch = async i => {
        let fn = middlewares[i];
        if (i === middlewares.length) {
          fn = next;
        }
        if (!fn) {
          return Promise.resolve();
        }
        try {
          if (i === middlewares.length) {
            res = await Promise.resolve(fn.call(self, ...args));
            return res;
          }
          return Promise.resolve(fn(ctx, dispatch.bind(null, i + 1)));
        } catch (err) {
          return Promise.reject(err);
        }
      };
      await dispatch(0);
      return res;
    };
  }
}
```

动态洋葱模型要比之前两个方案复杂很多，我们使用`Object.defineProperty`来定义自己的getter，这些getter将对每个使用了`webDriverMethod`装饰器的方法生效。`compose`方法非常重要，它用来将所有中间件和原函数组合到一起，compose是在[koa-compose](https://github.com/koajs/compose/blob/master/index.js)的核心代码基础上修改得来的。getter将调用compose函数来将原函数和所有中间件包装成一个新函数返回。有了这种动态包装机制，就不需要每次增加中间的时候都要手动在原函数上添加装饰器了。

动态洋葱模型的代码比较难以理解，但绝对值得我们好好去学习。

顺便一提，本文中除了方法钩子这个名称外，静态洋葱模型和动态洋葱模型都是我自己发明的，如果读者有更好的名字，可以和我交流。

## 示例Repo

[ts-aop-example](https://github.com/nullcc/ts-aop-example)

## 运行测试

```shell
npm test
```

## 更多信息

- [什么是面向切面编程AOP](https://www.zhihu.com/question/24863332)
- [Koa Web Framework](https://koajs.com/)
- [Object.defineProperty()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty)
