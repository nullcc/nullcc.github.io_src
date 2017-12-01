---
title: 理解和使用keepalived（部署配置篇）
date: 2017-08-15
tags: [keepalived]
categories: web后端
---

## keepalived的用处

  在分布式系统架构中，为了保证高可用，我们通常的做法是使用双机热备的方式来提供服务。举个例子，我们有一个nginx作为反向代理对外提供服务，如果只有一个nginx实例，一旦该实例不可用，请求就无法转发到下游服务，造成整体服务出现问题。因此可以准备一个备服务器，一旦主服务器服务挂了，立刻自动切换至备服务器，整个切换过程对外透明，不会给用户造成影响。keepalived的作用就是负责检测主服务器的服务状态，一旦发现不可用，就切换到备服务器上，如果主服务器恢复正常，会再次切换到主服务器上。

<!--more-->

## 目标系统

  Ubuntu Server LTS 16.04.3 x64（两台，主备）

## 安装

  安装keepalived:

    sudo apt-get install keepalived

  安装nginx:

    sudo apt-get install nginx

## 开启SSH服务

  sudo apt-get install openssh-server

  安装后可以通过：

    ssh username@host -p 22

  ssh到虚拟机中操作

## 网络配置

准备两台Ubuntu虚拟主机，配置内网IP地址：

主：

    sudo ifconfig ens33 172.16.130.130 netmask 255.255.255.0

备：

    sudo ifconfig ens33 172.16.130.131 netmask 255.255.255.0

配置后：

    master: 172.16.130.130（主）

    backup: 172.16.130.131（备）

需要注意的是主备机器的IP必须在相同的网段。

然后需要配置主备机器的虚拟IP地址，设置为172.16.130.150，分别对主备两台机器运行：

    sudo ifconfig ens33:0 172.16.130.150 netmask 255.255.255.0

配置后：

    vip: 172.16.130.150（虚拟IP）

如果要删除虚拟IP，可以运行：

    ifconfig ens33:0 down

为了让虚拟机重启后虚拟IP的配置依然有效，需要在/etc/network/interfaces文件中添加：

    auto ens33:0  
    iface ens33:0 inet static  
    name Ethernet alias LAN card  
    address 172.16.130.150
    netmask 255.255.255.0
    broadcast 172.16.130.255
    network 172.16.130.0

然后重启网络服务：

    /etc/init.d/networking restart

然后在/etc/keepalived/keepalived.conf中输入配置，注意主从服务器的配置有一点点差别：

主服务器：

    global_defs {
       notification_email {

       }
    }

    vrrp_script chk_nginx {
        script "/etc/keepalived/check_nginx.sh"
        interval 2                    # 每2s检查一次
        weight -5                     # 检测失败（脚本返回非0）则优先级减少5个值
        fall 3                        # 如果连续失败次数达到此值，则认为服务器已down
        rise 2                        # 如果连续成功次数达到此值，则认为服务器已up，但不修改优先级
    }

    vrrp_instance VI_1 {              # 实例名称
        state MASTER                  # 可以是MASTER或BACKUP，不过当其他节点keepalived启动时会自动将priority比较大的节点选举为MASTER
        interface ens33                # 节点固有IP（非VIP）的网卡，用来发VRRP包做心跳检测
        virtual_router_id 51          # 虚拟路由ID,取值在0-255之间,用来区分多个instance的VRRP组播,同一网段内ID不能重复;主备必须为一样
        priority 100                  # 权重，主服务器要比备服务器高
        advert_int 1                  # 检查间隔默认为1秒,即1秒进行一次master选举(可以认为是健康查检时间间隔)
        authentication {              # 认证区域,认证类型有PASS和HA（IPSEC）,推荐使用PASS(密码只识别前8位)
            auth_type PASS            # 默认是PASS认证
            auth_pass 1111            # PASS认证密码
        }
        virtual_ipaddress {
            172.16.130.150           # 虚拟VIP地址,允许多个,一行一个
        }
        track_script {                # 引用VRRP脚本，即在 vrrp_script 部分指定的名字。定期运行它们来改变优先级，并最终引发主备切换。
            chk_nginx          
        }                
    }

备服务器：

    global_defs {
       notification_email {

       }
    }

    vrrp_script chk_nginx {
        script "/etc/keepalived/check_nginx.sh"
        interval 2                    # 每2s检查一次
        weight -5                     # 检测失败（脚本返回非0）则优先级减少5个值
        fall 3                        # 如果连续失败次数达到此值，则认为服务器已down
        rise 2                        # 如果连续成功次数达到此值，则认为服务器已up，但不修改优先级
    }

    vrrp_instance VI_1 {              # 实例名称
        state BACKUP                  # 可以是MASTER或BACKUP，不过当其他节点keepalived启动时会自动将priority比较大的节点选举为MASTER
        interface ens33                # 节点固有IP（非VIP）的网卡，用来发VRRP包做心跳检测
        virtual_router_id 51          # 虚拟路由ID,取值在0-255之间,用来区分多个instance的VRRP组播,同一网段内ID不能重复;主备必须为一样
        priority 50                   # 权重，主服务器要比备服务器高
        advert_int 1                  # 检查间隔默认为1秒,即1秒进行一次master选举(可以认为是健康查检时间间隔)
        authentication {              # 认证区域,认证类型有PASS和HA（IPSEC）,推荐使用PASS(密码只识别前8位)
            auth_type PASS            # 默认是PASS认证
            auth_pass 1111            # PASS认证密码
        }
        virtual_ipaddress {
            172.16.130.150           # 虚拟VIP地址,允许多个,一行一个
        }
        track_script {                # 引用VRRP脚本，即在 vrrp_script 部分指定的名字。定期运行它们来改变优先级，并最终引发主备切换。
            chk_nginx          
        }                
    }

check_nginx.sh:

    #more /etc/keepalived/check_http.sh  
    #!/bin/bash  
    #代码一定注意空格，逻辑就是：如果nginx进程不存在则启动nginx,如果nginx无法启动则kill掉keepalived所有进程  
    A=`ps -C nginx --no-header | wc -l`  
    if [ $A -eq 0 ];then  
      /etc/init.d/nginx start  
      sleep 3  
      if [ `ps -C nginx --no-header | wc -l` -eq 0 ];then  
        killall keepalived  
      fi  
    fi  

需要注意的一个问题是，check_nginx.sh的执行权限一定要配置正确，否则keepalived运行可能会有问题。

保存后执行：

    sudo /etc/init.d/keepalived restart

配置完毕。

## 测试

我们在172.16.130.130（主）这台机器上执行：

    ps -ef | grep nginx

结果如下：

    root       5230      1  0 16:27 ?        00:00:00 nginx: master process /usr/sbin/nginx -g daemon on; master_process on;
    www-data   5231   5230  0 16:27 ?        00:00:00 nginx: worker process
    nullcc     5233   5046  0 16:27 pts/0    00:00:00 grep --color=auto nginx

说明这台机器nginx确实是在后台运行的，172.16.130.131（备）也是类似。测试结果如下：

    http://172.16.130.130（主）正常
    http://172.16.130.131（备）正常
    http://172.16.130.150（虚拟IP）正常

此时可以在172.16.130.130（主）上执行：

    ip a

当前虚拟IP指向的是主服务器：

![虚拟IP指向主服务器](/assets/images/post_imgs/keepalived_1.png)

如上图所示，此时访问虚拟IP http://172.16.130.150 实际上访问的是172.16.130.130这台主服务器的nginx服务。现在我们直接关闭172.16.130.130（主）的服务，再依次访问主备服务器和虚拟IP：

    http://172.16.130.130（主）失败
    http://172.16.130.131（备）正常
    http://172.16.130.150（虚拟IP）正常

说明此时keepalived已经监测到主服务器的nginx不可用了，把虚拟IP漂移到备服务器上，保证了nginx的高可用。

此时可以在172.16.130.131（备）上执行：

    ip a

当前虚拟IP指向的是备服务器：

![虚拟IP指向备服务器](/assets/images/post_imgs/keepalived_2.png)

如果我们再把172.16.130.130（主）启动起来，keepalived会感知到主服务器恢复正常，会再次把虚拟IP指向主服务器。
