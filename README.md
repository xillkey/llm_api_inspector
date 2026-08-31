# LLM API Inspector

LLM API Inspector 是一个 LLM API 中转代理与报文查看器。它对外提供 OpenAI 兼容的 `/v1/chat/completions` 接口，并将请求参数、工具注册、流式响应完整记录下来，支持对进行中请求的 Live 实时查看。

## 功能

- 开箱即用，免除繁琐依赖安装
- OpenAI 兼容协议代理（chat/completions）
- 支持流式与非流式请求
- 查看 messages、tools 注册、采样参数
- 支持 Live 实时查看模型思考过程与回答
- 上游 Base URL 配置
- SQLite 本地持久化历史记录



## 使用方式

1. 启动应用
2. 打开「设置」，填写 **上游 Base URL**（例如 `https://api.openai.com/v1`）并保存
3. 将客户端指向代理地址，使用真实的 **model** 和 **API Key**（与直连上游时相同）：

```bash
export OPENAI_BASE_URL=http://127.0.0.1:8317/v1
export OPENAI_API_KEY=你的上游 API Key
```

4. 像平常一样调用 Chat Completions，左侧会出现请求记录

代理会将请求原样转发到上游，`Authorization` 等请求头会透传，仅做中转与抓包。

左侧「连接信息」可查看代理 Base URL 与当前上游地址；也可在设置中调整监听端口、是否允许局域网访问。

## 使用示例

非流式：

```bash
curl http://127.0.0.1:8317/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer 你的上游 API Key' \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "hello"}]
  }'
```

流式：

```bash
curl http://127.0.0.1:8317/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer 你的上游 API Key' \
  -d '{
    "model": "gpt-4o",
    "stream": true,
    "messages": [{"role": "user", "content": "hello"}]
  }'
```

## 开发指南

### 环境要求

- Node.js 22.x（项目已提供 `.nvmrc`）
- macOS / Windows / Linux

```bash
nvm use
npm install
```

如果 Electron 二进制下载失败，可尝试：

```bash
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

### 开发运行

```bash
npm start
```

验证内置 SQLite 模块：

```bash
npm run verify:sqlite
```

### 打包

```bash
npm run build
```

平台专用：

```bash
npm run build:mac
npm run build:win
npm run build:linux
```

### 项目结构

```
electron/     主进程、代理、SQLite
renderer/     原生 HTML/CSS/JS 界面
```

### 安全说明

- 代理默认仅监听 `127.0.0.1`（可在「设置 → 代理接入」勾选「允许局域网连接」）
- 开启局域网访问后监听 `0.0.0.0`，同网段设备可通过本机局域网 IP 访问
- 客户端 `Authorization` 等请求头会透传到上游，代理不单独管理 API Key

