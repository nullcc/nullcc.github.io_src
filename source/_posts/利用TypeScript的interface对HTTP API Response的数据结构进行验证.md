---
title: 利用TypeScript的interface对HTTP API Response的数据结构进行验证
date: 2019-05-27
tags: [TypeScript]
categories: 编程语言
---

在HTTP API自动化测试中，我们常常需要验证返回JSON数据的结构是否符合我们的预期，本章将讨论如何使用TypeScript的interface来对HTTP API数据结构建模和验证。

<!--more-->

## 需求

假设有一个HTTP API用来获取用户基本信息:

```
/api/v1/users/:userId
```

该API的一个合法的请求类似这样：

```
/api/v1/users/1234567
```

该请求的返回数据如下：

```json
{
  "status": {
    "success": true,
    "errorCode": null,
    "errorMessage": null
  },
  "id": 1234567,
  "firstName": "John",
  "lastName": "Doe",
  "avator": "http://www.somehost.com/upload/user_1234567.png",
  "department": "Development",
  "email": "john_doe@somehost.com",
  "phone": "1234567890",
  "address": {
    "country": "US",
    "state": "California",
    "city": 
  }
}
```
