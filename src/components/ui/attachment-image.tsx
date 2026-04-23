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

  useEffect(() => {
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
      console.warn("加载附件图片失败:", err);
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [attachment, projectId]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-muted rounded ${className || ""}`}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-muted rounded text-xs text-muted-foreground ${className || ""}`}>
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
      loading="lazy"
    />
  );
}
