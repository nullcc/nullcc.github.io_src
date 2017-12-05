---
title: MongoDB索引(1)——入门篇：学习使用MongoDB数据库索引
date: 2017-05-10
tags: [MongoDB, 数据库索引]
categories: 数据库
---

介绍了MongoDB索引索引的相关知识。

<!--more-->

## 1. 准备工作

在学习使用MongoDB数据库索引之前，有一些准备工作要做，之后的探索都是基于这些准备工作。

首先需要建立一个数据库和一些集合，这里我就选用一个国内手机号归属地的库，大约32W条记录，数据量不大，不过做一些基本的分析是够了。

首先我们建立一个数据库，叫做db_phone，然后导入测试数据。测试数据就是一些手机号归属地的信息。单个文档长这个样子：

    {
        "_id" : ObjectId("57bd12ba085bed84151ca203"),
        "prefix" : "1898852",
        "province" : "广东",
        "city" : "佛山",
        "isp" : "中国电信"
    }

## 2. 学会分析MongoDB的查询

默认情况下，每个MongoDB文档都有一个_id字段，这个字段是唯一的。系统能保证在单台机器上这个字段是唯一的(而且是递增)，有兴趣的同学可以去看看_id的生成方式。

### (1) 用_id字段作为查询条件

在MongoDB shell中，利用一些查询语句来对数据库进行查询，比如想要找到刚才那个文档，可以执行：

    db.phonehomes.find({_id:ObjectId("57bd12ba085bed84151ca203")})

我们利用explain()来分析这个查询：

    db.phonehomes.find({_id:ObjectId("57bd12ba085bed84151ca203")}).explain()

这个查询分析不会返回找到的文档，而是返回该查询的分析文档：

    {
        "cursor" : "IDCursor",
        "n" : 1,
        "nscannedObjects" : 1,
        "nscanned" : 1,
        "indexOnly" : false,
        "millis" : 0,
        "indexBounds" : {
            "_id" : [
                [
                    ObjectId("57bd12ba085bed84151ca203"),
                    ObjectId("57bd12ba085bed84151ca203")
                ]
            ]
        },
        "server" : "zhangjinyideMac-Pro.local:27017"
    }

解释一些比较重要的几个字段：

#### 1.  "cursor" : "IDCursor"

cursor的本意是游标，在这里它表示用的是什么索引，或者没用索引。没用索引就是全表扫描了，后面会看到。这里的cursor是"IDCursor"，这是_id特有的一个索引。默认情况下，数据库会为_id创建索引，因此在查询中如果用_id作为查询条件，效率是非常高的。

#### 2.  "n" : 1

返回文档的个数。这个查询本身只返回了一个文档(因为_id是不能重复的)。

#### 3. "nscannedObjects" : 1

实际查询的文档数。

#### 4. "nscanned" : 1

表示使用索引扫描的文档数，如果没有索引，这个值是整个集合的所有文档数。


#### 5. "indexOnly" : false

表示是否只有索引即可完成查询，当查询的字段都存在一个索引中并且返回的字段也在同一索引中即为true。如果执行：

    db.phonehomes.find({_id:ObjectId("57bd12ba085bed84151ca203")}, {"_id": 1}).explain()

则indexOnly会为true。

#### 6.  "millis" : 0,

查询耗时，单位毫秒，为0说明这个查询太快了。由于索引会被加载到内存中，直接利用内存中的索引是非常高效的，可能只用到了纳秒级别的时间(1ms = 1000000ns)，因此就显示为0了。

#### 7. "indexBounds"

索引的使用情况，即文档中key的上下界。

### (2) 用未被索引的prefix字段作为查询条件

接下来我们使用一个没有索引的字段：prefix，查询语句如下：

    db.phonehomes.find({prefix: '1899950'}).explain()

返回结果：

    {
        "cursor" : "BasicCursor",
        "isMultiKey" : false,
        "n" : 1,
        "nscannedObjects" : 327664,
        "nscanned" : 327664,
        "nscannedObjectsAllPlans" : 327664,
        "nscannedAllPlans" : 327664,
        "scanAndOrder" : false,
        "indexOnly" : false,
        "nYields" : 2559,
        "nChunkSkips" : 0,
        "millis" : 92,
        "server" : "zhangjinyideMac-Pro.local:27017",
        "filterSet" : false
    }

这次的字段比较多，还是看来一些重要的(有些和之前查询完全重复就不列举了)：

#### 1. "cursor" : "BasicCursor"

查询使用索引的信息，为"BasicCursor"表示未使用索引，即全表扫描了。

#### 2. "n" : 1

返回的文档数为1。

#### 3. "nscannedObjectsAllPlans" : 327664

所有查询计划的查询文档数。

#### 4. "nscannedAllPlans" : 327664

所有查询计划的查询文档数。

#### 5. "scanAndOrder" : false

是否对返回的结果排序，当直接使用索引的顺序返回结果时其值为false。如果使用了sort()，则为true。

#### 6. "nYields" : 2559

表示查询暂停的次数。这是由于mongoDB的其他操作使得查询暂停，使得这次查询放弃了读锁以等待写操作的执行。

#### 7. "nChunkSkips" : 0

表示的略过的文档数量，当在分片系统中正在进行的块移动时会发生。

#### 8. "filterSet" : false

表示是否应用了索引过滤。

需要特别说明的是，上面3个重要的文档数量指标的关系为：nscanned >= nscannedObjects >= n，也就是扫描数（也可以说是索引条目） >= 查询数（通过索引到硬盘上查询的文档数） >= 返回数（匹配查询条件的文档数）。

可以看到由于prefix字段没有索引，导致了全表扫描。当文档数量很小（只有32W条）时，耗时不大（92ms），不过一旦文档数量非常大，查询耗时就会增长到一个无法忍受的程度。

### (3) 用有索引的prefix字段作为查询条件

为prefix字段增加索引：

    db.phonehomes.ensureIndex({"prefix": 1})

成功建立索引后，执行之前那个查询语句：

    db.phonehomes.find({prefix: '1899950'}).explain()

返回结果：

    {
        "cursor" : "BtreeCursor prefix_1",
        "isMultiKey" : false,
        "n" : 1,
        "nscannedObjects" : 1,
        "nscanned" : 1,
        "nscannedObjectsAllPlans" : 1,
        "nscannedAllPlans" : 1,
        "scanAndOrder" : false,
        "indexOnly" : false,
        "nYields" : 0,
        "nChunkSkips" : 0,
        "millis" : 0,
        "indexBounds" : {
            "prefix" : [
                [
                    "1899950",
                    "1899950"
                ]
            ]
        },
        "server" : "zhangjinyideMac-Pro.local:27017",
        "filterSet" : false，
        // 略去一部分暂时不讨论的内容
    }

重点看下"cursor"字段：

    "cursor" : "BtreeCursor prefix_1"

这个查询使用了一个prefix的索引。由于索引的使用，使得这个查询变得非常高效，从以下这几个字段可以很明显地看出：

    "n" : 1,
    "nscannedObjects" : 1,
    "nscanned" : 1,
    "nscannedObjectsAllPlans" : 1,
    "nscannedAllPlans" : 1,
    "millis" : 0,

### (4) 有多个单独索引的情况

执行查询：

    db.phonehomes.find({province: '福建', 'isp': '中国电信'}).explain()

返回结果：

    {
        "cursor" : "BasicCursor",
        "isMultiKey" : false,
        "n" : 2667,
        "nscannedObjects" : 327664,
        "nscanned" : 327664,
        "nscannedObjectsAllPlans" : 327664,
        "nscannedAllPlans" : 327664,
        "scanAndOrder" : false,
        "indexOnly" : false,
        "nYields" : 2559,
        "nChunkSkips" : 0,
        "millis" : 138,
        "server" : "zhangjinyideMac-Pro.local:27017",
        "filterSet" : false,
        // 略去一部分暂时不讨论的内容
    }

可以看到是全表扫描。

先给"isp"字段加索引：

    db.phonehomes.ensureIndex({"isp": 1})

再执行一次：

    db.phonehomes.find({province: '福建', 'isp': '中国电信'}).explain()

返回结果：

    {
        "cursor" : "BtreeCursor isp_1",
        "isMultiKey" : false,
        "n" : 2667,
        "nscannedObjects" : 59548,
        "nscanned" : 59548,
        "nscannedObjectsAllPlans" : 59548,
        "nscannedAllPlans" : 59548,
        "scanAndOrder" : false,
        "indexOnly" : false,
        "nYields" : 465,
        "nChunkSkips" : 0,
        "millis" : 64,
        "indexBounds" : {
            "isp" : [
                [
                    "中国电信",
                    "中国电信"
                ]
            ]
        },
        "server" : "zhangjinyideMac-Pro.local:27017",
        "filterSet" : false,
        // 略去一部分暂时不讨论的内容
    }


发现"cursor"为"BtreeCursor isp_1"，这个查询用到了isp的索引，扫描了59548个文档。

为了进一步提高查询效率，可以再对"province"字段建立索引：

    db.phonehomes.ensureIndex({"province": 1})

再次执行：

    db.phonehomes.find({province: '福建', 'isp': '中国电信'}).explain()

返回结果：

    {
        "cursor" : "BtreeCursor province_1",
        "isMultiKey" : false,
        "n" : 2667,
        "nscannedObjects" : 10223,
        "nscanned" : 10223,
        "nscannedObjectsAllPlans" : 10324,
        "nscannedAllPlans" : 10425,
        "scanAndOrder" : false,
        "indexOnly" : false,
        "nYields" : 81,
        "nChunkSkips" : 0,
        "millis" : 13,
        "indexBounds" : {
            "province" : [
                [
                    "福建",
                    "福建"
                ]
            ]
        },
        "server" : "zhangjinyideMac-Pro.local:27017",
        "filterSet" : false,
        // 略去一部分暂时不讨论的内容
    }

可以发现一个有意思的现象，我们同时拥有province和isp字段的单独索引，但是这个查询用了province的索引而不使用isp的索引。同时，扫描的文档数只有10223个，这比使用isp索引扫描的59548个文档要少。

使用province索引效率高于使用isp索引的原因是，这个集合中的包含的省份数为31个(部分地区未收入)，isp为4个(中国移动、中国联通、中国电信和虚拟运营商)，因此province对文档的区分度大于isp。

这两种情况的具体过程如下：

1. 使用isp索引

    先用isp索引，获取到isp为"中国电信"的文档(59548个)，然后再对这部分文档做扫描，筛选出province为"福建"的所有文档(2667个)。

2. 使用province索引

    先用province索引，获取到province为"福建"的文档(10223个)，然后再对这部分文档做扫描，筛选出isp为"中国电信"的所有文档(2667个)。

对比一下就知道，用isp索引要比用province索引多扫描4W+个文档(这里忽略了用索引筛选文档的代价，因为这个代价相比扫描大量文档要小得多)。

MongoDB会自动province索引的原因，个人猜测是MongoDB在真正执行查询时会现有一个预执行阶段，会先分析这个查询使用哪个索引最高效。

### (5) 使用联合索引

刚才都是用单独索引，现在要介绍联合索引。顾名思义，联合索引使用多个字段作为索引。

我们先把刚才建的索引删除：

    db.phonehomes.dropIndex({"province":1})
    db.phonehomes.dropIndex({"isp":1})

建立一个province和isp的联合索引：

    db.phonehomes.ensureIndex({"province": 1, "isp": 1})

再次执行刚才那个查询：

    db.phonehomes.find({province: '福建', 'isp': '中国电信'}).explain()

返回结果：

    {
        "cursor" : "BtreeCursor province_1_isp_1",
        "isMultiKey" : false,
        "n" : 2667,
        "nscannedObjects" : 2667,
        "nscanned" : 2667,
        "nscannedObjectsAllPlans" : 2667,
        "nscannedAllPlans" : 2667,
        "scanAndOrder" : false,
        "indexOnly" : false,
        "nYields" : 20,
        "nChunkSkips" : 0,
        "millis" : 3,
        "indexBounds" : {
            "province" : [
                [
                    "福建",
                    "福建"
                ]
            ],
            "isp" : [
                [
                    "中国电信",
                    "中国电信"
                ]
            ]
        },
        "server" : "zhangjinyideMac-Pro.local:27017",
        "filterSet" : false,
         // 略去一部分暂时不讨论的内容
    }

建立了province和isp的联合索引后，查询分析的"cursor"为"BtreeCursor province_1_isp_1",即使用了这个联合索引，其他数据也表现了此索引在这个查询上的高效：

    n" : 2667,
    "nscannedObjects" : 2667,
    "nscanned" : 2667,
    "nscannedObjectsAllPlans" : 2667,
    "nscannedAllPlans" : 2667,

就算改变查询条件的顺序也没关系：

    db.phonehomes.find({'isp': '中国电信', province: '福建'}).explain()

返回结果：

    {
        "cursor" : "BtreeCursor province_1_isp_1",
        "isMultiKey" : false,
        "n" : 2667,
        "nscannedObjects" : 2667,
        "nscanned" : 2667,
        "nscannedObjectsAllPlans" : 2667,
        "nscannedAllPlans" : 2667,
        "scanAndOrder" : false,
        "indexOnly" : false,
        "nYields" : 20,
        "nChunkSkips" : 0,
        "millis" : 2,
        "indexBounds" : {
            "province" : [
                [
                    "福建",
                    "福建"
                ]
            ],
            "isp" : [
                [
                    "中国电信",
                    "中国电信"
                ]
            ]
        },
        "server" : "zhangjinyideMac-Pro.local:27017",
        "filterSet" : false，
        // 略去一部分暂时不讨论的内容
    }

由于我们刚才删除了province和isp的单独索引，所以我们要来实验一下，如果使用单个字段查询，能否利用到联合索引。

先执行查询：

    db.phonehomes.find({province: '福建'}).explain()

返回结果：

    {
        "cursor" : "BtreeCursor province_1_isp_1",
        "isMultiKey" : false,
        "n" : 10223,
        "nscannedObjects" : 10223,
        "nscanned" : 10223,
        "nscannedObjectsAllPlans" : 10223,
        "nscannedAllPlans" : 10223,
        "scanAndOrder" : false,
        "indexOnly" : false,
        "nYields" : 79,
        "nChunkSkips" : 0,
        "millis" : 9,
        "indexBounds" : {
            "province" : [
                [
                    "福建",
                    "福建"
                ]
            ],
            "isp" : [
                [
                    {
                        "$minElement" : 1
                    },
                    {
                        "$maxElement" : 1
                    }
                ]
            ]
        },
        "server" : "zhangjinyideMac-Pro.local:27017",
        "filterSet" : false,
        // 略去一部分暂时不讨论的内容
    }

可以发现这个查询使用了province_1_isp_1联合索引：

    "cursor" : "BtreeCursor province_1_isp_1"

再执行：

    db.phonehomes.find({isp: '中国电信'}).explain()

返回结果：

    {
        "cursor" : "BasicCursor",
        "isMultiKey" : false,
        "n" : 59548,
        "nscannedObjects" : 327664,
        "nscanned" : 327664,
        "nscannedObjectsAllPlans" : 327664,
        "nscannedAllPlans" : 327664,
        "scanAndOrder" : false,
        "indexOnly" : false,
        "nYields" : 2559,
        "nChunkSkips" : 0,
        "millis" : 106,
        "server" : "zhangjinyideMac-Pro.local:27017",
        "filterSet" : false
    }

然而，这个查询并没有使用任何索引，而是来了个全表扫描：

     "cursor" : "BasicCursor"

这是怎么回事，难道用单独用isp做查询条件就不能使用province_1_isp_1联合索引吗？

对于联合索引来说，确实能为某些查询提供索引支持，但这要看是什么查询。全字段满足的查询(查询字段顺序无关)肯定是可以使用相应的联合索引的，这点毋庸置疑，刚才也看到了实例。那究竟怎么利用联合索引呢，在给出答案前我们再看一个例子。

这个例子需要建立一个province-city-isp的联合索引 ：

    db.phonehomes.ensureIndex({"province": 1, "city": 1, "isp": 1})

然后分别执行4个查询：

1. db.phonehomes.find({'province': '福建', 'isp': '中国电信'}).explain()
2. db.phonehomes.find({'isp': '中国电信', 'province': '福建'}).explain()
3. db.phonehomes.find({'city': '厦门', 'isp': '中国电信'}).explain()
4. db.phonehomes.find({'isp': '中国电信', 'city': '厦门'}).explain()
5. db.phonehomes.find({'province': '福建', 'city': '厦门'}).explain()
6. db.phonehomes.find({'city': '厦门', 'province': '福建'}).explain()

然后我们只考察"cursor"字段。

第一个查询的"cursor"为：

    "cursor": "BtreeCursor province_1_city_1_isp_1"

第二个查询的"cursor"为：

    "cursor": "BtreeCursor province_1_city_1_isp_1"

第三个查询的"cursor"为：

    "cursor": "BasicCursor"

第四个查询的"cursor"为：

    "cursor": "BasicCursor"

第五个查询的"cursor"为：

    "cursor": "BtreeCursor province_1_city_1_isp_1"

第六个查询的"cursor"为：

    "cursor": "BtreeCursor province_1_city_1_isp_1"

仔细观察可以发现几个规律：

1. 在字段相同的查询中，使用索引的情况和查询中字段摆放的顺序无关(参看1和2、3和4、5和6做对比)。
2. MongoDB中，一个给定的联合索引能否被某个查询使用，要看这个查询中字段是否满足"最左前缀匹配"。具体来说就是，当查询条件精确匹配索引的最左边连续或不连续的几个列时，该查询可以使用索引。

其中第一项很好理解，主要是第二项。

在上面第1和第2个查询中，查询条件为(查询字段顺序无关)：

    {'province': '福建', 'isp': '中国电信'}

这满足了province_1_city_1_isp_1联合索引的"最左前缀匹配"原则(虽然并不是连续的，少了中间的city列)。

在上面第3和第4个查询中，查询条件为(查询字段顺序无关)：

    {'city': '厦门', 'isp': '中国电信'}

这不满足province_1_city_1_isp_1联合索引的"最左前缀匹配"原则，因为并没有匹配到最左边的province列。

在上面第5和第6个查询中，查询条件为(查询字段顺序无关)：

    {'province': '福建', 'city': '厦门'}

这满足了province_1_city_1_isp_1联合索引的"最左前缀匹配"原则(是连续的)

因此可以总结MongoDB中联合索引的使用方法：在MongoDB中，一个给定的联合索引能否被某个查询使用，要看这个查询中字段是否满足"最左前缀匹配"。具体来说就是，当查询条件精确匹配索引的最左边连续或不连续的几个列时，该查询可以使用索引。
