---
title: Python包导入详解
date: 2017-06-09
---

在Python导入包有以下四种情况：

1. 主程序导入系统内置模块或已安装的依赖模块。
2. 主程序和模块程序在同一目录下。
3. 主程序所在目录是模块所在目录的上级目录。
4. 主程序导入上级目录中的模块或其他目录(与主程序所在目录平级)下的模块。

下面依次来看看。

## 主程序导入系统内置模块或已安装的依赖模块

```python
import json
```

这种写法是直接导入包名，使用该模块下的函数时都必须带上`json`前缀，比如`json.loads()``

```python
from datetime import datetime
```

这种写法是导入包中具体的某个模块，这里导入的是`datetime`包中的`datetime`模块，可以直接使用这个`datetime`模块，比如`datetime.now()`

```python
import os.path
```

这种写法是导入os包中的path模块，使用时必须以`os.path`为前缀调用该模块下的函数，比如`os.path.exists(a_file_path)`检查某个文件是否存在

## 主程序和模块程序在同一目录下

文件目录结构：

```python
--src
  |--a.py
  |--main.py
```

在`main.py`中导入`a.py`中的模块：

```python
from a import A
```

## 主程序所在目录是模块所在目录的上级目录

文件目录结构：

```python
--src
  |--a
     |--__init__.py
     |--a.py
  |--main.py
```

在`main.py`中导入`a.py`中的模块：

```python
from a.a import A
```

## 主程序导入上级目录中的模块或其他目录(与主程序所在目录平级)下的模块

文件目录结构：

```python
--src
  |--a.py
  |--b
     |--__init__.py
     |--b.py
  |--sub
     |--main.py
```

在`sub/main.py`中导入`a.py`和`b.py`中的模块：

```Python
import os
import sys
sys.path.append(os.path.abspath(os.path.dirname(__file__) + '/' + '..'))
from a import A
from b.b import B
```

这种情况下需要在`sys.path`中添加父目录，才能让Python找到具体模块的路径。
