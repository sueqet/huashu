/**
 * 文档解析服务：只支持纯文本类文档（不再解析 PDF / Word，避免引入大型依赖）
 */

/** 支持作为附件的文本文档扩展名 */
export const TEXT_DOCUMENT_EXTENSIONS = ["txt", "md", "html", "htm", "csv", "log", "json"];

function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "";
}

export function isSupportedDocument(filename: string): boolean {
  return TEXT_DOCUMENT_EXTENSIONS.includes(getExtension(filename));
}

/**
 * 将文本文档解析为纯文本；不支持的类型直接报错，避免把二进制内容当文本发给模型
 */
export async function parseDocument(
  content: Uint8Array,
  filename: string
): Promise<string> {
  if (!isSupportedDocument(filename)) {
    throw new Error(
      `不支持的文件类型：${filename}（仅支持 ${TEXT_DOCUMENT_EXTENSIONS.join("、")}）`
    );
  }

  const text = new TextDecoder("utf-8").decode(content);
  const ext = getExtension(filename);
  return ext === "html" || ext === "htm" ? parseHTML(text) : text;
}

function parseHTML(html: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll("script, style").forEach((element) => element.remove());
  return (document.body?.textContent || document.documentElement.textContent || "").trim();
}
