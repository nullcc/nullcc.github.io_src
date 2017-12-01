---
title: 使用nginx+gunicorn部署flask
date: 2017-10-12
tags: [Python]
categories: 自动化部署
---

本文会就使用nginx+gunicorn部署flask给出一个步骤说明。

<!--more-->

由于Ubuntu默认是Python 2.7，我们安装一个Python 3.5:

```shell
sudo apt-get install python3
```

然后安装`pip`：

```shell
sudo apt-get install python-pip
sudo pip install --upgrade pip
```

使用`pip`安装`virtualenv`：

```shell
sudo pip install virtualenv
```

假设源码部署在`/home/nullcc/demo`目录下，

执行：

```shell
cd /home/nullcc/demo
```

在项目根目录下运行以下命令激活一个虚拟环境：

```shell
virtualenv -p python3.5 --no-site-packages venv # 这个命令可能需要多试几次才能成功，天朝的网络你懂的
. venv/bin/activate
```

激活虚拟环境后，在命令行等待符号前面会有一个`(venv)`标志，比如这样：

```shell
(venv) nullcc@ubuntu:~/demo$
```

如果需要取消激活当前venv，运行：

```shell
deactivate
```

创建一个文件`index.py`，输入下列代码，这是一个最简单的flask应用：

```python
from flask import Flask
app = Flask(__name__)

@app.route('/')
def hello_world():
    return 'Hello World!'

if __name__ == '__main__':
    app.run()
```

然后再创建一个`requirements.txt`：

```shell
--index https://pypi.doubanio.com/simple

Flask==0.10.1
```

运行下面命令安装依赖项：

```shell
pip install -r requirements.txt
```

再安装`gunicorn`：
```shell
pip install gunicorn
```

执行：
```shell
gunicorn -w 4 -b :8082 index:app --log-level=debug
```

`-w`表示启动多少个worker，`-b`表示访问地址。

执行：
```shell
curl 127.0.0.1:8082
```
会返回`Hello World!'`字符串。

至于nginx，可以使用：

```shell
sudo apt-get install nginx
```
来安装，具体配置可以参考nginx的说明。
