---
title: 广度优先搜索(BFS)和深度优先搜索(DFS)
date: 2018-06-07
tags: [算法]
categories: 算法
---

本文将解析广度优先搜索(BFS)和深度优先搜索(DFS)。

<!--more-->

## 广度优先搜索(BFS)

BFS即Breadth First Search，是最简便的一种图的搜索算法。BFS是一种盲目搜索算法，目的是以一种指定的顺序系统地展开并检查图中的所有节点，以寻找某种结果。换句话说，BFS并不考虑结果的位置，而是彻底搜索整张图以寻找结果。

我们通过遍历一颗二叉树来感受一下BFS是什么样的。假设一颗二叉树如下：

![二叉树](/assets/images/post_imgs/bfs_dfs_1.png)

使用BFS对它进行遍历，遍历的顺序如下图：

![BFS二叉树](/assets/images/post_imgs/bfs_dfs_2.png)

上图很形象地说明了BFS的特点，还可以发现一个很有趣的事情是实际上对一颗二叉树做BFS就是以层级来遍历它：从上到下，从左到右地遍历一颗二叉树。我们可以利用队列的先进先出特性实现BFS，代码如下：

```Python
# bfs.py

def bfs(root, fn):
    q = list()
    q.append(root)

    while len(q) > 0:
        node = q.pop(0)
        fn(node)
        for child in node.get_children():
            q.append(child)
```

测试代码：

```Python
# test_bfs.py
import unittest

from bfs.bfs import bfs


class Node:
    def __init__(self, val):
        self.val = val
        self.left = None
        self.right = None

    def get_children(self):
        children = []
        if self.left is not None:
            children.append(self.left)
        if self.right is not None:
            children.append(self.right)
        return children


class BFSTest(unittest.TestCase):
    def test_bfs_using_binary_tree(self):
        root = Node('root')
        node_1 = Node('node_1')
        node_2 = Node('node_2')
        node_3 = Node('node_3')
        node_4 = Node('node_4')
        node_5 = Node('node_5')
        node_6 = Node('node_6')
        node_7 = Node('node_7')
        node_8 = Node('node_8')

        #          root
        #         /    \
        #        1      2
        #       / \    / \
        #      3   4  5   6
        #     / \
        #    7   8

        root.left = node_1
        root.right = node_2
        node_1.left = node_3
        node_1.right = node_4
        node_2.left = node_5
        node_2.right = node_6
        node_3.left = node_7
        node_3.right = node_8

        output = []

        def fn(node):
            output.append(node.val)

        bfs(root, fn)
        self.assertEqual(['root', 'node_1', 'node_2', 'node_3', 'node_4', 'node_5', 'node_6', 'node_7', 'node_8'], output)
```

## 深度优先搜索(DFS)

DFS即Depth First Search，和BFS同属于基础的图论算法。其基本思想是对一张图的每一个可能路径深入到不能再深入为止，且路径上的每个节点只访问一次。DFS同样也不考虑结果的位置，而是彻底搜索整张图以寻找结果。

还是以之前那颗二叉树为例，看一下DFS是如何做的：

![DFS二叉树](/assets/images/post_imgs/bfs_dfs_3.png)

以下是DFS的递归和非递归解法，其中非递归解法利用了栈的后进先出特性：

```Python
from collections import defaultdict

class Stack:
    def __init__(self):
        self._stack = []

    def push(self, element):
        self._stack.insert(0, element)

    def pop(self):
        return self._stack.pop(0)

    def get_top(self):
        return self._stack[0]

    def is_empty(self) -> int:
        return len(self._stack) == 0

    def size(self) -> int:
        return len(self._stack)

def dfs_recursion(root, fn):
    visited = defaultdict(bool)
    visited[root] = True
    fn(root)
    for child in root.get_children():
        if not visited.get(child):
            dfs_recursion(child, fn)

def dfs_stack(root, fn):
    stack = Stack()
    stack.push(root)
    visited = defaultdict(bool)
    visited[root] = True
    fn(root)

    while not stack.is_empty():
        node = stack.get_top()
        for child in node.get_children():
            if not visited.get(child):
                fn(child)
                visited[child] = True
                stack.push(child)
            else:
                stack.pop()
```

测试代码：

```Python
import unittest

from dfs.dfs import dfs_recursion

class Node:
    def __init__(self, val):
        self.val = val
        self.left = None
        self.right = None

    def get_children(self):
        children = []
        if self.left is not None:
            children.append(self.left)
        if self.right is not None:
            children.append(self.right)
        return children


class DFSTest(unittest.TestCase):
    def test_dfs_recursion_using_binary_tree(self):
        root = Node('root')
        node_1 = Node('node_1')
        node_2 = Node('node_2')
        node_3 = Node('node_3')
        node_4 = Node('node_4')
        node_5 = Node('node_5')
        node_6 = Node('node_6')
        node_7 = Node('node_7')
        node_8 = Node('node_8')

        #          root
        #         /    \
        #        1      2
        #       / \    / \
        #      3   4  5   6
        #     / \
        #    7   8

        root.left = node_1
        root.right = node_2
        node_1.left = node_3
        node_1.right = node_4
        node_2.left = node_5
        node_2.right = node_6
        node_3.left = node_7
        node_3.right = node_8

        output = []

        def fn(node):
            output.append(node.val)

        dfs_recursion(root, fn)
        self.assertEqual(['root', 'node_1', 'node_3', 'node_7', 'node_8', 'node_4', 'node_2', 'node_5', 'node_6'],
                         output)

    def test_dfs_stack_using_binary_tree(self):
        root = Node('root')
        node_1 = Node('node_1')
        node_2 = Node('node_2')
        node_3 = Node('node_3')
        node_4 = Node('node_4')
        node_5 = Node('node_5')
        node_6 = Node('node_6')
        node_7 = Node('node_7')
        node_8 = Node('node_8')

        #          root
        #         /    \
        #        1      2
        #       / \    / \
        #      3   4  5   6
        #     / \
        #    7   8

        root.left = node_1
        root.right = node_2
        node_1.left = node_3
        node_1.right = node_4
        node_2.left = node_5
        node_2.right = node_6
        node_3.left = node_7
        node_3.right = node_8

        output = []

        def fn(node):
            output.append(node.val)

        dfs_recursion(root, fn)
        self.assertEqual(['root', 'node_1', 'node_3', 'node_7', 'node_8', 'node_4', 'node_2', 'node_5', 'node_6'], output)

```