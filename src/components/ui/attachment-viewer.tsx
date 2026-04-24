import { useState, useEffect, useCallback } from "react";
import type { Attachment } from "@/types";
import { attachmentService } from "@/services/attachment-service";
import { Sheet } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Copy, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  const handleOpen = useCallback((e: Event) => {
    const d = (e as CustomEvent<AttachmentViewerDetail>).detail;
    if (!d) return;
    setDetail(d);
    setOpen(true);

    if (d.attachment && d.projectId) {
      setLoading(true);
      setImageSrc("");
      setDocText("");

      attachmentService.readAttachmentData(d.projectId, d.attachment).then((data) => {
        if (d.attachment!.type === "image") {
          setImageSrc(data);
        } else {
          setDocText(data);
        }
        setLoading(false);
      }).catch(() => {
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

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      size={isImage ? "lg" : "md"}
      title={filename || "Attachment preview"}
    >
      {loading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && isImage && imageSrc && (
        <div className="flex flex-col gap-3">
          <img
            src={imageSrc}
            alt={filename}
            className="max-w-full rounded-lg"
          />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {filename && <span>{filename}</span>}
            {size && <span>{(size / 1024).toFixed(1)} KB</span>}
          </div>
        </div>
      )}

      {!loading && !isImage && docText && (
        <DocumentViewer text={docText} filename={filename} />
      )}
    </Sheet>
  );
}

function DocumentViewer({ text, filename }: { text: string; filename: string }) {
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
        <Button variant="ghost" size="sm" onClick={handleCopy}>
          {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <ScrollArea className="flex-1 max-h-[70vh]">
        <pre className="text-sm font-mono whitespace-pre-wrap break-words text-foreground/90 leading-relaxed">
          {text}
        </pre>
      </ScrollArea>
    </div>
  );
}
