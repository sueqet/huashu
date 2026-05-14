import { useState, useEffect, useCallback } from "react";
import type { Attachment } from "@/types";
import { attachmentService } from "@/services/attachment-service";
import { getAttachmentPreviewKind, type AttachmentPreviewKind } from "@/services/attachment-preview";
import { Sheet } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Copy, Check, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface AttachmentViewerDetail {
  attachment?: Attachment;
  projectId?: string;
  type?: "image";
  src?: string;
  alt?: string;
}

export function AttachmentViewerSheet() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<AttachmentViewerDetail | null>(null);
  const [imageSrc, setImageSrc] = useState("");
  const [docText, setDocText] = useState("");
  const [docHtml, setDocHtml] = useState("");
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpen = useCallback((e: Event) => {
    const d = (e as CustomEvent<AttachmentViewerDetail>).detail;
    if (!d) return;
    setDetail(d);
    setOpen(true);
    setDownloaded(false);
    setError(null);

    if (d.attachment && d.projectId) {
      setLoading(true);
      setImageSrc("");
      setDocText("");
      setDocHtml("");
      setPdfPages([]);

      void (async () => {
        const attachment = d.attachment!;
        const previewKind = attachment.previewKind || getAttachmentPreviewKind(
          attachment.type,
          attachment.filename,
          attachment.mimeType
        );

        if (previewKind === "image") {
          setImageSrc(await attachmentService.readAttachmentData(d.projectId!, attachment));
        } else if (previewKind === "pdf" && attachment.originalFilePath) {
          setPdfPages(await renderPdfPages(d.projectId!, attachment));
        } else if (previewKind === "docx" && attachment.originalFilePath) {
          setDocHtml(await renderDocxHtml(d.projectId!, attachment));
          setDocText(await attachmentService.readAttachmentData(d.projectId!, attachment));
        } else {
          setDocText(await attachmentService.readAttachmentData(d.projectId!, attachment));
        }
        setLoading(false);
      })().catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn("加载附件预览失败", {
          projectId: d.projectId,
          attachmentId: d.attachment?.id,
          filename: d.attachment?.filename,
          filePath: d.attachment?.filePath,
          error: err,
        });
        setError(message);
        setImageSrc("");
        setDocText("");
        setDocHtml("");
        setPdfPages([]);
        setLoading(false);
      });
    } else if (d.src) {
      setImageSrc(d.src);
      setDocText("");
      setDocHtml("");
      setPdfPages([]);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("open-attachment-viewer", handleOpen);
    return () => window.removeEventListener("open-attachment-viewer", handleOpen);
  }, [handleOpen]);

  const isImage = detail?.attachment
    ? detail.attachment.type === "image"
    : detail?.type === "image";

  const previewKind: AttachmentPreviewKind | undefined = detail?.attachment
    ? detail.attachment.previewKind || getAttachmentPreviewKind(
        detail.attachment.type,
        detail.attachment.filename,
        detail.attachment.mimeType
      )
    : detail?.type;

  const filename = detail?.attachment?.filename || detail?.alt || "";
  const size = detail?.attachment?.size;

  const handleDownload = useCallback(async () => {
    if (!detail?.attachment || !detail.projectId) return;

    const savePath = await save({
      defaultPath: detail.attachment.filename,
    });
    if (!savePath) return;

    const bytes = await attachmentService.readAttachmentBytes(
      detail.projectId,
      detail.attachment
    );
    await writeFile(savePath, bytes);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2000);
  }, [detail]);

  const handleImageError = useCallback(() => {
    const message = `无法解码图片: ${filename || "attachment"}`;
    console.warn("附件预览图片解码失败", {
      projectId: detail?.projectId,
      attachmentId: detail?.attachment?.id,
      filename,
      mimeType: detail?.attachment?.mimeType,
      filePath: detail?.attachment?.filePath,
    });
    setError(message);
    setImageSrc("");
  }, [detail, filename]);

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      size={isImage ? "lg" : "md"}
      title={filename || "Attachment preview"}
      resizable
      defaultWidth={isImage ? 720 : 620}
      minWidth={360}
      maxWidth={1100}
    >
      {loading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" title={error}>
          加载失败
        </div>
      )}

      {!loading && !error && isImage && imageSrc && (
        <div className="flex flex-col gap-3">
          <img
            src={imageSrc}
            alt={filename}
            className="max-w-full rounded-lg"
            onError={handleImageError}
          />
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-3 min-w-0">
              {filename && <span className="truncate">{filename}</span>}
              {size && <span>{(size / 1024).toFixed(1)} KB</span>}
            </div>
            {detail?.attachment && (
              <Button variant="outline" size="sm" onClick={handleDownload}>
                {downloaded ? (
                  <Check className="h-3.5 w-3.5 mr-1" />
                ) : (
                  <Download className="h-3.5 w-3.5 mr-1" />
                )}
                {downloaded ? "Saved" : "Download"}
              </Button>
            )}
          </div>
        </div>
      )}

      {!loading && !error && !isImage && previewKind === "pdf" && pdfPages.length > 0 && (
        <PdfViewer
          pages={pdfPages}
          filename={filename}
          onDownload={detail?.attachment ? handleDownload : undefined}
          downloaded={downloaded}
        />
      )}

      {!loading && !error && !isImage && previewKind === "docx" && docHtml && (
        <DocxViewer
          html={docHtml}
          text={docText}
          filename={filename}
          onDownload={detail?.attachment ? handleDownload : undefined}
          downloaded={downloaded}
        />
      )}

      {!loading && !error && !isImage && docText && (previewKind === "text" || !detail?.attachment?.originalFilePath) && (
        <DocumentViewer
          text={docText}
          filename={filename}
          legacy={previewKind !== "text" && !detail?.attachment?.originalFilePath}
          onDownload={detail?.attachment ? handleDownload : undefined}
          downloaded={downloaded}
        />
      )}
    </Sheet>
  );
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

async function renderPdfPages(projectId: string, attachment: Attachment): Promise<string[]> {
  const bytes = await attachmentService.readAttachmentBytes(projectId, attachment);
  const loadingTask = pdfjs.getDocument({ data: toArrayBuffer(bytes) });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  try {
    const pageCount = Math.min(pdf.numPages, 8);
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.25 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) continue;

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      pages.push(canvas.toDataURL("image/png"));
    }
  } finally {
    await pdf.destroy();
  }

  return pages;
}

async function renderDocxHtml(projectId: string, attachment: Attachment): Promise<string> {
  const bytes = await attachmentService.readAttachmentBytes(projectId, attachment);
  const mammoth = await import("mammoth");
  const result = await mammoth.convertToHtml({ arrayBuffer: toArrayBuffer(bytes) });
  return result.value;
}

function DocumentViewer({
  text,
  filename,
  legacy,
  onDownload,
  downloaded,
}: {
  text: string;
  filename: string;
  legacy?: boolean;
  onDownload?: () => void;
  downloaded?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span>{filename}</span>
          <span>{(new TextEncoder().encode(text).length / 1024).toFixed(1)} KB</span>
          {legacy && <span className="text-[11px]">旧附件文本预览</span>}
        </div>
        <div className="flex items-center gap-1">
          {onDownload && (
            <Button variant="ghost" size="sm" onClick={onDownload}>
              {downloaded ? <Check className="h-3.5 w-3.5 mr-1" /> : <Download className="h-3.5 w-3.5 mr-1" />}
              {downloaded ? "Saved" : "Download"}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1 max-h-[70vh]">
        <pre className="text-sm font-mono whitespace-pre-wrap break-words text-foreground/90 leading-relaxed">
          {text}
        </pre>
      </ScrollArea>
    </div>
  );
}

function PdfViewer({
  pages,
  filename,
  onDownload,
  downloaded,
}: {
  pages: string[];
  filename: string;
  onDownload?: () => void;
  downloaded?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4 shrink-0" />
          <span className="truncate">{filename}</span>
          <span>{pages.length} page{pages.length === 1 ? "" : "s"}</span>
        </div>
        {onDownload && (
          <Button variant="ghost" size="sm" onClick={onDownload}>
            {downloaded ? <Check className="h-3.5 w-3.5 mr-1" /> : <Download className="h-3.5 w-3.5 mr-1" />}
            {downloaded ? "Saved" : "Download"}
          </Button>
        )}
      </div>
      <ScrollArea className="flex-1 max-h-[78vh]">
        <div className="space-y-4 pr-3">
          {pages.map((src, index) => (
            <img
              key={index}
              src={src}
              alt={`${filename} page ${index + 1}`}
              className="w-full rounded border bg-white"
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function DocxViewer({
  html,
  text,
  filename,
  onDownload,
  downloaded,
}: {
  html: string;
  text: string;
  filename: string;
  onDownload?: () => void;
  downloaded?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4 shrink-0" />
          <span className="truncate">{filename}</span>
        </div>
        <div className="flex items-center gap-1">
          {onDownload && (
            <Button variant="ghost" size="sm" onClick={onDownload}>
              {downloaded ? <Check className="h-3.5 w-3.5 mr-1" /> : <Download className="h-3.5 w-3.5 mr-1" />}
              {downloaded ? "Saved" : "Download"}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1 max-h-[78vh]">
        <div
          className="prose prose-sm max-w-none rounded border bg-background p-4 text-foreground"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </ScrollArea>
    </div>
  );
}
