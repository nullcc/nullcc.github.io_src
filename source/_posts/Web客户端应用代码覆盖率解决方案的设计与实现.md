---
title: Web客户端应用代码覆盖率解决方案的设计与实现
date: 2023-02-28
tags: [代码覆盖率]
categories: 自动化测试
---

本文对Web客户端应用代码覆盖率的解决方案做了一些讨论，全文以一种模拟系统设计面试的场景的方式来讲述。

<!--more-->

## 第一步：理解问题并确定设计范围

在Web客户端应用的研发过程中，对目标应用的测试是必不可少的。Martin Fowler在 [TestPyramid](https://martinfowler.com/bliki/TestPyramid.html) 中提到测试金字塔的概念，表明在一个系统的测试方案中，出于测试效率和成本的考量，一般来说我们需要构建大量的单元测试(UT)，中等数量的集成测试(IT)和少量的端到端测试(E2E Test)。

![测试金字塔，引用自https://martinfowler.com/bliki/TestPyramid.html](/assets/images/post_imgs/test-pyramid.png)

我们通常会使用一些测试框架来进行测试，这些框架中集成的工具可以帮助生成测试报告。在单元测试和集成测试中这很容易办到，例如在Web客户端开发中，我们常用 [Jest ](https://jestjs.io/)来运行它们。这些测试框架支持生成各种测试报告，常见的有 [Istanbul](https://istanbul.js.org/)。也就是说我们很容易量化单元测试和集成测试的代码覆盖率。那么对于Web客户端应用的端到端测试是否也能这样量化？更进一步地，如果在回归阶段我们想要综合地量化 Web 客户端应用的所有测试对代码的覆盖率呢？本文将讨论这个问题域的具体解决方案。

当确定了基本的问题域后，我们可以给出 Web 客户端应用的代码覆盖率解决方案的基本功能：

* 从被测Web应用中收集原始覆盖率数据
* 处理原始代码覆盖率数据，并将归属于同一个项目的同一个release下的所有覆盖率数据进行合并，计算出总体覆盖率。
* 用户能针对某个项目的某个 release 生成覆盖率报告。

以下的面试对话有助于明确需求和缩小设计范围。

候选人：我们需要支持哪些平台和编程语言？
面试官：浏览器和 Electron 应用。这些应用都使用JS/TS编写。

候选人：我们需要支持哪些代码覆盖率数据格式？
面试官：Chrome V8 和 Istanbul。

候选人：我们需要支持哪些测试类型？
面试官：单元测试, 集成测试和端到端测试。

候选人：上述的测试类型是概念上的，我觉得可以将它们进一步映射到具体的技术手段上。在Web客户端测试实践中，单元测试和集成测试经常放在一起执行，可以把他们都归为一类，统称为 Unit Testing (UT)。端到端测试还分为自动化端到端测试和手工端到端测试，可以分别称为 Automated Testing (AT) 和 Manual Testing (MT)。这样按照技术手段区分有助于之后的具体设计实现。
面试官：听上去可行。

候选人：我们多久执行一次全量的测试覆盖率收集？每个release持续多长时间？
面试官：每个 release 执行一次。每个 release 持续3周。

候选人：一般来说 UT 执行后只会生成一份代码覆盖率数据（UT 框架会执行所有 UT cases 并计算出总体覆盖率数据），但每个端到端测试都会生成一份单独的代码覆盖率数据。因此 AT + MT 产生的数据会比 UT 多得多。我们有必要先预估每个 release 有多少 AT + MT 需要执行？
面试官：让我们假设每个 release 中 AT + MT 有10k个。

候选人：代码覆盖率数据的上传并发数有多少？
面试官：让我们假设代码覆盖率数据的上传并发数为50。

候选人：代码覆盖率数据的平均大小是多少？
面试官：让我们假设代码覆盖率数据的平均大小为30M。

候选人：我们的原始覆盖率数据有保留期限吗？
面试官：是的，让我们假设原始覆盖率数据需要被保留1个release，即3周。

候选人：我们对代码覆盖率报告的生成有什么要求吗？
面试官：要能够支持对不同测试类型的组合生成代码覆盖率报告。例如：UT + AT + MT 或者 AT + MT。

### 功能需求

* 能从浏览器和 Electron 应用中收集代码覆盖率数据
* 需要支持三种测试类型：UT, AT 和 MT
* 能够存储和处理原始代码覆盖率数据
* 支持用户根据测试类型的组合生成代码覆盖率报告
* 支持可配置的数据保留期

### 非功能需求和约束

* 精确性：代码覆盖率数据要尽可能精确

### 粗略估算

让我们做一个粗略估计，以确定我们的解决方案需要应对的潜在规模和挑战。一些约束和假设如下：

* 假设每个release中有10k个case。
* 结社灭个case产生的代码覆盖率数据为30M。
* 假设代码覆盖率数据的平均上传并发数为50。
* 假设数据保留期为3周。
* 假设在最大上传并发(50)下，所有客户端都能在5s内上传成功一个平均大小的的代码覆盖率数据文件。

以下是根据上传约束和假设做出的估算：

|          项目          |            预估值            |
| :--------------------: | :--------------------------: |
|        网络带宽        | 30MB * 50 / 5s * 8 ~ 2.4Gbps |
|        存储容量        |      30MB * 10k ~ 300GB      |
| 代码覆盖率数据上传 TPS |              50              |

## 第二步：提出高阶设计并获得认可

现在我们可以给出一个高阶的方案图：

![高阶设计](/assets/images/post_imgs/web_application_coverage_solution_1.png)

高阶设计中有3个部分：

- Code coverage client
- Coverage management service
- Coverage aggregation service

### Code Coverage Client

Web客户端应用的代码覆盖率解决方案中一个很重要的部分就是收集端，覆盖率数据的收集和上传都发生在这里。如前所述，我们需要支持Web客户端应用 UT, AT 和 MT 的代码覆盖率。让我们分别来看看：

#### UT 覆盖率数据

对于 UT 覆盖率数据，我们常用 [Jest](https://jestjs.io/) 运行 UT 用例，然后生成 [Istanbul](https://istanbul.js.org/) 代码覆盖率报告，这个比较容易处理。因此我们只需要将这些现成的 UT 代码覆盖率数据上传到后端即可。在实践中一般是在 Jenkins pipeline 中运行 UT，只需要使用 curl 命令即可上传至后端。这里不需要引入专门的代码覆盖率客户端来收集和上传数据。

#### AT 覆盖率数据

对于 AT 覆盖率数据，很多Web自动化测试框架如 [webdriver.io](https://webdriver.io/) 都支持在本地和远程在浏览器和Electron中运行Web应用。为了在浏览器中收集代码覆盖率数据，我们需要借助于  [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)。

> "The Chrome DevTools Protocol allows for tools to instrument, inspect, debug and profile Chromium, Chrome and other [Blink](https://www.chromium.org/blink/)-based browsers."

这句摘自 [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) 的话告诉我们了如何收集浏览器端的代码覆盖率数据。我们可以设计一个专用的代码覆盖率客户端来收集和上传这些数据。

#### MT 覆盖率数据

Web客户端应用 的 MT 用例由 QA 手工在浏览器上执行。但一般情况下，QA 会直接启动浏览器并访问目标应用，因此无法在浏览器端直接收集代码覆盖率数据。我们需要一个包装器应用程序，它可以启动浏览器并启用一些 profile 功能，以便代码覆盖率客户端可以收集浏览器上的 coverage。

我们得到了收集端和上传端的进一步设计方案：

![收集端和上传端的设计](/assets/images/post_imgs/web_application_coverage_solution_2.png)

### Coverage Management Service

coverage management service 的关键功能有：

- 接收 coverage 数据
- Project 和 release 的管理功能
- 生成 coverage 报告

我们先关注 coverage 数据，有 3 种 coverage 数据需要被持久化：

- Coverage metadata
- Raw coverage data
- Release coverage data

#### Coverage metadata

Coverage metadata 记录了原始 coverage 的基本信息，这些信息包括但不限于：

|     属性      |  类型  |
| :-----------: | :----: |
|  coverage id  | string |
|  project id   | string |
|  release id   | string |
|      sut      | string |
| testing type  | string |
|    case id    | string |
| build version | string |
|  file format  | string |
|    status     | string |
|  uploaded by  | string |

Coverage metadata 数据尺寸都不大，它们可以被存储在 NoSQL 和 RDBMS 中。

#### Raw coverage data

Raw coverage data 的来源是多种多样的。我们可以通过 CDP 连接从 chrome V8 引擎收集它们，或者是 Istanbul coverage。Raw coverage data 的典型大小单位是MB，因此 NoSQL 和 RDBMS 不适用于这种情况。我们选择对象存储服务（OSS）来存储这些数据：

|             属性             |  类型  |
| :--------------------------: | :----: |
|         coverage id          | string |
|    coverage storage name     | string |
| source code map storage name | string |

#### Release coverage data

Chrome V8 覆盖率数据不能直接用于生成覆盖率报告。我们必须将其转换为 Istanbul coverage。Istanbul coverage 的典型大小单位是MB，因此 NoSQL 和 RDBMS 不适合这种情况。我们选择对象存储服务（OSS）来存储这些数据。请注意，我们在这里存储 release id和testing type，因为同一测试类型的所有原始覆盖率数据在一个 release 中被聚合在一起。通过这种设计，对于每一个 release，我们都会得到三种测试类型的三个 release 覆盖率记录：

- 已合并的 UT coverage
- 已合并的 AT coverage
- 已合并的 MT coverage

|             属性             |  类型  |
| :--------------------------: | :----: |
|    coverage storage name     | string |
|          release id          | string |
| source code map storage name | string |
|         testing type         | string |

基于这些数据，用户就可以以任意测试类型的组合来生成代码覆盖率报告了。

### Coverage Aggregation Service

Coverage Aggregation Service 负责将每个原始覆盖率数据转换为 Istanbul coverage，并将其合并到其对应的 release 覆盖率中。设计如下：

![Coverage Aggregation Service的设计](/assets/images/post_imgs/web_application_coverage_solution_3.png)

在这个设计中，UT 输出 Istanbul coverage，因此无需额外处理。AT 和 MT 输出 V8 coverage。覆盖率聚合服务将V8覆盖率转换为伊斯坦布尔覆盖率，然后将其合并为相应的发布测试类型覆盖率。

### Generate coverage report

我们的目标是按 release 和测试类型生成覆盖率报告。我们可以通过发布 UT/AT/MT 覆盖数据来完成这一任务。现在我们还有一个问题要解决：如何获取源代码？覆盖率报告由覆盖率数据和源代码组成。我们将在详细设计部分讨论这个问题。

## 第三步：详细设计

在这部分，我们将详细讨论这三个组件：

- Code coverage client
- Coverage management service
- Coverage aggregation service

### Code Coverage Client

浏览器和Electron程序上的覆盖率收集机制不同。

我们通过 CDP 收集浏览器覆盖率：

![通过CDP收集浏览器上的JS代码覆盖率](/assets/images/post_imgs/web_application_coverage_solution_4.png)

Electron 应用程序在 Node.js 上运行，我们需要使用环境变量 [NODE_V8_COVERAGE=dir](https://nodejs.org/api/cli.html#node_v8_coveragedir) 启动Electron应用程序。通过设置此环境变量，Node.js 中的 V8 引擎在运行时会收集 coverage，并在进程退出时将 V8 coverage 输出到给定目录。

![在Electron应用上收集JS代码覆盖率](/assets/images/post_imgs/web_application_coverage_solution_7.png)

现在我们已经完成了从浏览器和 Electron 应用程序收集覆盖率的详细设计。让我们考虑一下上一节中提到的问题：如何获取源代码？

### Fetch source code

我们有3种测试类型和2个平台需要考虑：

- UT
- AT
  - Browser
  - Electron
- MT
  - Browser
  - Electron

对于 UT，我们可以在生成 Istanbul coverage 后获取所有文件名（文件名是 Istanbul coverage 的 key）。通过访问本地项目的 repository，我们可以按文件名获取到源代码。

对于浏览器上的 AT，我们可以从 JS source map 中获取源代码。例如，打包的 JS 文件部署在 https://www.myapp.com/static/js/4331.35a46fee9f78aedbca7c.chunk.min.js 这个文件的末尾有一个像这样的标记（注释）：

```javascript
//# sourceMappingURL=4331.35a46fee9f78aedbca7c.chunk.min.js.map
```

此标记指示此 JS 文件的 JS source map URL。我们需要获取该 JS 文件及其JS source map，然后解析它们以获取 JS 源代码。

对于 Electron 应用程序的 AT，我们可以通过解析 Electron ASAR 归档文件从 JS source map 中获取 JS 源代码。[@electron/asar](https://github.com/electron/asar) 这个包可以帮助我们完成这项任务。

浏览器和 Electron 应用程序上的 MT 解决方案与 AT 类似，这里不做讨论。

### Coverage management service

coverage management service 最终要的几个功能如下：

- 创建 project
- 创建属于某个 project 的 release
- 创建 coverage
- 生成 coverage report

创建 project、release和 coverage 基本上都是 CRUD 操作，这里不讨论。生成 coverage report 值得讨论一下。在工程实践中，可能有多个团队在同一 repository 中协作开发。我们通常需要为这些团队单独生成覆盖率报告，或者将它们合并到一个整体覆盖率报告中。我们可以这样设计这个API：

```json
POST /api/v1/coverage-reports
 
{
  "releaseIds": [],
  "testingTypes": [
    "UT",
    "AT",
    "MT"
  ],
  "reportType": "",
  "comment": ""
}
```

releaseId 数组字段中的值表示我们希望将多个项目发布覆盖率数据合并到一个覆盖率报告中。testingTypes 字段指示当前覆盖率报告中应包括哪些测试类型的覆盖率。

### Coverage aggregation service

Coverage aggregation service 是整个系统中最复杂的部分，我们来看一下它的工作流程：

![Coverage aggregation service的工作流程](/assets/images/post_imgs/web_application_coverage_solution_5.png)

Coverage aggregation service 的工作流说明：

1. 一个定时器会定期被触发来扫描未处理的 coverage，然后根据 coverage type（V8 或 Istanbul）对其进行处理。
   * V8:
     * (1) 从 V8 raw coverage 中提取 JS URL
     * (2) 获取所有打包的 JS 文件和相应的 JS source map
     * (3) 将 V8 coverage 中的所有 JS 文件的覆盖率数据转换为 Istanbul coverage（此步骤中需要打包的 JS 文件及其 source map）
     * (4) 将所有文件的  Istanbul coverage 合并为一个 Istanbul coverage 作为 case coverage
   * Istanbul: 无需任何处理
2. Case coverage 将按测试类型（UT/AT/MT）合并到其 release coverage 中。
3. Release coverage 在本地缓存在服务中，并由一个专用 scheduler 上传到OSS，以减小昂贵的网络 I/O 开销。
4. 过期数据清理 scheduler 负责清理过期数据，为新数据腾出空间。
5. 用户可以请求 coverage management service 实时生成 coverage report。

## 第四步：总结

本文讨论了 Web/Electron 应用的代码覆盖率收集、分析和报告生成的解决方案。让我们用思维导图总结一下：

![总结](/assets/images/post_imgs/web_application_coverage_solution_6.png)

