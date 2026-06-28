# autoShoes → shoes :Electron WebUI 迁移计划

> 目标:将 `autoShoes`(Electron 42 + React 19 + TS)迁移为 **Vite + React 19 + Node 后端** 的前后端分离 WebUI,输出目录 `shoes/`,语言 TypeScript,并重构页面结构使其更合理。

---

## 0. 技术选型(已确认)

| 维度 | 决策 |
|---|---|
| 前端 | Vite + React 19 + TypeScript(替代 webpack 渲染端) |
| 后端 | Node.js + Express/Fastify + TypeScript(替代 Electron 主进程) |
| 存储 | 服务端磁盘(`data/` 目录)+ `.env` 配置;API Key 仅存服务端 |
| 图片访问 | 静态路由 `/api/images/:filename`(替代 `file://` 协议) |
| 类型共享 | `shared/types/` 前后端共用 |

---

## 1. 现状分析:autoShoes 架构

### 1.1 进程模型
```
Electron
├── 主进程 src/main/           ← 迁移为 → Node 后端 server/
│   ├── main.ts                (窗口创建,删除)
│   ├── preload.ts             (contextBridge,删除)
│   ├── ipc/bridge.ts          (单通道 IPC 路由 → HTTP Router)
│   ├── ipc/handlers/*.ts      (6 类 handler → REST 路由)
│   └── services/              (业务逻辑,平移)
│       ├── config.service.ts
│       └── api/qwen.api.ts
└── 渲染进程 src/renderer/     ← 迁移为 → 前端 client/
    ├── bridge.ts              (IPC 封装 → HTTP 客户端)
    ├── App.tsx                (TabBar 切换 → React Router)
    └── components/            (页面组件,重构)
```

### 1.2 Electron 强依赖点(必须改造)
| Electron 能力 | 源码位置 | Web 替代方案 |
|---|---|---|
| `ipcRenderer.invoke('bridge')` | `preload.ts:14`、`renderer/bridge.ts:20` | `fetch('/api/...')` |
| 单通道 action 路由 | `main/ipc/bridge.ts:50` | Express Router 注册 |
| `app.getPath('userData')` | `config.service.ts:60`、`chat.handler.ts:15,38,135` | `process.env.DATA_DIR`(默认 `<root>/data`) |
| `dialog.showOpenDialog` | `file.handler.ts:8,42` | `<input type="file">`(浏览器原生) |
| `fs.readFileSync` 读本地图片 | `file.handler.ts:21` | 前端 `FileReader.readAsDataURL`(无需经过后端) |
| `clipboard.writeImage` / `nativeImage` | `file.handler.ts:31` | `navigator.clipboard.write([ClipboardItem])` |
| `file://` 图片协议 | `ChatBubble.tsx:67,82`、`GalleryPage.tsx:75,97` | `/api/images/:filename` 静态路由 |
| 窗口控制 `window:*` | `window.handler.ts` | **删除**(Web 无窗口概念) |
| 内存 KV `store:*` | `store.handler.ts` | **删除**(仅被内部用,无 UI 依赖) |
| App 版本/平台 `app:*` | `app.handler.ts` | 保留一个 `/api/health` 或 `meta` 端点 |
| `config.json` 持久化 | `config.service.ts` | 后端 `data/config.json` + `.env` 覆盖 |

### 1.3 业务核心(chat.handler.ts:71-131)
聊天发送三步链路,需整体迁到后端路由:
1. **多模态润色** → `qwen.api.ts:multimodalRefine`(正则解析 `【设计说明】`/`【Prompt】`)
2. **文生图/图生图** → `qwen.api.ts:generateImages`
3. **图片下载落盘** → `chat.handler.ts:downloadImage` 存入 `data/images/`

---

## 2. 目标目录结构

```
shoes/
├── client/                         # 前端 Vite + React 19 + TS
│   ├── public/
│   ├── src/
│   │   ├── main.tsx                # 入口
│   │   ├── App.tsx                 # 根布局 + 路由
│   │   ├── routes/                 # ★ 路由式页面(替代 Tab 切换)
│   │   │   ├── ChatRoute.tsx
│   │   │   ├── GalleryRoute.tsx
│   │   │   └── SettingsRoute.tsx
│   │   ├── pages/                  # 页面内部组装(纯 UI)
│   │   │   ├── chat/               # ChatPage / ChatList / ChatInput / ChatBubble
│   │   │   ├── gallery/            # GalleryPage
│   │   │   └── settings/           # SettingsPage
│   │   ├── features/               # ★ 按领域聚合(数据 + 组件)
│   │   │   ├── chat/               # chat API + hook
│   │   │   ├── gallery/            # gallery API + hook
│   │   │   └── settings/           # config API + hook
│   │   ├── components/             # 跨领域通用组件
│   │   │   ├── layout/             # AppShell / Sidebar / MobileTabBar
│   │   │   ├── common/             # Icon / ImageModal(★ 抽取)
│   │   │   └── ui/                 # Button / Spinner 等
│   │   ├── lib/
│   │   │   ├── http.ts             # ★ fetch 封装(替代 bridge.invoke)
│   │   │   └── imageUrl.ts         # ★ file:// → /api/images 转换
│   │   ├── hooks/
│   │   └── styles/                 # App.css / tokens.css(抽设计令牌)
│   ├── index.html
│   ├── vite.config.ts              # ★ dev 代理 /api → 后端
│   ├── tsconfig.json
│   └── package.json
│
├── server/                         # 后端 Node + Express + TS
│   ├── src/
│   │   ├── index.ts                # 启动 + 注册路由 + 静态托管
│   │   ├── routes/                 # ★ 替代 ipc/handlers
│   │   │   ├── chat.routes.ts      # ← chat.handler.ts
│   │   │   ├── config.routes.ts    # ← config.handler.ts
│   │   │   ├── image.routes.ts     # ← image:list/delete + 静态读取
│   │   │   └── meta.routes.ts      # ← app.handler(精简)
│   │   ├── services/               # ← main/services(平移)
│   │   │   ├── config.service.ts   #   去掉 app.getPath
│   │   │   ├── storage.service.ts  # ★ 封装磁盘读写 + 图片目录
│   │   │   └── qwen.api.ts         #   几乎原样
│   │   ├── middleware/
│   │   │   ├── error.ts            # 统一错误 → JSON
│   │   │   └── upload.ts           # ★ multer 接收参考图(可选)
│   │   ├── config.ts               # ★ 加载 .env(端口/DATA_DIR/API_KEY)
│   │   └── types.ts
│   ├── .env.example
│   ├── tsconfig.json
│   └── package.json
│
├── shared/                         # ★ 前后端共享类型
│   └── types/
│       ├── chat.ts                 # Message / ChatSendResponse
│       └── config.ts               # AppConfig
│
├── data/                           # ★ 运行时数据(替代 userData,.gitignore)
│   ├── images/                     # 生成图 + 上传参考图
│   ├── config.json                 # 配置(不含密钥,密钥走 .env)
│   └── chat_history.json
│
├── docs/                           # 从 autoShoes/docs 迁移
├── scripts/                        # test-qwen.ts 迁移为后端脚本
├── demo/                           # 保留现有 Python demo
├── .gitignore                      # ★ 排除 data/、.env、node_modules
└── README.md
```

---

## 3. IPC → HTTP API 映射表

> 原 `bridge.<ns>.<method>(args)` → `HTTP <method> /api/<path>`

| 原 action | 原 bridge 调用 | 新 HTTP 接口 | handler 来源 |
|---|---|---|---|
| `chat:send` | `bridge.chat.send({userText, imageBase64, imageCount})` | `POST /api/chat/generate` | chat.handler.ts:71 |
| `chat:loadHistory` | `bridge.chat.loadHistory()` | `GET /api/chat/history` | chat.handler.ts:51 |
| `chat:saveHistory` | `bridge.chat.saveHistory(msgs)` | `PUT /api/chat/history` | chat.handler.ts:62 |
| `image:list` | `bridge.image.list()` | `GET /api/images` | chat.handler.ts:134 |
| `image:delete` | `bridge.image.delete(path)` | `DELETE /api/images/:filename` | chat.handler.ts:149 |
| `file:readBase64` | `bridge.file.readBase64(path)` | **前端 FileReader,无需后端** | — |
| `file:saveImage` | `bridge.file.saveImage(path)` | `GET /api/images/:filename?download=1` | file.handler.ts:39 |
| `file:copyImage` | `bridge.file.copyImage(path)` | **前端 navigator.clipboard** | — |
| `config:get` | `bridge.config.get()` | `GET /api/config` | config.handler.ts:5 |
| `config:set` | `bridge.config.set(patch)` | `PATCH /api/config` | config.handler.ts:9 |
| `config:reset` | `bridge.config.reset()` | `POST /api/config/reset` | config.handler.ts:13 |
| 静态图片 | `file://<path>` | `GET /api/images/:filename` | ★ 新增 |
| `app:getVersions` 等 | `bridge.app.*` | `GET /api/meta` | app.handler.ts(精简) |
| `window:*` | `bridge.window.*` | **删除** | — |
| `store:*` | `bridge.store.*` | **删除** | — |
| `file:selectFile` | `bridge.file.selectFile()` | **前端 `<input type=file>`** | — |
| `file:readFile/writeFile` | `bridge.file.readFile/writeFile` | **删除**(无 UI 依赖) | — |

---

## 4. 页面结构合理化(核心改进)

### 4.1 现状问题
1. **Tab 切换是命令式状态** (`App.tsx:9` 的 `useState<TabKey>`)— 无 URL,不可分享/刷新丢失、无浏览器历史。
2. **预览弹窗重复实现两次** — `ChatBubble.tsx:79` 和 `GalleryPage.tsx:93` 各写一套 overlay + 右键菜单 + 保存/复制,逻辑重复。
3. **导航写死移动端底部栏** — 桌面端仍是底部 Tab(`App.css` 90vh/10vh 布局),未利用 `useResponsive`(该 hook 已存在却几乎没被消费)。
4. **图片路径硬编码 `file://`** — `ChatBubble.tsx:67`、`GalleryPage.tsx:75`,与 Electron 绑死。
5. **ChatPage 职责过重** — 一个组件同时管:历史加载/防抖持久化/滚动/发送/清空。

### 4.2 改进方案
| 改进项 | 方案 |
|---|---|
| ★ 路由化 | 引入 `react-router-dom`,`/chat`、`/gallery`、`/settings`。`App.tsx` 仅做 `<Outlet/>` 布局。可刷新、可分享、可前进后退。 |
| ★ 响应式导航 | 桌面端(`isDesktop`)用左侧 `Sidebar`,移动端(`isMobile`)用底部 `MobileTabBar`。真正消费 `useResponsive`。 |
| ★ 抽取 ImageModal | 统一到 `components/common/ImageModal.tsx`:大图预览 + 右键菜单(复制/下载)。Chat 和 Gallery 共用,消除重复。 |
| ★ 图片 URL 工具 | `lib/imageUrl.ts`:`toImageUrl(filename)` → `/api/images/:filename`。一处替换 `file://`。 |
| ★ ChatPage 拆分 | 拆为 `ChatList`(渲染+滚动)、`ChatInput`(输入+图片)、`features/chat/useChat`(数据逻辑 hook),Page 只做组合。 |
| ★ 设计令牌外移 | `App.css` 的 `:root` 令牌抽到 `styles/tokens.css`,各页 CSS `@import`。 |

---

## 5. 分阶段迁移步骤

### 阶段 1:后端骨架(可直接验证 API)
1. 初始化 `server/`(Express + TS + tsx 热重载)。
2. 平移 `main/services/qwen.api.ts` → `server/src/services/qwen.api.ts`(几乎原样)。
3. 改造 `config.service.ts`:去掉 `app.getPath`,改用 `env.DATA_DIR`。
4. 新增 `storage.service.ts`:封装 `images/` 目录读写、下载图、安全路径校验(沿用 `chat.handler.ts:153` 的 `startsWith` 思路,但基于 `path.resolve` 防穿越)。
5. 实现 REST 路由(见 §3 表);统一错误中间件,返回 `{success, data, error}` 保持与原 bridge 响应结构一致。
6. `.env.example`:定义 `PORT`、`DATA_DIR`、`DASHSCOPE_API_KEY`、`DASHSCOPE_BASE_URL`、模型名等。
7. 静态托管 `data/images/` → `GET /api/images/:filename`。
8. 用 `scripts/test-qwen.ts` 思路写后端冒烟脚本验证千问链路。

**关键:密钥模型变更** — 原 config.json 存 `apiKey`(`config.service.ts:24`)。迁移后 `.env` 优先,`config.json` 仅存非敏感项(模型名、baseUrl、systemPrompt)。`/api/config` 的 `GET` 响应**不返回 apiKey**,只回 `hasKey: boolean`。

### 阶段 2:前端骨架
1. 初始化 `client/`(Vite React-TS 模板)。
2. `lib/http.ts`:封装 `fetch`,自动 JSON 解析、抛错(对齐原 `bridge.ts:25` 的 `success` 校验)。
3. `vite.config.ts` 配 dev 代理:把 `/api` 转发到 `http://localhost:<PORT>`,解决开发期跨域。
4. `features/*/api.ts`:按 §3 映射逐个实现调用函数,签名对齐原 `bridge` 命名空间。
5. `lib/imageUrl.ts`:统一图片 URL 生成。
6. 迁移 `components/common/Icon.tsx`、`hooks/useResponsive.ts`(原样可用)。
7. 抽 `styles/tokens.css`(从 `App.css:7-19` 提取令牌)。

### 阶段 3:页面重构(逐页)
1. **ChatRoute**:`features/chat/useChat.ts`(loadHistory/防抖 save/send)+ `ChatList` + `ChatInput` + `ChatPage` 组合。
   - 图片上传:`ChatInput` 改 `<input type="file" accept="image/*">` + `FileReader` 生成 base64(替代 `bridge.file.selectFile` + `readBase64`)。
   - 粘贴图片:原 `handlePaste`(`ChatInput.tsx:38`)浏览器原生,可直接保留。
   - 生成图显示:`ChatBubble` 用 `toImageUrl()` 替换 `file://`。
2. **GalleryRoute**:`features/gallery/useGallery.ts` + `GalleryPage`,复用 `ImageModal`。
3. **SettingsRoute**:`features/settings/useSettings.ts` + `SettingsPage`。
   - API Key 字段:改为「密钥在服务端 .env」说明 + 只读 `hasKey` 状态;或在「允许 UI 配置密钥」时 `POST` 到后端(后端写 `.env` 或 config.json)。
4. **AppShell**:`react-router` 布局 + `useResponsive` 决定 Sidebar/MobileTabBar。

### 阶段 4:裁剪 Electron 残留
- 删除 `window:*`、`store:*`、`file:selectFile/readFile/writeFile`、`app:getPath` 相关代码。
- 删除 `main.ts`(窗口)、`preload.ts`、`webpack.main.config.js`、`electron` 依赖。
- `index.html` 的 CSP(`src/renderer/index.html:6`)调整为生产部署 CSP。

### 阶段 5:验证与收尾
- 类型检查:`client` 与 `server` 各自 `tsc --noEmit`。
- 联调:启动后端 → `vite dev` → 走通「配置 → 对话生图 → 图库查看 → 下载/复制」全链路。
- 测试:把 `autoShoes` 的 jest 配置思路迁到 server 侧(`qwen.api` 单测)。
- README:记录启动方式(分起前后端 / 一条脚本)。
- `.gitignore`:`data/`、`.env`、`*/node_modules`、`*/dist`。

---

## 6. 响应结构约定(保持兼容)

为减少前端改动,后端统一返回原 bridge 的信封:
```ts
// shared/types/api.ts
interface ApiEnvelope<T> { success: boolean; data?: T; error?: string }
```
`lib/http.ts` 解包后抛错,前端业务代码拿到的就是 `data`——与原 `invoke<T>()`(`bridge.ts:20`)行为一致。

---

## 7. 安全注意(迁移时必须处理)

1. ⚠️ **轮换泄露的密钥** — `shoes/demo/image.py:24` 硬编码了真实 API Key(`sk-767cd0...`)。该密钥已暴露在文件中,**迁移前应到阿里云百炼控制台吊销并重新生成**,新密钥仅入 `.env`(不入库、不写死)。
2. **路径穿越防护** — `image:delete` 原用 `startsWith`(`chat.handler.ts:153`)较弱,迁移时改用 `path.resolve` 后比较前缀,严格限定在 `data/images/` 内。
3. **文件名安全** — 生成图落盘用随机名(已有 `Date.now()+random`),上传参考图同理,禁止用用户原始文件名直接写盘。
4. **API Key 不下发前端** — `/api/config` GET 不回明文密钥。
5. **上传大小限制** — multer 加 `limits.fileSize`,防超大文件。
6. **CORS** — 生产部署若前后端不同源,显式配置允许的 Origin。

---

## 8. 迁移对照速查(逐文件)

| autoShoes 源文件 | 去向 | 处理 |
|---|---|---|
| `main/main.ts` | — | 删除 |
| `main/preload.ts` | — | 删除 |
| `main/ipc/bridge.ts` | `server/src/index.ts` | Router 注册 + 错误中间件 |
| `main/ipc/handlers/chat.handler.ts` | `server/src/routes/chat.routes.ts` + `services/storage.service.ts` | 拆分:路由/存储 |
| `main/ipc/handlers/config.handler.ts` | `server/src/routes/config.routes.ts` | 平移 |
| `main/ipc/handlers/file.handler.ts` | 部分前端、部分 `image.routes.ts` | 拆解:dialog/read→前端,copy/save→静态 |
| `main/ipc/handlers/store.handler.ts` | — | 删除 |
| `main/ipc/handlers/window.handler.ts` | — | 删除 |
| `main/ipc/handlers/app.handler.ts` | `server/src/routes/meta.routes.ts` | 精简 |
| `main/services/config.service.ts` | `server/src/services/config.service.ts` | 去 electron 依赖 |
| `main/services/api/qwen.api.ts` | `server/src/services/qwen.api.ts` | 原样 |
| `renderer/bridge.ts` | `client/src/features/*/api.ts` + `lib/http.ts` | 拆分 |
| `renderer/App.tsx` | `client/src/App.tsx` | Router 重写 |
| `renderer/components/layout/TabBar.tsx` | `client/src/components/layout/MobileTabBar.tsx` + `Sidebar.tsx` | 响应式拆分 |
| `renderer/components/chat/*` | `client/src/pages/chat/*` + `features/chat/*` | 拆数据/UI |
| `renderer/components/gallery/GalleryPage.tsx` | `client/src/pages/gallery/*` | 复用 ImageModal |
| `renderer/components/settings/SettingsPage.tsx` | `client/src/pages/settings/*` | 改密钥模型 |
| `renderer/components/common/Icon.tsx` | `client/src/components/common/Icon.tsx` | 原样 |
| `renderer/hooks/useResponsive.ts` | `client/src/hooks/useResponsive.ts` | 原样,真正消费 |
| `renderer/components/chat/ChatBubble.tsx` (预览) + `gallery/GalleryPage.tsx` (预览) | `client/src/components/common/ImageModal.tsx` | 合并去重 |
| `webpack.renderer.config.js` | `vite.config.ts` | 替换 |
| `webpack.main.config.js` | — | 删除 |
| `scripts/test-qwen.ts` | `server/scripts/test-qwen.ts` | 改读 .env |
| `docs/*` | `shoes/docs/*` | 保留 |

---

## 9. 建议执行顺序与验收点

1. **后端先行** → 用 curl/REST 客户端验证 `POST /api/chat/generate` 能跑通千问并落盘图片。
2. **前端 http 层** → `lib/http.ts` + 一个 `features/chat` 调用,确认 dev 代理通。
3. **Chat 全链路** → 上传参考图 → 生图 → 显示 → 历史持久化。
4. **Gallery + ImageModal** → 列表/删除/预览/下载/复制。
5. **Settings** → 配置读写 + 密钥状态显示。
6. **响应式导航** → 桌面 Sidebar / 移动 TabBar。
7. **清理 + 类型检查 + README**。

每个验收点的硬指标:该路径下无 Electron import、无 `file://`、无 `window.electronAPI`、`tsc --noEmit` 通过。
