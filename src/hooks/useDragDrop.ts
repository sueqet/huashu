import { useState, useCallback } from "react";

const IMAGE_MIME_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp",
]);

const DOC_MIME_TYPES = new Set([
  "text/plain", "text/markdown", "text/html", "text/csv",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

/** 判断 MIME 类型是否受支持 */
function isSupportedMime(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.has(mimeType) || DOC_MIME_TYPES.has(mimeType);
}

interface UseDragDropOptions {
  /** 接收拖入文件的回调 */
  onFiles: (files: File[]) => void;
}

/**
 * 拖拽上传 Hook
 * 使用计数器处理嵌套 dragenter/dragleave 事件
 */
export function useDragDrop({ onFiles }: UseDragDropOptions) {
  const [isDragging, setIsDragging] = useState(false);
  let enterCount = 0;

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    enterCount++;
    if (enterCount === 1) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    enterCount--;
    if (enterCount <= 0) {
      enterCount = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    enterCount = 0;
    setIsDragging(false);

    const files: File[] = [];
    if (e.dataTransfer.files) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        if (isSupportedMime(file.type) || isSupportedByExtension(file.name)) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      onFiles(files);
    }
  }, [onFiles]);

  const dragHandlers = {
    onDragEnter: handleDragEnter,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  };

  return { isDragging, dragHandlers };
}

/** 通过文件扩展名判断是否支持 */
function isSupportedByExtension(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const supported = new Set([
    "png", "jpg", "jpeg", "gif", "webp", "bmp",
    "txt", "md", "pdf", "docx", "html", "htm", "csv", "log",
  ]);
  return supported.has(ext);
}
