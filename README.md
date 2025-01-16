1. Base URL 相关:
background.js:
- fetchBaseUrl() 从workers.dev获取
- fallback到api.pipecdn.app
- 60分钟刷新一次

2. 心跳请求(Heartbeat):
background.js:
- 6小时间隔
- 包含ip、location、timestamp
- 使用token认证

3. 节点测试(Node Tests):
background.js:
- 30分钟间隔
- 测试节点延迟
- 上报测试结果
