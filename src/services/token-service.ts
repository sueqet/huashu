/**
 * Token 数估算（不再内置 tiktoken 词表：它占了安装包的大头，且只对 OpenAI 模型精确）
 *
 * 按字符估算，宁多勿少，用于上下文预算和章节切换阈值：
 * - 非 ASCII（中文、日文等）约 1.5 token/字
 * - ASCII 约 0.25 token/字符
 */
export function countTokens(text: string): number {
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

/** OpenAI Vision 格式的内容部分 */
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/** 估算单条消息 content 的 token 数 */
function countContentTokens(content: string | ContentPart[]): number {
  if (typeof content === "string") {
    return countTokens(content);
  }
  let total = 0;
  for (const part of content) {
    if (part.type === "text") {
      total += countTokens(part.text);
    } else {
      // 图片 token 估算（OpenAI low-detail: 85, high-detail: 765）
      total += 765;
    }
  }
  return total;
}

/**
 * 计算消息数组的总 Token 数（包含角色标记的开销）
 */
export function countMessagesTokens(
  messages: Array<{ role: string; content: string | ContentPart[] }>
): number {
  let total = 0;
  for (const msg of messages) {
    total += countContentTokens(msg.content);
    total += 4; // 每条消息的角色和格式开销
  }
  total += 2; // 对话起始/结束标记
  return total;
}
