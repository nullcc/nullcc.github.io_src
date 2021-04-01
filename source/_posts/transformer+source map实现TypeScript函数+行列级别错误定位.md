---
title: transformer+source map实现TypeScript函数+行列级别错误定位
date: 2021-04-02
tags: [typescript]
categories: 工具
---

本文将给出一个在运行时获取TS函数完整原始代码并展示出错点的方式。

<!--more-->

## 场景和需求

在使用TypeScript实现的自动化测试场景中，一般情况下如果测试失败我们都会打印出error message和error stack信息（比如显示在一些dashboard中）来方便我们排查问题。不过这种做法只能获取到出错点的文件和行列号。而且如果运行的是编译成JS后的代码，获取到的文件名和行列号都是JS代码的。当然你可能会说可以使用source map转换成原始的TS代码文件的行列号，或者不主动编译成JS，而是使用ts-node直接运行TS代码，这样报错信息里的代码和行列号就是TS的了。我们确实可以这么做，但也就仅此而已。

如果能取到出错点对应的方法或函数的完整原始TS代码并展示出出错点和出错信息，直接在错误报告中打印出来，岂不是可以省掉再去工程文件中定位到对应文件和行列号这个步骤，在test case数量大且运行频繁的时候，这种做法能节省我们不少排错时间。

## 分析问题

很多人知道在JS中可以使用`toString`方法打印出函数（非native函数，打印native函数源码只会显示`function () { [native code] }`）的源码：

```javascript
// a.js
function add(a, b) {
  return a + b;
}
console.log(add.toString());
```

运行`node a.js`，脚本会打印出add函数的JS源码:

```javascript
function add(a, b) {
  return a + b;
}
```

在TS中也能这么做，但打印出的代码并不是TS源码，而是转换成JS后的代码：

```typescript
// b.ts
function add(a: number, b: number): number {
  return a + b;
}
console.log(add.toString());
```

运行`ts-node b.ts`，脚本打印出的add函数源码还是JS的：

```javascript
function add(a, b) {
    return a + b;
}
```

使用tsc编译结果也是一样的，这里就不列出了。

很显然，不管是用ts-node隐式编译或者是用tsc显式编译TS代码，我们无法简单地使用toString方法来打印函数的完整TS源码。

不过这也难不倒我们，TS中的transformer是一个很强大的工具，它允许我们在编译阶段对TS代码的抽象语法树(AST)做一些操作。实际上，在transformer中我们可以访问AST的所有node，这些node里有一些信息是我们感兴趣的，比如TS文件名、函数/方法声明的start和end信息，这些TS源码级别的信息有助于实现我们的目标。

## 解决方案

这个transformer有几个要实现的目标：

1. 找到所有函数和方法的声明点，并记录它们在TS源码中的起止位置。
2. 将这些记录输出到一个外部文件中。

第一个目标可以通过遍历所有的AST node来实现，使用下面的代码：

```typescript
// transformer.ts
import ts from "typescript";

export default (program: ts.Program, fileFnRangeMap: any): ts.TransformerFactory<ts.SourceFile> => {
  return (ctx: ts.TransformationContext) => {
    return (sourceFile: ts.SourceFile): ts.SourceFile => {
      // 这里定义访问者方法，该方法会在TS遍历每个AST node时被调用
      const visitor = (node: ts.Node): ts.Node => {
        return ts.visitEachChild(visitNode(node, program, sourceFile.fileName, fileFnRangeMap), visitor, ctx);
      };
      return <ts.SourceFile> ts.visitEachChild(visitNode(sourceFile, program, sourceFile.fileName, fileFnRangeMap), visitor, ctx);
    };
  };
}
```

上面的代码实际是一个访问者模式的典型用法，我们不用关系TS正在编译代码时具体是怎么遍历AST的，我们只需要提供一个方法，告诉TS在访问到每个node时该做什么。`visitNode`方法需要我们自己实现。另外你可能会好奇`fileFnRangeMap`是做什么的，可以暂时先忽略这个参数。

再来看`visitNode`方法：

```typescript
// transformer.ts
const visitNode = (node: ts.Node, program: ts.Program, fileName: string, fileFnRangeMap: any): ts.Node => {
  if (ts.isSourceFile(node)) {
    fileFnRangeMap[node.fileName] = [];
    return node;
  }
  if (!isFnDeclaration(node)) {
    return node;
  }
  let start, end = 0;
  const positions = fileFnRangeMap[fileName];
  if (isVariableDeclarationWithArrowFunction(node)) {
    if (ts.isVariableDeclarationList(node.parent) || ts.isVariableDeclaration(node.parent)) {
      start = node.parent.pos;
      end = node.parent.end;
    }
  } else {
    start = node.pos;
    end = node.end;
  }
  positions.push({ start, end });
  return node;
};

const isFnDeclaration = (node: ts.Node): boolean => {
  return ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || isVariableDeclarationWithArrowFunction(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
    || ts.isConstructorDeclaration(node);
};

const isVariableDeclarationWithArrowFunction = (node: ts.Node): boolean => {
  return ts.isVariableDeclaration(node) && !!node.initializer && ts.isArrowFunction(node.initializer);
};
```

在TS遍历AST node时会对每个node调用该方法，首先判断当前node是否是`SourceFile` node，如果是就从中提取出这个文件的名称，并设置`fileFnRangeMap`中以这个文件名为key的value为一个空数组，我们不打算对node做任何操作，直接返回它。如果不是`SourceFile` node，就判断它是否是一个函数声明node，函数声明node有以下几种：

* 使用function声明的函数

```typescript
function add(x: number, y: number): number {
  return x + y;
}
```

* 箭头函数

```typescript
const results = [1, 2, 3].reduce((x: number, y: number): number => {
  return x + y;
}, 0);
```

* 带赋值语句的箭头函数

```typescript
const add = (x: number, y: number): number => {
  return x + y;
};
```

* 类构造函数和类方法声明

```typescript
export class Calc {
  constructor() {
  }

  add(x: number, y: number): number {
    return x + y;
  }
}
```

我们需要识别出这几种node，我们可以直接使用typescript提供了一些方法来判断，像这样：

```typescript
ts.isFunctionDeclaration(node)
```

如果是上述几种我们关系的函数声明node，需要获取下它们在TS源码里的起止位置，并push到`fileFnRangeMap[$sourceFileName]`中。这里我们还是不会对node做任何操作，直接返回即可。

回顾这部分的内容，这个transformer帮助我们在TS遍历AST树时记录下我们所关心的函数声明node的起止位置，并把这些信息记录到`fileFnRangeMap`中以相应文件名为key的数组里。

到此，我们已经准备好了TS源码中所有函数声明的信息，之后把它输出到一个外部文件就行了。为了输出到外部文件，有一种做法是在遍历到每个函数声明node时把`fileFnRangeMap`字符串到文件，这么做可以但效率太低，因为每遍历到一个函数声明node都要写一次文件。 其实还可以控制整个TS编译过程，使用一个`compile.ts`文件来控制：

```typescript
// compile.ts
import ts from "typescript";
import transformer from "./transformer";
import * as util from "./util";
import { OUTPUT_FILE_NAME } from "./constant";

export default function compile(dir: string, configFilePath: string, writeFileCallback?: ts.WriteFileCallback) {
  const parsedCommandLine = ts.getParsedCommandLineOfConfigFile(configFilePath, undefined as any, ts.sys as any);
  if (!parsedCommandLine) {
    throw new Error("Parsing TS config file error!");
  }
  const filePaths = util.scan(dir);
  const compilerOptions = parsedCommandLine.options;
  compilerOptions.sourceMap = true;
  const program = ts.createProgram(filePaths, compilerOptions);
  const fileFnRangeMap = {};
  const transformers: ts.CustomTransformers = {
    before: [transformer(program, fileFnRangeMap)],
    after: [],
  };
  const { emitSkipped, diagnostics } = program.emit(undefined, writeFileCallback, undefined, false, transformers);
  if (emitSkipped) {
    throw new Error(diagnostics.map(diagnostic => diagnostic.messageText).join('\n'));
  }
  util.writeToFile(OUTPUT_FILE_NAME, JSON.stringify(fileFnRangeMap));
}
```

这个`compile.ts`里的compile方法的用法是这样的： 

```typescript
compile(sourceCodeDir, tsconfigFile);
```

有几个地方需要说明，`compile`中强制开启了source map，因为我们必须借助source map才能通过编译后的JS代码行列号定位到TS源码的行列号。`compile`方法让我们能控制整个TS编译过程。注意第16行声明了一个`fileFnRangeMap`对象并将它作为`transformer`方法的第二个参数。接着在最后将`fileFnRangeMap`对象字符串化到文件里。

来看一个例子，假设有一个项目目录和文件如下：

```
|---my-app
|   |---src
|   |   |---inner
|   |   |   |---b.ts
|   |   |---a.ts
```

src/a.ts:
```typescript
export function add(a: number, b: number): number {
  return a + b;
}
```

src/inner/b.ts:
```typescript
export const add = (a: number, b: number): number => {
  return a + b;
}

export class Calc {
  add(a: number, b: number): number {
    return a + b;
  }
}
```

在使用如下代码编译后会在当前目录生成一个`_ts-err-hunter-file-fn-range.json`文件，里面记录了`src`目录下所有TS文件里方法声明的起止位置，另外我们还获得了source map。

```typescript
compile("src", "tsconfig.json");
```

_ts-err-hunter-file-fn-range.json:
```json
{
  "src/a.ts": [
    {
      "start": 0,
      "end": 69
    }
  ],
  "src/inner/b.ts": [
    {
      "start": 6,
      "end": 72
    },
    {
      "start": 18,
      "end": 72
    },
    {
      "start": 93,
      "end": 153
    }
  ]
}
```

有了上面这些信息，当运行时报错时，我们就可以通过error stack获得出错点的JS文件路径和行列号。然后使用source map查找到对应TS文件的路径和行列号。再计算出TS文件的行列号对应的位置，并查询该位置在`_ts-err-hunter-file-fn-range.json`里的对应文件中落在哪个函数声明区间，这个区间的起止位置就是这个出错点在TS文件中函数的完整区间了。最后直接把这个区间的代码打印出来可以了。具体的查找过程不复杂，就不赘述了。
