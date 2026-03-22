import { encodingForModel, type TiktokenModel } from "js-tiktoken";

/** 支持 tiktoken 精确计算的模型前缀 */
const TIKTOKEN_MODEL_MAP: Record<string, TiktokenModel> = {
  "gpt-4o": "gpt-4o",
  "gpt-4": "gpt-4",
  "gpt-3.5": "gpt-3.5-turbo",
  "o1": "o200k_base" as TiktokenModel,
  "o3": "o200k_base" as TiktokenModel,
};

/** 编码器缓存 */
const encoderCache = new Map<string, ReturnType<typeof encodingForModel>>();

function getEncoder(model: string) {
  // 找到匹配的 tiktoken 模型
  for (const [prefix, tiktokenModel] of Object.entries(TIKTOKEN_MODEL_MAP)) {
    if (model.startsWith(prefix)) {
      if (!encoderCache.has(tiktokenModel)) {
        try {
          encoderCache.set(tiktokenModel, encodingForModel(tiktokenModel));
        } catch {
          return null;
        }
      }
      return encoderCache.get(tiktokenModel)!;
    }
  }
  return null;
}

/**
 * 计算文本的 Token 数
 * - OpenAI 模型使用 tiktoken 精确计算
 * - 其他模型使用字符估算（中文 ~1.5 token/字，英文 ~0.25 token/字符）
 */
export function countTokens(text: string, model: string): number {
  const encoder = getEncoder(model);
  if (encoder) {
    return encoder.encode(text).length;
  }

  // 字符数估算
  let tokens = 0;
  for (const char of text) {
    if (char.charCodeAt(0) > 127) {
      // 非 ASCII（中文、日文等）
      tokens += 1.5;
    } else {
      tokens += 0.25;
    }
  }
  return Math.ceil(tokens);
}

/**
 * 计算消息数组的总 Token 数（包含角色标记的开销）
 */
export function countMessagesTokens(
  messages: Array<{ role: string; content: string }>,
  model: string
): number {
  let total = 0;
  for (const msg of messages) {
    total += countTokens(msg.content, model);
    total += 4; // 每条消息的角色和格式开销
  }
  total += 2; // 对话起始/结束标记
  return total;
}
