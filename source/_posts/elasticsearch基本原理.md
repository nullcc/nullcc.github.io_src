---
title: ElasticSearch基本原理
date: 2017-05-18
tags: [ElasticSearch]
categories: web后端
---

本部分简要介绍一下ElasticSearch的基本原理，不会太深入，仅仅是介绍最基础的一些概念。

<!--more-->

## 1.基于Apache Lucene

## 2.使用REST API

## 3.输入数据分析

分析(analysis)是这样一个过程：

首先，表征化一个文本块为适用于倒排索引单独的词(term)
然后标准化这些词为标准形式，提高它们的“可搜索性”或“查全率”

对输入数据的分析是比较复杂的，由分析器完成。分析器(analyzer)的组成：

![输入分析过程](/assets/images/post_imgs/elasticsearch_1.png)

1.零个或多个*字符过滤器*(character filter)

	这是分词之前的操作，使用字符过滤器可以过滤掉HTML字符，并映射一些字符(比如'&'->'and)

2.一个*分词器*(tokenizer)

	对文本进行分词，把完整文本断成一个一个的词(英文或一些西方语言可以利用空格断词，中文或一些东方系语言需要使用词库断词)

3.零个或多个*标记过滤器*(token filter)，又被称为表征过滤器

	标记过滤器可以把分词后的单词标准化，比如lowercase过滤器可以把所有单词都转换成小写(例如Cat->cat)，stemmer过滤器则会把单词转换为它的词根或基本形式(例如cats->cat)。

ElasticSearch内置的一些*analyzer*：

|       analyzer        | logical name  | description                               |
| ----------------------|---------------| ------------------------------------------|
| standard analyzer      | standard      | standard tokenizer, standard filter, lower case filter, stop filter |
| simple analyzer       | simple        | lower case tokenizer                      |
| stop analyzer         | stop          | lower case tokenizer, stop filter         |
| keyword analyzer      | keyword       | 不分词，内容整体作为一个token(not_analyzed) |
| pattern analyzer      | whitespace    | 正则表达式分词，默认匹配\W+                 |
| language analyzers    | [lang](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/analysis-lang-analyzer.html)  | 各种语言 |
| snowball analyzer     | snowball      | standard tokenizer, standard filter, lower case filter, stop filter, snowball filter |
| custom analyzer       | custom        | 一个Tokenizer, 零个或多个Token Filter, 零个或多个Char Filter |

ElasticSearch内置的*tokenizer*列表：

| token filter          | logical name  | description                           |
| ----------------------| --------------| --------------------------------------|
| standard filter       | standard      |                                       |
| ascii folding filter  | asciifolding  |                                       |
| length filter         | length        | 去掉太长或者太短的                      |
| lowercase filter      | lowercase     | 转成小写                               |
| ngram filter          | nGram         |                                       |
| edge ngram filter     | edgeNGram     |                                       |
| porter stem filter    | porterStem    | 波特词干算法                            |
| shingle filter        | shingle       | 定义分隔符的正则表达式                  |
| stop filter           | stop          | 移除 stop words                        |
| word delimiter filter | word_delimiter| 将一个单词再拆成子分词                   |
| stemmer token filter  | stemmer       |                                        |
| stemmer override filter| stemmer_override|                                     |
| keyword marker filter | keyword_marker|                                        |
| keyword repeat filter | keyword_repeat|                                        |
| kstem filter          | kstem         |                                        |
| snowball filter       | snowball      |                                        |
| phonetic filter       | phonetic      | [插件](https://github.com/elasticsearch/elasticsearch-analysis-phonetic) |
| synonym filter        | synonyms      | 处理同义词                              |
| compound word filter  | dictionary_decompounder, hyphenation_decompounder | 分解复合词  |
| reverse filter        | reverse       | 反转字符串                              |
| elision filter        | elision       | 去掉缩略语                              |
| truncate filter       | truncate      | 截断字符串                              |
| unique filter         | unique        |                                        |
| pattern capture filter| pattern_capture|                                       |
| pattern replace filte | pattern_replace| 用正则表达式替换                        |
| trim filter           | trim          | 去掉空格                                |
| limit token count filter| limit       | 限制token数量                           |
| hunspell filter       | hunspell      | 拼写检查                                |
| common grams filter   | common_grams  |                                        |
| normalization filter  | arabic_normalization, persian_normalization |          |

ES内置的*character filter*列表：

| character filter          | logical name  | description               |
| --------------------------|---------------| --------------------------|
| mapping char filter       | mapping       | 根据配置的映射关系替换字符   |
| html strip char filter    | html_strip    | 去掉HTML元素               |
| pattern replace char filter| pattern_replace| 用正则表达式处理字符串    |

对具体字段的查询

* 当你查询全文(full text)字段，查询将使用相同的分析器来分析查询字符串，以产生正确的词列表。
* 当你查询一个确切值(exact value)字段，查询将不分析查询字符串，但是你可以自己指定。

## 4.评分和查询相关性

默认情况下，Apache Lucene使用TF/IDF(term frequency/inverse document frequency，词频/逆向文档频率)评分机制，这是一种计算文档在我们查询上下文中相关度的算法，也可以使用其他算法。

## 5.数据架构的主要概念

(1)索引

索引(index)是ElasticSearch对逻辑数据的逻辑存储，可以把它认为是关系型数据库的表。ElasticSearch可以把索引放在一台机器上或者分散放在多台机器上，每个索引有一个或多个分片(shard)，每个分片可以有多个副本(replica)。

(2)文档

存储在ElasticSearch中的主要实体是文档(document)，它相当于关系型数据库的行。ElasticSearch和MongoDB不同的是，MongoDB中相同字段类型可以不同，但ElasticSearch中相同字段必须是类型相同的。

文档包含多个字段。
从客户端的角度看，文档是一个JSON对象。
每个文档存储在一个索引中并由一个ElasticSearch自动生成的唯一标识符和文档类型。

索引、文档类型和文档ID唯一确定一个文档。

(3)文档类型

在ElasticSearch中，一个索引可以存放很多不同用途的文档，可以用文档类型加以区分。

但是需要记住一点，同一索引的所有文档类型中，同一字段名只能有一种类型。

(4)映射

*映射制定了ElasticSearch应该如何处理相应的字段。*

ElasticSearch在映射中存储有关字段的信息，每一个文档类型都有自己的映射，即使我们没有手动指定(当然也可以手动指定)。

例如年龄字段和内容字段就需要不同的处理，前者不需要做分析，后者需要。

## 6.ElasticSearch的主要概念

(1)节点和集群

ElasticSearch可以运行在单机上，不过为了处理大规模的数据和保证容错和高可用性，ElasticSearch被设计成分布式的，可以用多台机器组成ElasticSearch集群(cluster)，每台机器称为一个节点(node)。

(2)分片

当有大量数据需要处理时，单机的处理能力就不够了，此时可以把一个索引拆分成几个分片，分别放在不同的机器上。当搜索请求到来时，ElasticSearch会把查询发送到相关分片上，并将结果合并到一起回送客户端，然而客户端并不知道这些事情。而且分片可以加快索引速度。

(3)副本

为了提高吞吐量和保证高可用性，一个分片可以有零个或多个复制分片，称为副本。这些相同的分片中会有一个作为主分片来响应请求，其余副本保证了当主分片或主分片所在机器挂掉时晋升为主分片，保证可用性。

(4)节点间的同步

每个节点都会在本地保存信息，并会自动同步。

## 7.Elasticsearch 分片交互过程

(1)Elasticsearch如何把数据存储到分片中

这里有一个问题：当我们存储数据时，数据应该存放在哪一个分片中(主分片还是复制分片)？当我们取数据时，应当从哪个分片去取？

数据存储到分片中使用以下规则：

	shard = hash(routing) % number_of_primary_shards

这里，routing是一个字符串，一般是文档的_id值，也可以是用户自定义的值。使用hash函数计算出routing的散列值，再对主分片数取模运算，结果就是我们想要的那个分片，这个值范围是0-number_of_primary_shards - 1。

这样做也有个问题，就是在索引建立以后，主分片数不能更改。否则会有一部分数据无法被索引到。

(2)主分片和复制分片之间如何交互

这里有3个节点，2个主分片，每个主分片分别对应2个复制分片，node1为主节点：

![主分片和复制分片示例](/assets/images/post_imgs/elasticsearch_2.png)

1、索引与删除一个文档

![索引与删除一个文档](/assets/images/post_imgs/elasticsearch_3.png)

2、更新一个文档

![更新一个文档](/assets/images/post_imgs/elasticsearch_4.png)

3、检索文档

检索的过程将分为查询阶段与获取阶段。

检索文档-查询语句：

![检索文档-查询语句](/assets/images/post_imgs/elasticsearch_5.png)

检索文档-查询阶段：

![检索文档-查询阶段](/assets/images/post_imgs/elasticsearch_6.png)

查询阶段主要定位了所要检索数据的具体位置，但是我们还必须取回它们才能完成整个检索过程。

检索文档-获取阶段：

![检索文档-获取阶段](/assets/images/post_imgs/elasticsearch_7.png)
