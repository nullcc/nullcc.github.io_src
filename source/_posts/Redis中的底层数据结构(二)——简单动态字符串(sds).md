---
title: Redis中的底层数据结构(二)——简单动态字符串(sds)
date: 2017-11-10
---

本文将详细说明Redis中简单动态字符串(sds)的实现。

在Redis源码（这里使用3.2.11版本）中，sds的实现在`sds.h`和`sds.c`中。

<!--more-->

## sds字符串和C原生字符串的对比

Redis并没有直接使用C语言的原生字符串，而是有一个专用的字符串实现：sds。sds相比于C语言原生字符串有很多优势：

1. sds获取字符串长度的效率高。要想获取C语言原生字符串的长度，需要遍历整个字符串对字符个数计数，直到遇到一个`\0`为止，时间复杂度为O(n)。sds在头部保存了`len`用来表示字符串的实际长度，获取sds字符串长度的时间复杂度为O(1)。

2. sds可以避免缓冲区溢出。一个简单的例子，字符串拼接，对C语言原生字符串str1和str2来说，把str2拼接到str1后，如果没有为str1申请好足够的内存，直接拼接可能造成str1后的内存区域被覆盖从而导致不可预知的后果。sds字符串在拼接时，会自动检查空间是否足够，如果不够会自动按照一定的规则进行分配，因此无需担心溢出问题。

3. sds的内存分配策略可以有效降低修改字符串时内存重分配的开销。在`sdsMakeRoomFor`函数中有这么一段代码（只截取一小部分）：
```Java
// ...other code...
// 扩充后的长度小于sds最大预分配长度时，把newlen加倍以防止短期内再扩充
if (newlen < SDS_MAX_PREALLOC)  
  newlen *= 2;
else  // 否则直接加上sds最大预分配长度
  newlen += SDS_MAX_PREALLOC;
// ...other code...
```
上面这段代码表示，在对一个sds字符串进行扩充时，Redis会认为这个字符串还有进一步被扩充的可能性，因此会根据一定规则来预先分配一部分空间来避免短期内再次申请内存分配。另外sds字符串在缩短内容时，也不会立即释放多出来的空间，sds字符串在`alloc`属性中标识了占用的总空间大小，在需要的时候，Redis会进行释放。

4.sds是二进制安全的。C原生字符串的结尾是`\0`，也就是说它在字符串内容中不能包含`\0`，如果包含了会导致字符串被截断，因此C原生字符串只能用来保存文本数据，无法保存图片等包含`\0`的数据。sds字符串使用`len`属性来标识字符串长度而不是`\0`，所以其内容可以是任意的二进制数据。

## sds头文件详解

sds的定义表明sds实际上是一个`char *`：

```Java
typedef char *sds;
```

但这还不足以说明sds是什么，源码中还定义了五种sds header的类型：

```Java
/* 注意: sdshdr5这种类型从未被使用, 我们仅仅直接访问它的flags。
 * 这里记录的是type为5的sds的布局。
 * __attribute__ ((__packed__))表示结构体字节对齐，这是GNU C特有的语法 */
struct __attribute__ ((__packed__)) sdshdr5 {
    unsigned char flags;
    char buf[];
};
struct __attribute__ ((__packed__)) sdshdr8 {
    uint8_t len;  // 已使用的字符串长度
    uint8_t alloc;  // 分配的内存空间大小，不包括头部和空终止符
    unsigned char flags;  // 3个最低有效位表示类型，5个最高有效位未使用
    char buf[];  // 字符数组
};
struct __attribute__ ((__packed__)) sdshdr16 {
    uint16_t len;
    uint16_t alloc;
    unsigned char flags;
    char buf[];
};
struct __attribute__ ((__packed__)) sdshdr32 {
    uint32_t len;
    uint32_t alloc;
    unsigned char flags;
    char buf[];
};
struct __attribute__ ((__packed__)) sdshdr64 {
    uint64_t len;
    uint64_t alloc;
    unsigned char flags;
    char buf[];
};

/* SDS类型值，一共5种类型 */
#define SDS_TYPE_5  0
#define SDS_TYPE_8  1
#define SDS_TYPE_16 2
#define SDS_TYPE_32 3
#define SDS_TYPE_64 4
#define SDS_TYPE_MASK 7  // sds类型掩码 0b00000111，因为flags中只有3个最低有效位表示类型
#define SDS_TYPE_BITS 3  // 表示sds类型的比特位数，前面有提到：3个最低有效位表示类型
```

除了`sdshdr5`不被使用以外，可以观察到其他四种类型的头部中`len`和`alloc`域的类型都不同，不同类型的头部支持的字符串长度不同，这是为了空间效率才这么做的，后面会有详细分析。

根据sds header的定义，来看看一个头部类型为sdshdr8的sds字符串的内存布局：

![Redis的sds内存布局1](/assets/images/post_imgs/redis_data_structure_2.png)

`sdshdr8`中的`len`表示sds字符串的实际长度，也就是buf字符数组的长度，`alloc`表示分配给字符串的空间大小，注意这个大小不包含头部和结尾的终止符。也就是说`alloc`是大于或等于`len`的，当`alloc`等于`len`时，内存布局就如上图所示，如果当`alloc`大于`len`，在字符串和和结尾终止符(\0)之间，会用`\0`填充，下面是一个`len`等于12，`alloc`等于15的sds字符串的内存布局示意图：

![Redis的sds内存布局2](/assets/images/post_imgs/redis_data_structure_3.png)

先看几个在sds实现中很常用的宏：

```Java
/* 从sds获取其header起始位置的指针，并声明一个sh变量赋值给它，获得方式是sds的地址减去头部大小 */
#define SDS_HDR_VAR(T,s) struct sdshdr##T *sh = (void*)((s)-(sizeof(struct sdshdr##T)));

/* 从sds获取其header起始位置的指针，作用和上面一个定义差不多，只不过不赋值给sh变量 */
#define SDS_HDR(T,s) ((struct sdshdr##T *)((s)-(sizeof(struct sdshdr##T))))

// 获取type为5的sds的长度，由于其flags的5个最高有效位表示字符串长度，所以直接把flags右移3位即是其字符串长度
#define SDS_TYPE_5_LEN(f) ((f)>>SDS_TYPE_BITS)
```

`sdslen`函数获取一个sds的长度。

```Java
static inline size_t sdslen(const sds s) {
    /* 通过sds字符指针获得header类型的方法是，先向低地址方向偏移1个字节的位置，得到flags字段，
       然后取flags的最低3个bit得到header的类型。 */
    unsigned char flags = s[-1];
    switch(flags&SDS_TYPE_MASK) {  // 操作：0b00000??? & 0b00000111，根据sds类型获取其字符串长度
        case SDS_TYPE_5:
            return SDS_TYPE_5_LEN(flags);
        case SDS_TYPE_8:
            return SDS_HDR(8,s)->len;
        case SDS_TYPE_16:
            return SDS_HDR(16,s)->len;
        case SDS_TYPE_32:
            return SDS_HDR(32,s)->len;
        case SDS_TYPE_64:
            return SDS_HDR(64,s)->len;
    }
    return 0;
}
```

`sdsavail`函数获取一个sds的空闲空间，计算方式是：已分配的空间 - 字符串长度大小。

```Java
static inline size_t sdsavail(const sds s) {
    unsigned char flags = s[-1];
    switch(flags&SDS_TYPE_MASK) {  // 同上，获取sds类型
        case SDS_TYPE_5: {  // SDS_TYPE_5未被使用，直接返回0
            return 0;
        }
        case SDS_TYPE_8: {
            SDS_HDR_VAR(8,s);  // 从sds获取其header起始位置的指针
            return sh->alloc - sh->len;
        }
        case SDS_TYPE_16: {
            SDS_HDR_VAR(16,s);
            return sh->alloc - sh->len;
        }
        case SDS_TYPE_32: {
            SDS_HDR_VAR(32,s);
            return sh->alloc - sh->len;
        }
        case SDS_TYPE_64: {
            SDS_HDR_VAR(64,s);
            return sh->alloc - sh->len;
        }
    }
    return 0;
}
```

`sdssetlen`函数设置sds的字符串长度

```Java
static inline void sdssetlen(sds s, size_t newlen) {
    unsigned char flags = s[-1];
    switch(flags&SDS_TYPE_MASK) {  // 同上，获取sds类型
        case SDS_TYPE_5:  // SDS_TYPE_5的sds
            {
                unsigned char *fp = ((unsigned char*)s)-1;     // fp是sdshdr5的flags的指针
                *fp = SDS_TYPE_5 | (newlen << SDS_TYPE_BITS);  // 把newlen右移SDS_TYPE_BITS位再和SDS_TYPE_5合成即可
            }
            break;
        case SDS_TYPE_8:
            SDS_HDR(8,s)->len = newlen;  // 直接改写header中的len
            break;
        case SDS_TYPE_16:
            SDS_HDR(16,s)->len = newlen;
            break;
        case SDS_TYPE_32:
            SDS_HDR(32,s)->len = newlen;
            break;
        case SDS_TYPE_64:
            SDS_HDR(64,s)->len = newlen;
            break;
    }
}
```

`sdsinclen`函数增加sds的长度。

```Java
static inline void sdsinclen(sds s, size_t inc) {
    unsigned char flags = s[-1];
    switch(flags&SDS_TYPE_MASK) {  // 同上，获取sds类型
        case SDS_TYPE_5:
            {
                unsigned char *fp = ((unsigned char*)s)-1;         // fp是sdshdr5的flags的指针
                unsigned char newlen = SDS_TYPE_5_LEN(flags)+inc;  // 计算出newlen
                *fp = SDS_TYPE_5 | (newlen << SDS_TYPE_BITS);      // 同sdssetlen
            }
            break;
        case SDS_TYPE_8:
            SDS_HDR(8,s)->len += inc;  // 直接增加header中的len
            break;
        case SDS_TYPE_16:
            SDS_HDR(16,s)->len += inc;
            break;
        case SDS_TYPE_32:
            SDS_HDR(32,s)->len += inc;
            break;
        case SDS_TYPE_64:
            SDS_HDR(64,s)->len += inc;
            break;
    }
}
```

`sdsalloc`函数获取sds容量，sdsalloc() = sdsavail() + sdslen()。

```Java
static inline size_t sdsalloc(const sds s) {
    unsigned char flags = s[-1];
    switch(flags&SDS_TYPE_MASK) {  // 同上，获取sds类型
        case SDS_TYPE_5:
            return SDS_TYPE_5_LEN(flags);
        case SDS_TYPE_8:  // 其他type直接返回header的alloc属性
            return SDS_HDR(8,s)->alloc;
        case SDS_TYPE_16:
            return SDS_HDR(16,s)->alloc;
        case SDS_TYPE_32:
            return SDS_HDR(32,s)->alloc;
        case SDS_TYPE_64:
            return SDS_HDR(64,s)->alloc;
    }
    return 0;
}
```

`sdssetalloc`函数设置sds容量。

```Java
static inline void sdssetalloc(sds s, size_t newlen) {
    unsigned char flags = s[-1];
    switch(flags&SDS_TYPE_MASK) {  // 同上，获取sds类型
        case SDS_TYPE_5:
            /* Nothing to do, this type has no total allocation info. */
            break;
        case SDS_TYPE_8:  // 其他type直接设置header的alloc属性
            SDS_HDR(8,s)->alloc = newlen;
            break;
        case SDS_TYPE_16:
            SDS_HDR(16,s)->alloc = newlen;
            break;
        case SDS_TYPE_32:
            SDS_HDR(32,s)->alloc = newlen;
            break;
        case SDS_TYPE_64:
            SDS_HDR(64,s)->alloc = newlen;
            break;
    }
}
```

下面是`sds.h`中声明的函数原型：

```Java
sds sdsnewlen(const void *init, size_t initlen);  // 创建一个长度为initlen的sds，使用init指向的字符数组来初始化数据
sds sdsnew(const char *init);  // 内部调用sdsnewlen，创建一个sds
sds sdsempty(void);            // 返回一个空的sds
sds sdsdup(const sds s);       // 拷贝一个sds并返回这个拷贝
void sdsfree(sds s);           // 释放一个sds
sds sdsgrowzero(sds s, size_t len);  // 使一个sds的长度增长到一个指定的值，末尾未使用的空间用0填充
sds sdscatlen(sds s, const void *t, size_t len);  // 连接一个sds和一个二进制安全的数据t，t的长度为len
sds sdscat(sds s, const char *t);  // 连接一个sds和一个二进制安全的数据t，内部调用sdscatlen
sds sdscatsds(sds s, const sds t);  // 连接两个sds
sds sdscpylen(sds s, const char *t, size_t len);  // 把二进制安全的数据t复制到一个sds的内存中，覆盖原来的字符串，t的长度为len
sds sdscpy(sds s, const char *t);  // 把二进制安全的数据t复制到一个sds的内存中，覆盖原来的字符串，内部调用sdscpylen

/* 通过fmt指定个格式来格式化字符串 */
sds sdscatvprintf(sds s, const char *fmt, va_list ap);
#ifdef __GNUC__
sds sdscatprintf(sds s, const char *fmt, ...)
    __attribute__((format(printf, 2, 3)));
#else
sds sdscatprintf(sds s, const char *fmt, ...);
#endif

sds sdscatfmt(sds s, char const *fmt, ...);  // 将格式化后的任意数量个字符串追加到s的末尾
sds sdstrim(sds s, const char *cset);  // 删除sds两端由cset指定的字符
void sdsrange(sds s, int start, int end);  // 通过区间[start, end]截取字符串
void sdsupdatelen(sds s);  // 根据字符串占用的空间来更新len
void sdsclear(sds s);  // 把字符串的第一个字符设置为'\0'，把字符串设置为空字符串，但是并不释放内存
int sdscmp(const sds s1, const sds s2);  // 比较两个sds的相等性
sds *sdssplitlen(const char *s, int len, const char *sep, int seplen, int *count);  // 使用分隔符sep对s进行分割，返回一个sds数组
void sdsfreesplitres(sds *tokens, int count);  // 释放sds数组tokens中的count个sds
void sdstolower(sds s);  // 将sds所有字符转换为小写
void sdstoupper(sds s);  // 将sds所有字符转换为大写
sds sdsfromlonglong(long long value);  // 将长整型转换为字符串
sds sdscatrepr(sds s, const char *p, size_t len);  // 将长度为len的字符串p以带引号的格式追加到s的末尾
sds *sdssplitargs(const char *line, int *argc); // 将一行文本分割成多个参数，参数的个数存在argc
sds sdsmapchars(sds s, const char *from, const char *to, size_t setlen);  // 将字符串s中，出现存在from中指定的字符，都转换成to中的字符，from与to有位置关系
sds sdsjoin(char **argv, int argc, char *sep);  // 使用分隔符sep将字符数组argv拼接成一个字符串
sds sdsjoinsds(sds *argv, int argc, const char *sep, size_t seplen);  // 和sdsjoin类似，不过拼接的是一个sds数组

/* 暴露出来作为用户API的低级函数 */
sds sdsMakeRoomFor(sds s, size_t addlen);  // 为指定的sds扩充大小，扩充的大小为addlen
void sdsIncrLen(sds s, int incr);  // 根据incr增加或减少sds的字符串长度
sds sdsRemoveFreeSpace(sds s);  // 移除一个sds的空闲空间
size_t sdsAllocSize(sds s);  // 获取一个sds的总大小（包括header、字符串、末尾的空闲空间和隐式项目）
void *sdsAllocPtr(sds s);  // 获取一个sds确切的内存空间的指针（一般的sds引用都是一个指向其字符串的指针）

/* 导出供外部程序调用的sds的分配/释放函数 */
void *sds_malloc(size_t size);  // sds分配器的包装函数，内部调用s_malloc
void *sds_realloc(void *ptr, size_t size);  // sds分配器的包装函数，内部调用s_realloc
void sds_free(void *ptr);  // sds释放器的包装函数，内部调用s_free
```

## sds实现详解

下面列举了一部分是`sds.c`中的函数定义，由于`sds.c`代码量较多（超过1500行），其中有一些函数是帮助函数，或测试代码，这里只列举比较重要的函数详细解释。

`sdsHdrSize`函数获取sds header的大小。

```Java
static inline int sdsHdrSize(char type) {
    switch(type&SDS_TYPE_MASK) {  // 获取sds类型
        case SDS_TYPE_5:
            return sizeof(struct sdshdr5);
        case SDS_TYPE_8:
            return sizeof(struct sdshdr8);
        case SDS_TYPE_16:
            return sizeof(struct sdshdr16);
        case SDS_TYPE_32:
            return sizeof(struct sdshdr32);
        case SDS_TYPE_64:
            return sizeof(struct sdshdr64);
    }
    return 0;
}
```

`sdsReqType`函数根据字符串大小判断sds类型。

```Java
static inline char sdsReqType(size_t string_size) {
    if (string_size < 1<<5)
        return SDS_TYPE_5;
    if (string_size < 1<<8)
        return SDS_TYPE_8;
    if (string_size < 1<<16)
        return SDS_TYPE_16;
    if (string_size < 1ll<<32)
        return SDS_TYPE_32;
    return SDS_TYPE_64;
}
```

`sdsnewlen`函数使用init指针指向的数据和initlen的长度创建一个新的sds字符串。如果init指针是NULL，字符串会被初始化为长度为initlen，内容全为0字节。 sds字符串总是以'\0'字符结尾的，所以即使你创建了如下的sds字符串：
  mystring = sdsnewlen("abc",3);
由于这个字符串在结尾隐式包含了一个'\0'，所以你可以使用printf()函数打印它。然而，sds字符串是二进制安全的，并且可以在中间包含'\0'字符，因为在sds字符串header中保存了字符串长度。

```Java
sds sdsnewlen(const void *init, size_t initlen) {
    void *sh;
    sds s;
    char type = sdsReqType(initlen);  // 使用初始长度判断该创建哪种类型的sds字符串
    /* Empty strings are usually created in order to append. Use type 8
     * since type 5 is not good at this. */
    /* 空字符串一般在创建后都会追加数据进去（完全可能大于32个字节），使用type 8的字符串类型要优于type 5 */
    if (type == SDS_TYPE_5 && initlen == 0) type = SDS_TYPE_8;
    int hdrlen = sdsHdrSize(type);  // 获取header长度
    unsigned char *fp; /* flags pointer. */

    sh = s_malloc(hdrlen+initlen+1);  // 为sds字符串header申请内存空间，大小为：头部大小+初始化长度大小+1（其中1是为'\0'留的）
    if (!init)  // 初始数据指针为NULL
        memset(sh, 0, hdrlen+initlen+1);  // 把整个sds的内容都设置为0
    if (sh == NULL) return NULL;  // 申请内存失败返回NULL
    s = (char*)sh+hdrlen;  // 字符串指针
    fp = ((unsigned char*)s)-1;  // flags指针
    switch(type) {  // 根据sds类型设置header中的数据
        case SDS_TYPE_5: {
            *fp = type | (initlen << SDS_TYPE_BITS);
            break;
        }
        case SDS_TYPE_8: {
            SDS_HDR_VAR(8,s);
            sh->len = initlen;
            sh->alloc = initlen;
            *fp = type;
            break;
        }
        case SDS_TYPE_16: {
            SDS_HDR_VAR(16,s);
            sh->len = initlen;
            sh->alloc = initlen;
            *fp = type;
            break;
        }
        case SDS_TYPE_32: {
            SDS_HDR_VAR(32,s);
            sh->len = initlen;
            sh->alloc = initlen;
            *fp = type;
            break;
        }
        case SDS_TYPE_64: {
            SDS_HDR_VAR(64,s);
            sh->len = initlen;
            sh->alloc = initlen;
            *fp = type;
            break;
        }
    }
    if (initlen && init)
        memcpy(s, init, initlen);  // 将初始化数据指针init指向的数据拷贝到字符串中
    s[initlen] = '\0';  // 设置最后一个字节为'\0'
    return s;
}
```

`sdsempty`函数创建一个空sds(字符串长度为0)字符串。即使在这种情况下，字符串也总是有一个隐式的'\0'结束符。

```Java
sds sdsempty(void) {
    return sdsnewlen("",0);
}
```

`sdsnew`函数使用一个以'\0'为结束符的C字符串创建一个新的sds字符串。

```Java
sds sdsnew(const char *init) {
    size_t initlen = (init == NULL) ? 0 : strlen(init);  // 初始化数据指针为NULL时，字符串长度为0
    return sdsnewlen(init, initlen);
}
```

`sdsdup`函数复制一个sds字符串

```Java
sds sdsdup(const sds s) {
    return sdsnewlen(s, sdslen(s));
}
```

`sdsfree`函数释放一个sds字符串，如果该字符串是NULL则什么都不做。

```Java
void sdsfree(sds s) {
    if (s == NULL) return;
    s_free((char*)s-sdsHdrSize(s[-1]));
}
```

`sdsupdatelen`函数使用通过strlen()获取的sds字符串长度来设置sds字符串的长度，所以只考虑到第一个空字符前的字符串长度。当sds字符串被手动修改的时候这个函数很有用，比如下面的例子：
  s = sdsnew("foobar");
  s[2] = '\0';
  sdsupdatelen(s);
  printf("%d\n", sdslen(s));
上面的代码输出是"2"，但是如果我们注释掉调用sdsupdatelen()的那行代码，输出则是'6'，因为字符串被强行修改了，但字符串的逻辑长度还是6个字节。

```Java
void sdsupdatelen(sds s) {
    int reallen = strlen(s);  // 获取字符串的真实长度（会取第一个终止符'\0'之前的字符串长度）
    sdssetlen(s, reallen);  // 重新设置sds的字符串长度
}
```

`sdsclear`函数就地修改一个sds字符串为空（长度为0）。然而，所有当前的缓冲区都不会被释放，而是设置成空闲空间，所以下一次追加操作可以使用原来的空闲空间而不需要分配空间。

```Java
void sdsclear(sds s) {
    sdssetlen(s, 0);  // 设置sds字符串的长度为0
    s[0] = '\0';  // 设置字符串首地址为终止符'\0'
}
```

`sdsMakeRoomFor`函数扩充sds字符串的空闲空间，调用此函数后，可以保证在原sds字符串后面扩充了addlen个字节的空间，外加1个字节的终止符。注意：这个函数不会改变调用sdslen()返回的字符串长度，仅仅改变了空闲空间的大小。

```Java
sds sdsMakeRoomFor(sds s, size_t addlen) {
    void *sh, *newsh;
    size_t avail = sdsavail(s);  // 获取sds字符串的空闲空间大小
    size_t len, newlen;
    char type, oldtype = s[-1] & SDS_TYPE_MASK;  // 获取sds字符串类型
    int hdrlen;

    /* 如果当前空闲空间大于addlen，就不做扩充操作，直接返回 */
    if (avail >= addlen) return s;

    len = sdslen(s);  // sds字符串当前长度
    sh = (char*)s-sdsHdrSize(oldtype);  // sds字符串header指针
    newlen = (len+addlen);  // 扩充后的新长度
    if (newlen < SDS_MAX_PREALLOC)  // 扩充后的长度小于sds最大预分配长度时，把newlen加倍以防止短期内再扩充
        newlen *= 2;
    else  // 否则直接加上sds最大预分配长度
        newlen += SDS_MAX_PREALLOC;

    type = sdsReqType(newlen);  // 获取新长度下的sds字符串类型

    /* 不要使用type 5：由于用户向字符串追加数据时，type 5的字符串无法保存空闲空间，所以
     * 每次追加数据时都要调用sdsMakeRoomFor() */
    if (type == SDS_TYPE_5) type = SDS_TYPE_8;  // 比较短的字符串一律用type 8

    hdrlen = sdsHdrSize(type);  // 计算sds字符串header长度
    if (oldtype==type) {  // 字符串类型不变的情况下
        newsh = s_realloc(sh, hdrlen+newlen+1);  // 在原header指针上重新分配新的大小
        if (newsh == NULL) return NULL;
        s = (char*)newsh+hdrlen;  // 更新字符串指针
    } else {
        /* 一旦header大小变化，需要把字符串前移，并且不能使用realloc */
        newsh = s_malloc(hdrlen+newlen+1);  // 新开辟一块内存
        if (newsh == NULL) return NULL;
        memcpy((char*)newsh+hdrlen, s, len+1);  // 把原始sds字符串的内容复制到新的内存区域
        s_free(sh);  // 释放原始sds字符串的头指针指向的内存
        s = (char*)newsh+hdrlen;  // 更新sds字符串指针
        s[-1] = type;  // 更新flags字节信息
        sdssetlen(s, len);  // 更新sds字符串header中的len
    }
    sdssetalloc(s, newlen);  // 更新sds字符串header中的alloc
    return s;
}
```

`sdsRemoveFreeSpace`函数重新分配sds字符串的空间，保证结尾没有空闲空间。其中包含的字符串不变，但下一次进行字符串连接操作时需要一次空间重新分配。调用此函数后，原来作为参数传入的sds字符串的指针不再是有效的，所有引用必须被替换为函数返回的新指针。

```Java
sds sdsRemoveFreeSpace(sds s) {
    void *sh, *newsh;
    char type, oldtype = s[-1] & SDS_TYPE_MASK;
    int hdrlen;
    size_t len = sdslen(s);  // 字符串真正的长度
    sh = (char*)s-sdsHdrSize(oldtype);  // 获取sds字符串header指针

    type = sdsReqType(len);  // 计算字符串的新type
    hdrlen = sdsHdrSize(type);  // 计算字符串的新header大小
    if (oldtype==type) {  // 字符串类型不变
        newsh = s_realloc(sh, hdrlen+len+1);  // realloc，大小更新为：header大小+真实字符串大小+1
        if (newsh == NULL) return NULL;
        s = (char*)newsh+hdrlen;  // 更新sds字符串指针
    } else {  // 字符串类型改变
        newsh = s_malloc(hdrlen+len+1);  // 新开辟一块内存
        if (newsh == NULL) return NULL;
        memcpy((char*)newsh+hdrlen, s, len+1);  // 复制数据到新内存中
        s_free(sh);  // 释放原始的sds字符串内存
        s = (char*)newsh+hdrlen; // 更新sds字符串指针
        s[-1] = type;  // 更新flags
        sdssetlen(s, len);  // 更新sds字符串header中的len
    }
    sdssetalloc(s, len);  // 更新sds字符串header中的alloc
    return s;
}
```

`sdsAllocSize`函数返回指定sds字符串的分配空间大小，包括:
  1) sds header大小。
  2) 字符串本身的大小。
  3) 末尾的空闲空间大小（如果有的话）。
  4) 隐式包含的终止符。

```Java
size_t sdsAllocSize(sds s) {
    size_t alloc = sdsalloc(s);  // 获取sds header的alloc
    return sdsHdrSize(s[-1])+alloc+1;  // header大小+alloc（字符串大小+空闲空间大小）+1
}
```

`sdsAllocPtr`函数返回sds分配空间的首地址（一般来说sds字符串的指针是其字符串缓冲区的首地址）

```Java
void *sdsAllocPtr(sds s) {
    return (void*) (s-sdsHdrSize(s[-1]));  // 字符串缓冲区的首地址减去header大小即可
}
```

`sdsIncrLen`函数取决于'incr'参数，此函数增加sds字符串的长度或减少剩余空闲空间的大小。同时也将在新字符串的末尾设置终止符。此函数用来修正调用sdsMakeRoomFor()函数之后字符串的长度，在当前字符串后追加数据这些需要设置字符串新长度的操作之后。注意：可以使用一个负的增量值来右对齐字符串。使用sdsIncrLen()和sdsMakeRoomFor()函数可以用来满足如下模式，从内核中直接复制一部分字节到一个sds字符串的末尾，且无须把数据先复制到一个中间缓冲区中：
  oldlen = sdslen(s);
  s = sdsMakeRoomFor(s, BUFFER_SIZE);
  nread = read(fd, s+oldlen, BUFFER_SIZE);
  ... check for nread <= 0 and handle it ...
  sdsIncrLen(s, nread);

```Java
void sdsIncrLen(sds s, int incr) {
    unsigned char flags = s[-1];
    size_t len;
    switch(flags&SDS_TYPE_MASK) {  // 判断sds字符串类型
        case SDS_TYPE_5: {
            unsigned char *fp = ((unsigned char*)s)-1;  // flags指针
            unsigned char oldlen = SDS_TYPE_5_LEN(flags); // 原始字符串大小
            assert((incr > 0 && oldlen+incr < 32) || (incr < 0 && oldlen >= (unsigned int)(-incr)));
            *fp = SDS_TYPE_5 | ((oldlen+incr) << SDS_TYPE_BITS);  // 更新flags中字符串大小的比特位
            len = oldlen+incr;  // 更新header的len
            break;
        }
        case SDS_TYPE_8: {
            SDS_HDR_VAR(8,s);  // 获取sds字符串的header指针
            assert((incr >= 0 && sh->alloc-sh->len >= incr) || (incr < 0 && sh->len >= (unsigned int)(-incr)));
            len = (sh->len += incr);  // 更新header的len
            break;
        }
        case SDS_TYPE_16: {
            SDS_HDR_VAR(16,s);
            assert((incr >= 0 && sh->alloc-sh->len >= incr) || (incr < 0 && sh->len >= (unsigned int)(-incr)));
            len = (sh->len += incr);
            break;
        }
        case SDS_TYPE_32: {
            SDS_HDR_VAR(32,s);
            assert((incr >= 0 && sh->alloc-sh->len >= (unsigned int)incr) || (incr < 0 && sh->len >= (unsigned int)(-incr)));
            len = (sh->len += incr);
            break;
        }
        case SDS_TYPE_64: {
            SDS_HDR_VAR(64,s);
            assert((incr >= 0 && sh->alloc-sh->len >= (uint64_t)incr) || (incr < 0 && sh->len >= (uint64_t)(-incr)));
            len = (sh->len += incr);
            break;
        }
        default: len = 0; /* Just to avoid compilation warnings. */
    }
    s[len] = '\0';  // 设置终止符
}
```

`sdsgrowzero`函数增长一个sds字符串到一个指定长度。扩充出来的不是原来字符串的空间会被设置为0。如果指定的长度比当前长度小，不做任何操作。

```Java
sds sdsgrowzero(sds s, size_t len) {
    size_t curlen = sdslen(s);  // 当前字符串长度

    if (len <= curlen) return s;  // 设置的长度小于当前长度，直接返回原始sds字符串指针
    s = sdsMakeRoomFor(s,len-curlen);  // 扩充sds
    if (s == NULL) return NULL;

    /* Make sure added region doesn't contain garbage */
    /* 确保新增的区域不包含垃圾数据 */
    memset(s+curlen,0,(len-curlen+1)); /* also set trailing \0 byte */
    sdssetlen(s, len);  // 更新sds字符串header中的len
    return s;
}
```

`sdscatlen`函数向指定的sds字符串's'尾部追加由't'指向的二进制安全的字符串，长度'len'字节。调用此函数后，原来作为参数传入的sds字符串的指针不再是有效的，所有引用必须被替换为函数返回的新指针。

```Java
sds sdscatlen(sds s, const void *t, size_t len) {
    size_t curlen = sdslen(s);  // 当前字符串长度

    s = sdsMakeRoomFor(s,len);  // 扩充len字节
    if (s == NULL) return NULL;
    memcpy(s+curlen, t, len);  // 追加数据到原字符串末尾
    sdssetlen(s, curlen+len);  // 更新sds字符串header中的len
    s[curlen+len] = '\0';  // 设置终止符
    return s;
}
```

`sdscat`函数追加指定的C字符串到sds字符串's'的尾部。调用此函数后，原来作为参数传入的sds字符串的指针不再是有效的，所有引用必须被替换为函数返回的新指针。

```Java
sds sdscat(sds s, const char *t) {
    return sdscatlen(s, t, strlen(t));
}
```

`sdscatsds`函数追加指定的sds字符串't'到已经存在的sds字符串's'末尾。调用此函数后，原来作为参数传入的sds字符串的指针不再是有效的，所有引用必须被替换为函数返回的新指针。

```Java
sds sdscatsds(sds s, const sds t) {
    return sdscatlen(s, t, sdslen(t));
}
```

`sdscpylen`函数把由't'指向的二进制安全的字符串复制到sds字符串's'的内存空间中，长度为'len'，覆盖原来的数据。

```Java
sds sdscpylen(sds s, const char *t, size_t len) {
    if (sdsalloc(s) < len) {
        s = sdsMakeRoomFor(s,len-sdslen(s));  // 原sds总空间不足就扩充
        if (s == NULL) return NULL;
    }
    memcpy(s, t, len);  // 将t指向的数据直接覆盖s
    s[len] = '\0';  // 设置终止符
    sdssetlen(s, len);  // 更新sds字符串header中的len
    return s;
}
```

`sdscpy`函数和sdscpylen()函数类似，但是't'指向的必须是一个以'\0'结尾的字符串，所以可以用strlen()获取该字符串长度。

```Java
sds sdscpy(sds s, const char *t) {
    return sdscpylen(s, t, strlen(t));
}
```
