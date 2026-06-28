/* ═══════════════════════════════════════════
   配置服务 — 替代 main/services/config.service.ts
   - .env 的 DASHSCOPE_API_KEY 优先级最高
   - data/config.json 存非敏感项 + 可选的密钥
   - 对外(GET)永不返回明文密钥,仅返回 hasApiKey
   ═══════════════════════════════════════════ */

import path from 'node:path';
import type { AppConfig, AppConfigPatch } from '@shared/types';
import { storage } from './storage.service';
import { logger } from '../utils/logger';

interface StoredConfig {
  baseUrl: string;
  apiKey: string;
  multimodalModel: string;
  imageModel: string;
  systemPrompt: string;
}

const DEFAULTS: StoredConfig = {
  baseUrl: 'https://dashscope.aliyuncs.com',
  apiKey: '',
  multimodalModel: 'qwen3.6-plus',
  imageModel: 'qwen-image-2.0-pro-2026-04-22',
  systemPrompt: `你是鞋类电商商品图助手。你能正常对话,也能调用 generate_image 工具产出或修改商品图。

## 一、什么情况必须生图(调用 generate_image 工具)
只要用户的话里出现"要图"的意图,**必须直接调用 generate_image 工具去产出图片**,严禁用文字把 Prompt 写出来当回复、严禁反问、严禁确认。
"要图"意图包括以下任一表述(出现即触发):
- "帮我生成一个/一双/一张…""我要生成…""给我生成…""生成一个/一双…"
- "画一个/一双…""做一个/做一张…""设计一款…""来一张…""出一张图…"
- 附参考图 + "改成/换成/调整/再来一张/换个颜色"
举例(全部必须调 generate_image,不要只回文字):
- "帮我生成一双网面运动鞋,精简风,日常通勤" → 调 generate_image
- "我要生成一双黑色皮靴,复古风" → 调 generate_image
- "帮我生成一个白色老爹鞋" → 调 generate_image
- (带参考图)"把鞋底换成棕色" → 调 generate_image,设 based_on_last=true

调用时:prompt 参数写成完整中文生图描述,必含 产品类型、颜色、材质、视角、风格、纯白背景、柔光箱照明、高清;基于上一张调整时设 based_on_last=true;多张用 count。

## 一·五、改图规则(关键:只改指定处,其余保持不变)
当用户基于参考图/上一张要求修改(改成/换成/调整/换个…/再来一张但要改某处)时:
1. **必须设 based_on_last=true**,以原图为基础。
2. prompt 的写法 = **先完整复述原鞋的全部特征(款式、配色、材质、构图、视角、背景、光照,全部照旧)**,再**仅追加用户要求的那一处改动**,并在末尾强调"**除上述改动外,其余一切(款式、颜色、材质、构图、视角、背景、光影)完全保持原样,不得整体重新设计**"。
3. **严禁整体重画**:不要因为用户改一处就把整双鞋的款式、配色、构图都换掉。用户的改动词之外的特征,逐字保留。
4. 改颜色/材质:只替换对应词,其余照搬;改局部(如鞋底、鞋带、logo):保留整体,只描述该局部的变化。
正确示例:原图是红色网面运动鞋 + 用户"把鞋底改成棕色" →
prompt = "一双红色网面运动鞋,网面鞋面,白色中底(保持原款式、红色鞋面、网面材质、构图、视角、纯白背景、柔光箱照明均不变),仅将鞋底改为棕色,其余部分完全保持原样,高清产品摄影"
错误示例:用户说"鞋底改棕色",却生成了一双全新款式/配色的鞋 —— 严禁。

## 二、什么情况只回文字(不调工具)
仅当用户**没有**上述要图表述时:征求意见、求推荐、问知识/功能、闲聊、讨论设计、只给一个词。
- "网面运动鞋适合通勤吗?" → 文字
- "这个设计怎么样?" → 文字
- "给我一些配色建议" → 文字
- "红色运动鞋"(只一个词、无要图动词) → 文字并反问

判定要点:看是否有"生成/画/做一个/一张/一双/我要生成"等要图动词——有就生图,没有就文字。**绝不能用文字写出 Prompt 来代替生图。**

## 三、Prompt 对用户默认隐藏(重要)
- generate_image 的 prompt 参数是**内部参数**,默认**绝对不要**把它作为文字回复展示给用户。
- 你给用户的可见回复(content),生图时只用**一句自然话**说明在做什么,例如:"好的,正在为你生成一双精简风网面运动鞋。"——简短即可,不要复述 prompt、不要罗列参数、不要写【】标记。
- **只有当用户明确要求查看 Prompt 时**(如"提示词是什么/给我看 prompt/输出 prompt/把提示词给我"),才把当前或最近一次的生图 Prompt 作为文字回复给用户。

## 四、输出
- 生图:content 用一句话自然说明(不暴露 prompt);不要输出【】、"模式"等标记。
- 不生图:content 即完整回复。
- **严禁伪造**:绝不要在文字里写出"🎨 生图提示词""✅ 已生成 N 张"等格式化句子来假装已生图。要生图就必须调用 generate_image 工具;没调用工具就等于没生图,不得声称已生成。`,
};

function configPath(): string {
  return path.join(storage.dataDir, 'config.json');
}

function loadStored(): StoredConfig {
  const raw = storage.readJSON<Partial<StoredConfig>>(configPath(), {});
  return {
    baseUrl: raw.baseUrl ?? DEFAULTS.baseUrl,
    apiKey: raw.apiKey ?? DEFAULTS.apiKey,
    multimodalModel: raw.multimodalModel ?? DEFAULTS.multimodalModel,
    imageModel: raw.imageModel ?? DEFAULTS.imageModel,
    systemPrompt: raw.systemPrompt ?? DEFAULTS.systemPrompt,
  };
}

function saveStored(cfg: StoredConfig): void {
  storage.writeJSON(configPath(), cfg);
}

/** 当前生效的 API Key:前端(设置页→config.json)优先;前端未提供则回退到 .env */
export function getActiveApiKey(): string {
  const stored = loadStored().apiKey;
  return stored ? stored : readEnvKey();
}

export function hasApiKey(): boolean {
  return !!loadStored().apiKey || env_hasEnvKey();
}

/* 对外配置(GET)— 不含明文密钥,也不含提示词(提示词由后端独占配置) */
export function loadConfig(): AppConfig {
  const c = loadStored();
  return {
    qwen: { baseUrl: c.baseUrl },
    multimodalModel: c.multimodalModel,
    imageModel: c.imageModel,
    hasApiKey: hasApiKey(),
  };
}

export function updateConfig(patch: AppConfigPatch): AppConfig {
  const cur = loadStored();
  const next: StoredConfig = {
    baseUrl: patch.qwen?.baseUrl ?? cur.baseUrl,
    apiKey: patch.qwen?.apiKey ?? cur.apiKey,
    multimodalModel: patch.multimodalModel ?? cur.multimodalModel,
    imageModel: patch.imageModel ?? cur.imageModel,
    systemPrompt: cur.systemPrompt, // 提示词不从前端更新,保留后端配置
  };
  saveStored(next);
  logger.info('config', '配置已更新', {
    baseUrl: next.baseUrl,
    multimodalModel: next.multimodalModel,
    imageModel: next.imageModel,
    apiKeyChanged: patch.qwen?.apiKey ? true : undefined,
  });
  return loadConfig();
}

export function resetConfig(): AppConfig {
  saveStored({ ...DEFAULTS });
  logger.info('config', '配置已重置为默认值');
  return loadConfig();
}

/* ── 内部读取(供 qwen 调用) ── */
export function loadFullConfig(): StoredConfig {
  return loadStored();
}

/* env 读取独立函数(便于覆盖/测试) */
function env_hasEnvKey(): boolean {
  return process.env.DASHSCOPE_API_KEY !== undefined && process.env.DASHSCOPE_API_KEY !== '';
}
function readEnvKey(): string {
  return process.env.DASHSCOPE_API_KEY ?? '';
}
