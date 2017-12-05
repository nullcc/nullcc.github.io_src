---
title: Redis中的底层数据结构(7)——跳跃表(zskiplist)
date: 2017-11-17
tags: [Redis, 数据结构]
categories: 源码分析
---

本文将详细说明Redis中跳跃表的实现。

在Redis源码（这里使用3.2.11版本）中，跳跃表的实现在server.h（2.8版本之前是redis.h）中的zskiplist结构和zskiplistNode结构，以及t_zset.c中所有以zsl开头的函数。

<!--more-->

## 跳跃表概述

Redis使用跳跃表来作为zset的底层数据结构。跳跃表是一种随机化的数据结构，其内部是多个链表的并联。在插入、查找、删除等操作上都有不错的效率，而且实现起来比红黑树要简单。

```Java
/* ZSET（有序集合）使用的特殊版本的跳跃表 */
// 有序集合跳跃表节点结构
typedef struct zskiplistNode {
    robj *obj;                          // 节点数据对象，指向一个sds字符串对象
    double score;                       // 节点分值，跳跃表中的所有节点都按照分值从小到大排序
    struct zskiplistNode *backward;     // 前置节点
    struct zskiplistLevel {
        struct zskiplistNode *forward;  // 后置节点
        unsigned int span;              // 该层跨越的节点数量
    } level[];                          // 跳跃表层结构，一个zskiplistLevel数组
} zskiplistNode;

// 有序集合跳跃表结构
typedef struct zskiplist {
    struct zskiplistNode *header, *tail;  // 跳跃表表头节点指针和表尾节点指针
    unsigned long length;                 // 跳跃表的长度，即跳跃表当前的节点数量（表头节点不算在内）
    int level;                            // 当前跳跃表中层数最大的节点的层数（表头节点的层数不算在内）
} zskiplist;
```

解释一下`zskiplist`：

header：跳跃表头节点指针，跳跃表头节点是一个特殊的节点，它不保存实际分值和对象，它的level数组长度为32。
tail：跳跃表尾节点指针，跳跃表尾节点是一个真实的节点，这点和头节点不同。
length：跳跃表长度，即跳跃表当节点数量，不包括表头节点。
level：跳跃表当前节点中的最大层数，不包括表头节点。

再看看`zskiplistNode`：

obj：节点保存的对象，是一个sds字符串对象。
score：节点分值，跳跃表中所有节点都按照分值从小到大排序。
backward：指向前驱节点。
level[]：`zskiplistLevel`结构体的数组，数组中的每个`zskiplistLevel`元素称为“层”。每层中保存了后继节点的指针`forward`和一个`span`，`span`表示当前节点到`forward`指向的后继节点之间需要跨越多少个节点。

Redis zskiplist的数据结构示意图：

![Redis的zskiplist](/assets/images/post_imgs/redis_data_structure_10.png)

跳跃表查找的原理：

```Java
unsigned long zslGetRank(zskiplist *zsl, double score, robj *o) {
    zskiplistNode *x;
    unsigned long rank = 0;
    int i;

    x = zsl->header;
    for (i = zsl->level-1; i >= 0; i--) {
        while (x->level[i].forward &&
            (x->level[i].forward->score < score ||
                (x->level[i].forward->score == score &&
                compareStringObjects(x->level[i].forward->obj,o) <= 0))) {
            rank += x->level[i].span;
            x = x->level[i].forward;
        }

        /* x might be equal to zsl->header, so test if obj is non-NULL */
        if (x->obj && equalStringObjects(x->obj,o)) {
            return rank;
        }
    }
    return 0;
}
```

以上图为例，跳跃表中有4个节点，score分别为1，2，3，4。假设现在我想查询score为3，obj为"c"的节点在跳跃表中的排名。Redis会从level[]从后往前遍历，也就是从跳跃表当前的最大层数向最小层数遍历。从头节点出发，首先遍历第5层，直接找到score等于4的节点，但这个节点并不满足`x->level[i].forward->score < score`这个条件，因此跳过这层。接着还是从头节点触发遍历第4层，首先来到score=2的节点，这个节点满足while循环的条件，因此rank加上上一个节点到score为2这个节点的span，值为2，且x当前指向score为2这个节点。在第4层继续查找，来到score为4的节点，还是不满足`x->level[i].forward->score < score`这个条件，第4层查找接触。此时从score为2这个节点的第3层开始查找，下一个节点来到score为3的节点，这个节点满足while循环的条件，rank加上score为2的节点在第3层的span值，为1，此时rank值等于3，而且score为3这个节点不但score相等，obj成员也相等，我们找到了我们想要的节点了，它在跳跃表中的排名是3。

需要特别说明的是，由于头节点的存在，跳跃表排名是从1开始的，要注意这和数组下标以0开始的区别。

上面的跳跃表查找过程图示如下：

![一次跳跃表查找的过程](/assets/images/post_imgs/redis_data_structure_11.png)

## 跳跃表实现

`zslCreateNode`函数创建有序集合跳跃表节点。

```Java
zskiplistNode *zslCreateNode(int level, double score, robj *obj) {
    // level为跳跃表节点的层数
    zskiplistNode *zn = zmalloc(sizeof(*zn)+level*sizeof(struct zskiplistLevel));
    zn->score = score;  // 设置节点分值
    zn->obj = obj;  // 设置节点数据
    return zn;
}
```

`zslCreate`函数创建有序集合跳跃表。

```Java
zskiplist *zslCreate(void) {
    int j;
    zskiplist *zsl;

    zsl = zmalloc(sizeof(*zsl));
    zsl->level = 1;  // 初始化时，节点的最大层数只有1
    zsl->length = 0;  // 初始化时，跳跃表中没有节点，长度为0
    // 创建表头节点，表头的level为32
    zsl->header = zslCreateNode(ZSKIPLIST_MAXLEVEL,0,NULL);  
    // 初始化表头节点的各层，初始化后置节点为NULL，跨度为0
    for (j = 0; j < ZSKIPLIST_MAXLEVEL; j++) {
        zsl->header->level[j].forward = NULL;
        zsl->header->level[j].span = 0;
    }
    zsl->header->backward = NULL;  // 表头节点的前置节点为NULL
    zsl->tail = NULL;  // 初始化时表尾节点为NULL
    return zsl;
}
```

`zslFreeNode`函数释放有序集合跳跃表节点。

```Java
void zslFreeNode(zskiplistNode *node) {
    decrRefCount(node->obj);  // 减少节点数据对象的引用计数
    zfree(node);
}
```

`zslFree`函数释放有序集合跳跃表。

```Java
void zslFree(zskiplist *zsl) {
    zskiplistNode *node = zsl->header->level[0].forward, *next;

    zfree(zsl->header);  // 释放表头
    while(node) {  // 遍历跳跃表，释放所有节点
        next = node->level[0].forward;
        zslFreeNode(node);
        node = next;
    }
    zfree(zsl);  // 释放跳跃表
}
```

`zslRandomLevel`函数在创建新跳跃表节点时，为它设置一个随机的层数。此函数的返回值介于1到ZSKIPLIST_MAXLEVEL(32)之间（包含1和32）。采用幂率分布的方式，获得越高层级的level概率越低。

```Java
int zslRandomLevel(void) {
    int level = 1;
    // 每次有0.25的概率对level+1
    while ((random()&0xFFFF) < (ZSKIPLIST_P * 0xFFFF))
        level += 1;
    return (level<ZSKIPLIST_MAXLEVEL) ? level : ZSKIPLIST_MAXLEVEL;
}
```

`zslInsert`函数在有序集合跳跃表中插入一个节点，节点的分值为score，数据对象为obj。

```Java
zskiplistNode *zslInsert(zskiplist *zsl, double score, robj *obj) {
    // update数组用来存放新节点在跳跃表每一层的前置节点
    zskiplistNode *update[ZSKIPLIST_MAXLEVEL], *x;
    unsigned int rank[ZSKIPLIST_MAXLEVEL];
    int i, level;

    serverAssert(!isnan(score));
    x = zsl->header;  // 跳跃表头节点
    // 遍历各层寻找新节点的插入位置
    for (i = zsl->level-1; i >= 0; i--) {
        /* 大于当前跳跃表节点最大层数的层（这些层没有数据），rank值为0 */
        rank[i] = i == (zsl->level-1) ? 0 : rank[i+1];
        /* 如果当前节点的后置节点存在且给定的score大于当前节点的后置节点的score，
         * 或给定的score等于当前节点的后置节点的score且给定的obj等于当前节点的后置节点的obj，
         * 将当前节点的span值加到当前层的rank上，且更新x指向当前层的下一个节点。 */
        while (x->level[i].forward &&
            (x->level[i].forward->score < score ||
                (x->level[i].forward->score == score &&
                compareStringObjects(x->level[i].forward->obj,obj) < 0))) {
            rank[i] += x->level[i].span;  // 记录在该层跨越了多少节点
            x = x->level[i].forward;  // 移动到后置节点
        }
        update[i] = x;  // 获得新节点在跳跃表每一层的前置节点
    }
    /* we assume the key is not already inside, since we allow duplicated
     * scores, and the re-insertion of score and redis object should never
     * happen since the caller of zslInsert() should test in the hash table
     * if the element is already inside or not. */
    level = zslRandomLevel();  // 随机获取一个值作为新节点的层数
    /* 如果层数大于跳跃表节点中最大的层数，初始化表头节点中那些未使用的层（共level - zsl->level个），
     * 设置其rank为0，设置其span为跳跃表长度（因为表头节点的层指针直接就指向表尾节点的相应层，接着就指向NULL了，
     * 相当于跨越了整个跳跃表）
     *  */
    if (level > zsl->level) {
        for (i = zsl->level; i < level; i++) {
            rank[i] = 0;
            update[i] = zsl->header;
            update[i]->level[i].span = zsl->length;
        }
        zsl->level = level;  // 更新跳跃表的level属性
    }
    x = zslCreateNode(level,score,obj);  // 创建一个新节点
    // 遍历新节点的所有层，建立该节点在每个层在跳跃表中的前后关系
    for (i = 0; i < level; i++) {
        x->level[i].forward = update[i]->level[i].forward;  // 建立新节点和后置节点的关系
        update[i]->level[i].forward = x;  // 建立新节点和前置节点的关系

        /* 更新新节点的span以及它的后置节点的span */
        x->level[i].span = update[i]->level[i].span - (rank[0] - rank[i]);
        update[i]->level[i].span = (rank[0] - rank[i]) + 1;
    }

    /* 由于新节点中从level到zsl->level层的存在，它的前置节点相应层的span需要+1 */
    for (i = level; i < zsl->level; i++) {
        update[i]->level[i].span++;
    }

    // 设置新节点的前置节点
    x->backward = (update[0] == zsl->header) ? NULL : update[0];
    if (x->level[0].forward)
        x->level[0].forward->backward = x;  // 新节点有后置节点，设置它后置节点的前置节点为它自己
    else
        zsl->tail = x;  // 新节点没有后置节点，它就是尾节点
    zsl->length++;  // 更新跳跃表节点数量
    return x;
}
```

`zslDeleteNode`函数是zslDelete、zslDeleteByScore和zslDeleteByRank函数内部使用的函数，删除一个指定的跳跃表节点。

```Java
void zslDeleteNode(zskiplist *zsl, zskiplistNode *x, zskiplistNode **update) {
    // zsl为跳跃表，x为要删除的节点，update为指向保存在每一层中要删除节点的前置节点的数组
    int i;
    // 更新删除点上每一层的的节点关系和跨度
    for (i = 0; i < zsl->level; i++) {
        if (update[i]->level[i].forward == x) {
            update[i]->level[i].span += x->level[i].span - 1;
            update[i]->level[i].forward = x->level[i].forward;
        } else {
            update[i]->level[i].span -= 1;
        }
    }
    // 更新被删除节点的前置和后置指针
    if (x->level[0].forward) {
        x->level[0].forward->backward = x->backward;
    } else {
        zsl->tail = x->backward;
    }
    // 更新跳跃表的最大层数
    while(zsl->level > 1 && zsl->header->level[zsl->level-1].forward == NULL)
        zsl->level--;
    zsl->length--;  // 跳跃表节点数量-1
}
```

`zslDelete`函数从有序集合跳跃表中删除一个具有指定score和object的节点。

```Java
int zslDelete(zskiplist *zsl, double score, robj *obj) {
    zskiplistNode *update[ZSKIPLIST_MAXLEVEL], *x;
    int i;

    x = zsl->header;  // 表头节点
    for (i = zsl->level-1; i >= 0; i--) {
        while (x->level[i].forward &&
            (x->level[i].forward->score < score ||
                (x->level[i].forward->score == score &&
                compareStringObjects(x->level[i].forward->obj,obj) < 0)))
            x = x->level[i].forward;
        update[i] = x;  // 获得指定节点在跳跃表每一层的前置节点
    }
    /* 可能有多个节点具有相同的分值，需要找到分值和对象都相等的节点。 */
    x = x->level[0].forward;
    if (x && score == x->score && equalStringObjects(x->obj,obj)) {  // score和obj都相等
        zslDeleteNode(zsl, x, update);  // 删除跳跃表节点
        zslFreeNode(x);  // 释放跳跃表节点
        return 1;
    }
    return 0; /* not found */
}
```

`zslValueGteMin`函数判断给定值value是否大于或等于范围spec中的min，返回1表示value大于或等于min，否则返回0。

```Java
static int zslValueGteMin(double value, zrangespec *spec) {
    return spec->minex ? (value > spec->min) : (value >= spec->min);
}
```

`zslValueLteMax`函数判断给定值value是否小于或等于范围spec中的max，返回1表示value小于或等于max，否则返回0。

```Java
int zslValueLteMax(double value, zrangespec *spec) {
    return spec->maxex ? (value < spec->max) : (value <= spec->max);
}
```

`zslIsInRange`函数判断给定的分值范围range是否在跳跃表的分值范围之内，在返回1，否则返回0。

```Java
int zslIsInRange(zskiplist *zsl, zrangespec *range) {
    zskiplistNode *x;

    // 先排除总为空的范围值
    if (range->min > range->max ||
            (range->min == range->max && (range->minex || range->maxex)))
        return 0;
    // 跳跃表尾部节点是跳跃表分值的上限
    x = zsl->tail;
    if (x == NULL || !zslValueGteMin(x->score,range))
        return 0;
    // 跳跃表头部节点的下一个节点是跳跃表分值的下限
    x = zsl->header->level[0].forward;
    if (x == NULL || !zslValueLteMax(x->score,range))
        return 0;
    return 1;
}
```

`zslFirstInRange`函数在跳跃表中查找第一个被包含在指定范围内的节点，如果没找到返回NULL。

```Java
zskiplistNode *zslFirstInRange(zskiplist *zsl, zrangespec *range) {
    zskiplistNode *x;
    int i;

    /* 如果给定的分值范围不在跳跃表分值范围之内，直接返回 */
    if (!zslIsInRange(zsl,range)) return NULL;

    x = zsl->header;  // 表头节点
    for (i = zsl->level-1; i >= 0; i--) {
        /* Go forward while *OUT* of range. */
        while (x->level[i].forward &&
            !zslValueGteMin(x->level[i].forward->score,range))
                x = x->level[i].forward;
    }

    /* This is an inner range, so the next node cannot be NULL. */
    x = x->level[0].forward;
    serverAssert(x != NULL);

    /* 判断节点分值是否小于或等于给定范围range的上限 */
    if (!zslValueLteMax(x->score,range)) return NULL;
    return x;
}
```

`zslLastInRange`函数在跳跃表中查找最后一个被包含在指定范围内的节点，如果没找到返回NULL。

```Java
zskiplistNode *zslLastInRange(zskiplist *zsl, zrangespec *range) {
    zskiplistNode *x;
    int i;

    /* If everything is out of range, return early. */
    if (!zslIsInRange(zsl,range)) return NULL;

    x = zsl->header;
    for (i = zsl->level-1; i >= 0; i--) {
        /* Go forward while *IN* range. */
        while (x->level[i].forward &&
            zslValueLteMax(x->level[i].forward->score,range))
                x = x->level[i].forward;
    }

    /* This is an inner range, so this node cannot be NULL. */
    serverAssert(x != NULL);

    /* 判断节点分值是否大于或等于给定范围range的下限 */
    if (!zslValueGteMin(x->score,range)) return NULL;
    return x;
}
```
