import { useState, useEffect } from "react";
import type { Attachment } from "@/types";
import { attachmentService } from "@/services/attachment-service";
import { Loader2, FileText } from "lucide-react";

type ThumbnailSize = "node" | "input" | "chat";

const SIZE_MAP: Record<ThumbnailSize, string> = {
  node: "h-12 w-12",
  input: "h-10 w-10",
  chat: "",
};

interface AttachmentThumbnailProps {
  attachment: Attachment;
  projectId: string;
  size?: ThumbnailSize;
  className?: string;
  onClick?: () => void;
}

export function AttachmentThumbnail({
  attachment,
  projectId,
  size = "node",
  className,
  onClick,
}: AttachmentThumbnailProps) {
  const [src, setSrc] = useState<string>(attachment.data || "");
  const [loading, setLoading] = useState(!attachment.data && attachment.type === "image");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (attachment.type !== "image") return;

    setSrc("");
    setError(null);

    if (attachment.data) {
      setSrc(attachment.data);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    attachmentService.readAttachmentData(projectId, attachment).then((data) => {
      if (!cancelled) {
        setSrc(data);
        setLoading(false);
      }
    }).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("加载缩略图失败", {
        projectId,
        attachmentId: attachment.id,
        filename: attachment.filename,
        filePath: attachment.filePath,
        error: err,
      });
      if (!cancelled) {
        setError(message);
        setSrc("");
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [attachment, projectId]);

  const handleImageError = () => {
    const message = `无法解码图片: ${attachment.filename}`;
    console.warn("缩略图解码失败", {
      projectId,
      attachmentId: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      filePath: attachment.filePath,
    });
    setError(message);
    setSrc("");
    setLoading(false);
  };

  if (attachment.type === "document") {
    return (
      <div
        className={`flex items-center justify-center bg-muted rounded ${SIZE_MAP[size]} ${className || ""}`}
        onClick={onClick}
      >
        <FileText className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center bg-muted rounded ${SIZE_MAP[size]} ${className || ""}`}
      >
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-muted rounded ${SIZE_MAP[size]} text-[8px] text-muted-foreground ${className || ""}`}
        title={error || `加载失败: ${attachment.filename}`}
        onClick={onClick}
      >
        失败
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={attachment.filename}
      className={`object-cover rounded ${SIZE_MAP[size]} ${className || ""}`}
      onClick={onClick}
      onError={handleImageError}
      loading="lazy"
    />
  );
}
