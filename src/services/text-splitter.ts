import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export interface TextChunk {
  content: string;
  chunkIndex: number;
  metadata?: Record<string, unknown>;
}

/**
 * 将文本切分为适合 Embedding 的片段
 */
export async function splitText(
  text: string,
  options?: {
    chunkSize?: number;
    chunkOverlap?: number;
  }
): Promise<TextChunk[]> {
  const { chunkSize = 500, chunkOverlap = 50 } = options || {};

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: ["\n\n", "\n", "。", ".", "！", "!", "？", "?", "；", ";", " ", ""],
  });

  const docs = await splitter.createDocuments([text]);

  return docs.map((doc, index) => ({
    content: doc.pageContent,
    chunkIndex: index,
    metadata: doc.metadata as Record<string, unknown>,
  }));
}
