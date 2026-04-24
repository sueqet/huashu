import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

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
      return new TextDecoder("utf-8").decode(content);
  }
}

function toArrayBuffer(content: Uint8Array): ArrayBuffer {
  return content.buffer.slice(
    content.byteOffset,
    content.byteOffset + content.byteLength
  ) as ArrayBuffer;
}

async function parsePDF(content: Uint8Array): Promise<string> {
  const loadingTask = pdfjs.getDocument({ data: toArrayBuffer(content) });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .filter(Boolean)
        .join(" ");
      pages.push(pageText);
    }
  } finally {
    await pdf.destroy();
  }

  return pages.join("\n\n");
}

async function parseDOCX(content: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({
    arrayBuffer: toArrayBuffer(content),
  });
  return result.value;
}

function parseHTML(html: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll("script, style").forEach((element) => element.remove());
  return (document.body?.textContent || document.documentElement.textContent || "").trim();
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
