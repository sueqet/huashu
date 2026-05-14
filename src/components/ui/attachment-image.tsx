import { useState, useEffect } from "react";
import type { Attachment } from "@/types";
import { attachmentService } from "@/services/attachment-service";
import { Loader2 } from "lucide-react";

interface AttachmentImageProps {
  attachment: Attachment;
  projectId: string;
  className?: string;
  onClick?: () => void;
}

/**
 * 附件图片组件：按需从磁盘加载图片数据
 */
export function AttachmentImage({
  attachment,
  projectId,
  className,
  onClick,
}: AttachmentImageProps) {
  const [src, setSrc] = useState<string>(attachment.data || "");
  const [loading, setLoading] = useState(!attachment.data);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
      console.warn("加载附件图片失败:", {
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
    console.warn("附件图片解码失败:", {
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

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-muted rounded ${className || ""}`}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-muted rounded text-xs text-muted-foreground ${onClick ? "cursor-pointer" : ""} ${className || ""}`}
        title={error || `加载失败: ${attachment.filename}`}
        onClick={onClick}
      >
        加载失败
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={attachment.filename}
      className={className}
      onClick={onClick}
      onError={handleImageError}
      loading="lazy"
    />
  );
}
