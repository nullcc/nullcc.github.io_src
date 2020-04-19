---
title: LL(1)语法解析器的一次简单实践
date: 2020-04-19
tags: [语法解析器]
categories: 语言应用
---

本文记录LL(1)语法解析器的一次简单实践。

<!--more-->

## 需求概述

前段时间和Team内部的同学进行了一次Coding Dojo，遇到一道题目，我个人觉得有点意思，就记录了一下自己的解题方式和心得。题目是[StringCalculator](http://codingdojo.org/kata/StringCalculator/)。

这道题目一共有7个小需求，题目需求这里就不详细说明了，可以参考上面的链接。本文主要给出实现。

## 实现

这个题目实际上可以用LL(1)语法解析器来处理。这里先给出完整的语法解析器实现：

```typescript
// lexer.ts
export interface LexerOptions {
  collectAllErrors?: boolean;
}

export class Lexer {
  public static EOF = '<EOF>';
  public static TYPE_EOF = 0;
  public static TYPE_NUMBER: number = 1;
  public static TYPE_DELIMITER: number = 2;
  public static TYPE_NEW_LINE: number = 3;
  public static tokenNames: string[] = [ '<EOF>', 'NUMBER', 'TYPE_DELIMITER', 'NEW_LINE'];

  private options: LexerOptions;
  private input: string;
  private c: string;
  private i: number;
  private delimiter = ',';
  private _errors: string[] = [];

  public constructor(input: string, options?: LexerOptions) {
    this.options = options || {};
    this.input = input;
    this.i = 0;
    this.checkDelimiter();
    this.c = this.input[0];
  }

  public nextToken(): Token {
    while (this.c != Lexer.EOF) {
      switch (this.c) {
        case this.delimiter[0]: {
          for (let i = 1; i < this.delimiter.length; i += 1) {
            this.expect(this.delimiter[i]);
          }
          this.consume();
          if (this.expectNumber()) {
            return new Token(Lexer.TYPE_DELIMITER, this.delimiter);
          }
          this.collectError(`Number expected but '${this.getC()}' found at position ${this.i}.`);
          break;
        }
        case '\n': {
          this.consume();
          if (this.expectNumber()) {
            return new Token(Lexer.TYPE_DELIMITER, '\n');
          }
          this.collectError(`Number expected but '${this.getC()}' found at position ${this.i}.`);
          break;
        }
        default:
          if (this.isNumber()) {
            return this.readNumber();
          }
          if (this.i < this.input.length - 1 && this.c !== this.delimiter[0]) {
            this.collectError(`'${this.delimiter[0]}' expected but '${this.input[this.i]}' found at position ${this.i}.`);
            break;
          }
          this.consume();
      }
    }
    return new Token(Lexer.TYPE_EOF, Lexer.EOF);
  }

  get errors(): string[] {
    return this._errors;
  }

  private checkDelimiter(): void {
    const regex = /\/\/(.+?)\n(.+)?/;
    const res = regex.exec(this.input);
    if (res) {
      this.delimiter = res[1];
      this.input = res[2];
    }
  }

  private isNumber(): boolean {
    if (this.c === '-' || this.c === '.') {
      return true;
    }
    return !isNaN(parseFloat(this.c));
  }

  private consume(): void {
    this.i += 1;
    if (this.i > this.input.length) {
      this.c = Lexer.EOF;
    } else {
      this.c = this.input[this.i];
    }
  }

  private readNumber() {
    let numberStr = '';
    do {
      numberStr += this.c;
      this.consume();
    } while (this.isNumber());
    return new Token(Lexer.TYPE_NUMBER, parseFloat(numberStr));
  }

  private expectNumber(): boolean {
    return /\d/.test(this.c) || this.c === '-';
  }

  private expect(c: string): void {
    this.consume();
    if (this.c !== c) {
      this.collectError(`${c} expected but '${this.getC()}' found at position ${this.i}.`);
    }
  }

  private getC(): string {
    if (this.i < this.input.length) {
      return this.c;
    }
    return '<EOF>';
  }

  private collectError(errMsg: string) {
    if (this.options.collectAllErrors) {
      this._errors.push(errMsg);
    } else {
      throw new Error(errMsg);
    }
  }
}

export class Token {
  public type: number;
  public value: string | number;

  public constructor(type: number, value: string | number) {
    this.type = type;
    this.value = value;
  }

  public getTokenName(x: number): string {
    return Lexer.tokenNames[x];
  }
}
```

有了语法解析器以后，剩下的事情就很简单了。这里也不需要parser，只需要实现一个StringCalculator类即可：

```typescript
import { Lexer, LexerOptions } from './lexer';

export class StringCalculator {
  private options: LexerOptions;

  public constructor (options?: LexerOptions) {
    this.options = options || {};
  }

  public add(input: string): number {
    const tokens = [];
    const lexer = new Lexer(input, this.options);
    let token = lexer.nextToken();
    while (token.type !== Lexer.TYPE_EOF) {
      tokens.push(token);
      token = lexer.nextToken();
    }
    let res = 0;
    let errors: string[] = [];
    errors = errors.concat(lexer.errors);
    const negativeNumberTokens = tokens.filter(token => token.value < 0);
    if (negativeNumberTokens.length > 0) {
      const negativeNumbers = negativeNumberTokens.map(token => token.value);
      errors = errors.concat(`Negative not allowed: ${negativeNumbers.join(', ')}`);
    }
    if (errors.length > 0) {
      throw new Error(errors.join('\n'));
    }
    for (const token of tokens) {
      if (token.type === Lexer.TYPE_NUMBER) {
        res += <number> token.value;
      }
    }
    return res;
  }
}
```

## 测试

```typescript
// string-calculator.test.ts
import { StringCalculator } from '../src/calculator';

describe('Test string calculator.', () => {
  test('Test case 0.', async () => {
    const input = '';
    const stringCalculator = new StringCalculator();
    const res = stringCalculator.add(input);
    expect(res).toEqual(0);
  });

  test('Test case 1.', async () => {
    const input = '0';
    const stringCalculator = new StringCalculator();
    const res = stringCalculator.add(input);
    expect(res).toEqual(0);
  });

  test('Test case 2.', async () => {
    const input = '1,2,3,10';
    const stringCalculator = new StringCalculator();
    const res = stringCalculator.add(input);
    expect(res).toEqual(16);
  });

  test('Test case 3.', async () => {
    const input = '1,2.5,3';
    const stringCalculator = new StringCalculator();
    const res = stringCalculator.add(input);
    expect(res).toEqual(6.5);
  });

  test('Test case 4.', async () => {
    const input = '1\n2,3,10';
    const stringCalculator = new StringCalculator();
    const res = stringCalculator.add(input);
    expect(res).toEqual(16);
  });

  test('Test case 5.', async () => {
    const input = '1\n2,3,10';
    const stringCalculator = new StringCalculator();
    const res = stringCalculator.add(input);
    expect(res).toEqual(16);
  });

  test('Test case 6.', async () => {
    try {
      const input = '1\n,2,3,10';
      const stringCalculator = new StringCalculator();
      const res = stringCalculator.add(input);
      expect(true).toBe(false);
    } catch (e) {
      expect(e.message).toBe("Number expected but ',' found at position 2.");
    }
  });

  test('Test case 7.', async () => {
    try {
      const input = '1,2,3,10,';
      const stringCalculator = new StringCalculator();
      const res = stringCalculator.add(input);
      expect(true).toBe(false);
    } catch (e) {
      expect(e.message).toBe("Number expected but '<EOF>' found at position 9.");
    }
  });

  test('Test case 8.', async () => {
    const input = '//;\n1;2';
    const stringCalculator = new StringCalculator();
    const res = stringCalculator.add(input);
    expect(res).toEqual(3);
  });

  test('Test case 9.', async () => {
    const input = '//|\n1|2|3';
    const stringCalculator = new StringCalculator();
    const res = stringCalculator.add(input);
    expect(res).toEqual(6);
  });

  test('Test case 10.', async () => {
    const input = '//sep\n2sep3';
    const stringCalculator = new StringCalculator();
    const res = stringCalculator.add(input);
    expect(res).toEqual(5);
  });

  test('Test case 11.', async () => {
    try {
      const input = '//|\n1|2,3';
      const stringCalculator = new StringCalculator();
      const res = stringCalculator.add(input);
    } catch (e) {
      expect(e.message).toBe("'|' expected but ',' found at position 3.");
    }
  });

  test('Test case 12.', async () => {
    try {
      const input = '-1,2';
      const stringCalculator = new StringCalculator();
      const res = stringCalculator.add(input);
    } catch (e) {
      expect(e.message).toBe("Negative not allowed: -1");
    }
  });

  test('Test case 13.', async () => {
    try {
      const input = '2,-4,-5';
      const stringCalculator = new StringCalculator();
      const res = stringCalculator.add(input);
    } catch (e) {
      expect(e.message).toBe("Negative not allowed: -4, -5");
    }
  });

  test('Test case 14.', async () => {
    try {
      const input = '-1,,2';
      const stringCalculator = new StringCalculator({ collectAllErrors: true });
      const res = stringCalculator.add(input);
    } catch (e) {
      expect(e.message).toBe("Number expected but ',' found at position 3.\nNegative not allowed: -1");
    }
  });
});
```

## 其他

Coding Dojo过程中我发现这题的很多的实现都是先用`split`之类的方法去解开整个输入字符串，然后收集到一个数字数组后再去求和。这样做不能说不行，但是随着本题的需求越来越多，这种实现方式的弊端会慢慢显现出来，代码越来越复杂，而且很难修改。如果利用LL(1)语法解析器，其解析精度会比较高，而且一系列需求做下来实际上是对它的渐进式增强。在实际解题的过程中我发现对于每个新需求，使用LL(1)语法解析器的方案需要做的修改和重构量都很小，而且比较不容易出错。