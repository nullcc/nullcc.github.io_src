---
title: 理解Linux中的I/O多路复用
date: 2017-11-13
tags: [Linux, I/O多路复用]
categories: 系统编程
---

在Linux的I/O多路复用中，主要有这三个系统调用：

1. select
2. poll
3. epoll

<!--more-->

## 1. select

select的函数原型：

```c
int select(int nfds, fd_set *readfd, fd_set *writefd, fd_set *expectd, struct timeval *timeout);
```

### 参数解析

1. nfds：select监控的文件描述符的最大值+1，用于限制扫描的范围。
2. readfd：包含所有因状态变为可读而触发select返回的文件描述符。
3. writefd：包含所有因状态变为可写而触发select返回的文件描述符。
4. expectd：包含所有因发生异常而触发select返回的文件描述符。
5. timeout：select的超时时间。设为NULL表示阻塞住，直到有fd就绪，设为0表示不阻塞直接返回，设为一个大于0的值会让select阻塞一个指定的时间，这期间一旦有fd就绪就返回，否则当超过这个超时时间时，select也返回。

### 返回值

1. 成功时返回一个大于0的整数。
2. 超时返回0。
3. 出错返回-1。

### 函数原理

首先把需要监控的文件描述符加载到一个fd_set类型的集合中，然后调用select监控集合中的所有文件描述符。假设我们把timeout设为NULL，阻塞select调用，并且在readfd参数中传入了一个fd_set类型的集合，表示监控这个集合中所有文件描述符的读就绪事件。一旦集合中有文件描述符读就绪，select马上返回一个大于0的整数。然后调用方需要遍历这个fd_set类型的集合，对每个文件描述符使用`FD_ISSET`判断是否就绪，如果就绪了就处理这个文件描述符。需要注意的是，在每次调用select之前，需要使用`FD_ZERO`对fd_set类型的集合中每个文件描述符的就绪状态清零。

### 一些问题

select有几个问题，首先select一次性只能监控`FD_SETSIZE`个文件描述符，在大多数Linux系统中这个数字是1024。我们可以修改这个宏来增加这个数字，不过由于select调用在内核中会遍历整个fd集合，集合越大效率越低，所以也不是将`FD_SETSIZE`设置为越大越好。第二个问题是每次调用select时，都需要把fd集合从用户态拷贝到内核态，fd集合不大时还好，一旦fd集合很大，这种拷贝的开销也会对系统产生影响。

## 2. poll

poll的函数原型：

```c
int poll(struct pollfd* fds, nfds_t nfds, int timeout);
```

pollfd结构：

```c
struct pollfd
{
  int fd;         // 文件描述符
  short events;   // 告诉poll监听fd上的哪些事件
  short revents;  // 内核负责修改，用来通知应用程序fd上发生的实际事件
};
```

### 参数解析

1. fds：一个pollfd类型的数组。
2. nfds：监听事件集合大小。
3. timeout：超时时间，为-1时会一直阻塞直到有fd就绪，为0表示立即返回，为一个大于0的整数时会让poll阻塞一个指定的时间，这期间一旦有fd就绪就返回，否则当超过这个超时时间时，poll也返回。

### 返回值

1. 成功时返回一个大于0的整数，表示就绪的文件描述符的个数。
2. 超时返回0。
3. 出错返回-1。

### 函数原理

poll中没有select对监听的fd个数的限制，也不再需要三个fd集合来分别存放不同事件类型的fd了，我们只需要在pollfd中指定fd的事件类型即可。而且poll也不需要像在select中那样每次调用前需要清零一次fd集合。

### 一些问题

poll和select一样，还是需要在内核中遍历fd集合，另外在调用时也需要把fd集合从用户态拷贝到内核态，这在fd集合比较大的时候效率较低。

## 3. epoll

epoll有一组函数，如下：

### 创建事件表的函数原型

```c
int epoll_create(int size);
```

参数：
1. size表示要创建多大的事件表

返回值：
  返回事件表的文件描述符

### 操作事件表的函数原型

```c
int epoll_ctl(int epfd, int op, int fd, struct epoll_event *event);
```

参数：
1. epfd：事件表文件描述符
2. op：操作类型，有：
  (1). EPOLL_CTL_ADD
  (2). EPOLL_CTL_MOD
  (3). EPOLL_CTL_DEL
3. fd：要操作的文件描述符
4. 事件

其中epoll_event是一个结构体：

```c
struct epoll_event
{
   int events;
   epoll_data_t data;  // 一个union，里面是事件的数据
};
```
返回值：
  1. 成功返回0。
  2. 失败返回-1。

### 事件监听的函数原型

```c
int epoll_wait(int epfd, struct epoll_event *events, int maxevents, int timeout);
```

参数：
1. epfd：事件表文件描述符
2. events：当有事件发生时，内核会将和事件有关的信息放入events中
3. maxevents：一次epoll中内核返回的的最大事件数
4. timeout：监听超时时间

返回值：
  1. 成功时返回大于0的整数，表示就绪的fd个数
  2. 失败返回-1
  3. 超时返回0

### 函数原理

epoll相比于select和poll的差别比较大，epoll不需要在每次调用时都将数据从用户空间拷贝到内核空间，取而代之的是把事件表以共享内存的方式供用户空间和内核空间使用。其次，调用epoll_wait时只会把就绪的事件从事件表拷贝到events参数中（通过注册的回调函数），应用程序只要遍历这个已就绪的fd集合即可，这就避免了select和poll每次都要遍历整个fd集合的问题，提高了效率。另外epoll的时间复杂度是O(1)。

epoll有两种模式，LT和ET。LT是水平触发(Level Trigger)，ET是边缘触发(Edge Trigger)。

水平触发：当epoll监测到某个fd上有事件发生时，应用程序若没有立即处理，在下次epoll时，还会再次触发此fd上的事件。
边缘触发：当epoll监测到某个fd上有事件发生时，内核只通知应用程序一次，应用程序必须立即处理，否则这个事件相当于被忽略了。

## 总结

epoll的时间复杂度虽然比select和poll低，但也未必总是效率比它们高。在一个有非常多活跃fd的集合中，epoll由于每次都要触发回调函数，效率会降低，此时遍历fd集合来处理反而效率更高。epoll适合fd集合很大但大部分fd不活跃的场景。
