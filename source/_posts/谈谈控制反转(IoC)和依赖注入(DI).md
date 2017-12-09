---
title: 谈谈控制反转(IoC)和依赖注入(DI)
date: 2017-12-09
tags: [设计模式]
categories: 设计模式
---

我们常常看到控制反转和依赖注入这两个词，到底是什么含义，在现实编码过程中又有什么意义呢，本文将谈谈这些问题。

<!--more-->

控制反转(Inverse of Control, IoC)一开始看上去会让人一头雾水：要控制谁？反转给谁？怎么反转？依赖注入(Dependency Injection, DI)从字面上稍微好理解一点，就是把某个事物所依赖的东西注入到这个事物中。

先来看一段代码：

```Java
public class Driver {
    public void drive() {
        Car car = new Car();
        car.run();
    }
}
```

上面的代码中司机要开车，于是直接在`drive`函数中实例化了一辆小汽车来驾驶，这样写能运行是没错，但是有一个问题，如果现在我要驾驶一辆卡车，就得修改`Driver`类的`drive`函数，那之后要驾驶摩托车呢？吊车呢？这就很麻烦了，仅仅是为了驾驶不同种类的车辆就要修改`Driver`类的`drive`函数，也就是说`Driver`类和具体的车辆类产生了很强的耦合性。这种情况我们是不愿意看到的，这里有三种解耦方式：构造函数注入、变量注入、接口注入。

## 构造函数注入

修改代码如下：

```Java
public class Driver {
    private Vehicle vehicle;
    public Driver(Vehicle vehicle) {
        this.vehicle = vehicle;
    }

    public void drive() {
        this.vehicle.run();
    }
}
```

这里我们做了两件事，一是将具体车辆改为用构造函数参数的形式传入，二是构造函数参数的类型是一个抽象类`Vehicle`。在声明变量时，我们应该尽量使用抽象类或接口作为变量类型，这符合里式替换原则。经过改造以后，在实例化`Driver`时，想传入小汽车、卡车或者摩托车都行，只要这些具体的交通工具类实现了抽象类`Vehicle`中的`run`方法即可。

## 变量注入

```Java
public class Driver {
    private Vehicle vehicle;

    public void setVehicle(Vehicle vehicle) {
        this.vehicle = vehicle;
    }

    public void drive() {
        this.vehicle.run();
    }
}
```

定义`setVehicle`函数后，可以在外部设置`Driver`类实例的`vehicle`属性，这就是变量注入。

## 接口注入

```Java
public interface IVehicleChanger {
    public abstract void changeVehicle(Vehicle vehicle);
}

public class Driver implements IVehicleChanger{
    private Vehicle vehicle;

    public void changeVehicle(Vehicle vehicle) {
        this.vehicle = vehicle;
    }

    public void drive() {
        this.vehicle.run();
    }
}
```

使用接口注入时，需要将所有类的依赖抽取到一个接口，调用类需要实现该接口的注入方法。接口注入和属性注入有点相似，不过需要多定义一个接口，相对麻烦一些。

上面这些代码和解释都是为了说明控制反转和依赖注入的本质：将一个类所依赖的东西的控制权从类本身中移除，将控制权交给外部。在最初的一段代码中，`Driver`类要亲自实例化一个具体的交通工具，这种方式不具有可复用性和可修改性。三种解耦方案其实就是让`Driver`类不要去管具体交通工具库类实例化的过程，只要用它就好了。

那么控制反转和依赖注入这两个词的区别是什么？其实就是驾驶交通工具和驾驶小汽车的区别，控制反转这种讲法更抽象一些，依赖注入则更具体一些：依赖注入是控制反转的一种实现方式。