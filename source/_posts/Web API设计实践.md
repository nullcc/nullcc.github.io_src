---
title: Web API设计实践
date: 2018-12-17
tags: [API]
categories: Web
---

本文将讨论Web API设计的实践。

<!--more-->

## Web API的基本概念

Web世界在发展了一段时间后，出现了很多在线服务，这些在线服务不但本身提供一些功能，还公开了自己的Web API。第三方应用可以以Web API的方式接入这些在线服务开发自己的应用，从而也衍生出很多周边服务，甚至以这些已存在的在线服务为基础搭建自己的核心服务。

人们在Web系统中使用URI(Uniform Resource Identifier, 统一资源标识符)来定位资源，顾名思义URI是用来表示资源的，因此URI应该（或者说大部分情况下，特殊情况之后会提到）是一个名词。另外HTTP协议中定义了一些HTTP Method来表示如何操作这个URI，这是动词。HTTP Method + URI就构成了一个基本的操作：动词 + 名词。


## HTTP Method 和 Endpoints 的设计

我们也经常可以在一些Web API上看到动词，例如下面这组操作用户的Web API：

```
GET http://api.example.com/v1/get_users
POST http://api.example.com/v1/create_user
PUT http://api.example.com/v1/update_user?id=123
DELETE http://api.example.com/v1/delete_user?id=123
```

拿上述的第一个Web API为例，这个URI的作用是获取用户列表，它使用了HTTP GET方法。虽然这么设计Web API也能工作，但这么设计有一些问题：首先HTTP GET和URI中的get重复了，另外一般在URI中有动词也不太符合而且也不符合URI表示资源这个原则，这个URI这样设计会好很多：

```
GET http://api.example.com/v1/users
```

其他几个Web API也有类似的问题，要么是HTTP Method和URI中的内容有重复，要么是URI包含了动词，首先这不大符合URI的设计规范，而且这么做也没有一个统一的标准，试想一下删除用户的Web API也可以设计成：

```
DELETE http://api.example.com/v1/remove_user?id=123
```

如果没有统一的设计标准，一旦之后Web API数量增加，就会造成各种奇形怪状的Web API层出不穷，非常不利于维护，当然也影响美观。

下面以user资源为例，列出了各种操作对应的HTTP Method 和 Endpoints的规范设计方式：

| 操作含义 | HTTP Method | Endpoint |
|:------------------|:------------------|:
| 获取用户列表  | GET | /users
| 获取用户信息    | GET | /users/:id
| 创建用户   | POST | /users
| 更新用户(完整更新) | PUT | /users/:id
| 更新用户(部分更新) | PATCH | /users/:id
| 删除用户 | DELETE | /users/:id

首先说说为什么这么设计，对于一个Web系统中的某种资源来说，绝大部分情况下不止一个，也就是说资源是一个集合的概念，就算只有唯一一个资源，也可以看做是集合只有一个元素的特殊情况。

比较容易让人混淆的是PUT和PATCH方法的含义，其中PUT是指“完整更新”，客户端需要发送这个资源的全部信息，PATCH指“部分更新”，客户端只需要发送需要更新的个别字段。以user这个资源举例说明的话，假设user有name, age, icon三个属性，有一个id为123的user如下：

```json
{
  "name": "Foo",
  "age": 29,
  "icon": "http://www.example.com/icon.png
}
```

这时我们希望更新该user的age字段为30，如果使用PUT，body需要包含所有这三个属性，其中不打算做更新的字段保持原来的值即可：

```json
{
  "name": "Foo",
  "age": 30,
  "icon": "http://www.example.com/icon.png
}
```

如果用PATCH则不必包含所有属性，只需要列出age字段即可：

```json
{
  "age": 30
}
```

在设计Web API的 HTTP Method 和 Endpoint 有以下几个需要注意的地方：

1. 资源名称应该是复数形式。
2. 注意根据Web API的功能选择适当的HTTP Method：GET操作不应该对服务器端资源造成任何修改，GET应该是幂等的。POST用来创建资源，PUT用来完整更新资源，PATCH用来局部更新资源，DELETE负责删除资源。
3. Endpoints中不要使用空格和需要编码的字符。
4. 使用连字符来连接多个单词，常用的连字符有"-"和"_"，不建议使用驼峰法，因为URI本身并不区分字母大小写。

另外比较常见的Web API Endpoints经常是这样的：

```
https://api.example.com/v1
https://www.example.com/api/v1
```

注意如果主机名已经有"api"了，一般path中就不需要再出现"api"，否则path中会出现"api"以示这是一个Web API Endpoint。选择哪种方式其实也没有一个唯一答案。一般来说能选则第一种尽量选第一种。

### 授权

OAuth 2.0已经成为Web API授权的事实标准，OAuth 2.0 有4种授权模式：

1. Authorization Code
2. Implicit
3. Resource Owner Password Credentials
4. Client Credentials

这里只举例说明Resource Owner Password Credentials的用法。Resource Owner Password Credentials主要用于那些需要使用用户名和密码进行授权的Web API，它的请求参数如下：

| 参数名 | 参数类型 | 参数值 | 参数说明
|:------------------|:------------------|:
| grant_type  | string | password | Resource Owner Password Credentials下固定为password
| username  | string |  | 用户名
| password  | string |  | 密码
| scope  | string |  | 允许访问的权限范围（可选）

看一下完整的请求信息：

```
POST /oauth/token HTTP/1.1
Host: api.example.com
Authorization: Basic bXlfYXBwOm15X3NlY3JldA==
Content-Type: application/x-www-form-urlencoded

grant_type=password&username=xxx&password=yyy
```

响应如下：

```json
{
    "access_token": "1e1d0e61ed71aa1864d1ab89606b8474b5a1ddc4",
    "token_type": "Bearer",
    "expires_in": 3599,
    "refresh_token": "6f03c4646bf0bc0a3face83b1561f86692ad45f2"
}
```

解释一下这里的HTTP请求和响应。请求方面，OAuth 2.0的授权HTTP Method一般为POST，endpoint推荐使用/oauth/token。Headers中的Authorization是一种客户端认证，其形式为`Basic base64Encoded(${app_key}:${app_secret})`，用来标识客户端应用的身份。grant_type, username, password的含义和值参见上面的表格。响应方面，"access_token"是之后访问Web API需要带上的access_token，"token_type"为Bearer，这是RFC 6750中定义的OAuth 2.0使用的token类型，"expires_in"表示access_token的过期时间，"refresh_token"则表示在access_token过期后可以使用这它来刷新access_token以获取新的access_token。


## 响应数据设计

### 响应数据格式

目前主流的Web API设计中，响应数据格式大部分是JSON。在比较早以前Web API中曾大量使用XML，但JSON由于其简洁易用性等优点很快被广大开发者所接受，慢慢替代了XML称为最主流的Web API响应数据格式。现在基本上很难找到哪个Web API是不支持JSON格式的，很多Web API甚至只支持JSON而不支持XML了。

### JSONP

todo...