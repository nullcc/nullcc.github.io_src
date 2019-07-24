---
title: TypeScript中利用transformer获取interface keys
date: 2019-07-18
tags: [typescript]
categories: 编程语言
---

本文分成四个部分：
1. 需求和灵感
2. TypeScript的抽象语法树简介
3. TypeScript transformer简介
4. 编写获取TypeScript interface keys的transformer

<!--more-->

## 需求和灵感

使用过TypeScript写代码的同学都对interface这个东西不陌生，借助interface来定义一些纯值对象的类型是再简单不过了。最开始我的需求很简单，想用interface来定义一个HTTP API的response DTO，在对一个API进行测试的时候，可以验证这个API的response结构是否和我用interface定义的结构相同。

遗憾的是，正常情况下用interface是办不到的。因为TypeScript的interface实际上并不存在于runtime，要理解这个问题还需要知道TypeScript针对JavaScript提供了一整套的类型辅助系统，但仅仅是辅助，最终的代码还是要转换成JavaScript来执行，JavaScript中并不存在interface这种东西，因此也就无法在runtime获得interface的keys了。

以我的性格来说，不可能这么简单就放过这个问题，经过一番搜索，我发现了[ts-transformer-keys](https://github.com/kimamula/ts-transformer-keys)这个包，该包宣称可以获得interface的keys。仔细研究了一下，发现这个包提供一个`keys<T>()`方法，其实现原理是使用了自定义的transformer在将代码转换成JavaScript时获取了interface的信息，然后修改了调用`keys<T>()`处的AST节点信息。换句话说，这个包提供的transformer在将代码转换成JavaScript时直接从AST中找到相应interface的keys，然后创建一个包含所有keys数组，并将这个数组直接输出到转换出来的JavaScript代码中。

举个简单的例子：

```typescript
interface Foo {
  a: number;
  b: string;
}
console.log(keys<Foo>());
```

上面这几行代码在被转换成JavaScript时被替换成了下面这行：

```javascript
console.log(["a", "b"]);
```

正如上面所描述的，`ts-transformer-keys`所做的只是对AST Nodes的遍历-转换，不过这种能力正是我所需要的。

进一步说，由于response DTO内部经常是嵌套结构的，因此很自然想到是否可以支持嵌套interface，比如下面这种情况：

```typescript
interface Foo {
  a: number;
  b: Bar;
}
interface Bar {
  c: boolean;
  d: string;
}
console.log(keys<Foo>());
```

但是`ts-transformer-keys`的输出还是只有a和b：

```javascript
console.log(["a", "b"]);
```

看来`ts-transformer-keys`尚未支持这种用法。

再进一步，我还想要得到interface各个key的类型和存在性，目前`ts-transformer-keys`也不支持。不过没关系，知道了内部的实现原理，完全可以自己写一个transformer。

## TypeScript的抽象语法树简介

在真正开始编写自己的transformer之前，有必要简单了解一下TypeScript的抽象语法树和TypeScript对操作抽象语法树所提供的支持。

抽象语法树(Abstract Syntax Tree，AST)，下文简称为AST，是源代码语法结构的一种抽象表示。为了更直观地观察TypeScript的AST，可以借助[ts-ast-viewer](https://ts-ast-viewer.com/)这个工具来以树形结构将其可视化。先看一个基本的TypeScript interface的抽象语法树表示，假设有如下代码：

```typescript
interface Foo {
  a?: number;
  b: string;
}
```

使用ts-ast-viewer可以得到上面代码的AST结构：

![interface的AST结构](/assets/images/post_imgs/ts-ast-1.png)

从图中可以很清楚地看到Foo的AST表示，另外在右边的Node部分，还能查看到其AST中具体节点的信息，对于TypeScript的interface我们关心的属性名称、存在性和类型都可找到相应的字段来对应。

图形化表示如下：

![interface的AST结构图形表示](/assets/images/post_imgs/ts-ast-2.png)

源代码的几乎每一个细节，在AST中都有体现。让我们从上到下走马观花一下：

1. 最顶层是`SourceFile`，每一个TypeScript源代码文件都会对应一个SourceFile。
2. `SourceFile`下直接包含的`SyntaxList`包括了这个文件中的所有语法结构，在这里只有这个interface声明，如果还有其他语法结构，也将被包含在内。
3. `InterfaceDeclaration`表示这个interface的声明。
4. `InterfaceKeyword`表示关键字interface。
5. 紧接着的`Identifier`对应的是interface的名字`Foo`。
6. `OpenBraceToken`表示`{`。
7. 接下来又是一个`SyntaxList`，这个SyntaxList和刚才看到的那个不一样，它只包括了interface Foo中声明的所有语法结构，这样的结构划分有点类似作用域。
8. 之后的`PropertySignature`是一个属性签名，表示`a?: number;`。
9. PropertySignature下的一些属性，`Identifier`表示属性名`a`，`QuestionToken`表示`?`，`ColonToken`表示`:`，`NumberKeyword`表示属性名a的类型是`number`，`SemicolonToken`则表示`;`。

后面的结构和前面差不多就不赘述了。

值得一提的是，在TypeScript的类型声明文件`typeacript.t.ts`的`SyntaxKind`这个`enum`声明中，可以找到上面列举的AST语法结构类型的声明，编写transformer的时候我们还会用到它。另外，之前提到`ts-transformer-keys`是使用transformer来遍历AST Nodes以获取interface keys，并就地创建一个Array，将keys数组（是一个字符串数组）复制给原来TypeScript代码中`keys<T>()`对应的左值。因此我们还需要能遍历，修改和创建AST Nodes，实际上TypeScript对这些操作已经提供了支持，具体细节之后会谈到。

上面AST内部的细节部分将在实际编写transformer的时候再来研究，现在只需要大致知道它的结构就可以了。

## TypeScript transformer简介

在介绍transformer之前需要大致了解一下TypeScript的编译过程。

在[TypeScript](https://github.com/microsoft/TypeScript/)的Wiki中可以找到一篇和TypeScript内部架构和编译过程有关的文章，大部分网络上涉及TypeScript编译过程的文章大都参考它：[TypScript Architectural Overview](https://github.com/microsoft/TypeScript/wiki/Architectural-Overview)。

根据文章中的介绍，TypeScript的核心编译过程中涉及的编译组件主要有下面几个：

1. Pre-processor: 预处理器（包含Scanner）。
2. Parser: 语法分析器。
3. Binder: 绑定器。
4. Type resolver/ Checker: 类型检查器，解析每种类型的构造，负责处理、检查针对每个类型的语义操作，并生成合适的诊断信息。
5. Emitter：生成器，负责根据输入的.ts和.d.ts文件生成最终的结果，它有三种可能的输出：JavaScript源码(.js)、类型定义文件(.d.ts)或source map文件(.js.map)，其中类型定义文件可以帮助开发者在各种IDE中获取TypeScript的类型信息，source map文件则是一个存储源代码与编译代码对应位置映射的信息文件，在debug时我们需要利用source map文件来找到实际运行的代码(最终生成的.js文件)和其原始代码(开发者实际编写的.ts文件)的位置对应关系。

TypeScript的编译过程简单归纳如下：

1. 在编译过程的开始阶段，输入是一些.ts源代码，Pre-processor会计算出有哪些源代码文件将参与编译过程（它会查找import语句和用`///`的引用语句），并在内部调用扫描器(Scanner)对所有源文件进行扫描，并封装成Tokens流，作为之后Parser的输入。
2. Parser以预处理器产生的Tokens流作为输入，根据语言语法规则生成抽象语法树(AST)，每个源文件的AST都有一个SourceFile节点。
3. Binder会遍历AST，并使用符号(Symbol)来链接相同结构的声明（例如对于具有相同结构的interface或模块，或者同名的函数或模块）。这个机制能帮助类型系统推导出这些具名声明。Binder也会处理作用域，确保每个Symbol都在正确的作用域中被创建。到目前为止，编译过程已经对每个单独的.ts文件进行了处理，得到了每个.ts文件的AST（每个AST都有一个SourceFile节点作为根节点）。接下来还需要将所有.ts文件的SourceFile合并在一起形成一个程序(Program)，TypeScript提供了一个`ts.createProgram`API来创建Program。我们知道源代码文件经常互相引用，下一步还将处理这些引用关系。
4. 生成Program后，TypeChecker会负责计算出不同SourceFile中的Symbol引用关系，并将`Type`赋值给`Symbol`，并在此时生成语义诊断（如果有错误的话）。
5. 对于一个Program，会生成一个Emitter，Emitter要做的就是针对每个SourceFile生成输出(.js/.d.ts/.js.map)。

另外，在TypeScript的Wiki还能找到一篇比较“残缺”的文章（估计是项目开发人员忙于具体实现懒得更新Wiki了），提到了transformer：[TypScript Compiler-Internals](https://github.com/microsoft/TypeScript/wiki/Compiler-Internals#transformer)

摘录transformer部分的内容如下，其中`translated`和`transforms`颇为微妙：

> The transformer is nearing completion to replace the emitter. The change in name is because the emitter **translated** TypeScript to JavaScript. The transformer **transforms** TypeScript or JavaScript (various versions) to JavaScript (various versions) using various module systems. The input and output are basically both trees from the same AST type, just using different features. There is still a small printer that writes any AST back to text.

这里对emitter的功能描述是`translated TypeScript to JavaScript`，emitter的作用是将TypeScript代码`翻译`成JavaScript代码。而翻译的意思是保持原文意思不变，也就是说emitter对TypeScript代码没有添油加醋，是照原样转成JavaScript的。而对transformer的功能描述是`transforms TypeScript or JavaScript (various versions) to JavaScript (various versions) using various module systems`，这里的transforms还有转换、变换的功能。

一言以蔽之，transformer对开发者暴露了AST，使我们能按照我们的意愿遍历和修改AST（这种修改包括删除、创建和直接修改AST Nodes）。

有了这些信息做铺垫后，可以用一张流程图来表示TypeScript的编译过程：

![TypeScript的编译过程](/assets/images/post_imgs/ts-ast-3.png)

## 编写获取TypeScript interface keys的transformer

终于到了实际写代码的环节了。在真正实现获取interface keys的transformer之前我们还有几个准备工作要做：

1. 实现一个最简单的transformer，之后的工作将在此基础上展开。
2. 研究如何将transformer集成到TypeScript项目中。

首先我们需要一种能在项目中使用transformer的方式，这里我选择[ttypescript](https://github.com/cevek/ttypescript)，因为它使用起来非常简单，另外还有一种方式是使用[ts-loader](https://github.com/TypeStrong/ts-loader)结合webpack，篇幅关系这里就只介绍使用`ttypescript`的方式。

以`ttypescript`提供的例子为基础，我们可以先写一个基础的transformer（部分代码来自于[ts-transformer-keys](https://github.com/kimamula/ts-transformer-keys)）：

```typescript
// src/transformer.ts
import * as ts from 'typescript';

export default (program: ts.Program): ts.TransformerFactory<ts.SourceFile> => {
  return (ctx: ts.TransformationContext) => {
    return (sourceFile: ts.SourceFile): ts.SourceFile => {
      const visitor = (node: ts.Node): ts.Node => {
        return ts.visitEachChild(visitNode(node, program), visitor, ctx);
      };
      return <ts.SourceFile> ts.visitEachChild(visitNode(sourceFile, program), visitor, ctx);
    };
  };
}

const visitNode = (node: ts.Node, program: ts.Program): ts.Node => {
  const typeChecker = program.getTypeChecker();
  if (!isKeysCallExpression(node, typeChecker)) {
    return node;
  }
  return ts.createStringLiteral('will be replaced by interface keys later');
};

const indexTs = path.join(__dirname, './index.ts');
const isKeysCallExpression = (node: ts.Node, typeChecker: ts.TypeChecker): node is ts.CallExpression => {
  if (!ts.isCallExpression(node)) {
    return false;
  }
  const signature = typeChecker.getResolvedSignature(node);
  if (typeof signature === 'undefined') {
    return false;
  }
  const { declaration } = signature;
  return !!declaration
    && !ts.isJSDocSignature(declaration)
    && (path.join(declaration.getSourceFile().fileName) === indexTs)
    && !!declaration.name
    && declaration.name.getText() === 'keys';
};
```

几个地方解释一下：

1. 在导出方法中，`ts.visitEachChild`可以使用开发者提供的visitor来访问AST Node的每个子节点，并且在visitor中允许返回一个相同类型的新节点来替换当前被访问的节点。
2. `visitNode`接受一个`ts.Node`和`ts.Program`类型的参数会在访问指定节点的每个子节点时被调用，这个方法需要放回一个`ts.Node`类型的对象，如果不想对当前节点做任何改变的话，直接返回实参中的`node`即可，如果想要做一些转换，那就需要自己编码实现了，这也是这个transformer实际发挥作用的地方。目前这里的做法是遇到`keys<T>()`调用就将节点替换为一个字符串'will be replaced by interface keys later'。
3. 这里会沿用`ts-transformer-keys`的调用方式`keys<T>()`，我们需要判断调用点，`isKeysCallExpression`就是用来判断源码中调用`keys<T>()`的地方。

写个测试来验证一下：

```typescript
// test/transformer.test.ts
import { keys } from '../index';

describe('Test transformer.', () => {
  test('Should output \"will be replaced by interface keys later\".', () => {
    interface Foo {}
    expect(keys<Foo>()).toEqual('will be replaced by interface keys later'); // true
  });
});
```

测试通过说明我们的transformer生效了。

接下来要进入本文最重要的部分（请原谅我前面铺垫了这么多=。=）：编写获取interface keys的代码了。在第一部分已经列出了一个包含interface的SourceFile的AST结构，不过里面的interface的结构是平坦的，没有嵌套的层级关系。而我们的目的是能够支持具有层级关系和嵌套的interface，一个有层级关系的interface的AST结构如下：

![具有层级关系的interface的AST结构](/assets/images/post_imgs/ts-ast-4.png)

我们需要嵌套地对interface的property做处理，完整的代码如下：

```typescript
import * as ts from 'typescript';
import * as path from 'path';

export default (program: ts.Program): ts.TransformerFactory<ts.SourceFile> => {
  return (ctx: ts.TransformationContext) => {
    return (sourceFile: ts.SourceFile): ts.SourceFile => {
      const visitor = (node: ts.Node): ts.Node => {
        return ts.visitEachChild(visitNode(node, program), visitor, ctx);
      };
      return <ts.SourceFile> ts.visitEachChild(visitNode(sourceFile, program), visitor, ctx);
    };
  };
}

interface InterfaceProperty {
  name: string;
  optional: boolean;
}

const symbolMap = new Map<string, ts.Symbol>();

const visitNode = (node: ts.Node, program: ts.Program): ts.Node => {
  if (node.kind === ts.SyntaxKind.SourceFile) {
    (<any>node).locals.forEach((value: any, key: string) => {
      if (!symbolMap.get(key)) {
        symbolMap.set(key, value);
      }
    });
  }
  const typeChecker = program.getTypeChecker();
  if (!isKeysCallExpression(node, typeChecker)) {
    return node;
  }
  if (!node.typeArguments) {
    return ts.createArrayLiteral([]);
  }
  const type = typeChecker.getTypeFromTypeNode(node.typeArguments[0]);
  let properties: InterfaceProperty[] = [];
  const symbols = typeChecker.getPropertiesOfType(type);
  symbols.forEach(symbol => {
    properties = [ ...properties, ...getPropertiesOfSymbol(symbol, [], symbolMap) ];
  });

  return ts.createArrayLiteral(properties.map(property => ts.createRegularExpressionLiteral(JSON.stringify(property))));
};

const getPropertiesOfSymbol = (symbol: ts.Symbol, outerLayerProperties: InterfaceProperty[], symbolMap: Map<string, ts.Symbol>): InterfaceProperty[] => {
  let properties: InterfaceProperty[] = [];
  let propertyPathElements = JSON.parse(JSON.stringify(outerLayerProperties.map(property => property)));
  const property = symbol.escapedName;
  propertyPathElements.push(property);
  let optional = true;
  for (let declaration of symbol.declarations) {
    if (undefined === (<any>declaration).questionToken) {
      optional = false;
      break;
    }
  }
  const key = <InterfaceProperty> {
    name: propertyPathElements.join('.'),
    optional,
  };
  properties.push(key);

  const propertiesOfSymbol = _getPropertiesOfSymbol(symbol, propertyPathElements, symbolMap);
  properties = [
    ...properties,
    ...propertiesOfSymbol,
  ];

  return properties;
};

const isOutermostLayerSymbol = (symbol: any): boolean => {
  return symbol.valueDeclaration && symbol.valueDeclaration.symbol.valueDeclaration.type.members;
};

const isInnerLayerSymbol = (symbol: any): boolean => {
  return symbol.valueDeclaration && symbol.valueDeclaration.symbol.valueDeclaration.type.typeName;
};

const _getPropertiesOfSymbol = (symbol: ts.Symbol, propertyPathElements: InterfaceProperty[], symbolMap: Map<string, ts.Symbol>): InterfaceProperty[] => {
  if (!isOutermostLayerSymbol(symbol) && !isInnerLayerSymbol(symbol)) {
    return [];
  }
  let properties: InterfaceProperty[] = [];
  let members: any;
  if ((<any>symbol.valueDeclaration).type.symbol) {
    members = (<any>symbol.valueDeclaration).type.members.map((member: any) => member.symbol);
  } else {
    const propertyTypeName = (<any>symbol.valueDeclaration).type.typeName.escapedText;
    const propertyTypeSymbol = symbolMap.get(propertyTypeName);
    if (propertyTypeSymbol) {
      if (propertyTypeSymbol.members) {
        members = propertyTypeSymbol.members;
      } else {
        members = (<any>propertyTypeSymbol).exportSymbol.members;
      }
    }
  }
  if (members) {
    members.forEach((member: any) => {
      properties = [
        ...properties,
        ...getPropertiesOfSymbol(member, propertyPathElements, symbolMap),
      ];
    });
  }

  return properties;
};

const indexTs = path.join(__dirname, './index.ts');
const isKeysCallExpression = (node: ts.Node, typeChecker: ts.TypeChecker): node is ts.CallExpression => {
  if (!ts.isCallExpression(node)) {
    return false;
  }
  const signature = typeChecker.getResolvedSignature(node);
  if (typeof signature === 'undefined') {
    return false;
  }
  const { declaration } = signature;
  return !!declaration
    && !ts.isJSDocSignature(declaration)
    && (path.join(declaration.getSourceFile().fileName) === indexTs)
    && !!declaration.name
    && declaration.name.getText() === 'keys';
};
```

完整的repo可以移步[ts-interface-keys-transformer](https://github.com/nullcc/ts-interface-keys-transformer)。

使用该transformer非常简单，首先安装`ttypescript`：

```bash
npm i ttypescript
```

然后在tsconfig.json的`compilerOptions`下增加如下信息：

```
"plugins": [
  { "transform": "ts-interface-keys-transformer/transformer" }
]
```

例子如下：

```typescript
import { keys } from 'ts-interface-keys-transformer';

interface Foo {
  a: number;
  b?: string;
  c: {
    d: number;
    e?: boolean;
  }
  f: Bar;
}

interface Bar {
  x: string;
  y: number;
}

console.log(keys<Foo>());

// output:
// [ { name: 'a', optional: false },
//   { name: 'b', optional: true },
//   { name: 'c', optional: false },
//   { name: 'c.d', optional: false },
//   { name: 'c.e', optional: true },
//   { name: 'f', optional: false },
//   { name: 'f.x', optional: false },
//   { name: 'f.y', optional: false } ]
```
在build TypeScript项目时，一般用的是`tsc`命令，现在由于使用了ttypescript，需要改用`ttsc`，这里有一个[ts-interface-keys-transformer-demo](https://github.com/nullcc/ts-interface-keys-transformer-demo)展示了用法。

## 参考资料

1. [TypScript Architectural Overview](https://github.com/microsoft/TypeScript/wiki/Architectural-Overview)
2. [TypScript Compiler-Internals](https://github.com/microsoft/TypeScript/wiki/Compiler-Internals#transformer)
3. [ts-transformer-keys](https://github.com/kimamula/ts-transformer-keys)
4. [ts-ast-viewer](https://ts-ast-viewer.com/)
