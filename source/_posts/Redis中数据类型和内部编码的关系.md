---
title: Redis中数据类型和内部编码的关系
date: 2018-01-23
tags: [Redis, 数据结构]
categories: 数据库
---

Redis中常用的数据类型主要有：字符串、列表、哈希、集合和有序集合，这些是键的`type`，那么这些type的底层实现是怎样的呢，本文将简单介绍一下各种数据类型对应的底层实现数据结构。在之前的几篇Redis源码分析文章中已经介绍了相关内容，不过这里作为一个整合会集中给出这些信息。

首先要知道的是Redis之所以会对不同的数据类型使用不同的内部编码方式主要还是为了节省内存，由于Redis会在内存中存放大量数据，因此根据数据特定来量身定做内部编码是非常有必要的。本文引用的全部源码都来自于Redis(version 3.2.11)。

<!--more-->

在`server.h`文件中，使用宏定义给出了Redis支持的所有对象编码：

```Java
/* Objects encoding. Some kind of objects like Strings and Hashes can be
 * internally represented in multiple ways. The 'encoding' field of the object
 * is set to one of this fields for this object. */
/* 对象编码。一些对象比如字符串和哈希表在内部可以以不同的方式实现。这些对象的'encoding'字段
 * 是下面的其中一个。 */

// 原始编码
#define OBJ_ENCODING_RAW 0     /* Raw representation */

// 整型编码
#define OBJ_ENCODING_INT 1     /* Encoded as integer */

// 哈希表编码
#define OBJ_ENCODING_HT 2      /* Encoded as hash table */

// 压缩字典编码
#define OBJ_ENCODING_ZIPMAP 3  /* Encoded as zipmap */

// 链表编码
#define OBJ_ENCODING_LINKEDLIST 4 /* Encoded as regular linked list */

// 压缩链表编码
#define OBJ_ENCODING_ZIPLIST 5 /* Encoded as ziplist */

// 整数集合编码
#define OBJ_ENCODING_INTSET 6  /* Encoded as intset */

// 跳跃表编码
#define OBJ_ENCODING_SKIPLIST 7  /* Encoded as skiplist */

// 嵌入式字符串编码
#define OBJ_ENCODING_EMBSTR 8  /* Embedded sds string encoding */

// quicklist编码
#define OBJ_ENCODING_QUICKLIST 9 /* Encoded as linked list of ziplists */
```

下面就对这五种数据类型的内部编码进行介绍。

## 字符串（string）

string的内部编码有三种：

1. int（8字节长整型）
2. embstr（长度小于或等于44个字节的字符串）
3. raw（长度大于44个字节的字符串）

我们通过源码来理解这个事实，下面是`object.c`中的`createStringObject`函数：

```Java
/* 从long long类型创建一个字符串对象 */
robj *createStringObjectFromLongLong(long long value) {
    robj *o;
    /* value ∈ [0, 10000)，这部分数字经常用到，内存中会预先创建一个这个范围的整数对象数组，
     * 对其增加引用计数后直接返回这个整数对象即可。 */
    if (value >= 0 && value < OBJ_SHARED_INTEGERS) {
        incrRefCount(shared.integers[value]);
        o = shared.integers[value];
    } else {
        /* value ∈ [LONG_MIN, LONG_MAX]，需要创建一个字符串对象，编码类型为OBJ_ENCODING_INT，即整数对象 */
        if (value >= LONG_MIN && value <= LONG_MAX) {
            o = createObject(OBJ_STRING, NULL);
            o->encoding = OBJ_ENCODING_INT;
            o->ptr = (void*)((long)value);
        } else {
            // 超出long类型，将其编码成OBJ_STRING
            o = createObject(OBJ_STRING,sdsfromlonglong(value));
        }
    }
    return o;
}
```

这段代码负责从一个long long类型的值创建一个string对象，可以看到当`value ∈ [LONG_MIN, LONG_MAX]`时，string的内部编码使用的是`OBJ_ENCODING_INT`，一个long long类型的值占用8字节，因此当string对象中保存的是8字节长整型时，内部会使用`int`编码方式。

继续看`embstr`和`raw`的情况，下面是`object.c`中的`createStringObject`函数：

```Java
/* Create a string object with EMBSTR encoding if it is smaller than
 * REIDS_ENCODING_EMBSTR_SIZE_LIMIT, otherwise the RAW encoding is
 * used.
 *
 * The current limit of 44 is chosen so that the biggest string object
 * we allocate as EMBSTR will still fit into the 64 byte arena of jemalloc. */
#define OBJ_ENCODING_EMBSTR_SIZE_LIMIT 44
robj *createStringObject(const char *ptr, size_t len) {
    if (len <= OBJ_ENCODING_EMBSTR_SIZE_LIMIT)
        return createEmbeddedStringObject(ptr,len);
    else
        return createRawStringObject(ptr,len);
}
```

这段代码的意思是当字符串长度小于`OBJ_ENCODING_EMBSTR_SIZE_LIMIT`时，使用`embstr`编码，否则使用`raw`编码。`OBJ_ENCODING_EMBSTR_SIZE_LIMIT`大小是44，需要注意的是在之前的一些版本中`OBJ_ENCODING_EMBSTR_SIZE_LIMIT`曾经为32和39，那么这个值是怎么来的呢，下面根据源代码进行分析。

`createStringObject`函数的注释中提到Redis会使用`jemalloc`来进行内存分配，`jemalloc`对此会分配64字节的内存。要详细了解`jemalloc`的内存分配策略和优势可以查阅相关资料。

下面是`server.h`中的部分代码，定义了`robj`结构体：

```Java
// LRU时钟占用的位数
#define LRU_BITS 24

// redis对象结构体
typedef struct redisObject {
    unsigned type:4;  // 对象类型 4bit
    unsigned encoding:4;  // 对象编码 4bit
    unsigned lru:LRU_BITS; /* lru time (relative to server.lruclock) */  // LRU时间 24bit
    int refcount;  // 对象引用计数 4字节
    void *ptr;  // 对象的数据指针 8字节
} robj;
```

可以计算出在64位机器上一个`robj`所占用的字节数为：4bit + 4bit + 24bit + 4字节 + 8字节 = 16字节。

再看`sds.h`中对`sdshdr8`的定义（除`sdshdr5`以外，`sds.h`中的`sdshdr8`、`sdshdr16`、`sdshdr32`和`sdshdr64`结构都是相同的，其中`sdshdr5`未被使用）：

```Java
struct __attribute__ ((__packed__)) sdshdr8 {
    uint8_t len; /* used */ // 已使用的字符串长度 1字节
    uint8_t alloc; /* excluding the header and null terminator */  // 分配的内存空间大小，不包括头部和空终止符 1字节
    unsigned char flags; /* 3 lsb of type, 5 unused bits */  // 3个最低有效位表示类型，5个最高有效位未使用 1字节
    char buf[];  // 字符数组 1字节
};
```

可以计算出在一个sdshdr占用的字节数为：1字节 + 1字节 + 1字节 + 1字节 = 4字节。

所以对于分配了64字节，内部编码为`embstr`的字符串对象来说，字符串真正可用的字节数为：64字节 - 16字节 - 4字节 = 44字节。刚才提到了Redis之前的一些版本中`OBJ_ENCODING_EMBSTR_SIZE_LIMIT`的值为32和39，主要是`sdshdr`和`robj`的大小不同导致的。

## 列表（list）

关于list的内部编码，不同版本的方法有所区别，先看Redis 3.2版本之前的做法：

1. ziplist (压缩列表，当list中的元素个数小于list-max-ziplist-entries，默认512，且每个元素的大小都小于list-max-ziplist-value，默认64字节)
2. linkedlist（链表，当list中的元素不满足ziplist的条件时，内部实现使用linkedlist）

在Redis 3.0版本的源码的`redis.conf`文件中可以看到：

```Java
list-max-ziplist-entries 512
list-max-ziplist-value 64
```

在Redis 3.2版本以及之后的版本，引入了一种叫做`quicklist`的数据结构，`quicklist`综合了`ziplist`和`linkedlist`的优点。从外部看，`quicklist`也是一个`linkedlist`，不过它的每个节点都是一个`ziplist`。我们来看看在`redis.conf`中的说明，在Redis 3.2.11版本的源码的`redis.conf`文件中：

```Java
# Lists are also encoded in a special way to save a lot of space.
# The number of entries allowed per internal list node can be specified
# as a fixed maximum size or a maximum number of elements.
# For a fixed maximum size, use -5 through -1, meaning:
# -5: max size: 64 Kb  <-- not recommended for normal workloads
# -4: max size: 32 Kb  <-- not recommended
# -3: max size: 16 Kb  <-- probably not recommended
# -2: max size: 8 Kb   <-- good
# -1: max size: 4 Kb   <-- good
# Positive numbers mean store up to _exactly_ that number of elements
# per list node.
# The highest performing option is usually -2 (8 Kb size) or -1 (4 Kb size),
# but if your use case is unique, adjust the settings as necessary.
list-max-ziplist-size -2
```

刚才我们提到在3.2+版本以后Redis使用`quicklist`来作为list类型的底层实现，其中的每个节点都是一个`ziplist`，这里`list-max-ziplist-size`的值为`-2`就表示每个`ziplist`的大小不能超过8kb（请注意是小写的b不是大写的B）。因此在3.2+版本的Redis中，list类型的表现如下：

```
127.0.0.1:6379> lpush a 1 2 3
(integer) 3
127.0.0.1:6379> type a
list
127.0.0.1:6379> object encoding a
"quicklist"
```

## 哈希（hash）

1. ziplist（压缩列表，当hash中的元素个数小于hash-max-ziplist-entries，默认512，且每个元素的大小都小于hash-max-ziplist-value，默认64字节）
2. hashtable（哈希表，当hash中的元素不满足ziplist的条件时，内部实现使用hashtable）

在`redis.conf`文件中可以看到：

```Java
hash-max-ziplist-entries 512
hash-max-ziplist-value 64
```

在`t_hash.c`的`hashTypeSet`函数中有如下一段代码：

```Java
if (hashTypeLength(o) > server.hash_max_ziplist_entries)
    hashTypeConvert(o, OBJ_ENCODING_HT);
```

这个if语句就是判断hash中元素个数是否超过`hash-max-ziplist-entries`设置的值，如果超过就将其转换成`hashtable`实现。

## 集合（set）

1. intset（整数集合，当set中的元素都是整数且个数小于set-max-intset-entries，默认512）
2. hashtable（哈希表，当set中的元素不满足intset的条件时，内部实现使用hashtable）

在`redis.conf`文件中可以看到：

```Java
set-max-intset-entries 512
```

在`t_set.c`的`setTypeAdd`函数中有如下一段代码：

```Java
if (intsetLen(subject->ptr) > server.set_max_intset_entries)
    setTypeConvert(subject,OBJ_ENCODING_HT);
```

这个if语句就是判断set中元素个数是否超过`set-max-intset-entries`设置的值，如果超过就将其转换成`hashtable`实现。

## 有序集合（zset）

1. ziplist（压缩链表，当zset中的元素个数小于zset-max-ziplist-entries，默认128，且每个元素的值都小于zset-max-ziplist-value，默认64字节）
2. skiplist（跳跃表，当zset不满足ziplist的条件时，内部实现使用skiplist）

在`redis.conf`文件中可以看到：

```Java
zset-max-ziplist-entries 128
zset-max-ziplist-value 64
```

在`t_zset.c`的`zsetConvertToZiplistIfNeeded`函数中有如下一段代码：

```Java
if (zset->zsl->length <= server.zset_max_ziplist_entries &&
        maxelelen <= server.zset_max_ziplist_value)
            zsetConvert(zobj,OBJ_ENCODING_ZIPLIST);
```

这个if语句就是判断zset中元素个数是否超过`zset-max-ziplist-entries`设置的值且其中长度最大的元素是否超过`zset-max-ziplist-value`，如果超过就将其转换成`skiplist`实现。