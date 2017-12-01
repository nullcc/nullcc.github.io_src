---
title: 使用ElasticSearch搭建高性能可扩展的全文搜索引擎
date: 2017-05-18
tags: [ElasticSearch]
categories: web后端
---

## 准备环境

1. 下载 ElasticSearch

最新版本下载:  https://www.elastic.co/downloads/elasticsearch
指定版本下载:  https://download.elasticsearch.org/elasticsearch/elasticsearch/elasticsearch-[版本号].zip

## 安装

### 1. 安装ElasticSearch

1. 首先下载ElasticSearch(请先确认你已经安装了JDK)
2. cd到所在文件夹后运行以下命令

```shell
unzip elasticsearch-1.2.2.zip
mv elasticsearch-1.2.2 /usr/local/
ln -s /usr/local/elasticsearch-1.2.2 /usr/local/elasticsearch
```
### 安装到自启动项

我们还需要设置ElasticSearch自启动，成为daemon常驻后台，这里需要用到[elasticsearch-servicewrapper](https://github.com/elastic/elasticsearch-servicewrapper)，unzip后把service文件夹copy到 /usr/local/elasticsearch/bin下，运行以下命令可以安装ElasticSearch：

```shell
sudo /usr/local/elasticsearch/bin/service/elasticsearch install
```

启动：

```shell
sudo /usr/local/elasticsearch/bin/service/elasticsearch start
```

如果启动失败，可能是内存设置有问题，打开bin/service/elasticsearch.conf文件，设置Elasticsearch能够分配的JVM内存大小。一般情况下，设置成总内存的50%比较好：

```shell
set.default.ES_HEAP_SIZE=512
```

如果要限制ES_MIN_MEM和ES_MAX_MEM，建议设置成一样大，避免出现频繁的内存分配。

### 修改节点名称

有时候需要指定一个明确的节点名称，如果不指定，ElasticSearch会随机为我们生成一个节点名，每次启动都不同。要手动指定节点名，需要打开/usr/local/elasticsearch/config/elasticsearch.yml文件，修改(比如要指定该节点名称为meiqu)：

```shell
node.name: "meiqu"
```

保存后，重启Elasticsearch就行了。

### 2. 安装插件

```shell
head:           /usr/local/elasticsearch/bin/plugin -install mobz/elasticsearch-head
marvel:         /usr/local/elasticsearch/bin/plugin -i elasticsearch/marvel/latest
mongodb插件:     /usr/local/elasticsearch/bin/plugin --install com.github.richardwilly98.elasticsearch/elasticsearch-river-mongodb/2.0.1
```

### 3. 配置分词插件

ElasticSearch默认采用standard分词，默认的分词对中文来说效果不好，只是简单粗暴地把所有中文字拆分出来，并没有根据词的语意来分词(没有使用中文词库)，因此在真正查询的时候，准确率不高，我们可以使用ik分词插件或者其他插件，这里以ik分词来做示例。

1.从 https://github.com/medcl/elasticsearch-rtf/tree/master/plugins/analysis-ik 下载 elasticsearch-analysis-ik-1.2.6.jar，放到/usr/local/elasticsearch/plugins/analysis-ik文件下(没有就新建一个)。

2.从 https://github.com/medcl/elasticsearch-analysis-ik 下载ik分词插件，unzip后把config目录下的ik目录放到/usr/local/elasticsearch/config文件夹下。

3.打开/usr/local/elasticsearch/config/elasticsearch.yml，在最后加上：

```yml
index:
  analysis:
      tokenizer:
        my_tokenizer:
            type: ik
            use_smart: false                
      analyzer:      
          ik:
              alias: [ik_analyzer]
              type: org.elasticsearch.index.analysis.IkAnalyzerProvider
          ik_max_word:
              type: ik
              use_smart: false
          ik_smart:
              type: ik
              use_smart: true
          my_analyzer:
            type: custom
            tokenizer: my_tokenizer
              filter: [lowercase, stemmer]
```

配置完需要重启ElasticSearch。

### 4.运行

在console里运行：

```shell
sudo /usr/local/elasticsearch/bin/elasticsearch start
```

在后台运行：

```shell
sudo /usr/local/elasticsearch/bin/service/elasticsearch start
```

### 5.控制台

```shell
marvel:         http://localhost:9200/_plugin/marvel
sense:          http://localhost:9200/_plugin/marvel/sense/index.html
head:           http://localhost:9200/_plugin/head/
river-mongodb   http://localhost:9200/_plugin/river-mongodb/
```

PS: 以下的示例全部使用marvel的sense来运行。

经过以上的配置，我们的ElasticSearch的默认分词算法已经变成ik了。

我们可以先来测试一下我们配置的ik分词效果如何，作为对比，会先运行默认分词的例子。

首先新建一个索引：

```shell
curl -XPUT http://localhost:9200/index
```

standard分词：

```shell
GET /meiqu/_analyze?analyzer=standard&pretty=true
{
    "text":"PHP是全世界最好的编程语言"
}
```

结果有点蛋疼，默认分词是直接切分了每个汉字，结果如下：

![standard](/assets/images/post_imgs/elasticsearch_usage_1.png)

ik分词：

```shell
GET /meiqu/_analyze?analyzer=ik&pretty=true
{
    "text":"PHP是全世界最好的编程语言"
}
```

ik分词比较合理地做到了根据词语的意思来分词，效果还不错（在分词中，一些助动词经常被省略，比如'是'）：

![standard](/assets/images/post_imgs/elasticsearch_usage_2.png)

利用成熟的分词插件，可以让我们的全文索引功能事倍功半。

#### 自定义分词词典

先制作自己的词典，然后修改文件 /usr/local/elasticsearch/config/ik/IKAnalyzer.cfg.xml 中的词典配置项就行。

## 6.同步mongodb到ElasticSearch

* 注意: 请先确保拥有至少一个mongoDB的副本集合，以下是MongoDB River Plugin、ElasticSearch和MongoDB的版本搭配列表

| MongoDB River Plugin     | ElasticSearch    | MongoDB       | TokuMX        |
|--------------------------|------------------|---------------|---------------|
| master                   | 1.4.2            | 3.0.0         | 1.5.1         |
| 2.0.9                    | 1.4.2            | 3.0.0         | 1.5.1         |
| 2.0.5                    | 1.4.2            | 2.6.6         | 1.5.1         |
| 2.0.2                    | 1.3.5            | 2.6.5         | 1.5.1         |
| 2.0.1                    | 1.2.2            | 2.4.9 -> 2.6.3| 1.5.0         |
| 2.0.0                    | 1.0.0 -> 1.1.1   | 2.4.9         |               |
| 1.7.4                    | 0.90.10          | 2.4.8         |               |
| 1.7.3                    | 0.90.7           | 2.4.8         |               |
| 1.7.2                    | 0.90.5           | 2.4.8         |               |
| 1.7.1                    | 0.90.5           | 2.4.6         |               |
| 1.7.0                    | 0.90.3           | 2.4.5         |               |
| 1.6.11                   | 0.90.2           | 2.4.5         |               |
| 1.6.9                    | 0.90.1           | 2.4.4         |               |
| 1.6.8                    | 0.90.0           | 2.4.3         |               |
| 1.6.7                    | 0.90.0           | 2.4.3         |               |
| 1.6.6                    | 0.90.0           | 2.4.3         |               |

为ElasticSearch创建和mongoDB对应的index和type:

```shell
PUT /_river/mongodb/_meta
  {
    "type": "mongodb",
    "mongodb": {
        "db": "DATABASE_NAME",
        "collection": "COLLECTION",
        "gridfs": true
      },
    "index": {
        "name": "ES_INDEX_NAME",
        "type": "ES_TYPE_NAME"
    }
  }
```

#### 同步食物表、运动表、贴士表和用户表

在真正开始同步之前我们先来做一些准备工作，这些工作很重要，直接影响到我们搜索匹配的精确度和排序，就是指定mapping：

#### 为索引创建别名

有时我们需要更改索引中的映射，这就需要重建索引，为了做到无缝切换索引和零停机时间，可以使用别名机制。
先为上述的索引创建别名，这个别名就叫做meiqu，真正的索引名可以为meiqu_v1、meiqu_v2之类的，然后在查询时，只需要使用别名meiqu就行了，这样客户端代码不需要修改。

我们创建了一个索引meiqu_v1，并创建了一个别名指向它：

1. 创建一个索引和别名：

```shell
PUT /meiqu_v1
```

只所以在索引名后加一个版本号是由于以后可能会重建索引，为了保证生产环境在重建索引时的平滑过渡，需要有一个别名机制。这里先新建一个索引，创建别名需要在重建索引完毕后再进行。

2. 为foods表指定mapping：

```shell
PUT /meiqu_v1/foods/_mapping
{
  "foods": {
      "properties": {
          "name": {
            "type" : "string",
            "analyzer" : "my_analyzer"
          },
          "nutrientInfoArr": {
                "properties": {
                   "content": {
                      "type": "string"
                   }
                }
             }
      }
  }
}
```

3. 为activities表指定mapping：

```shell
PUT /meiqu_v1/activities/_mapping
{
  "activities": {
      "properties": {
          "name": {
            "type" : "string",
            "analyzer" : "my_analyzer"
          }
      }
  }
}
```

4. 为tips表指定mapping：

```shell
PUT /meiqu_v1/tips/_mapping
{
  "tips": {
      "properties": {
          "title": {
            "type" : "string",
            "analyzer" : "my_analyzer"
          },
          "summary":{
            "type" : "string",
            "analyzer" : "my_analyzer"
        },
          "content":{
            "type" : "string",
            "analyzer" : "my_analyzer"
          }
      }
  }
}
```

5. 为user表指定mapping：

```shell
PUT /meiqu_v1/users/_mapping
{
  "users": {
    "properties": {
        "profile": {
            "properties": {
                "nickname": {
                  "type" : "string",
                  "analyzer" : "my_analyzer"
                }
        }
        }
      }
  }
}
```

指定mapping可以选择我们需要的字段来做分词和建立倒排索引，因为分词和建立倒排索引是需要消耗很多性能的，例如_id、url之类的字段我们没必要为他们做这些，所以我们需要指定哪些重要的字段需要分词。

食物表

```shell
PUT /_river/mongodb_foods/_meta
{
  "type": "mongodb",
  "mongodb": {
      "host": "192.168.1.119",
      "port": "27017",
      "db": "meiqu618_20150211",
      "collection": "foods"
  },
  "index": {
      "name": "meiqu_v1",
      "type": "foods"
    }
  }
```

运动表

```shell
PUT /_river/mongodb_activities/_meta
{
  "type": "mongodb",
  "mongodb": {
      "host": "192.168.1.119",
      "port": "27017",
      "db": "meiqu618_20150211",
      "collection": "activities"
  },
  "index": {
      "name": "meiqu_v1",
      "type": "activities"
    }
  }
```

贴士表

```shell
PUT /_river/mongodb_tips/_meta
{
"type": "mongodb",
"mongodb": {
    "host": "192.168.1.119",
    "port": "27017",
    "db": "meiqu618_20150211",
    "collection": "tips"
},
"index": {
    "name": "meiqu_v1",
    "type": "tips"
  }
}
```

用户表

```shell
PUT /_river/mongodb_users/_meta
{
  "type": "mongodb",
  "mongodb": {
      "host": "192.168.1.119",
      "port": "27017",
      "db": "meiqu618_20150211",
      "collection": "users"
  },
  "index": {
      "name": "meiqu_v1",
      "type": "users"
    }
}
```

6. 数据同步完毕后，创建索引别名：

```shell
PUT /meiqu_v1/_alias/meiqu
```

这个别名很重要，我们需要使用这个别名来指向当前的索引，代码中也是使用这个别名来进行查询。

7. 简单查询

* 使用以下查询，能够查询出食物名称中包含"番茄"的所有食物:

```shell
GET /meiqu/foods/_search
{
  "query": {
      "match": {
          "name": "番茄"
      }
  },
  "_source": ["_id", "name", "calory", "description", "units", "userName"]
}
```

* 使用以下查询，能够查询出运动名称中包含"跑"的所有运动:

```shell
GET /meiqu/activities/_search
{
  "query": {
      "match": {
          "name": "跑"
      }
  },
  "_source": ["_id", "name", "mets", "description"]
}
```

* 使用以下查询，能够查询出贴士名称中包含"白领"的所有贴士:

```shell
GET /meiqu/tips/_search
{
  "query": {
    "bool": {
      "must": [
        {
            "term": {
              "status": 1
            }
        },
        {
            "range": {
              "effDate": {
                  "lt": new Date().getTime()
              }
            }
        },
        {
            "dis_max": {
              "queries": [
                  { "match": { "title":"白领" }},
                  { "match": { "tags":"白领" }}
              ],
              "tie_breaker": 0.3
            }
        }
      ]
    }
  },
  "_source": ["_id", "title", "cover", "summary", "tags", "effDate"]
}
```

* 使用以下查询，能够查询出用户昵称中包含"test"的所有用户:

```shell
GET /meiqu/users/_search
{
  "query": {
    "filtered": {
            "query":  {
                "match": {
                  "profile.nickname": "test"
                }
              },
              "filter": {
                "term": { "status": 1 }
              }
          }
      },
      "_source": ["_id", "diaries", "fans", "idols", "profile.nickname", "profile.icon"]
}
```

8. 在开发环境中使用ElasticSearch

直接cd到项目根目录执行：

```shell
npm install elasticsearch
```

搞定。

nodejs下一个搜索用户的例子：

```javascript
//搜索用户
var searchUser = function (req, res, next) {
    var skip = parseInt(req.query.offset);
    skip = isNaN(skip) ? 0 : skip;
    var limit = parseInt(req.query.size);
  limit = isNaN(limit) ? 10 : limit;
    var nickname = req.query.nickname;

    var query = {
        "index": "meiqu",
        "type": "users",
        "from": skip,
        "size": limit,
        "body": {
            "query": {
                "filtered": {
                    "query":  {
                        "match": { "profile.nickname": nickname }},
                    "filter": {
                        "term": { "status": 1 }}
                }
            }
        },
        "_source": ['_id', 'diaries', 'fans', 'idols', 'profile.nickname', 'profile.icon']
  };

    client.search(query, function (error, response) {
        if (error){
            return next(error);
        }
        var users = [];
        response.hits.hits.forEach(function(data){
            users.push(data._source);
        });

        req.users = users;
        return next();
  });
};
```
