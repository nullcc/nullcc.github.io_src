---
title: Trie树(单词查找树)简介
date: 2017-11-18
tags: [数据结构]
categories: 数据结构
---

Trie树经常被用来保存单词，所以又被称为单词查找树。它有几个特点：

1. 根节点不保存字符，其余的每个节点都保存一个字符。
2. 包括根节点在内，所有节点都有一个字符数组用来保存下一个字符的节点。
3. 从根节点出发，沿着子节点一直往下直到某个叶子节点，可以得到一个保存在Trie树中的单词（字符串）。

先来看看Trie树的结构：

![一棵Trie树](/assets/images/post_imgs/trie_1.png)

这棵Trie树中保存了bat bag bay bear beat bed nice night一共八个单词。

下面来看看Trie树的C语言简单实现：

```Java
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

#define MAX 26
#define MAXLEN 100
#define FALSE 0
#define TRUE 1

// Trie节点结构
typedef struct TrieNode
{
    char c;  // 每个节点保存的单个字符
    int count;  // 以从根节点到当前节点作为前缀的字符串个数
    struct TrieNode *next[MAX];  // 下一个节点的字符数组
    int exist;  // 表示到该字符为止是否，搜索过程是否获得一个已存在的字符串
}TrieNode;  

// 创建节点
TrieNode *createTrieNode(){
    TrieNode *node = (TrieNode *)malloc(sizeof(TrieNode));
    node->count = 0;
    node->exist = 0;
    // 初始时节点的next数组的元素都为NULL
    for(int i = 0; i < MAX; i++){  
        node->next[i] = NULL;
    }
    return node;
}

// 插入一个单词
void Insert(char *word, TrieNode *root)
{
    int i;
    TrieNode *cur;
    if(word[0] == '\0')  // 不处理空字符串
        return;

    cur = root;
    for(i = 0; word[i] != '\0'; i++)
    {      
        int id = word[i] - 'a';  // 计算字符在next数组的下标
        if(cur->next[id] == NULL)  // 如果这个字符不存在于next数组，创建该字符的节点
        {
            TrieNode *newNode = createTrieNode();
            newNode->c = word[i];
            cur->next[id] = newNode;
        }
        cur = cur->next[id];  // 从这个新节点往下搜索
    }

    cur->count++;
    cur->exist = 1;
    return;
}

// 遍历树，打印树中所有单词
void Traverse(TrieNode *cur)
{
    static char theWord[MAXLEN];
    static int pos = 0;
    int i;

    if(cur == NULL)
        return;

    if(cur->count)
    {
        theWord[pos++] = cur->c;
        theWord[pos] = '\0';
        printf("%s\n", theWord);
    }

    if(cur->c == '\0'){  // 根节点
        for(i = 0; i < MAX; i++)
        {
            if (cur->next[i] == NULL){
                continue;
            }
            pos = 0;
            Traverse(cur->next[i]);

        }
    } else {
        for(i = 0; i < MAX; i++)  // 非根节点
        {   
            if (cur->next[i] == NULL){
                continue;
            }
            if(!cur->count){
                theWord[pos++] = cur->c;
            }
            Traverse(cur->next[i]);
            pos -= 2;
        }
    }
    return;
}

// 查找一个单词是不是在树中
int Find(TrieNode *root, char *word)
{
    int i;
    TrieNode *cur;
    cur = root;

    // 遍历单词中的每一个字符
    for(i = 0; word[i] != '\0'; i++)
    {   
        int id = word[i] - 'a';  // 计算字符在next数组中的下标
        if(cur->next[id] == NULL)
        {
            return FALSE;
        }
        cur = cur->next[id];
    }
    if(cur->count)
        return TRUE;
    else
        return FALSE;
}

// 输入单词，在Trie树中创建字符串，直到输入*号停止输入
void Construct(TrieNode *root)
{
     char inStr[MAXLEN];
     int size = 0;

     while(1)
     {  
         scanf("%s",inStr);
         if(strcmp(inStr,"*")==0)
             break;
         Insert(inStr, root);
     }
     printf("树中的所有单词：\n");
     Traverse(root);
     return;
}

int main()  
{  
    TrieNode *root = createTrieNode();
    root->c = '\0';
    char str[MAXLEN];
    Construct(root);
    printf("\n");  
    while(1)
    {
        printf("请输入需要查找的单词：\n");
        scanf("%s", str);
        if(strcmp(str,"*") ==0)
            break;
        printf("%s:%d\n", str, Find(root, str));
    }
    return 0;
}  
```

简单说明一下，`TrieNode`结构体中的`next`数组长度为26，对应26个小写英文字母，保存了下一个字符的`TrieNode`节点。其中的遍历和查找都是一个递归过程。

上面的代码实现了输入一系列单词来构建Trie树，然后遍历Trie树输出所有单词，最后用户可以查询某个单词是否在Trie树中。
