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

比较容易让人混淆的是PUT和PATCH方法的含义，其中PUT是指“完整更新”，客户端需要发送资源的完整信息来更新这个资源，PATCH是指“部分更新”，客户端只需要发送需要更新的个别字段即可完成资源的更新。以user这个资源举例说明的话，假设user有name, age, icon三个属性，有一个id为123的user如下：

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

另外，在设计Web API的 HTTP Method 和 Endpoint 有以下几个需要注意的地方：

1. 一般情况下（search之类的特殊URI例外），不应该在URI中出现动词，URI表示资源，应该是名词。
2. 资源名称应该是复数形式。
3. 注意根据Web API的功能选择适当的HTTP Method：GET操作不应该对服务器端资源造成任何修改，应该是幂等的。POST用来创建资源，PUT用来完整更新资源，PATCH用来局部更新资源，DELETE用来删除资源。
4. Endpoints中不要使用空格和需要编码的字符。
5. 使用连字符来连接多个单词，常用的连字符有"-"和"_"，不建议使用驼峰法，因为URI本身并不区分字母大小写。

另外比较常见的 Web API Endpoint 经常是这样的：

```
https://api.example.com/v1
https://www.example.com/api/v1
```

注意如果主机名已经有"api"了，一般path中就不需要再出现"api"，否则path中会出现"api"以示这是一个Web API Endpoint。选择哪种方式其实也没有一个唯一答案。一般来说能选则第一种尽量选第一种。

### URI中使用动词的特殊情况

有时候一个行为可能无法很好地映射到一个资源上，一个典型的情形是搜索，典型的Web API搜索URI是这样的：

```
https://api.example.com/v1/search?query=xxx
```

这么设计搜索API基本是一种约定俗成的规范，像这类特殊的URI其实可以不拘泥于动词 + 名词的形式，只要这个URI能准确表达出意图，一般也没什么问题。


### 查询参数

分除了host, path以外，Web API还有一个很重要的组成部分：query，也就是查询参数。查询参数的作用是更详细的描述URI所指定的资源。对于是把一些参数放在path中还是放在query中，主要是看这个参数相对于资源的意义。我个人的理解是，如果这个参数具有唯一描述某个资源的能力，比如id，推荐将其放在path中。比如下面的实例描述了一个公司的某个职员：

```
/api/v1/companies/123/employees/456
```

这里用公司ID和职员ID来唯一定位到资源。还有一种设计方式：

```
/api/v1/companies/123?employee_id=456
```

这种方式当然也没问题，不过在URI的长度不是特别长的情况下，建议使用第一种方式。

有时候我们想通过一系列的参数来对资源进行查询，这一般是一种范围性的查询，不像用ID那样直接定位到唯一一个资源，此时可以使用query去设计URI。例如想要获取某个公司开发部门的，且性别为男的员工，且以名字升序排列：

```
/api/v1/companies/123?department=development&gender=male&sort=name
```

通过区分参数的性质来设计，我们也能让API更加优雅。


### 分页

在获取资源列表的时候，比如获取用户列表，由于用户可能非常多，一次性获取全部用户不现实，因此很自然地会用分页来获取。分页的方案大致可以分为两种：绝对位置分页和相对位置分页。

#### 基于相对位置的分页方案

使用页数和每页资源个数来分页获取用户：

```
GET http://api.example.com/v1/users?page=2&limit=50&sort=+name
```

我们在查询参数中指定了page和limit，这种分页方案以页数为单位，每次获取由limit指定的个数的资源，并指定了排序规则为用户名升序排列(+为升序，-为降序)。这种分页方案很直接，但是有一个问题，由于指定了页数，也就是说我们需要skip前面几页的资源。这在数据库中的操作是这样的，首先查询出所符合查询条件的所有条目，然后skip掉指定数量的条目，skip数量=(page - 1) * limit。这时如果资源集合非常大，页数也指定得很大，数据库就需要skip掉非常多的条目，这会导致查询越来越慢。

基于页数和每页条目数的分页方案还有一种变体，就是指定offset和size，比如在基于页数和每页条目数的分页方案中的参数为page=2&limit=50，也就是要跳过前面一页（50个个条目），对于offset和size的方案就是offset=50&size=50。这两种方式其实质都是一样的，基于资源的相对位置来分页。

基于资源的相对位置来分页还有一个问题就是在数据插入/删除频繁的场景下回重复获取。比如记录A位于第50条，使用page=1&limit获取时，记录A位于最后一个位置，如果在获取下一页之前，由于某种情况删除了1-50条之间的任意一条或几条，获取下一页的时候，记录A还将出现在返回列表中。

在数据量不大或者插入/删除不太频繁的场景下，基于相对位置的分页工作得还可以。但如果要彻底避免大量skip和重复获取的问题，就要使用基于绝对位置的分页方案了。

#### 基于绝对位置的分页方案

基于绝对位置的分页不再以资源在数据库中的顺序为参考点，而是以一个能快速定位具体资源的方式做为参考点，比如主键或者任何unique key。一般资源都有主键，可以考虑用下面这种方式来获取分页的资源列表：

```
GET http://api.example.com/v1/users?max_id=12345&limit=50
```

这种方案中的一般做法是，将当前获取到的资源列表的最后一条的unique key作为定位点，向后获取limit参数指定的数量的条目。数据库通过在这个unique key上加上合适的索引来加速这种查询，因此查询效率非常高。

#### 返回“是否还有后续数据”

为了让前端做分页，不可避免的需要告知前端“是否还有后续数据”的信息。这里面又有两种常见的情况：

1. 需要知道总页数
2. 不需要知道总页数

需要知道总页数的情况相当常见，比如我们有很多订单，前端对订单列表做分页，用户往往需要知道“总共有多少订单”、“分页的总数”这类信息。这时服务端需要维护资源总数的信息。但是实时计算出资源总数有时候不现实（比如那些动辄上百万个的资源），这时候后端会使用一些其他技巧来实现，不过这不在本文的讨论范围内。

还有一种情况是不需要知道总页数，比如新闻资讯列表、社交媒体的timeline等。假设此时每页有N个资源，那么当后端在实际获取资源时，每次都获取N+1数量的资源，如果能获取到N+1个，就说明还有下一页，否则当前页就是最后一页。如果还有下一页，就需要把多获取的这个排除掉，只返回N个给客户端。这种方式的成本和实现难度都很低。


## 授权

在使用一些需要用户身份认证的Web API时需要做授权操作，OAuth 2.0已经成为Web API授权的事实标准，OAuth 2.0 支持4种授权模式：

1. Authorization Code
2. Implicit
3. Resource Owner Password Credentials
4. Client Credentials

OAuth 2.0详细的信息可以查看这里[OAuth 2.0介绍](http://www.ruanyifeng.com/blog/2014/05/oauth_2_0.html)。


## 响应数据设计

### 响应数据格式

目前主流的Web API设计中，响应数据格式大部分是JSON。在比较早以前Web API中曾大量使用XML，但JSON由于其简洁易用性等优点很快被广大开发者所接受，慢慢替代了XML称为最主流的Web API响应数据格式。现在基本上很难找到哪个Web API是不支持JSON格式的，很多Web API甚至只支持JSON而不支持XML。

### Web API 常用的HTTP状态码

HTTP相应状态码有五大类：1xx, 2xx, 3xx, 4xx, 5xx：

| HTTP响应吗类型 | 含义 |
|:------------------|:------------------
| 1xx  | 信息状态码
| 2xx  | 成功状态码
| 3xx  | 重定向状态码
| 4xx  | 客户端错误状态码
| 5xx  | 服务端错误状态码

可以参考[常用的Web API HTTP状态码](http://www.runoob.com/http/http-status-codes.html)。

### 更详细的状态码——应用级别的状态码

由于HTTP状态码只能表达问题的大类，在一些业务规则比较复杂的场景下，出错的时候我们希望服务端为客户端提供足够详细的出错信息，此时可以在响应体中提供应用级别的状态码和状态信息，一个参考例子：

```json
{
  "error": true,
  "errorCode": "xxxx",
  "errorMessage": "xxxx"
}
```

在设计应用级别的状态码和状态信息时也应该注意分类，并在Web API文档中详细说明各个状态码的含义。


## HTTP中的缓存

相比于从内存和硬盘中获取数据，网络请求的速度实在是太慢了，因此一些情况下将从服务器端获得的资源缓存起来就很关键，这能大大提高响应速度和降低服务器带宽/计算成本。

HTTP中的缓存概念大致分为两部分：

- 过期模型
- 验证模型

过期模型指明了一个资源何时过期，一旦资源过期，客户端就必须抛弃这个资源，重新从服务端获取。先来看看HTTP协议中和过期模型有关的响应首部：

- Expires
- Cache-Control

### 过期模型

#### Expires响应首部

```
expires: Sat, 21 Dec 2019 09:32:24 GMT
```

Expires响应首部指明了资源过期的时间点，表示资源在这个时间点之后是过期的，这是一个绝对值。需要注意的是Expires用的是服务器的时间，如果客户端和服务器时间不一致，会导致一些误差。


#### Cache-Control响应首部

Cache-Control的用法比较多，比如可以指明资源要经过多少时间后才过期：

```
cache-control: max-age=3600
```

这指明了资源经过1小时候过期，max-age的单位是秒。

或者可以指明某个资源不需要被客户端缓存：

```
cache-control: no-store
```

还可以指明在请求该资源时，需要先询问服务器是否有更新的版本：

```
cache-control: no-cache
```

### 验证模型

过期模型只能通过查看响应首部中Expires和Cache-Control来得知资源的过期与否，验证模型则需要客户端向服务端询问资源的过期情况，这被称为“附带条件的请求”。客户端需要在请求中附带资源最后的更新日期(Last Modified Time)或实体标签(ETag)，比如

```
etag: "5c137a66-c1a3"
last-modified: Fri, 14 Dec 2018 09:39:50 GMT
```

Last-Modified指明了资源最后一次更新的时间，ETag可以认为是资源的标识符，如果资源被更新了，它的标识符就会变化，这有资源的版本有点类似。

另外ETag还有“强验证”和“弱验证”两种，强验证大概是这样的：

```
etag: "5c137a66-c1a3"
```

弱验证需要在双引号之前加上一个"W/"：

```
etag: W/"5c137a66-c1a3"
```

二者的差别在于，强验证下，客户端缓存的资源和服务端的资源只要有任何一点不同，都会被判断为不同，需要重新从服务器获获取资源的最新数据。弱验证宽松很多，并不要求资源的完全一致，只要资源从使用意义来看没差别就不需要重新获取数据，比如一些网页上的广告信息。

这里不打算详细讲解HTTP缓存相关的内容，有需要可以参考Google和Mozilla官方关于HTTP Cache的资料：

- [http-caching](https://developers.google.com/web/fundamentals/performance/optimizing-content-efficiency/http-caching?hl=zh-cn)
- [HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)


## 在请求和响应中指明媒体类型和可接受的数据格式

使用Content-Type指明媒体类型很重要，这关系到服务端是否能正确理解客户端发来的请求和客户端能否正确解析服务端发来的响应。例如在返回JSON格式数据的Web API中，响应首部中应该指明响应的Content-Type：

```
HTTP/1.1 200 OK
...
content-type: application/json; charset=utf-8
...
```

如果客户端向服务端请求时所带的数据也是JSON格式的，也应该在请求头中说明：

```
POST /api/v1/projects HTTP/1.1
Host: api.example.com
Accept: application/json
Content-Type: application/json
...
```

Content-Type相当于客户端和服务端对数据格式的协商内容，任何一方再和另一方通信时，指明Content-Type就相当于告知对方：我给你的数据是什么媒体类型的。另一方得到这个信息后就可以才去针对这个媒体类型的操作。比如一个创建商品的接口既可以接受JSON数据也可以接受XML数据，那么客户端在发送请求时就必须指明所发送的数据是什么媒体类型的，否则服务端很可能将无法正确处理请求。相反，如果一个获取商品信息的接口同时支持返回JSON和XML两种格式的数据，那么也同样要指明响应数据的格式，否则客户端可能无法正确解析。

另外，还可以通过Accept首部指明接受何种类型的数据，比如上面的POST请求中，指明了`Accept: application/json`，这就告知服务端，客户端只能接受JSON格式的数据。

总而言之，Content-Type和Accept首部对于客户端和服务端双方通信数据的格式约定非常重要。

### 定义私有首部

有些时候HTTP协议中预定义的首部不能满足我们的需求，还需要定义私有首部。比如需要对客户端进行限速的场景，一般做法是指定一个`X-RateLimit-Limit`首部：

```
X-RateLimit-Limit: 60
```

至于这个限速的时间单位是多少，不同应用的单位可能不一样，有使用小时的也有使用天的，需要开发者自己去查看Web API文档。

一般来说，以"X-"开头的首部是私有首部。


## 跨域

现代Web应用中大量使用Ajax来获取数据，但浏览器的同源策略限制了这一技术的使用。同源策略简单说就是：协议名、主机、端口号这三个数据唯一确定了一个“源”。处于安全方面的考虑，默认情况下浏览器不允许通过Ajax请求不同“源”下的资源。在服务端经过特殊配置后允许不同源的客户端请求，这称为“跨域”。但是既然是Web API，就是要公开出来给其他人用，势必需要支持跨域，否则公开没有任何意义。

目前Web API 主流的跨域方案是跨域资源共享(Cross-Origin Resource Sharing, CORS)[https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Access_control_CORS]，如果需要允许某个域具有访问我方服务器，可以在请求头中带上：

```
Access-Control-Allow-Origin: http://www.example.com
```

如果要允许任何域访问，可以用"*"指定：

```
Access-Control-Allow-Origin: *
```

还有一种方式是服务器端可以在域名的根目录下，放置`crossdomain.xml`文件：

```xml
<?xml version="1.0"?>
<cross-domain-policy>
  <allow-access-from domain="www.example.com" />
  <allow-access-from domain="*.foo.com" />
  <allow-access-from domain="110.56.67.189" />
</cross-domain-policy>
```

如果要允许任意跨域，同样可以用"*"：

```xml
<?xml version="1.0"?>
<cross-domain-policy>
  <allow-access-from domain="*" />
</cross-domain-policy>
```

