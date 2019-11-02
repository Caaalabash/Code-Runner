# Code-Runner

代码在线运行工具: [在线地址: sandbox.calabash.top](http://sandbox.calabash.top)

- [x] `Node.js`

- [x] `Python`

- [x] `Go`

## 运行效果： 以Node.js为例

非`stream mode`, 限制`Docker`容器运行时间为10秒, 输出作为一个整体返回

![](https://static.calabash.top//blog-media/file/file-1559971278606.png)

`stream mode`, 限制`Docker`容器运行时间为30秒, 输出采用流的方式返回

![](https://static.calabash.top//blog-media/file/file-1559971416162.png)

## 主要技术栈

+ `Koa2`

+ `Server Sent Events`: `@caaalabash/node-sse`

+ `Docker`

+ `Node.js`的`stream`模块, `child_process`模块