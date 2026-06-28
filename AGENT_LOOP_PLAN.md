# 实现方案:模型驱动的多轮智能体循环(SSE + function_call + 自动续跑)

> 三项决策已定:① **自动续跑**,每轮依据历史消息对图片做调整;② **function_call** 决定生图,占位图由 SSE 事件驱动;③ **SSE 流式**传输。
> 生图与否完全由模型决定;对话为主,生图为辅且触发式。

---

## 一、总体架构

```
用户发送(单个发送按钮)
   │  POST /api/chat/stream  (text/event-stream)
   ▼
┌──────────── 后端 Agent Loop Runner ────────────┐
│  上下文 = 会话历史 + 历史图片描述 + 本回合 scratchpad │
│  for round in 1..MAX_ROUNDS:                    │
│    ① 调模型(tools=[generate_image, finish])     │
│       - 文本部分 → 流式 text 事件(可 token 级)   │
│    ② 若调用 generate_image:                     │
│       - 发 image_start(slot)  → 前端占位         │
│       - 依据 based_on_last 加载上张图作参考       │
│       - generateImages → 落盘 → filename         │
│       - 发 image_ready(slot,name) → 替换占位     │
│       - 工具结果回喂 scratchpad → 进入下一轮(续跑) │
│    ③ 若调用 finish 或无工具调用 → 跳出            │
│  持久化:1 条用户消息 + 1 条聚合助手消息           │
│  发 done 事件(最终 content + 全部 images)        │
└─────────────────────────────────────────────────┘
```

**续跑机制**:无需独立 `needMore` 标志——模型在下一轮**再次调用 `generate_image`** 即等于续跑;调用 `finish` 或不调工具即终止。每轮的生图 prompt 自然包含"基于上一张做 X 调整"(模型读历史)。

---

## 二、SSE 事件协议(前后端契约)

> 每个事件:`event: <type>\ndata: <json>\n\n`。前端按 `slot` 关联占位与成品。

| event | data | 前端行为 |
|---|---|---|
| `meta` | `{sessionId, round?}` | 建立关联;开始"思考中"态 |
| `text` | `{delta?:string, text?:string}` | 追加到流式助手消息(token 级 delta 或整段 text) |
| `image_start` | `{slot:string, round:number, count?:number}` | 插入**占位图卡**(骨架/spinner),按 slot 记录 |
| `image_ready` | `{slot:string, name:string}` | 占位 → 真实图(`/api/images/name`) |
| `image_error` | `{slot:string, error:string}` | 占位 → 错误态,可保留文字 |
| `done` | `{sessionId, content, images:string[], count}` | 定型助手消息(文字+图),加入消息列表 |
| `error` | `{message:string}` | 显示错误,结束流 |

> 占位图是 SSE 驱动,与 function_call 解耦:`image_start` 在**工具执行开始**时发,`image_ready` 在落盘后发。

---

## 三、Function / Tool 定义

向千问 `/compatible-mode/v1/chat/completions` 注册 `tools`:

```
generate_image:
  描述:生成或调整一张鞋类商品图。仅在确实需要产出/修改图片时调用。
  参数:
    prompt: string       // 已含调整意图的中文生图 prompt
    count?: number       // 张数,默认 1
    based_on_last?: boolean  // true=基于上一张生成图做图生图调整

finish:
  描述:不再生成更多图片,结束本轮(给出收尾文字即可用普通 content)。
  参数: { } (无参)
```

- 模型每轮可同时返回 `content`(对话文字)+ `tool_calls`(0 或多个 generate_image)。
- **对话为主**:咨询/建议类模型只回 content、不调工具 → 直接 finish,**零生图成本**。

> ⚠️ 前置验证:确认 `multimodalModel`(如 qwen-plus)在该端点支持 `tools`;不支持则退回 `response_format:{type:'json_object'}` + 提示词内 JSON schema(逻辑等价,稳定性略低)。

---

## 四、后端改动(基于现有文件)

| 现状文件 | 改动 |
|---|---|
| `routes/chat.routes.ts` | **新增 `POST /stream`(SSE)**;`/generate` 可保留兼容或移除 |
| **新增 `services/agent.runner.ts`** | 循环编排器:调模型→解析 tool_calls→执行→回喂→终止;带 `MAX_ROUNDS=5`、`MAX_IMAGES=6`、总超时 |
| `services/qwen.api.ts` | `multimodalRefine` 增加 `tools`/`stream` 参数;新增"调用模型取决策(含 tool_calls)"的封装 |
| `services/storage.service` | 新增 `readImageBase64(name)`:加载历史图作图生图参考 |
| `services/session.service` | 新增"读取最近一张生成图文件名"helper,供 `based_on_last` |
| `services/config.service.ts` | 提示词改为**智能体人设**(讲清工具、何时调用 generate_image 的判定准则);保留后端独占 |
| `middleware/error.ts` | SSE 通道内异常 → 发 `error` 事件而非 JSON |

**图生图调整(D1)**:`based_on_last=true` 时,runner 取上一张生成图 filename → `readImageBase64` → 作为 `refImageBase64` 传入 `generateImages`,实现"依据历史对图做调整"。

**持久化**:循环结束后只写 **1 条用户消息 + 1 条聚合助手消息**(content=聚合文字, generatedImages=全部 filename);中间轮 thought/工具结果仅存于本回合临时 scratchpad,不落盘。

---

## 五、前端改动(基于现有文件)

| 文件 | 改动 |
|---|---|
| **新增 `lib/sse.ts`** | SSE 客户端:`fetch` + `ReadableStream` 读取 + 解析 `text/event-stream`,回调各 event |
| `features/chat/chatApi.ts` | 新增 `streamMessage(params, handlers)`;移除/弱化旧 `generateImage` |
| `features/chat/useChat.ts` | `send` 改为开流;维护"流式助手消息":text 追加、image_start 占位、image_ready 替换、done 定型 |
| `pages/chat/ChatBubble.tsx` | `generatedImages` 支持**占位态**(`{placeholder, slot}`);占位渲染骨架,ready 渲染真图 |
| `pages/chat/ChatPage.tsx` | 单个发送按钮触发流(无单独"生成"按钮——生图由模型决定);状态文案"思考中…" |
| `pages/chat/ChatInput.tsx` | 维持单发送;可保留参考图上传(作为本轮视觉上下文) |

**占位渲染**:ChatBubble 的图片项变为联合类型 `{kind:'placeholder', slot} | {kind:'image', name}`;`image_ready` 按 slot 替换。

---

## 六、最终响应与类型

- 运行期靠 SSE 事件;`done` 事件即最终结果,无需另起 JSON 响应。
- 共享类型调整:移除 `ChatGenerateResponse.mode`;新增 SSE 事件类型(可放 `shared/types/stream.d.ts`)。`done` 的 payload:`{sessionId, content, images, count}`。

---

## 七、预算与安全

- `MAX_ROUNDS`(默认 5)、`MAX_IMAGES_PER_TURN`(默认 6)硬上限,防失控烧钱。
- 单回合总超时;超时发 `error` 并以已产出部分 `done` 收尾。
- 取消通道:前端 `AbortController` 终止流;后端检测断连即停循环。
- 每轮 JSON/tool 决策落日志,便于调试误判。

---

## 八、分阶段实施(每阶段可编译验证)

1. **模型能力验证**:用真实 Key 确认 `multimodalModel` 支持 `tools`;定 function_call / json_object 路线。
2. **后端 runner + tool 调用**:实现 `agent.runner.ts`(先非流式、单轮跑通决策→生图)。
3. **多轮续跑 + 图生图调整**:加循环、`based_on_last`、scratchpad、预算上限。
4. **SSE 通道**:`/stream` 端点 + 事件协议 + 占位事件;token 级 text 流(可选先整段)。
5. **前端 SSE 消费 + 占位渲染**:`lib/sse.ts`、`useChat` 流式、ChatBubble 占位态。
6. **持久化 + 错误/超时/取消**;类型更新;typecheck + build。

---

## 九、保持不变

会话机制、图库、图片静态访问、设置(含 localStorage 缓存)、密钥托管、提示词后端独占、路径安全、`ImageModal` 复用——均沿用。

---

## 十、一句话方案

> 单发送 → 后端 agent 循环(模型用 `generate_image`/`finish` 工具自决生图与续跑,每轮可基于上张图调整)→ SSE 流式推 `text`/`image_start`(占位)/`image_ready`/`done` → 前端实时渲染文字与占位→成图;对话类不调工具即零生图,实现"对话为主、生图触发式"。

> 唯一前置:确认所选千问模型支持 function calling(第八节第 1 步)。确认后即可按阶段实施。
