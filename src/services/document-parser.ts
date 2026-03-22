/**
 * 文档解析服务：将各类文档转为纯文本
 */

/**
 * 根据文件类型解析文档为纯文本
 */
export async function parseDocument(
  content: Uint8Array,
  filename: string
): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  switch (ext) {
    case "txt":
    case "md":
    case "csv":
    case "log":
      return new TextDecoder("utf-8").decode(content);

    case "pdf":
      return parsePDF(content);

    case "docx":
      return parseDOCX(content);

    case "html":
    case "htm":
      return parseHTML(new TextDecoder("utf-8").decode(content));

    default:
      // 尝试作为纯文本解析
      return new TextDecoder("utf-8").decode(content);
  }
}

async function parsePDF(content: Uint8Array): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfParseModule = await import("pdf-parse") as any;
  const pdfParse = pdfParseModule.default || pdfParseModule;
  const buffer = Buffer.from(content);
  const result = await pdfParse(buffer);
  return result.text;
}

async function parseDOCX(content: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({
    buffer: Buffer.from(content),
  });
  return result.value;
}

function parseHTML(html: string): string {
  // 使用 cheerio 提取文本
  const cheerio = require("cheerio") as typeof import("cheerio");
  const $ = cheerio.load(html);
  // 移除 script 和 style
  $("script, style").remove();
  return $("body").text().trim();
}

/**
 * 支持的文件类型列表
 */
export const SUPPORTED_FILE_TYPES = [
  ".txt",
  ".md",
  ".pdf",
  ".docx",
  ".html",
  ".htm",
  ".csv",
  ".log",
];
