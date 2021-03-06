---
title: 关于TDD和BDD的一点浅见
date: 2018-03-06
tags: [敏捷开发, TDD, BDD]
categories: 敏捷开发
---

`TDD`(Test-Driven Development)和`BDD`(Behavior-Driven Development)在敏捷开发中经常被提到，虽然看上去好像有点类似，但实际上它们两者的含义、适用人群、使用方式和在软件开发中的作用的区别相当大。

<!--more-->

## TDD(Test-Driven Development)——测试驱动开发

TDD是敏捷开发中的一项核心开发实践，也是一种方法论。其主要思想是在正式编写需求功能的代码之前，先编写单元测试代码，再编写需求功能代码满足这些单元测试代码。

TDD的测试粒度很细，可以说是最底层的一种测试了，开发人员针对一个类、一个函数去编写单元测试。在实际项目中，仅仅是一个函数的单元测试可能就要写多个测试函数：针对边界值、极大值、极小值、正常值、空值等的测试。因此这也导致了开发人员需要编写大量测试代码，如果想要较好地覆盖需要测试函数和类，这些单元测试代码的量可能会远大于实际功能代码的量。

TDD中主要是开发人员写单元测试，基本不太需要测试人员参与。TDD的好处非常明显，第一个好处是由于每个类和函数都有相应的单元测试，因此在任何一个时间节点，功能代码的质量都不会太差，只有很少量的bug，软件的可交付性好。还有一个好处是，代码的可维护性较高，开发人员可以时常重构和优化代码，而不必担心无意中引入问题，开发人员可以在每次重构完一个函数时运行单元测试，单元测试会告诉我们这个重构是否引入了错误。TDD结合持续集成(CI)在实际项目开发中可以有非常好的效果，开发人员在任何时刻都可以启动一次自动化测试，CI系统稍后会告诉你结果。TDD保证了在函数和类级别的可测试性和可维护性。

实际项目中，由于交付时间的限制，不太可能所有函数和类都去用详尽的单元测试区覆盖，所以实践TDD的最基本要求应该是对那些重要的东西编写尽可能详细的单元测试，把我们的精力花费在最核心的部分。

## BDD(Behavior-Driven Development)——行为驱动开发

从层次上来说，BDD是基于TDD的，或者说在自动化测试中，TDD所在的位置比较底层，是基础，而BDD大概在中间的位置。

BDD核心的是，开发人员、QA、非技术人员和用户都参与到项目的开发中，彼此协作。BDD强调从用户的需求出发，最终的系统和用户的需求一致。BDD验证代码是否真正符合用户需求，因此BDD是从一个较高的视角来对验证系统是否和用户需求相符。

BDD倡导使用简单明了的自然语言描述系统行为，保证系统功能和设计是相符的。