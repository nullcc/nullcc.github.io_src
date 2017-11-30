---
title: Redis的启动过程
date: 2017-11-13
---

Redis的启动过程都写在server.c的main中（这里使用的是Redis-3.2.11版本的源码，早期版本应该在redis.c的main中）。下面就来概括性地看看Redis的启动过程中发生了什么。

<!--more-->

由于main函数的头部有一些预编译条件代码，主要是针对测试用的，这里把这部分代码全部删除，以让整个过程更加清晰一点。

main函数的定义如下：

```Java
int main(int argc, char **argv) {
    struct timeval tv;
    int j;

    setlocale(LC_COLLATE,"");
    zmalloc_enable_thread_safeness();
    zmalloc_set_oom_handler(redisOutOfMemoryHandler);
    srand(time(NULL)^getpid());
    gettimeofday(&tv,NULL);
    dictSetHashFunctionSeed(tv.tv_sec^tv.tv_usec^getpid());
    server.sentinel_mode = checkForSentinelMode(argc,argv);
    initServerConfig();  // 初始化Redis服务器的各种参数

    /* Store the executable path and arguments in a safe place in order
     * to be able to restart the server later. */
    server.executable = getAbsolutePath(argv[0]);
    server.exec_argv = zmalloc(sizeof(char*)*(argc+1));
    server.exec_argv[argc] = NULL;
    for (j = 0; j < argc; j++) server.exec_argv[j] = zstrdup(argv[j]);

    /* We need to init sentinel right now as parsing the configuration file
     * in sentinel mode will have the effect of populating the sentinel
     * data structures with master nodes to monitor. */
    if (server.sentinel_mode) {
        initSentinelConfig();
        initSentinel();
    }

    /* Check if we need to start in redis-check-rdb mode. We just execute
     * the program main. However the program is part of the Redis executable
     * so that we can easily execute an RDB check on loading errors. */
    if (strstr(argv[0],"redis-check-rdb") != NULL)
        redis_check_rdb_main(argc,argv);

    if (argc >= 2) {
        j = 1; /* First option to parse in argv[] */
        sds options = sdsempty();
        char *configfile = NULL;

        /* Handle special options --help and --version */
        if (strcmp(argv[1], "-v") == 0 ||
            strcmp(argv[1], "--version") == 0) version();
        if (strcmp(argv[1], "--help") == 0 ||
            strcmp(argv[1], "-h") == 0) usage();
        if (strcmp(argv[1], "--test-memory") == 0) {
            if (argc == 3) {
                memtest(atoi(argv[2]),50);
                exit(0);
            } else {
                fprintf(stderr,"Please specify the amount of memory to test in megabytes.\n");
                fprintf(stderr,"Example: ./redis-server --test-memory 4096\n\n");
                exit(1);
            }
        }

        /* First argument is the config file name? */
        if (argv[j][0] != '-' || argv[j][1] != '-') {
            configfile = argv[j];
            server.configfile = getAbsolutePath(configfile);
            /* Replace the config file in server.exec_argv with
             * its absoulte path. */
            zfree(server.exec_argv[j]);
            server.exec_argv[j] = zstrdup(server.configfile);
            j++;
        }

        /* All the other options are parsed and conceptually appended to the
         * configuration file. For instance --port 6380 will generate the
         * string "port 6380\n" to be parsed after the actual file name
         * is parsed, if any. */
        while(j != argc) {
            if (argv[j][0] == '-' && argv[j][1] == '-') {
                /* Option name */
                if (!strcmp(argv[j], "--check-rdb")) {
                    /* Argument has no options, need to skip for parsing. */
                    j++;
                    continue;
                }
                if (sdslen(options)) options = sdscat(options,"\n");
                options = sdscat(options,argv[j]+2);
                options = sdscat(options," ");
            } else {
                /* Option argument */
                options = sdscatrepr(options,argv[j],strlen(argv[j]));
                options = sdscat(options," ");
            }
            j++;
        }
        if (server.sentinel_mode && configfile && *configfile == '-') {
            serverLog(LL_WARNING,
                "Sentinel config from STDIN not allowed.");
            serverLog(LL_WARNING,
                "Sentinel needs config file on disk to save state.  Exiting...");
            exit(1);
        }
        resetServerSaveParams();
        loadServerConfig(configfile,options);
        sdsfree(options);
    } else {
        serverLog(LL_WARNING, "Warning: no config file specified, using the default config. In order to specify a config file use %s /path/to/%s.conf", argv[0], server.sentinel_mode ? "sentinel" : "redis");
    }

    server.supervised = redisIsSupervised(server.supervised_mode);
    int background = server.daemonize && !server.supervised;
    if (background) daemonize();

    initServer();
    if (background || server.pidfile) createPidFile();
    redisSetProcTitle(argv[0]);
    redisAsciiArt();
    checkTcpBacklogSettings();

    if (!server.sentinel_mode) {
        /* Things not needed when running in Sentinel mode. */
        serverLog(LL_WARNING,"Server started, Redis version " REDIS_VERSION);
    #ifdef __linux__
        linuxMemoryWarnings();
    #endif
        loadDataFromDisk();
        if (server.cluster_enabled) {
            if (verifyClusterConfigWithData() == C_ERR) {
                serverLog(LL_WARNING,
                    "You can't have keys in a DB different than DB 0 when in "
                    "Cluster mode. Exiting.");
                exit(1);
            }
        }
        if (server.ipfd_count > 0)
            serverLog(LL_NOTICE,"The server is now ready to accept connections on port %d", server.port);
        if (server.sofd > 0)
            serverLog(LL_NOTICE,"The server is now ready to accept connections at %s", server.unixsocket);
    } else {
        sentinelIsRunning();
    }

    /* Warning the user about suspicious maxmemory setting. */
    if (server.maxmemory > 0 && server.maxmemory < 1024*1024) {
        serverLog(LL_WARNING,"WARNING: You specified a maxmemory value that is less than 1MB (current value is %llu bytes). Are you sure this is what you really want?", server.maxmemory);
    }

    aeSetBeforeSleepProc(server.el,beforeSleep);
    aeMain(server.el);  // 进入主事件循环
    aeDeleteEventLoop(server.el);
    return 0;
}
```

我们现在从头到尾解析这个函数。

## 1. initServerConfig

首先来到`initServerConfig();`这行代码上，从函数名称上很容易猜想这个函数是用来初始化Redis服务器配置的。这个函数的定义有点长，不过它做的事情并不难理解，就是初始化Redis的部分参数。在initServerConfig中初始化的这部分参数，一般都可以对应到redis.conf中的配置项，比如端口号、rdb文件名等。。initServerConfig中也提供了很多redis.conf配置项的默认参数，如果配置文件没有给出某个配置项的值，initServerConfig就会给出一个默认值。具体来看看这个函数：

```Java
/* 初始化Redis服务器配置（主要配置文件的一些参数） */
void initServerConfig(void) {
    int j;
    getRandomHexChars(server.runid,CONFIG_RUN_ID_SIZE);  // 设置server的runid，runid用来标识一个特定的唯一的已启动的redis实例
    server.configfile = NULL;  // 配置文件的绝对路径
    server.executable = NULL;  // 可执行文件的绝对路径
    server.hz = CONFIG_DEFAULT_HZ;  // serverCron()的调用频率，单位毫秒
    server.runid[CONFIG_RUN_ID_SIZE] = '\0';  // 设置runid的结束符
    server.arch_bits = (sizeof(long) == 8) ? 64 : 32;  // server的机器字长
    server.port = CONFIG_DEFAULT_SERVER_PORT;  // server端口
    server.tcp_backlog = CONFIG_DEFAULT_TCP_BACKLOG;  // tcp
    server.bindaddr_count = 0;  // server.bindaddr[]的元素个数
    server.unixsocket = NULL;  // Unix socket路径
    server.unixsocketperm = CONFIG_DEFAULT_UNIX_SOCKET_PERM;  // Unix socket许可
    server.ipfd_count = 0;  // ipfd[]的槽数
    server.sofd = -1;  // Unix socket文件描述符
    server.protected_mode = CONFIG_DEFAULT_PROTECTED_MODE;  // 保护模式开关，是否允许外部主机连接
    server.dbnum = CONFIG_DEFAULT_DBNUM;  // Redis server中db的个数
    server.verbosity = CONFIG_DEFAULT_VERBOSITY;  // 日志级别
    server.maxidletime = CONFIG_DEFAULT_CLIENT_TIMEOUT;  // 客户端超时时间，客户端空闲时间超过此值时服务器会断开和客户端的连接
    server.tcpkeepalive = CONFIG_DEFAULT_TCP_KEEPALIVE;  // tcp保活标志，当此值非零时，会设置SO_KEEPALIVE
    server.active_expire_enabled = 1;  /* Can be disabled for testing purposes. */
    server.client_max_querybuf_len = PROTO_MAX_QUERYBUF_LEN;  // 客户端最大查询缓存大小
    server.saveparams = NULL;  // rdb的保存点数组
    server.loading = 0;  // redis从磁盘上加载数据的标志，非零值表示正在从磁盘加载数据
    server.logfile = zstrdup(CONFIG_DEFAULT_LOGFILE);  // 日志文件路径
    server.syslog_enabled = CONFIG_DEFAULT_SYSLOG_ENABLED;  // 是否允许syslog
    server.syslog_ident = zstrdup(CONFIG_DEFAULT_SYSLOG_IDENT);  // syslog识别字段
    server.syslog_facility = LOG_LOCAL0;  // syslog设备
    server.daemonize = CONFIG_DEFAULT_DAEMONIZE;  // 是否是守护进程
    server.supervised = 0;  /* 1 if supervised, 0 otherwise. */
    server.supervised_mode = SUPERVISED_NONE;  /* See SUPERVISED_* */
    server.aof_state = AOF_OFF;  // AOF的状态，有AOF_(ON|OFF|WAIT_REWRITE)三种
    server.aof_fsync = CONFIG_DEFAULT_AOF_FSYNC;  // fsync()策略
    server.aof_no_fsync_on_rewrite = CONFIG_DEFAULT_AOF_NO_FSYNC_ON_REWRITE;  // 进行AOF rewrite时是否允许fsync
    server.aof_rewrite_perc = AOF_REWRITE_PERC;  /* Rewrite AOF if % growth is > M and... */
    server.aof_rewrite_min_size = AOF_REWRITE_MIN_SIZE;  // AOF文件的最小大小
    server.aof_rewrite_base_size = 0;  // 上一次rewrite后AOF文件大小
    server.aof_rewrite_scheduled = 0;  // BGSAVE结束后开始rewrite
    server.aof_last_fsync = time(NULL);  // 上一次fsync()的UNIX时间戳
    server.aof_rewrite_time_last = -1;  // 上一次AOF rewrite耗时
    server.aof_rewrite_time_start = -1;  // 当前一次AOF rewrite的开始时间
    server.aof_lastbgrewrite_status = C_OK;  // 上一次bgrewrite状态，C_OK或C_ERR
    server.aof_delayed_fsync = 0;  // fsync拖延次数
    server.aof_fd = -1;  // 当前AOF文件的文件描述符
    server.aof_selected_db = -1;  // 当前AOF选择的db
    server.aof_flush_postponed_start = 0;  // AOF文件延迟刷新的时间
    server.aof_rewrite_incremental_fsync = CONFIG_DEFAULT_AOF_REWRITE_INCREMENTAL_FSYNC;  // rewrite期间有fsync增量吗
    server.aof_load_truncated = CONFIG_DEFAULT_AOF_LOAD_TRUNCATED;  /* Don't stop on unexpected AOF EOF. */
    server.pidfile = NULL;  // redis server的pid文件路径
    server.rdb_filename = zstrdup(CONFIG_DEFAULT_RDB_FILENAME);  // rdb文件名
    server.aof_filename = zstrdup(CONFIG_DEFAULT_AOF_FILENAME);  // aof文件名
    server.requirepass = NULL;  // AUTH命令的密码，为NULL即不需要密码
    server.rdb_compression = CONFIG_DEFAULT_RDB_COMPRESSION;  // 是否在rdb中使用压缩
    server.rdb_checksum = CONFIG_DEFAULT_RDB_CHECKSUM;  // 是否使用rdb校验码
    server.stop_writes_on_bgsave_err = CONFIG_DEFAULT_STOP_WRITES_ON_BGSAVE_ERROR;  // 是否不允许在BGSAVE出错时写入
    server.activerehashing = CONFIG_DEFAULT_ACTIVE_REHASHING;  // serverCron()时是否可以执行增量哈希
    server.notify_keyspace_events = 0;  //
    server.maxclients = CONFIG_DEFAULT_MAX_CLIENTS;  // 同时允许多少客户端连接
    server.bpop_blocked_clients = 0;  // 被列表bpop命令阻塞住的客户端数
    server.maxmemory = CONFIG_DEFAULT_MAXMEMORY;  // 最大使用内存量（字节）
    server.maxmemory_policy = CONFIG_DEFAULT_MAXMEMORY_POLICY;  // 在内存达到最大值时的key淘汰策略
    server.maxmemory_samples = CONFIG_DEFAULT_MAXMEMORY_SAMPLES;
    server.hash_max_ziplist_entries = OBJ_HASH_MAX_ZIPLIST_ENTRIES;
    server.hash_max_ziplist_value = OBJ_HASH_MAX_ZIPLIST_VALUE;
    server.list_max_ziplist_size = OBJ_LIST_MAX_ZIPLIST_SIZE;
    server.list_compress_depth = OBJ_LIST_COMPRESS_DEPTH;
    server.set_max_intset_entries = OBJ_SET_MAX_INTSET_ENTRIES;
    server.zset_max_ziplist_entries = OBJ_ZSET_MAX_ZIPLIST_ENTRIES;
    server.zset_max_ziplist_value = OBJ_ZSET_MAX_ZIPLIST_VALUE;
    server.hll_sparse_max_bytes = CONFIG_DEFAULT_HLL_SPARSE_MAX_BYTES;
    server.shutdown_asap = 0;
    server.repl_ping_slave_period = CONFIG_DEFAULT_REPL_PING_SLAVE_PERIOD;
    server.repl_timeout = CONFIG_DEFAULT_REPL_TIMEOUT;
    server.repl_min_slaves_to_write = CONFIG_DEFAULT_MIN_SLAVES_TO_WRITE;
    server.repl_min_slaves_max_lag = CONFIG_DEFAULT_MIN_SLAVES_MAX_LAG;
    server.cluster_enabled = 0;
    server.cluster_node_timeout = CLUSTER_DEFAULT_NODE_TIMEOUT;
    server.cluster_migration_barrier = CLUSTER_DEFAULT_MIGRATION_BARRIER;
    server.cluster_slave_validity_factor = CLUSTER_DEFAULT_SLAVE_VALIDITY;
    server.cluster_require_full_coverage = CLUSTER_DEFAULT_REQUIRE_FULL_COVERAGE;
    server.cluster_configfile = zstrdup(CONFIG_DEFAULT_CLUSTER_CONFIG_FILE);
    server.migrate_cached_sockets = dictCreate(&migrateCacheDictType,NULL);
    server.next_client_id = 1; /* Client IDs, start from 1 .*/
    server.loading_process_events_interval_bytes = (1024*1024*2);
    server.lua_time_limit = LUA_SCRIPT_TIME_LIMIT;

    server.lruclock = getLRUClock();  // server的LRU时钟
    resetServerSaveParams();

    // 保存策略，1小时内至少有1次修改就保存
    appendServerSaveParams(60*60,1);  /* save after 1 hour and 1 change */
    // 保存策略，5分钟内至少有100次修改就保存
    appendServerSaveParams(300,100);  /* save after 5 minutes and 100 changes */
    // 保存策略，1分钟内至少有10000次修改就保存
    appendServerSaveParams(60,10000); /* save after 1 minute and 10000 changes */

    /* 复制相关 */
    server.masterauth = NULL;
    server.masterhost = NULL;
    server.masterport = 6379;
    server.master = NULL;
    server.cached_master = NULL;
    server.repl_master_initial_offset = -1;
    server.repl_state = REPL_STATE_NONE;
    server.repl_syncio_timeout = CONFIG_REPL_SYNCIO_TIMEOUT;
    server.repl_serve_stale_data = CONFIG_DEFAULT_SLAVE_SERVE_STALE_DATA;
    server.repl_slave_ro = CONFIG_DEFAULT_SLAVE_READ_ONLY;
    server.repl_down_since = 0; /* Never connected, repl is down since EVER. */
    server.repl_disable_tcp_nodelay = CONFIG_DEFAULT_REPL_DISABLE_TCP_NODELAY;
    server.repl_diskless_sync = CONFIG_DEFAULT_REPL_DISKLESS_SYNC;
    server.repl_diskless_sync_delay = CONFIG_DEFAULT_REPL_DISKLESS_SYNC_DELAY;
    server.slave_priority = CONFIG_DEFAULT_SLAVE_PRIORITY;
    server.slave_announce_ip = CONFIG_DEFAULT_SLAVE_ANNOUNCE_IP;
    server.slave_announce_port = CONFIG_DEFAULT_SLAVE_ANNOUNCE_PORT;
    server.master_repl_offset = 0;

    /* 复制部分的重新同步 */
    server.repl_backlog = NULL;
    server.repl_backlog_size = CONFIG_DEFAULT_REPL_BACKLOG_SIZE;
    server.repl_backlog_histlen = 0;
    server.repl_backlog_idx = 0;
    server.repl_backlog_off = 0;
    server.repl_backlog_time_limit = CONFIG_DEFAULT_REPL_BACKLOG_TIME_LIMIT;
    server.repl_no_slaves_since = time(NULL);

    /* 客户端输出缓冲区限制 */
    for (j = 0; j < CLIENT_TYPE_OBUF_COUNT; j++)
        server.client_obuf_limits[j] = clientBufferLimitsDefaults[j];

    /* 一些双精度浮点数常量初始化 */
    R_Zero = 0.0;  // 零
    R_PosInf = 1.0/R_Zero;  // 正无穷大
    R_NegInf = -1.0/R_Zero;  // 负无穷大
    R_Nan = R_Zero/R_Zero;  // 非数值

    /* 初始化命令表，由于命令名称有可能在redis.conf中使用重命名命令修改，
     * 这里我们先初始化它们。 */
    server.commands = dictCreate(&commandTableDictType,NULL);
    server.orig_commands = dictCreate(&commandTableDictType,NULL);
    populateCommandTable();
    server.delCommand = lookupCommandByCString("del");
    server.multiCommand = lookupCommandByCString("multi");
    server.lpushCommand = lookupCommandByCString("lpush");
    server.lpopCommand = lookupCommandByCString("lpop");
    server.rpopCommand = lookupCommandByCString("rpop");
    server.sremCommand = lookupCommandByCString("srem");
    server.execCommand = lookupCommandByCString("exec");
    server.expireCommand = lookupCommandByCString("expire");
    server.pexpireCommand = lookupCommandByCString("pexpire");

    /* 慢操作日志 */
    server.slowlog_log_slower_than = CONFIG_DEFAULT_SLOWLOG_LOG_SLOWER_THAN;
    server.slowlog_max_len = CONFIG_DEFAULT_SLOWLOG_MAX_LEN;

    /* 延迟监控 */
    server.latency_monitor_threshold = CONFIG_DEFAULT_LATENCY_MONITOR_THRESHOLD;

    /* 调试 */
    server.assert_failed = "<no assertion failed>";
    server.assert_file = "<no file>";
    server.assert_line = 0;
    server.bug_report_start = 0;
    server.watchdog_period = 0;
}
```

这里面东西很多，我们能发现有相当一部分代码是从一些宏定义中读取配置参数并赋值给server的相应属性。另外有几个比较重要的server属性需要说明一下，首先是server.runid，这个属性在每次Redis的启动过程中都会改变，它是一串随机值，用来标识一个特定的Redis运行实例，如果一个客户端两次连接Redis服务器runid不同，有两种可能，要么是连接到了另一个Redis实例，要么是原来的Redis已经重启导致runid改变。另外initServerConfig中还有很多文件路径的配置，比如配置文件路径、日志路径、rdb文件路径，aof文件路径等。还配置了Redis执行AOF的时机，默认的时机有三种：1小时内至少有1次修改就保存、5分钟内至少有100次修改就保存和1分钟内至少有10000次修改就保存，这个配置还可以在配置文件redis.conf中改变。

## 2. initServer

initServer函数代码如下：

```Java
/* 初始化服务器（主要是一些动态属性） */
void initServer(void) {
    int j;

    signal(SIGHUP, SIG_IGN);
    signal(SIGPIPE, SIG_IGN);
    setupSignalHandlers();  // 注册信号处理器

    if (server.syslog_enabled) {
        openlog(server.syslog_ident, LOG_PID | LOG_NDELAY | LOG_NOWAIT,
            server.syslog_facility);
    }

    server.pid = getpid();  // 获取进程pid
    server.current_client = NULL;  // 当前连接的客户端，只用于崩溃报告中
    server.clients = listCreate();  // 活动客户端列表
    server.clients_to_close = listCreate();  // 需要异步关闭的客户端列表
    server.slaves = listCreate();  // 从服务器列表
    server.monitors = listCreate();  // 监控服务器列表
    server.clients_pending_write = listCreate();  //
    server.slaveseldb = -1; /* Force to emit the first SELECT command. */  //
    server.unblocked_clients = listCreate();  // 在下一个事件循环中需要解锁的客户端列表
    server.ready_keys = listCreate();  //
    server.clients_waiting_acks = listCreate();  // 等待响应的客户端列表
    server.get_ack_from_slaves = 0;
    server.clients_paused = 0;  // 如果当前客户端暂停则为true
    server.system_memory_size = zmalloc_get_memory_size();  // 系统报告的总内存

    createSharedObjects();  // 创建一些共享对象
    adjustOpenFilesLimit();
    server.el = aeCreateEventLoop(server.maxclients+CONFIG_FDSET_INCR);  // 创建事件循环
    server.db = zmalloc(sizeof(redisDb)*server.dbnum);  // 创建db实例

    /* 在TCP socket上监听用户命令 */
    if (server.port != 0 &&
        listenToPort(server.port,server.ipfd,&server.ipfd_count) == C_ERR)
        exit(1);

    /* 打开Unix域socket监听 */
    if (server.unixsocket != NULL) {
        unlink(server.unixsocket); /* don't care if this fails */
        server.sofd = anetUnixServer(server.neterr,server.unixsocket,
            server.unixsocketperm, server.tcp_backlog);
        if (server.sofd == ANET_ERR) {
            serverLog(LL_WARNING, "Opening Unix socket: %s", server.neterr);
            exit(1);
        }
        anetNonBlock(NULL,server.sofd);
    }

    /* 没有监听的socket时程序终止 */
    if (server.ipfd_count == 0 && server.sofd < 0) {
        serverLog(LL_WARNING, "Configured to not listen anywhere, exiting.");
        exit(1);
    }

    /* 创建Redis数据库，并初始化其内部状态 */
    for (j = 0; j < server.dbnum; j++) {
        server.db[j].dict = dictCreate(&dbDictType,NULL);
        server.db[j].expires = dictCreate(&keyptrDictType,NULL);
        server.db[j].blocking_keys = dictCreate(&keylistDictType,NULL);
        server.db[j].ready_keys = dictCreate(&setDictType,NULL);
        server.db[j].watched_keys = dictCreate(&keylistDictType,NULL);
        server.db[j].eviction_pool = evictionPoolAlloc();
        server.db[j].id = j;
        server.db[j].avg_ttl = 0;
    }
    server.pubsub_channels = dictCreate(&keylistDictType,NULL);
    server.pubsub_patterns = listCreate();
    listSetFreeMethod(server.pubsub_patterns,freePubsubPattern);
    listSetMatchMethod(server.pubsub_patterns,listMatchPubsubPattern);
    server.cronloops = 0;
    server.rdb_child_pid = -1;
    server.aof_child_pid = -1;
    server.rdb_child_type = RDB_CHILD_TYPE_NONE;
    server.rdb_bgsave_scheduled = 0;
    aofRewriteBufferReset();  // 重置AOF rewrite buffer
    server.aof_buf = sdsempty();
    server.lastsave = time(NULL); /* At startup we consider the DB saved. */
    server.lastbgsave_try = 0;    /* At startup we never tried to BGSAVE. */
    server.rdb_save_time_last = -1;
    server.rdb_save_time_start = -1;
    server.dirty = 0;
    resetServerStats();  // 重置服务器状态
    /* A few stats we don't want to reset: server startup time, and peak mem. */
    server.stat_starttime = time(NULL);
    server.stat_peak_memory = 0;
    server.resident_set_size = 0;
    server.lastbgsave_status = C_OK;
    server.aof_last_write_status = C_OK;
    server.aof_last_write_errno = 0;
    server.repl_good_slaves_count = 0;
    updateCachedTime();  // 更新服务器缓存时间

    /* 创建处理后台操作的时间事件 */
    if(aeCreateTimeEvent(server.el, 1, serverCron, NULL, NULL) == AE_ERR) {
        serverPanic("Can't create the serverCron time event.");
        exit(1);
    }

    /* 创建处理通过TCP和Unix域socket的新连接的事件处理器 */
    for (j = 0; j < server.ipfd_count; j++) {
        if (aeCreateFileEvent(server.el, server.ipfd[j], AE_READABLE,
            acceptTcpHandler,NULL) == AE_ERR)
            {
                serverPanic(
                    "Unrecoverable error creating server.ipfd file event.");
            }
    }
    if (server.sofd > 0 && aeCreateFileEvent(server.el,server.sofd,AE_READABLE,
        acceptUnixHandler,NULL) == AE_ERR) serverPanic("Unrecoverable error creating server.sofd file event.");

    /* 在需要时打开AOF文件 */
    if (server.aof_state == AOF_ON) {
        server.aof_fd = open(server.aof_filename,
                               O_WRONLY|O_APPEND|O_CREAT,0644);
        if (server.aof_fd == -1) {
            serverLog(LL_WARNING, "Can't open the append-only file: %s",
                strerror(errno));
            exit(1);
        }
    }

    /* 32位机器侠设置内存最大值为3GB，且不会淘汰key */
    if (server.arch_bits == 32 && server.maxmemory == 0) {
        serverLog(LL_WARNING,"Warning: 32 bit instance detected but no memory limit set. Setting 3 GB maxmemory limit with 'noeviction' policy now.");
        server.maxmemory = 3072LL*(1024*1024); /* 3 GB */
        server.maxmemory_policy = MAXMEMORY_NO_EVICTION;
    }

    if (server.cluster_enabled) clusterInit();  // Redis集群配置
    replicationScriptCacheInit();  // 复制脚本缓存初始化
    scriptingInit(1);  // 复制脚本初始化
    slowlogInit();  // 慢操作日志初始化
    latencyMonitorInit();  // 延迟监控初始化
    bioInit();  // 初始化后台线程
}
```

initServer一开始会注册系统信号的处理器，然后初始化Redis服务器的部分参数，这些参数大都是动态的，比如pid、db、活动客户端列表之类的。再创建一些共享对象，这些共享对象被用到的频率很高，所以预先创建好，要使用时直接从内存中获得能提高效率。之后就是在TCP连接和Unix domain socket上监听客户端发来的命令。接着初始化所有db和它们的内部状态，创建后台操作的时间事件、打开AOF和设置内存的最大使用量（只有在32-bit的机器上）。最后就是做一些和集群、复制脚本、慢操作、延迟监控和后台进程相关的初始化操作。

## 3. aeSetBeforeSleepProc和aeMain

在Redis服务器其中之前，还需要设置主事件循环，在这个循环中将会处理Redis的I/O操作。aeSetBeforeSleepProc负责设置事件循环中每次进入事件处理过程之前前调用的函数，aeMain为主事件循环函数。
