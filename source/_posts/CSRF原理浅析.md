---
title: CSRF原理浅析
date: 2016-09-07
tags: [CSRF, web前端攻防]
categories: web前端
---

## CSRF简介

### CSRF是什么

CSRF(Cross Site Request Forgery跨站点请求伪造)，又叫one click attack/session riding，一般缩写为CSRF。

### CSRF的危害

CSRF是一种常见的web攻击方式，但是很多程序员甚至是安全工程师都不太理解它的利用条件和危害，因此CSRF也是web安全中最容易被忽略的一种攻击方式。但是在某些条件下，CSRF能够产生很强的破坏性。

CSRF实际上是盗用了被害者的身份，以被害者的身份发送恶意请求给服务器。常见的CSRF攻击能够造成攻击者以被害者的名义发送消息、邮件、转账、购买物品等等。尽管CSRF的热门程度可能不如XSS高，但是在现在的互联网环境中，CSRF的危害不亚于XSS。

### CSRF的基本原理

虽然从表面上看它和之前讲到的XSS很相似(因为都有一个Cross Site的缘故)，但是实际上它和XSS的攻击方式不同。XSS是利用网站受信任的用户来对目标用户进行攻击，而CSRF则是伪装成网站受信任用户的请求来利用网站。如图：

![csrf_1](/assets/images/post_imgs/csrf_1.png)

从图中我们可以看出，CSRF攻击需要有以下两个步骤：

1. 受害者先登陆受信网站A，网站A在本地生成cookie。
2. 在不登出A(或者A的cookie有效)的情况下，访问恶意网站B。
	
这个时候一种直观的预防措施可能是，只要不满足上述两点其中一点，就可以防止CSRF攻击了，实际上这种观点存在很多误区，原因有以下几个：

1. 用户无法确保在打开站点A后不再开启新标签浏览站点B；
2. 用户无法确保在不登出站点A的情况下不浏览站点B。
3. 用户不能确保当关闭浏览器后，站点A的cookie立即过期。实际上，很多站点都有这样的特点，当你关闭浏览器时，它的cookie并不立即失效，经常可以看到有的站点在你登陆后关闭浏览器，下次再访问时仍然是已登陆状态(比如微博)。这个是大多数人存在的误区，以为关闭浏览器以后所有cookie立即过期(这个要看网站的设定)。
4. 那些存在“恶意行为”的网站有可能是一个可信任的网站，只是因为可能是存在LD并被利用了。

综合以上几点可以看到，CSRF攻击可以说是防不胜防。

## CSRF案例

用一个真实例子感受一下CSRF，这里已经搭建好了一个站点，这个网站的后台存在CSRF LD。在这个网站的后台，可以构造一个表单来提交，添加一个管理员账号。我们在一个网站www.b.com根目录下放一个xiao5u.html文件，内容为:

![csrf_2](/assets/images/post_imgs/csrf_2.png)

引用的 http://www.b.com/test.html 内容为：

![csrf_3](/assets/images/post_imgs/csrf_3.png)

目的是添加一个账号为test，密码为123456的管理员账号。现在先登陆后台，目前只有一个管理员账号：

![csrf_4](/assets/images/post_imgs/csrf_4.png)

新开一个标签页，访问 http://www.b.com/xiao5u.html ，抓包：

![csrf_5](/assets/images/post_imgs/csrf_5.png)

再回来看后台：

![csrf_6](/assets/images/post_imgs/csrf_6.png)

CSRF攻击成功，添加了一个test账户的管理员。

## CSRF进阶

### 浏览器中的cookie策略

在刚才的例子里，CSRF攻击之所以能成功是因为用户的浏览器成功发送了cookie。

浏览器中的cookie分为两种，一种是Session Cookie，又称“临时	cookie”,另一种是“Third-party Cookie”，又称“本地 cookie”。两者的	区别在于，Third-party Cookie是客户端和服务器在交互时，服务器在	Set-Cookie时指定了Expire时间，因此只有过了Expire时间，Third-party 	Cookie才会失效，所以这种Cookie保存在本地。Session Cookie是没有指	定Expire时间的，所以在浏览器关闭后，Session Cookie就失效了。

在用户浏览网站的过程中，如果一个网站设置了Session Cookie，那么在浏览器进程的生命周期内，即使打开了新的标签页，Session Cookie也是有效的。Session Cookie保存在浏览器进程的内存空间中，Third-party Cookie保存在本地。
如果浏览器从一个域的页面中，要加载另一个域的资源，出于安全方面的考虑，有些浏览器会阻止Third-party Cookie的发送。目前默认阻止Third-party Cookie的浏览器有IE 6、IE7、IE8、safari，默认不阻止的有Firefox、Opera、Chrome等。

下面来看一个简单的例子体会一下这种策略：

首先建立一个网站www.a.com，在本地或者互联网上都可以。然后在根目录下建立一个a.php，这个脚本会给浏览器写入两个cookie，一个是Session Cookie，一个是Third-party Cookie：

![csrf_7](/assets/images/post_imgs/csrf_7.png)

先用IE 8访问 http://www.a.com/a.php ，通过抓包可以看到：

![csrf_8](/assets/images/post_imgs/csrf_8.png)

浏览器接收了这两个cookie。这是不要关闭这个页面，再打开一个新的标签页，访问此域下的其他页面，比如     http://www.a.com ，由于这个新标签页和原来的标签页同属于一个浏览器进程，因此Session Cookie会被发送(当然由于是同域，Third-party Cookie也会被发送)：

![csrf_9](/assets/images/post_imgs/csrf_9.png)

建立另一个网站www.b.com，在根目录下创建一个csrf.html，在里面构造一个<img>标签：

![csrf_10](/assets/images/post_imgs/csrf_10.png)

再开一个新标签页，访问 http://www.b.com/csrf.html ，抓包：

![csrf_11](/assets/images/post_imgs/csrf_11.png)

发现只有Session Cookie被发送了，因为IE浏览器默认会阻止跨域请求时发送Third-party Cookie。实际上，IE出于安全考虑，默认阻止了`<img>`、`<iframe>`、`<script>`、`<link>`等html标签发送跨域请求时携带Third-party Cookie。

再来看看Firefox，默认允许在发送跨域请求时携带Third-party Cookie：

![csrf_12](/assets/images/post_imgs/csrf_12.png)

由此可见，在Firefox中，由于默认不阻止Third-party Cookie的跨域发送，浏览器可以成功发送用于验证的Third-party Cookie，导致CSRF比较容易成功。而对于IE浏览器，攻击者则必须诱使受害者先访问目标站点，使得Session Cookie有效，再进行CSRF攻击。

### P3P头

某些浏览器默认不发送Third-party Cookie确实能在一定程度上防止CSRF的发生，但是W3C有一项关于隐私的标准，全称为The Platform for Privacy Preferences，简称P3P。

如果网站返回给浏览器的HTTP中包含P3P头，将允许浏览器跨域发送Third-party Cookie。在一些网站中，P3P主要用于类似广告等需要跨域访问的页面，但是一旦设置了P3P头，此影响将扩大到该域的所有页面中，因为cookie是以域和path为单位的，从某种程度上来说，P3P头将增加CSRF攻击成功的概率。

示例：
现在有www.a.com和www.b.com两个域，在www.b.com上，有一个页面包含一个指向www.a.com的`<img>`标签。http://www.b.com/p3p.html 的代码为：

![csrf_13](/assets/images/post_imgs/csrf_13.png)

http://www.a.com/p3p_cookie.php 会对a.com这个域设置cookie，代码如下：

![csrf_14](/assets/images/post_imgs/csrf_14.png)

当请求 http://www.b.com/p3p.html 时，`<img`>标签会跨域去请求 http://www.a.com/p3p_cookie.php ，这个脚本会尝试Set-Cookie，这时浏览器会收到一个cookie：

![csrf_15](/assets/images/post_imgs/csrf_15.png)

如果Set-Cookie成功，当下次再访问 http://www.b.com/p3p.html 时，浏览器会发送这个cookie。但是由于这里存在跨域限制，因此这种情况下Set-Cookie是不会成功的，浏览器也不会发送cookie，不管是Session Cookie还是Third-party Cookie都一样不会被发送：

![csrf_16](/assets/images/post_imgs/csrf_16.png)

现在加上P3P头，修改 http://www.a.com/p3p_cookie.php 的内容为：

![csrf_17](/assets/images/post_imgs/csrf_17.png)

重复刚才的步骤，先访问 http://www.b.com/p3p.html ，浏览器收到cookie：

![csrf_18](/assets/images/post_imgs/csrf_18.png)

再访问 http://www.a.com：

![csrf_19](/assets/images/post_imgs/csrf_19.png)

发现IE访问 http://www.a.com/p3p_cookie.php 时发送了Third-party Cookie。

P3P头的加入改变了a.com的隐私策略，从而使得IE不再阻止Third-party Cookie的跨域发送。由于P3P头的应用很广泛，因此不能认为靠浏览器的拦截机制就可以阻止Third-party Cookie的发送。

### POST与GET

在防御CSRF的时候有时候存在一个误解，有的开发人员认为CSRF攻击只能由GET请求发起，只要把一些重要的操作改为POST提交方式就可以防御CSRF攻击。

会存在这种误解的原因在于，很多时候CSRF是利用`<img`>、`<iframe`>的src属性来发起GET请求，这种属性不能发起POST请求。不过有一些网站的某些操作并未区分GET和POST，攻击者可以用GET方式对表单的提交地址进行请求。比如在PHP中，如果在服务端使用`$_REQUEST`而不是`$_POST`来获取数据就会出现这个问题。假设有一个表单：


![csrf_20](/assets/images/post_imgs/csrf_20.png)

攻击者可以尝试用GET方式提交 http://www.xxx.com/delete.php?id=123456

如果服务端的代码没有使用`$_POST`而是使用`$_REQUEST`来获得提交的数据，就会使这个请求成功。

但是如果服务器区分了`$_POST`和`$_REQUEST`，攻击者还可以构造出POST请求来提交：

![csrf_21](/assets/images/post_imgs/csrf_21.png)

这个页面会自动用POST方法提交表单，而且如果放在一个width和height都为0的不可见iframe中，用户很难察觉到。


### Flash CSRF

Flash也可以发起网络请求，GET或POST。

比如：

![csrf_22](/assets/images/post_imgs/csrf_22.png)

除了URLRequest外，Flash还可以用getURL、loadVars等方式发起请求，如：

![csrf_23](/assets/images/post_imgs/csrf_23.png)

在IE6、IE7中，Flash发起网络请求均可以带上本地cookie，但从IE8开始，Flash发起网络请求不会发送本地cookie。

## CSRF的防御

### 验证码

验证码被认为是对抗CSRF最简单有效的方法。

在CSRF攻击过程中，用户在不知情的情况下发起了请求。如果使用验证码，可以强制用户与网站进行交互才能进行正确的请求。所以利用验证码这种方式可以很容易的防止CSRF的发生。

但是，一般出于交互体验的考虑，不可能在所以请求中都加入验证码的限制。因此验证码只能是作为一种防止CSRF的辅助手段，不能作为主要的解决方案。

### Referer Check(来源检查)

Referer Check可以用来检查请求是否来自于合法的源。

常见的互联网应用中，页面与页面之间都具有一定的逻辑关系，这就使得每个正常请求的referer具有一定的规律。
比如在一个论坛中发帖，用户一般需要登陆后访问具有发帖功能的页面，这就使得这些这些发帖的请求的referer为发帖表单所在的页面，这都是有规律可循的。所以如果发现referer不是这些页面，甚至不是发帖网站的域，则很有可能是CSRF在作怪。

不过即使我们能够通过检查referer是否合法来判断用户是否被CSRF攻击，但这还不够。因为服务器并非在任何时候都能接收到referer，很多情况下出于对隐私的保护，限制了referer的发送。在某些情况下，浏览器甚至不发送referer，比如从https跳转到http。

而且在flash的某一些版本中，曾经可以自定义referer发送，不过后来的新版本取消了这种行为，但我们很难保证所有用户都更新到了新版本。

综上几点，利用referer来防御CSRF完全是不够的，不过可以利用referer来有效地监控CSRF的发生，第一时间发现LD并修复它。

### Token

刚才讨论的几种防止CSRF攻击的解决方案都有这样那样的不足，在实际中很少被采用，目前业界比较通用的做法是使用Token。在详细说明Token之前先来看一下为什么CSRF攻击会成功。

在一次成功的CSRF攻击中，攻击者要正确构造出URL和参数值，否则攻击无法成功。那么如果参数是加密的或者随机的，攻击者无法猜测到，就可以有效防止CSRF攻击了，这就是“不可预测性原则”的一种应用。

例如一个没有做任何处理的URL：
http://www.xxx.com/delete.php?user=test&id=123456
现在把参数改成：
http://www.xxx.com/delete.php?user=md5(salt+test)&id=123456

在攻击者不知道salt和加密方式的情况下，无法构造出这个URL，CSRF攻击不会成功。在服务器端，可以从Session或者cookie中获得user=test，再加上salt后进行md5散列，确认请求的合法性。

加入随机值或加密值的思想是正确的，但是上面这种实现方法有一个缺点，URL很复杂很不友好，而且如果用户想收藏网址也会变得无效，其次这对数据采集和分析工作会造成障碍，因为数据采集和分析都需要明文的数据。

业界比较好的方法是采用我们上面说到的Token：
http://www.xxx.com/delete.php?user=test&id=123456&token=[randomValue]
Token的值需要足够随机，这个随机算法需要经过一番推敲和验证。Token的值只有用户和服务器两者你知我知，第三方是不能知道的。Token可以放在Session Cookie或者本地cookie中。正是由于Token的存在，攻击者无法构造出正确的URL。

Token需要同时放在表单和Session(Session Cookie或服务器Session)或本地Cookie中，提交表单时，服务器需要验证表单中的Token和Session Cookie或服务器Session(或本地Cookie)中的Token是否一致，如果一致则认为是合法请求，如果不一致或有任何一个为空，就判断为不合法，此时有可能是CSRF攻击。

比如这样：

![csrf_24](/assets/images/post_imgs/csrf_24.png)

表单中有一个hidden隐藏字段，value是Token的值。下面是淘宝的一个表单的内容，在表单中有一个hidden隐藏域，正是Token。

![csrf_25](/assets/images/post_imgs/csrf_25.png)

在Session Cookie也可以看到`_tb_token_`：

![csrf_26](/assets/images/post_imgs/csrf_26.png)

### Token的使用原则

1. Token一定要足够随机。
2. 可以允许在一个用户的有效生命周期内，在Token消耗掉之前都使用同一个Token，但如果用户提交了则这个Token已消耗，应该重新生成一个Token。
3. 如果Token保存在Cookie而非服务器Session中，会有一个问题。如果用户同时打开几个标签页，当某个页面消耗掉Token后，其他页面的Token还是原来的，如果这时候提交会造成Token无效。这时可以考虑每个页面生成一个不同的Token。
4. 注意Token的保密性，不要把Token放在URL中，不然会有通过referer泄露的危险。最好尽量把Token放在表单中，提交方式为POST。但是如果页面存在XSS LD，Token还是有可能泄露。如果存在XSS，攻击几乎可以模拟用户做任何操作。加入Token只能防止CSRF，对XSS无效。
