---
title: Web后端系统架构漫谈(五)——微服务和远程过程调用(RPC)
date: 2017-11-28
tags: [后端架构]
categories: web后端
---

## 为什么需要微服务

随着后端系统的演进，在单一项目上做开发已经不能适应快速的迭代和团队分工，功能模块之间开始出现明显的界限，部分功能模块变成公共模块，需要暴露接口供外部调用。这时候是采用微服务的时候了。微服务的关键是识别功能模块的分界，将各个功能模块抽取出来，独立成一个服务，以提高复用性、可维护性和改进性能。

<!--more-->

拿一个网络商城来说，比较常见的拆分方式如下：

1. 用户服务
2. 订单服务
3. 商品信息服务
4. 物流信息服务
5. 数据统计服务
6. 消息推送服务

在后端架构中，这些服务均位于service层，service层的上游是web server层，当web server层的服务器收到请求后，会调用service层的一个或多个服务。在[Web后端系统架构漫谈(五)——负载均衡](/2017/11/23/Web后端系统架构漫谈(一)-负载均衡.html)中有一幅图，展示了web后端系统架构的负载均衡体系，其中从web server层到service层有负载均衡，微服务化后，各个服务可以独立部署和维护，因此也可以独立进行负载均衡，这有利于整个后端系统的可扩展性和高可用性。

拆分服务后，各个服务也可以使用不同的技术选型，比如用户服务使用Java，消息推送服务使用Python，这在大公司的大型系统中是有很优势的。

## RPC框架

在web server调用service层的具体服务时，一般是跨服务器调用，或者叫“远程过程调用”，就是常说的RPC。

在同一个进程空间内，一个函数要调用另一个函数的场景是我们习以为常的情况。但是如果要通过网络远程调用函数，就会经历一个比较复杂的过程，下面看一下RPC的过程示意图：

![rpc_1](/assets/images/post_imgs/web_arch_rpc_1.png)

（图片来源：https://www.cs.rutgers.edu/~pxk/417/notes/03-rpc.html ）

我们来看看执行一个RPC要经历的过程：

1. 客户端调用本地的client stub，client stub会将函数名和参数等信息按照一定格式序列化成字节流。
2. client stub使用系统调用将信息发送给内核。
3. 内核使用某种协议（比如TCP）将网络数据包发送给远端服务器。
4. 远端服务器的server stub收到消息，将字节流反序列化，获得函数名和参数。
5. 远端服务器在本地调用使用参数调用该函数，获得结果。
6. 获得结果后，将结果返回给server stub。
7. 远端服务器的server stub将结果序列化成字节流，发送给内核。
8. 远端服务器的内核将网络数据包发送给客户端。
9. 客户端从内核中读取消息。
10. 客户端client stub将字节流反序列化后获得调用结果。

这个过程还是比较复杂的，涉及了数据的序列化和反序列化、连接池、I/O管理、线程管理、收发队列、超时管理等。如果每次调用都要关注这些细节，就会变得很繁琐。RPC框架的出现就是为了屏蔽这些复杂性，它已经将这些通用的功能封装好。

## Apache Thrift

下面我们将来实践一把RPC框架，这里选择的是[Apache Thrift](http://thrift.apache.org/)。Apache Thrift是Facebook开发的一款RPC框架，开源后捐献给Apache软件基金会。

### 安装

首先从[这里](http://thrift.apache.org/download)下载Thrift的源码，对照[这里](http://thrift.apache.org/docs/BuildingFromSource)安装。

我们使用Python来演示，假设项目根目录为`thrift_demo`。首先建立一个`shared.thrift`文件：

```Java
/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * This Thrift file can be included by other Thrift files that want to share
 * these definitions.
 */

namespace cpp shared
namespace d share // "shared" would collide with the eponymous D keyword.
namespace dart shared
namespace java shared
namespace perl shared
namespace php shared
namespace haxe shared
namespace netcore shared

struct SharedStruct {
  1: i32 key
  2: string value
}

service SharedService {
  SharedStruct getStruct(1: i32 key)
}
```

然后建立`tutorial.thrift`文件：

```Java
/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

# Thrift Tutorial
# Mark Slee (mcslee@facebook.com)
#
# This file aims to teach you how to use Thrift, in a .thrift file. Neato. The
# first thing to notice is that .thrift files support standard shell comments.
# This lets you make your thrift file executable and include your Thrift build
# step on the top line. And you can place comments like this anywhere you like.
#
# Before running this file, you will need to have installed the thrift compiler
# into /usr/local/bin.

/**
 * The first thing to know about are types. The available types in Thrift are:
 *
 *  bool        Boolean, one byte
 *  i8 (byte)   Signed 8-bit integer
 *  i16         Signed 16-bit integer
 *  i32         Signed 32-bit integer
 *  i64         Signed 64-bit integer
 *  double      64-bit floating point value
 *  string      String
 *  binary      Blob (byte array)
 *  map<t1,t2>  Map from one type to another
 *  list<t1>    Ordered list of one type
 *  set<t1>     Set of unique elements of one type
 *
 * Did you also notice that Thrift supports C style comments?
 */

// Just in case you were wondering... yes. We support simple C comments too.

/**
 * Thrift files can reference other Thrift files to include common struct
 * and service definitions. These are found using the current path, or by
 * searching relative to any paths specified with the -I compiler flag.
 *
 * Included objects are accessed using the name of the .thrift file as a
 * prefix. i.e. shared.SharedObject
 */
include "shared.thrift"

/**
 * Thrift files can namespace, package, or prefix their output in various
 * target languages.
 */
namespace cpp tutorial
namespace d tutorial
namespace dart tutorial
namespace java tutorial
namespace php tutorial
namespace perl tutorial
namespace haxe tutorial
namespace netcore tutorial

/**
 * Thrift lets you do typedefs to get pretty names for your types. Standard
 * C style here.
 */
typedef i32 MyInteger

/**
 * Thrift also lets you define constants for use across languages. Complex
 * types and structs are specified using JSON notation.
 */
const i32 INT32CONSTANT = 9853
const map<string,string> MAPCONSTANT = {'hello':'world', 'goodnight':'moon'}

/**
 * You can define enums, which are just 32 bit integers. Values are optional
 * and start at 1 if not supplied, C style again.
 */
enum Operation {
  ADD = 1,
  SUBTRACT = 2,
  MULTIPLY = 3,
  DIVIDE = 4
}

/**
 * Structs are the basic complex data structures. They are comprised of fields
 * which each have an integer identifier, a type, a symbolic name, and an
 * optional default value.
 *
 * Fields can be declared "optional", which ensures they will not be included
 * in the serialized output if they aren't set.  Note that this requires some
 * manual management in some languages.
 */
struct Work {
  1: i32 num1 = 0,
  2: i32 num2,
  3: Operation op,
  4: optional string comment,
}

/**
 * Structs can also be exceptions, if they are nasty.
 */
exception InvalidOperation {
  1: i32 whatOp,
  2: string why
}

/**
 * Ahh, now onto the cool part, defining a service. Services just need a name
 * and can optionally inherit from another service using the extends keyword.
 */
service Calculator extends shared.SharedService {

  /**
   * A method definition looks like C code. It has a return type, arguments,
   * and optionally a list of exceptions that it may throw. Note that argument
   * lists and exception lists are specified using the exact same syntax as
   * field lists in struct or exception definitions.
   */

   void ping(),

   i32 add(1:i32 num1, 2:i32 num2),

   i32 calculate(1:i32 logid, 2:Work w) throws (1:InvalidOperation ouch),

   /**
    * This method has a oneway modifier. That means the client only makes
    * a request and does not listen for any response at all. Oneway methods
    * must be void.
    */
   oneway void zip()

}

/**
 * That just about covers the basics. Take a look in the test/ folder for more
 * detailed examples. After you run this file, your generated code shows up
 * in folders with names gen-<language>. The generated code isn't too scary
 * to look at. It even has pretty indentation.
 */
```

运行命令：

```shell
thrift -r --gen py tutorial.thrift
```

生成gen-py目录，在gen-py目录下建立`client.py`和`server.py`两个文件。

`client.py`：

```Python
import sys
import glob
# sys.path.append('gen-py')
# sys.path.insert(0, glob.glob('../../lib/py/build/lib*')[0])

from tutorial import Calculator
from tutorial.ttypes import InvalidOperation, Operation, Work

from thrift import Thrift
from thrift.transport import TSocket
from thrift.transport import TTransport
from thrift.protocol import TBinaryProtocol


def main():
    # Make socket
    transport = TSocket.TSocket('localhost', 9090)

    # Buffering is critical. Raw sockets are very slow
    transport = TTransport.TBufferedTransport(transport)

    # Wrap in a protocol
    protocol = TBinaryProtocol.TBinaryProtocol(transport)

    # Create a client to use the protocol encoder
    client = Calculator.Client(protocol)

    # Connect!
    transport.open()

    client.ping()
    print('ping()')

    sum_ = client.add(1, 1)
    print('1+1=%d' % sum_)

    work = Work()

    work.op = Operation.DIVIDE
    work.num1 = 1
    work.num2 = 0

    try:
        quotient = client.calculate(1, work)
        print('Whoa? You know how to divide by zero?')
        print('FYI the answer is %d' % quotient)
    except InvalidOperation as e:
        print('InvalidOperation: %r' % e)

    work.op = Operation.SUBTRACT
    work.num1 = 15
    work.num2 = 10

    diff = client.calculate(1, work)
    print('15-10=%d' % diff)

    log = client.getStruct(1)
    print('Check log: %s' % log.value)

    # Close!
    transport.close()

if __name__ == "__main__":
    main()
```

`server.py`文件：

```Python
import glob
import sys
# sys.path.append('gen-py')
# sys.path.insert(0, glob.glob('../../lib/py/build/lib*')[0])

from tutorial import Calculator
from tutorial.ttypes import InvalidOperation, Operation

from shared.ttypes import SharedStruct

from thrift.transport import TSocket
from thrift.transport import TTransport
from thrift.protocol import TBinaryProtocol
from thrift.server import TServer


class CalculatorHandler:
    def __init__(self):
        self.log = {}

    def ping(self):
        print('ping()')

    def add(self, n1, n2):
        print('add(%d,%d)' % (n1, n2))
        return n1 + n2

    def calculate(self, logid, work):
        print('calculate(%d, %r)' % (logid, work))

        if work.op == Operation.ADD:
            val = work.num1 + work.num2
        elif work.op == Operation.SUBTRACT:
            val = work.num1 - work.num2
        elif work.op == Operation.MULTIPLY:
            val = work.num1 * work.num2
        elif work.op == Operation.DIVIDE:
            if work.num2 == 0:
                x = InvalidOperation()
                x.whatOp = work.op
                x.why = 'Cannot divide by 0'
                raise x
            val = work.num1 / work.num2
        else:
            x = InvalidOperation()
            x.whatOp = work.op
            x.why = 'Invalid operation'
            raise x

        log = SharedStruct()
        log.key = logid
        log.value = '%d' % (val)
        self.log[logid] = log

        return val

    def getStruct(self, key):
        print('getStruct(%d)' % (key))
        return self.log[key]

    def zip(self):
        print('zip()')

if __name__ == '__main__':
    handler = CalculatorHandler()
    processor = Calculator.Processor(handler)
    transport = TSocket.TServerSocket(port=9090)
    tfactory = TTransport.TBufferedTransportFactory()
    pfactory = TBinaryProtocol.TBinaryProtocolFactory()

    server = TServer.TSimpleServer(processor, transport, tfactory, pfactory)

    print('Starting the server...')
    server.serve()
    print('done.')
```

在根目录下按顺序运行：

```shell
python gen-py/server.py
```

和

```shell
python gen-py/client.py
```

效果如下：

server:
![rpc_2](/assets/images/post_imgs/web_arch_rpc_2.png)

client:
![rpc_3](/assets/images/post_imgs/web_arch_rpc_3.png)
