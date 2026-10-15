import { useState, useEffect, useCallback } from "react";
import type { Attachment } from "@/types";
import { attachmentService } from "@/services/attachment-service";
import { Sheet } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Copy, Check, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
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

      void (async () => {
        const attachment = d.attachment!;
        if (attachment.type === "image") {
          setImageSrc(await attachmentService.readAttachmentData(d.projectId!, attachment));
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
        setLoading(false);
      });
    } else if (d.src) {
      setImageSrc(d.src);
      setDocText("");
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

      {!loading && !error && !isImage && docText && (
        <DocumentViewer
          text={docText}
          filename={filename}
          onDownload={detail?.attachment ? handleDownload : undefined}
          downloaded={downloaded}
        />
      )}
    </Sheet>
  );
}

function DocumentViewer({
  text,
  filename,
  onDownload,
  downloaded,
}: {
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span>{filename}</span>
          <span>{(new TextEncoder().encode(text).length / 1024).toFixed(1)} KB</span>
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
