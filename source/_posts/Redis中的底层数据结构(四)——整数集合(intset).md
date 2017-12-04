---
title: Redis中的底层数据结构(四)——整数集合(intset)
date: 2017-11-16
tags: [Redis, 数据结构]
categories: 源码分析
---

本文将详细说明Redis中整数集合的实现。

在Redis源码（这里使用3.2.11版本）中，整数集合的实现在`intset.h`和`intset.c`中。

<!--more-->

## 整数集合概述

整数集合中保存有序、不重复的多个整数，Redis会根据添加进集合中的数的大小来确定集合的编码方式。比如一个添加到一个集合中的所有数字都可以用`int16_t`来保存，那么这个整数集合的`encoding`就是`INTSET_ENC_INT16`。如果新添加一个数时，发现这个数字无法用`int16_t`保存，而是要用`int32_t`，Redis会先把这个整数集合的编码升级为`INTSET_ENC_INT32`，这需要把集合中所有数字都改为`int32_t`类型的，然后再添加这个新数。在`intset.c`中有如下代码：
```Java
/* 注意下面这些编码是有顺序的，关系如下：
 * INTSET_ENC_INT16 < INTSET_ENC_INT32 < INTSET_ENC_INT64. */
#define INTSET_ENC_INT16 (sizeof(int16_t))
#define INTSET_ENC_INT32 (sizeof(int32_t))
#define INTSET_ENC_INT64 (sizeof(int64_t))
```
整数集合支持三种编码：`INTSET_ENC_INT16`、`INTSET_ENC_INT32`和`INTSET_ENC_INT64`。
在整数集合升级后，集合中原来的数字的值大小不变，变化的只是其数据类型，升级后整数集合所占用的空间会变大。一种比较极端的例子是，一个包含10000个数字的整数集合，只有一个数字是需要用int64_t来编码的，其余数字只需int16_t编码即可，尽管只有一个数字需要int64_t，我们还是必须将整数集合升级到`INTSET_ENC_INT64`编码。需要特别注意的是，整数集合只支持升级不支持降级。

Redis整数集合的数据结构示意图：

![Redis的整数集合](/assets/images/post_imgs/redis_data_structure_5.png)

## 整数集合中的数据结构

下面是`intset.h`的全部内容：

```Java
/* 整数集合结构 */
typedef struct intset {
    uint32_t encoding;  // 编码方式
    uint32_t length;    // 集合数组中元素个数
    int8_t contents[];  // 集合数组
} intset;

intset *intsetNew(void);  // 创建一个新整数集合
intset *intsetAdd(intset *is, int64_t value, uint8_t *success);  // 向一个整数集合中加入元素
intset *intsetRemove(intset *is, int64_t value, int *success);  // 从一个整数集合中移除元素
uint8_t intsetFind(intset *is, int64_t value);  // 在一个整数集合中查找元素
int64_t intsetRandom(intset *is);  // 从一个整数集合中随机返回一个元素
uint8_t intsetGet(intset *is, uint32_t pos, int64_t *value);  // 获取整数集合中指定位置上的元素
uint32_t intsetLen(intset *is);  // 获取整数集合的长度
size_t intsetBlobLen(intset *is);  // 获取整数集合以字节为单位的大小
```

## 整数集合的实现

整数集合中的三种编码：

```Java
/* 注意下面这些编码是有顺序的，关系如下：
 * INTSET_ENC_INT16 < INTSET_ENC_INT32 < INTSET_ENC_INT64. */
#define INTSET_ENC_INT16 (sizeof(int16_t))
#define INTSET_ENC_INT32 (sizeof(int32_t))
#define INTSET_ENC_INT64 (sizeof(int64_t))
```

`_intsetValueEncoding`函数返回给定数字需要的编码方式。

```Java
static uint8_t _intsetValueEncoding(int64_t v) {
    if (v < INT32_MIN || v > INT32_MAX)
        return INTSET_ENC_INT64;
    else if (v < INT16_MIN || v > INT16_MAX)
        return INTSET_ENC_INT32;
    else
        return INTSET_ENC_INT16;
}
```

`_intsetGetEncoded`函数根据给定的索引值和编码获取整数集合中的元素。

```Java
static int64_t _intsetGetEncoded(intset *is, int pos, uint8_t enc) {
    int64_t v64;
    int32_t v32;
    int16_t v16;

    if (enc == INTSET_ENC_INT64) {
        memcpy(&v64,((int64_t*)is->contents)+pos,sizeof(v64));
        memrev64ifbe(&v64);
        return v64;
    } else if (enc == INTSET_ENC_INT32) {
        memcpy(&v32,((int32_t*)is->contents)+pos,sizeof(v32));
        memrev32ifbe(&v32);
        return v32;
    } else {
        memcpy(&v16,((int16_t*)is->contents)+pos,sizeof(v16));
        memrev16ifbe(&v16);
        return v16;
    }
}
```

`_intsetGet`函数根据给定的索引值获取整数集合中的元素，编码使用整数集合的encoding。

```Java
static int64_t _intsetGet(intset *is, int pos) {
    return _intsetGetEncoded(is,pos,intrev32ifbe(is->encoding));
}
```

`_intsetSet`函数设置整数集合指定索引值上的元素值，编码使用整数集合的encoding。

```Java
static void _intsetSet(intset *is, int pos, int64_t value) {
    uint32_t encoding = intrev32ifbe(is->encoding);

    if (encoding == INTSET_ENC_INT64) {
        ((int64_t*)is->contents)[pos] = value;
        memrev64ifbe(((int64_t*)is->contents)+pos);
    } else if (encoding == INTSET_ENC_INT32) {
        ((int32_t*)is->contents)[pos] = value;
        memrev32ifbe(((int32_t*)is->contents)+pos);
    } else {
        ((int16_t*)is->contents)[pos] = value;
        memrev16ifbe(((int16_t*)is->contents)+pos);
    }
}
```

`intsetNew`函数创建一个空的整数集合。

```Java
intset *intsetNew(void) {
    intset *is = zmalloc(sizeof(intset));
    is->encoding = intrev32ifbe(INTSET_ENC_INT16);  // 默认编码是INTSET_ENC_INT16
    is->length = 0;  // 集合长度初始化为0
    return is;
}
```

`intsetResize`函数调整整数集合大小。

```Java
static intset *intsetResize(intset *is, uint32_t len) {
    uint32_t size = len*intrev32ifbe(is->encoding);  // 计算新的集合空间大小
    is = zrealloc(is,sizeof(intset)+size);  // realloc新的空间，size是集合数组contents的大小，所以还要加上整数集合结构的其他成员空间大小
    return is;
}
```

`intsetSearch`函数查找"value"的位置。当找到这个值时返回1且将"pos"指向的值设置为这个位置。当没有找到这个值时返回0且将"pos"指向的值设置为插入"value"到这个整数集合时所在的位置。

```Java
static uint8_t intsetSearch(intset *is, int64_t value, uint32_t *pos) {
    int min = 0, max = intrev32ifbe(is->length)-1, mid = -1;
    int64_t cur = -1;

    /* 整数集合为空时，不可能找到该值的位置 */
    if (intrev32ifbe(is->length) == 0) {
        if (pos) *pos = 0;  // 向一个空的整数集合加入元素时当然是放在索引为0的位置了
        return 0;
    } else {
        /* 当在集合中找不到该值时，我们会知道它的插入位置。 */
        if (value > _intsetGet(is,intrev32ifbe(is->length)-1)) {
            // 整数集合中数组的最后一个值最大，如果value大于这个最大值，插入索引就是当前数组长度
            if (pos) *pos = intrev32ifbe(is->length);
            return 0;
        } else if (value < _intsetGet(is,0)) {
            // 整数集合中数组的第一个值最小，如果value小于这个最小值，插入索引就是0
            if (pos) *pos = 0;
            return 0;
        }
    }

    /* 插入索引在中间的情况，使用二分查找法找到插入位置 */
    while(max >= min) {
        mid = ((unsigned int)min + (unsigned int)max) >> 1;
        cur = _intsetGet(is,mid);
        if (value > cur) {
            min = mid+1;
        } else if (value < cur) {
            max = mid-1;
        } else {
            break;
        }
    }

    if (value == cur) {  // 在整数集合中找到了value，将pos指向的值设为value在数组中的索引
        if (pos) *pos = mid;
        return 1;
    } else {  // 在整数集合中没有找到value，获得它的插入位置，复制给pos指向的值
        if (pos) *pos = min;
        return 0;
    }
}
```

`intsetUpgradeAndAdd`函数将整数集合升级到一个更大的编码上然后添加给定的整数。

```Java
/* 将整数集合升级到一个更大的编码上然后添加给定的整数。 */
static intset *intsetUpgradeAndAdd(intset *is, int64_t value) {
    uint8_t curenc = intrev32ifbe(is->encoding);  // 当前整数编码
    uint8_t newenc = _intsetValueEncoding(value);  // 新的整数编码
    int length = intrev32ifbe(is->length);  // 当前整数集合中元素数量
    /* 由于需要升级编码，待添加的数一定是大于或者等于当前集合中的所有元素，
     * 因此只有可能在整数集合数组的头部或尾部添加 */
    int prepend = value < 0 ? 1 : 0;

    /* 设置新整数编码，调整整数集合大小 */
    is->encoding = intrev32ifbe(newenc);
    is = intsetResize(is,intrev32ifbe(is->length)+1);

    /* 以从尾至头的方向处理不会覆盖原来的值。
     * 注意"prepend"变量是用来判断是否需要在整数集合的开始或结束处保留一个空白空间。
     * 如果prepend值为1，意味着要在集合数组头部添加新值，则所有元素要后移一个位置，所以
     * _intsetSet的第二个参数是length+prepend；在末尾添加时prepend为0，所有元素不用移位。
     * _intsetGetEncoded(is,length,curenc)获取整数集合指定位置上的元素值。
    */
    while(length--)
        _intsetSet(is,length+prepend,_intsetGetEncoded(is,length,curenc));

    if (prepend)
        _intsetSet(is,0,value);  // 在整数集合数组头部插入元素
    else
        _intsetSet(is,intrev32ifbe(is->length),value);  // 在整数集合数组尾部插入元素
    is->length = intrev32ifbe(intrev32ifbe(is->length)+1);  // 更新整数集合元素数量
    return is;
}
```

`intsetMoveTail`函数将整数集合数组中from位置后的数据移动到to位置。

```Java
static void intsetMoveTail(intset *is, uint32_t from, uint32_t to) {
    void *src, *dst;  // 源数据指针和目标数据指针
    uint32_t bytes = intrev32ifbe(is->length)-from;  // 要移动的元素个数
    uint32_t encoding = intrev32ifbe(is->encoding);  // 整数集合编码

    /* 根据整数集合编码计算要移动的字节数，要移动的字节数 = 要移动的元素个数 * 编码类型单位大小 */
    if (encoding == INTSET_ENC_INT64) {
        src = (int64_t*)is->contents+from;
        dst = (int64_t*)is->contents+to;
        bytes *= sizeof(int64_t);
    } else if (encoding == INTSET_ENC_INT32) {
        src = (int32_t*)is->contents+from;
        dst = (int32_t*)is->contents+to;
        bytes *= sizeof(int32_t);
    } else {
        src = (int16_t*)is->contents+from;
        dst = (int16_t*)is->contents+to;
        bytes *= sizeof(int16_t);
    }
    memmove(dst,src,bytes);  // 移动数据
}
```

`intsetAdd`函数向整数集合中添加一个整数。

```Java
intset *intsetAdd(intset *is, int64_t value, uint8_t *success) {
    uint8_t valenc = _intsetValueEncoding(value);  // 计算要添加数值需要的编码方式
    uint32_t pos;
    if (success) *success = 1;

    /* 如果需要就升级整数集合编码方式。当我们要升级时，
     * 我们可以判断出是要在数组首部（value<0）还是尾部（value>0）插入这个新值，
     * 因为很容易知道新值对于原集合编码是上溢还是下溢。 */
    if (valenc > intrev32ifbe(is->encoding)) {
        return intsetUpgradeAndAdd(is,value);  // 升级集合编码并插入
    } else {
        /* 如果value已经存在于集合中则终止。
         * 当集合中不存在value时，pos指向的值表示value的插入位置。 */
        if (intsetSearch(is,value,&pos)) {
            if (success) *success = 0;  // 集合中已经存在value
            return is;
        }

        is = intsetResize(is,intrev32ifbe(is->length)+1);  // 扩充集合大小
        if (pos < intrev32ifbe(is->length)) intsetMoveTail(is,pos,pos+1);  // 把pos位置之后的数据移动到pos+1处
    }

    _intsetSet(is,pos,value);  // 插入value到pos处
    is->length = intrev32ifbe(intrev32ifbe(is->length)+1);  // 更新数组长度
    return is;
}
```

`intsetRemove`函数从整数集合种删除元素。

```Java
intset *intsetRemove(intset *is, int64_t value, int *success) {
    uint8_t valenc = _intsetValueEncoding(value);  // 计算要添加数值需要的编码方式
    uint32_t pos;
    if (success) *success = 0;

    /* 只有要删除数字的编码不大于当前集合编码且存在于集合中时才去做真正的删除操作，
     * 对于整数集合来说，大于当前集合编码方式的数字不可能存在于这个时刻的集合中。 */
    if (valenc <= intrev32ifbe(is->encoding) && intsetSearch(is,value,&pos)) {
        uint32_t len = intrev32ifbe(is->length);  // 当前集合元素数量

        if (success) *success = 1;

        /* 把pos+1之后的数据移动到pos,覆盖掉要删除的元素 */
        if (pos < (len-1)) intsetMoveTail(is,pos+1,pos);
        is = intsetResize(is,len-1);  // 调整集合大小
        is->length = intrev32ifbe(len-1);  // 更新数组长度
    }
    return is;
}
```

`intsetFind`函数判断value是否存在于集合中。

```Java
uint8_t intsetFind(intset *is, int64_t value) {
    uint8_t valenc = _intsetValueEncoding(value);  // 计算要添加数值需要的编码方式
    return valenc <= intrev32ifbe(is->encoding) && intsetSearch(is,value,NULL);  // 只是判断元素存在性，因此intsetSearch的pos参数为NULL
}
```

`intsetRandom`函数随机返回集合中一个元素。

```Java
int64_t intsetRandom(intset *is) {
    return _intsetGet(is,rand()%intrev32ifbe(is->length));
}
```

`intsetGet`函数返回集合中指定位置处的元素，当pos超出范围时返回0，否则返回1。value指向的地址保存获取到的元素。

```Java
uint8_t intsetGet(intset *is, uint32_t pos, int64_t *value) {
    if (pos < intrev32ifbe(is->length)) {
        *value = _intsetGet(is,pos);
        return 1;
    }
    return 0;
}
```

`intsetLen`函数返回整数集合中元素数量。

```Java
uint32_t intsetLen(intset *is) {
    return intrev32ifbe(is->length);
}
```

`intsetBlobLen`函数返回整数集合以字节为单位的大小。

```Java
size_t intsetBlobLen(intset *is) {
    return sizeof(intset)+intrev32ifbe(is->length)*intrev32ifbe(is->encoding);
}
```
