---
title: node.js的C++扩展入门
date: 2017-05-10
tags: [node]
categories: 编程语言
---

声明：本文主要翻译自node.js官方API：[C++ Addons](https://nodejs.org/api/addons.html)。部分解释为作者自己添加。

<!--more-->

编程环境：

1. 操作系统 Mac OS X 10.9.5
1. node.js v4.4.2
2. npm v3.9.2

本文将介绍node.js中编写C++扩展的入门知识。

## 1. 基本知识介绍

在node.js中，除了用js写代码以外，还可以使用C++编写扩展，这有点类似DLL，动态链接进js代码中。使用上也相当方便，只需用require包含，这和一般的js模块并没有什么区别。C++扩展为js和C++代码的通信提供了一个接口。

要编写node.js的C++扩展，需要了解一些基本知识：

1. V8： Google出品的大名鼎鼎的V8引擎，它实际上是一个C++类库，用来和 JavaScript 交互，比如创建对象，调用函数等等。V8的API大部分都声明在v8.h头文件中。
2. libuv：一个C实现的事件循环库，node.js使用libuv来实现自己的事件循环、工作线程和所有的异步行为。它是一个跨平台的，高度抽象的lib，提供了简单易用的、POSIX-like的方式来让操作系统和系统任务进行交互。比如和文件系统、sockets、定时器和系统事件。libuv还提供了POSIX threads线程级别的抽象来增强标准事件循环中不具备的复杂异步能力。我们鼓励C++扩展的作者思考如何通过转换I/O或其他耗时操作到非阻塞系统操作来避免阻塞事件循环。
3. node.js内部lib，node.js本身提供了很多C/C++ API来给扩展使用，比如最重要的一个：node::ObjectWrap类。
4. node.js包含了很多静态链接库，比如OpenSSL。这些库都放在node.js代码树的deps/目录下。只有V8和OpenSSL标识符被有意地被node.js重复导出来被各种扩展使用。

下面快速地来看一个实例。

## 2. 第一个例子Hello

下面的例子是一个简单的C++扩展，其功能相当于js的如下代码：

    module.exports.hello = () => 'world';

首先创建一个hello.cc：

    // hello.cc
    #include <node.h>

    namespace demo {
        using v8::FunctionCallbackInfo;
        using v8::Isolate;
        using v8::Local;
        using v8::Object;
        using v8::String;
        using v8::Value;

        void Method(const FunctionCallbackInfo<Value>& args) {
            Isolate* isolate = args.GetIsolate();
            args.GetReturnValue().Set(String::NewFromUtf8(isolate, "world"));
        }

        void init(Local<Object> exports) {
            NODE_SET_METHOD(exports, "hello", Method);
        }

        NODE_MODULE(addon, init)
    }  // namespace demo

这个最简单的例子，已经出现了一些我们完全没有接触过的东西。大致解释一下：

1. 函数Method的参数类型是FunctionCallbackInfo<Value>&，FunctionCallbackInfo
2. Isolate，英文意思是“隔离”，在这里Isolate指的是一个独立的V8 runtime，可以理解为一个独立的V8执行环境，它包括了自己的堆管理器、GC等组件。后续的很多操作都要依赖于这个Isolate，后面我们会看到在很多操作中，都会使用Isolate的实例作为一个上下文传入。
(注：一个给定的Isolate在同一时间只能被一个线程访问，但如果有多个不同的Isolate，就可以给多个线程同时访问。不过，一个Isolate还不足以运行脚本，你还需要一个全局对象，一个执行上下文通过指定一个全局对象来定义一个完整的脚本执行环境。因此，可以有多个执行上下文存在于一个Isolate中，而且它们还可以简单安全地共享它们的全局对象。这是因为这个全局对象实际上属于Isolate，而却这个全局对象被Isolate的互斥锁保护着。)
3. 返回值需要用args.GetReturnValue().Set()来设置。
4. 向外导出方法需要在扩展的初始化函数中使用NODE_SET_METHOD(exports, Method_Name, Method);。如果有多个方法需要导出，就写多个NODE_SET_METHOD。

注意到node.js的C++扩展都必须按以下形式导出一个初始化函数(该函数名字可以随便设置一个)：

    void Initialize(Local<Object> exports);
    NODE_MODULE(module_name, Initialize)

NODE_MODULE这行后面并没有分号(;)，因为它并不是一个函数，你可以认为这是一个声明。module_name必须匹配最后生成的二进制文件的文件名(不包括.node后缀)。在hello.cc这个例子中，初始化函数是init，扩展模块名是addon。

构建(Building)

写好源代码后我们就要把它编译成二进制的addon.node文件了。binding.gyp文件用来描述我们模块的构建配置，这个文件的内容是JSON形式的：

    {
        "targets": [
            {
                "target_name": "addon",
                "sources": [ "hello.cc" ]
            }
        ]
    }

实施构建操作需要用到node-gyp，如果尚未安装的话，需要运行(可能要用到sudo)：

    npm install -g node-gyp

来全局安装node-gyp。

编写完binding.gyp文件，我们使用：

    node-gyp configure

来生成对应项目在当前平台的build目录。这将会在build目录下生成一个Makefile(Unix-like系统)或者一个vcxproj文件(Windows系统)还有一部分其他文件。

接着，运行：

    node-gyp build

来生成一个编译过的addon.node文件，这个文件会被放在build/Release/目录下。

build成功后，这个二进制的C++扩展就可以在node.js中使用require包含进来：

    // hello.js
    const addon = require('./build/Release/addon');
    console.log(addon.hello()); // 'world'

由于扩展的二进制文件的存放位置会根据编译方式不同而变化(有可能放在build/Debug/目录)，所以可以用这种方式来引入扩展：

    try {
        return require('./build/Release/addon.node');
    } catch (err) {
        return require('./build/Debug/addon.node');
    }

但是个人觉得这种引入方式很奇怪，在能保证正确性的情况下，如果是开发模式，用Debug目录下的，生产模式用Release下的。

### 链接node.js依赖

node.js使用一些静态链接库，比如V8、libuv和OpenSSL。所有扩展都必须链接V8，还有可能需要链接一些其他的库。典型情况下，使用#include <...>来include这些库(比如链接V8就是#include <v8.h>)，node-gyp会自动找到这些库。然而，有几个注意事项需要说明：

1. node-gyp运行时，它会检测node.js的版本并且下载全部源码文件或者只是下载头文件。如果下载了全部源码文件，扩展就可以使用node.js的所有依赖，如果仅仅下载了头文件，则只有node.js导出的那些东西可以被使用。
2. node-gyp可以使用--nodedir选项来指定本地node.js映像，使用这个选项时，扩展可以使用全部的node.js依赖。

### 使用require加载C++扩展

经过编译的node.js C++扩展的后缀名是.node(类似.so和.dll)，require()函数会查找这些.node文件并像初始化动态链接库那样初始化它们。

当使用reqiure()时，.node后缀可以被省略。需要注意的是，node.js在使用reqiure()加载模块时，会优先加载js后缀的文件。比如说一个目录下有一个addon.js和一个addon.node，当使用require('addon')时，node.js会优先加载addon.js。

## 3.对node.js的原生抽象(这个暂略)

## 4.第二个例子

以下的几个例子的binding.gyp都使用：

    {
        "targets": [
            {
                "target_name": "addon",
                "sources": [ "addon.cc" ]
            }
        ]
    }

如果有多于一个的C++文件，可以把所有文件放在sources数组中：

    "sources": ["addon.cc", "myexample.cc"]

写好binding.gyp后，可以使用以下命令来一次性地配置和构建C++扩展：

    node-gyp configure build

### 函数参数

C++扩展可以暴露函数和对象出来让node.js访问。当从js中调用C++扩展中的函数时，入参和返回值必须映射到C/C++事先声明好的代码中。

以下代码展示了C++扩展代码如何读取从js传递过来的函数入参和如何返回值：

    // addon.cc
    #include <node.h>

    namespace demo {
        using v8::Exception;
        using v8::FunctionCallbackInfo;
        using v8::Isolate;
        using v8::Local;
        using v8::Number;
        using v8::Object;
        using v8::String;
        using v8::Value;

        // This is the implementation of the "add" method
        // Input arguments are passed using the
        // const FunctionCallbackInfo<Value>& args struct
        void Add(const FunctionCallbackInfo<Value>& args) {
            Isolate* isolate = args.GetIsolate();

            // Check the number of arguments passed.
            if (args.Length() < 2) {
                // Throw an Error that is passed back to JavaScript
                isolate->ThrowException(Exception::TypeError(
                    String::NewFromUtf8(isolate, "Wrong number of arguments")));
                return;
            }

            // Check the argument types
            if (!args[0]->IsNumber() || !args[1]->IsNumber()) {
                isolate->ThrowException(Exception::TypeError(
                    String::NewFromUtf8(isolate, "Wrong arguments")));
                return;
            }

            // Perform the operation
            double value = args[0]->NumberValue() + args[1]->NumberValue();
            Local<Number> num = Number::New(isolate, value);

            // Set the return value (using the passed in
            // FunctionCallbackInfo<Value>&)
            args.GetReturnValue().Set(num);
        }

        void Init(Local<Object> exports) {
            NODE_SET_METHOD(exports, "add", Add);
        }

        NODE_MODULE(addon, Init)
    }  // namespace demo

编译成功后，这个扩展可以被node.js使用require()包含并使用：

    // test.js
    const addon = require('./build/Release/addon');
    console.log('This should be eight:', addon.add(3, 5));

### 回调函数

一种很常见的做法是从js传递回调函数给C++调用，下面这个示例展示了如何做：

    // addon.cc
    #include <node.h>

    namespace demo {

        using v8::Function;
        using v8::FunctionCallbackInfo;
        using v8::Isolate;
        using v8::Local;
        using v8::Null;
        using v8::Object;
        using v8::String;
        using v8::Value;

        void RunCallback(const FunctionCallbackInfo<Value>& args) {
            Isolate* isolate = args.GetIsolate();
            Local<Function> cb = Local<Function>::Cast(args[0]);
            const unsigned argc = 1;
            Local<Value> argv[argc] = { String::NewFromUtf8(isolate, "hello world") };
            cb->Call(Null(isolate), argc, argv);
        }

        void Init(Local<Object> exports, Local<Object> module) {
            NODE_SET_METHOD(module, "exports", RunCallback);
        }

        NODE_MODULE(addon, Init)

    }  // namespace demo

解释：

1. 传递回调函数，其实和传递普通参数没什么大的区别，使用

    Local<Function> cb = Local<Function>::Cast(args[0]);

可以获得这个回调函数。然后需要显式声明这个回调函数的参数个数和参数数组：

    const unsigned argc = 1;
    Local<Value> argv[argc] = { String::NewFromUtf8(isolate, "hello world") };

调用这个回调函数需要传入isolate、参数个数argc、参数数组argv：

    cb->Call(Null(isolate), argc, argv);

2. Init函数和之前有点不同，上面这个扩展的Init()使用了两个参数的形式(之前都是单参数)，其中第二个参数接受一个module对象：

    void Init(Local<Object> exports, Local<Object> module) {
        NODE_SET_METHOD(module, "exports", RunCallback); // 相当于直接导出整个模块作为方法
    }

这将允许扩展使用单个函数的形式代替之前往exports中添加函数作为属性的方式来完全地重写exports。因此可以直接用扩展的名字作为函数名来调用，这适用于此扩展只对外暴露一个方法的情况：

    // test.js
    const addon = require('./build/Release/addon');
    addon((msg) => {
        console.log(msg); // 'hello world'
    });

作为演示，在这个示例中只是同步地调用回调函数。

### 对象工厂

在下面的示例中，扩展可以使用C++创建并返回新对象。下面的例子中，createObject()函数接受一个string类型的参数，然后创建一个一模一样的string，并在一个对象的msg属性中返回这个string：

    // addon.cc
    #include <node.h>

    namespace demo {

        using v8::FunctionCallbackInfo;
        using v8::Isolate;
        using v8::Local;
        using v8::Object;
        using v8::String;
        using v8::Value;

        void CreateObject(const FunctionCallbackInfo<Value>& args) {
            Isolate* isolate = args.GetIsolate();

            Local<Object> obj = Object::New(isolate);
            obj->Set(String::NewFromUtf8(isolate, "msg"), args[0]->ToString());

            args.GetReturnValue().Set(obj);
        }

        void Init(Local<Object> exports, Local<Object> module) {
            NODE_SET_METHOD(module, "exports", CreateObject);
        }

        NODE_MODULE(addon, Init)

    }  // namespace demo

解释：

1. 创建一个新对象，也需要把isolate作为参数传入并设置对象属性msg为第一个入参：

    Local<Object> obj = Object::New(isolate);
    obj->Set(String::NewFromUtf8(isolate, "msg"), args[0]->ToString());

2. Init函数中导出CreateObject作为模块函数。

测试上面扩展的js代码：

    // test.js
    const addon = require('./build/Release/addon');

    var obj1 = addon('hello');
    var obj2 = addon('world');
    console.log(obj1.msg + ' ' + obj2.msg); // 'hello world'

### 函数工厂

还有一种常见的行为是创建包装了C++函数的js函数，并返回给js：

    // addon.cc
    #include <node.h>

    namespace demo {

        using v8::Function;
        using v8::FunctionCallbackInfo;
        using v8::FunctionTemplate;
        using v8::Isolate;
        using v8::Local;
        using v8::Object;
        using v8::String;
        using v8::Value;

        void MyFunction(const FunctionCallbackInfo<Value>& args) {
            Isolate* isolate = args.GetIsolate();
            args.GetReturnValue().Set(String::NewFromUtf8(isolate, "hello world"));
        }

        void CreateFunction(const FunctionCallbackInfo<Value>& args) {
            Isolate* isolate = args.GetIsolate();

            Local<FunctionTemplate> tpl = FunctionTemplate::New(isolate, MyFunction);
            Local<Function> fn = tpl->GetFunction();

            // omit this to make it anonymous
            fn->SetName(String::NewFromUtf8(isolate, "theFunction"));

            args.GetReturnValue().Set(fn);
        }

        void Init(Local<Object> exports, Local<Object> module) {
            NODE_SET_METHOD(module, "exports", CreateFunction);
        }

        NODE_MODULE(addon, Init)

    }  // namespace demo

解释：

1. CreateFunction中使用v8::FunctionTemplate创建函数模板(传入参数MyFunction)，并创建一个函数，其中函数命名是可选的：

    Local<FunctionTemplate> tpl = FunctionTemplate::New(isolate, MyFunction);
    Local<Function> fn = tpl->GetFunction();

    // omit this to make it anonymous
    fn->SetName(String::NewFromUtf8(isolate, "theFunction"));

测试一下：

    // test.js
    const addon = require('./build/Release/addon');

    var fn = addon();
    console.log(fn()); // 'hello world'

### 包装C++对象

还可以使用js的new操作符创建由C++包装的对象或类：

    // addon.cc
    #include <node.h>
    #include "myobject.h"

    namespace demo {

        using v8::Local;
        using v8::Object;

        void InitAll(Local<Object> exports) {
            MyObject::Init(exports);
        }

        NODE_MODULE(addon, InitAll)

    }  // namespace demo

在上面的myobject.h中，包装类继承自node::ObjectWrap：

    // myobject.h
    #ifndef MYOBJECT_H
    #define MYOBJECT_H

    #include <node.h>
    #include <node_object_wrap.h>

    namespace demo {

        class MyObject : public node::ObjectWrap {
            public:
                static void Init(v8::Local<v8::Object> exports);

            private:
                explicit MyObject(double value = 0);
                ~MyObject();

            static void New(const v8::FunctionCallbackInfo<v8::Value>& args);
            static void PlusOne(const v8::FunctionCallbackInfo<v8::Value>& args);
            static v8::Persistent<v8::Function> constructor;
            double value_;
        };

    }  // namespace demo

    #endif

在myobject.cc中，实现了那些被暴露出去的方法。下面的代码通过把plusOne()添加到构造函数的prototype来暴露它：

    // myobject.cc
    #include "myobject.h"

    namespace demo {

        using v8::Context;
        using v8::Function;
        using v8::FunctionCallbackInfo;
        using v8::FunctionTemplate;
        using v8::Isolate;
        using v8::Local;
        using v8::Number;
        using v8::Object;
        using v8::Persistent;
        using v8::String;
        using v8::Value;

        Persistent<Function> MyObject::constructor;

        MyObject::MyObject(double value) : value_(value) {
        }

        MyObject::~MyObject() {
        }

        void MyObject::Init(Local<Object> exports) {
            Isolate* isolate = exports->GetIsolate();

            // Prepare constructor template
            Local<FunctionTemplate> tpl = FunctionTemplate::New(isolate, New);
            tpl->SetClassName(String::NewFromUtf8(isolate, "MyObject"));
            tpl->InstanceTemplate()->SetInternalFieldCount(1);

            // Prototype
            NODE_SET_PROTOTYPE_METHOD(tpl, "plusOne", PlusOne);

            constructor.Reset(isolate, tpl->GetFunction());
            exports->Set(String::NewFromUtf8(isolate, "MyObject"),
                       tpl->GetFunction());
        }

        void MyObject::New(const FunctionCallbackInfo<Value>& args) {
            Isolate* isolate = args.GetIsolate();

            if (args.IsConstructCall()) {
                // Invoked as constructor: `new MyObject(...)`
                double value = args[0]->IsUndefined() ? 0 : args[0]->NumberValue();
                MyObject* obj = new MyObject(value);
                obj->Wrap(args.This());
                args.GetReturnValue().Set(args.This());
          } else {
                // Invoked as plain function `MyObject(...)`, turn into construct call.
                const int argc = 1;
                Local<Value> argv[argc] = { args[0] };
                Local<Context> context = isolate->GetCurrentContext();
                Local<Function> cons = Local<Function>::New(isolate, constructor);
                Local<Object> result =
                    cons->NewInstance(context, argc, argv).ToLocalChecked();
                args.GetReturnValue().Set(result);
            }
        }

        void MyObject::PlusOne(const FunctionCallbackInfo<Value>& args) {
            Isolate* isolate = args.GetIsolate();

            MyObject* obj = ObjectWrap::Unwrap<MyObject>(args.Holder());
            obj->value_ += 1;

            args.GetReturnValue().Set(Number::New(isolate, obj->value_));
        }

    }  // namespace demo

解释：

1. 在MyObject::Init中，使用v8::FunctionTemplate创建一个函数模板(传入参数New)，并给这个模板设置一个类名MyObject，SetInternalFieldCount用来设定类的内部储存多少个内部变量，这里是1：

    Local<FunctionTemplate> tpl = FunctionTemplate::New(isolate, New);
    tpl->SetClassName(String::NewFromUtf8(isolate, "MyObject"));
    tpl->InstanceTemplate()->SetInternalFieldCount(1);

然后使用：

    NODE_SET_PROTOTYPE_METHOD(tpl, "plusOne", PlusOne);

来设置prototype中的plusOne方法。

代码：

    constructor.Reset(isolate, tpl->GetFunction());
    exports->Set(String::NewFromUtf8(isolate, "MyObject"),
                       tpl->GetFunction());

第一行相当于js中的

    XXX.prototype.constructor = XXX;

然后导出这个MyObject类。

2. 在MyObject::New中，情况略微复杂一些。首先判断是否是构造调用(使用js中的new操作符)，如果是构造调用，运行以下代码：

    MyObject* obj = new MyObject(value);

来new一个MyObject实例，value是构造入参，然后返回这个实例。

js中的函数如果不是构造调用就是普通的函数调用。

3. 在MyObject::PlusOne中，通过以下代码获取MyObject实例：

    MyObject* obj = ObjectWrap::Unwrap<MyObject>(args.Holder());
    obj->value_ += 1;

然后返回加1后的数值结果。

为了构建这个例子，需要把myobject.cc加入binding.gyp：

    {
        "targets": [
            {
            "target_name": "addon",
            "sources": [
                "addon.cc",
                "myobject.cc"
            ]
            }
        ]
    }

测试：

    // test.js
    const addon = require('./build/Release/addon');

    var obj = new addon.MyObject(10);
    console.log(obj.plusOne()); // 11
    console.log(obj.plusOne()); // 12
    console.log(obj.plusOne()); // 13

### 包装对象工厂

另外，还可以使用工厂模式来避免显式使用new操作符创建对象实例：

    var obj = addon.createObject();
    // instead of:
    // var obj = new addon.Object();

首先，需要在addon.cc中实现createObject()方法：

    // addon.cc
    #include <node.h>
    #include "myobject.h"

    namespace demo {

        using v8::FunctionCallbackInfo;
        using v8::Isolate;
        using v8::Local;
        using v8::Object;
        using v8::String;
        using v8::Value;

        void CreateObject(const FunctionCallbackInfo<Value>& args) {
            MyObject::NewInstance(args);
        }

        void InitAll(Local<Object> exports, Local<Object> module) {
            MyObject::Init(exports->GetIsolate());

            NODE_SET_METHOD(module, "exports", CreateObject);
        }

        NODE_MODULE(addon, InitAll)

    }  // namespace demo

在myobject.h中，加入静态方法NewInstance()来处理实例化对象的操作，我们将用NewInstance()替代js的new操作符：

    // myobject.h
    #ifndef MYOBJECT_H
    #define MYOBJECT_H

    #include <node.h>
    #include <node_object_wrap.h>

    namespace demo {

        class MyObject : public node::ObjectWrap {
            public:
                static void Init(v8::Isolate* isolate);
                static void NewInstance(const v8::FunctionCallbackInfo<v8::Value>& args);

            private:
                explicit MyObject(double value = 0);
                ~MyObject();

                static void New(const v8::FunctionCallbackInfo<v8::Value>& args);
                static void PlusOne(const v8::FunctionCallbackInfo<v8::Value>& args);
                static v8::Persistent<v8::Function> constructor;
                double value_;
        };

    }  // namespace demo

    #endif

myobject.cc中的实现和前面差不多：

    // myobject.cc
    #include <node.h>
    #include "myobject.h"

    namespace demo {

        using v8::Context;
        using v8::Function;
        using v8::FunctionCallbackInfo;
        using v8::FunctionTemplate;
        using v8::Isolate;
        using v8::Local;
        using v8::Number;
        using v8::Object;
        using v8::Persistent;
        using v8::String;
        using v8::Value;

        Persistent<Function> MyObject::constructor;

        MyObject::MyObject(double value) : value_(value) {
        }

        MyObject::~MyObject() {
        }

        void MyObject::Init(Isolate* isolate) {
            // Prepare constructor template
            Local<FunctionTemplate> tpl = FunctionTemplate::New(isolate, New);
            tpl->SetClassName(String::NewFromUtf8(isolate, "MyObject"));
            tpl->InstanceTemplate()->SetInternalFieldCount(1);

            // Prototype
            NODE_SET_PROTOTYPE_METHOD(tpl, "plusOne", PlusOne);

            constructor.Reset(isolate, tpl->GetFunction());
        }

        void MyObject::New(const FunctionCallbackInfo<Value>& args) {
            Isolate* isolate = args.GetIsolate();

            if (args.IsConstructCall()) {
                // Invoked as constructor: `new MyObject(...)`
                double value = args[0]->IsUndefined() ? 0 : args[0]->NumberValue();
                MyObject* obj = new MyObject(value);
                obj->Wrap(args.This());
                args.GetReturnValue().Set(args.This());
            } else {
                // Invoked as plain function `MyObject(...)`, turn into construct call.
                const int argc = 1;
                Local<Value> argv[argc] = { args[0] };
                Local<Function> cons = Local<Function>::New(isolate, constructor);
                Local<Context> context = isolate->GetCurrentContext();
                Local<Object> instance =
                    cons->NewInstance(context, argc, argv).ToLocalChecked();
                args.GetReturnValue().Set(instance);
            }
        }

        void MyObject::NewInstance(const FunctionCallbackInfo<Value>& args) {
            Isolate* isolate = args.GetIsolate();

            const unsigned argc = 1;
            Local<Value> argv[argc] = { args[0] };
            Local<Function> cons = Local<Function>::New(isolate, constructor);
            Local<Context> context = isolate->GetCurrentContext();
            Local<Object> instance =
                cons->NewInstance(context, argc, argv).ToLocalChecked();

            args.GetReturnValue().Set(instance);
        }

        void MyObject::PlusOne(const FunctionCallbackInfo<Value>& args) {
            Isolate* isolate = args.GetIsolate();

            MyObject* obj = ObjectWrap::Unwrap<MyObject>(args.Holder());
            obj->value_ += 1;

            args.GetReturnValue().Set(Number::New(isolate, obj->value_));
        }

    }  // namespace demo

解释：

1. 这个例子和之前那个差不太多，只不过在扩展中提供了CreateObject()工厂方法来创建MyObject实例，CreateObject()在内部又使用MyObject::NewInstance()来创建对象。

再强调一次，为了构建这个例子，需要把myobject.cc加入binding.gyp：

    {
        "targets": [
            {
                "target_name": "addon",
                 "sources": [
                    "addon.cc",
                    "myobject.cc"
                ]
            }
        ]
    }

测试：

    // test.js
    const createObject = require('./build/Release/addon');

    var obj = createObject(10);
    console.log(obj.plusOne()); // 11
    console.log(obj.plusOne()); // 12
    console.log(obj.plusOne()); // 13

    var obj2 = createObject(20);
    console.log(obj2.plusOne()); // 21
    console.log(obj2.plusOne()); // 22
    console.log(obj2.plusOne()); // 23

### 传递包装对象

为了进一步包装和返回C++对象，可以利用node.js的helper函数node::ObjectWrap::Unwrap来展开包装对象。下面的例子展示了一个接受两个MyObject对象作为参数的函数add()：

    // addon.cc
    #include <node.h>
    #include <node_object_wrap.h>
    #include "myobject.h"

    namespace demo {

        using v8::FunctionCallbackInfo;
        using v8::Isolate;
        using v8::Local;
        using v8::Number;
        using v8::Object;
        using v8::String;
        using v8::Value;

        void CreateObject(const FunctionCallbackInfo<Value>& args) {
            MyObject::NewInstance(args);
        }

        void Add(const FunctionCallbackInfo<Value>& args) {
            Isolate* isolate = args.GetIsolate();

            MyObject* obj1 = node::ObjectWrap::Unwrap<MyObject>(
                args[0]->ToObject());
            MyObject* obj2 = node::ObjectWrap::Unwrap<MyObject>(
                args[1]->ToObject());

            double sum = obj1->value() + obj2->value();
            args.GetReturnValue().Set(Number::New(isolate, sum));
        }

        void InitAll(Local<Object> exports) {
            MyObject::Init(exports->GetIsolate());

            NODE_SET_METHOD(exports, "createObject", CreateObject);
            NODE_SET_METHOD(exports, "add", Add);
        }

        NODE_MODULE(addon, InitAll)

    }  // namespace demo

在myobject.h中，加入一个新的public方法value()来获取private变量：

    // myobject.h
    #ifndef MYOBJECT_H
    #define MYOBJECT_H

    #include <node.h>
    #include <node_object_wrap.h>

    namespace demo {

        class MyObject : public node::ObjectWrap {
            public:
                static void Init(v8::Isolate* isolate);
                static void NewInstance(const v8::FunctionCallbackInfo<v8::Value>& args);
                inline double value() const { return value_; }

            private:
                explicit MyObject(double value = 0);
                ~MyObject();

                static void New(const v8::FunctionCallbackInfo<v8::Value>& args);
                static v8::Persistent<v8::Function> constructor;
                double value_;
        };

    }  // namespace demo

    #endif

myobject.cc的实现也和之前类似：

    // myobject.cc
    #include <node.h>
    #include "myobject.h"

    namespace demo {

        using v8::Context;
        using v8::Function;
        using v8::FunctionCallbackInfo;
        using v8::FunctionTemplate;
        using v8::Isolate;
        using v8::Local;
        using v8::Object;
        using v8::Persistent;
        using v8::String;
        using v8::Value;

        Persistent<Function> MyObject::constructor;

        MyObject::MyObject(double value) : value_(value) {
        }

        MyObject::~MyObject() {
        }

        void MyObject::Init(Isolate* isolate) {
            // Prepare constructor template
            Local<FunctionTemplate> tpl = FunctionTemplate::New(isolate, New);
            tpl->SetClassName(String::NewFromUtf8(isolate, "MyObject"));
            tpl->InstanceTemplate()->SetInternalFieldCount(1);

            constructor.Reset(isolate, tpl->GetFunction());
        }

        void MyObject::New(const FunctionCallbackInfo<Value>& args) {
            Isolate* isolate = args.GetIsolate();

            if (args.IsConstructCall()) {
                // Invoked as constructor: `new MyObject(...)`
                double value = args[0]->IsUndefined() ? 0 : args[0]->NumberValue();
                MyObject* obj = new MyObject(value);
                obj->Wrap(args.This());
                args.GetReturnValue().Set(args.This());
             } else {
                // Invoked as plain function `MyObject(...)`, turn into construct call.
                const int argc = 1;
                Local<Value> argv[argc] = { args[0] };
                Local<Context> context = isolate->GetCurrentContext();
                Local<Function> cons = Local<Function>::New(isolate, constructor);
                Local<Object> instance =
                    cons->NewInstance(context, argc, argv).ToLocalChecked();
                args.GetReturnValue().Set(instance);
            }
        }

        void MyObject::NewInstance(const FunctionCallbackInfo<Value>& args) {
            Isolate* isolate = args.GetIsolate();

            const unsigned argc = 1;
            Local<Value> argv[argc] = { args[0] };
            Local<Function> cons = Local<Function>::New(isolate, constructor);
            Local<Context> context = isolate->GetCurrentContext();
            Local<Object> instance =
                cons->NewInstance(context, argc, argv).ToLocalChecked();

            args.GetReturnValue().Set(instance);
        }

    }  // namespace demo

解释：

1. addon.cc中使用户如下代码来获取包装对象：

    MyObject* obj1 = node::ObjectWrap::Unwrap<MyObject>(args[0]->ToObject());

测试：

    // test.js
    const addon = require('./build/Release/addon');

    var obj1 = addon.createObject(10);
    var obj2 = addon.createObject(20);
    var result = addon.add(obj1, obj2);

    console.log(result); // 30

### AtExit钩子

一个AtExit钩子是这样一种函数：它会在node.js事件循环结束后、js虚拟机被终止前或node.js停机前被调用。AtExit钩子需要被使用node::AtExit来注册。

函数声明如下：

    void AtExit(callback, args)

callback: void (*)(void*)，一个在exit时被调用的函数的函数指针。
args: void*，一个传递给callback的指针。

AtExit钩子运行在事件循环之后和js虚拟机被kill掉之前。

AtExit钩子接受两个参数：一个回调函数的函数指针和一个传递给回调函数的隐式上下文数据的指针。

回调函数的调用方式是后进先出(LIFO)，和栈一样。

以下的addon.cc实现了AtExit钩子：

    // addon.cc
    #undef NDEBUG
    #include <assert.h>
    #include <stdlib.h>
    #include <node.h>

    namespace demo {

        using node::AtExit;
        using v8::HandleScope;
        using v8::Isolate;
        using v8::Local;
        using v8::Object;

        static char cookie[] = "yum yum";
        static int at_exit_cb1_called = 0;
        static int at_exit_cb2_called = 0;

        static void at_exit_cb1(void* arg) {
            Isolate* isolate = static_cast<Isolate*>(arg);
            HandleScope scope(isolate);
            Local<Object> obj = Object::New(isolate);
            assert(!obj.IsEmpty()); // assert VM is still alive
            assert(obj->IsObject());
            at_exit_cb1_called++;
        }

        static void at_exit_cb2(void* arg) {
            assert(arg == static_cast<void*>(cookie));
            at_exit_cb2_called++;
        }

        static void sanity_check(void*) {
            assert(at_exit_cb1_called == 1);
            assert(at_exit_cb2_called == 2);
        }

        void init(Local<Object> exports) {
            AtExit(sanity_check);
            AtExit(at_exit_cb2, cookie);
            AtExit(at_exit_cb2, cookie);
            AtExit(at_exit_cb1, exports->GetIsolate());
        }

        NODE_MODULE(addon, init);

    }  // namespace demo

解释：

1. 上面例子定义了4个AtExit函数：

    void init(Local<Object> exports) {
        AtExit(sanity_check);
        AtExit(at_exit_cb2, cookie);
        AtExit(at_exit_cb2, cookie);
        AtExit(at_exit_cb1, exports->GetIsolate());
    }

根据LIFO特性，在时间循环之后，VM停机之前，会依次执行：

    AtExit(at_exit_cb1, exports->GetIsolate());
    AtExit(at_exit_cb2, cookie);
    AtExit(at_exit_cb2, cookie);
    AtExit(sanity_check);

sanity_check会检查at_exit_cb1和at_exit_cb2的调用次数：

    assert(at_exit_cb1_called == 1);
    assert(at_exit_cb2_called == 2);

测试：

    // test.js
    const addon = require('./build/Release/addon');
