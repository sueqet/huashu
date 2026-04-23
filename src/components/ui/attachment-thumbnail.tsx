import { useState, useEffect } from "react";
import type { Attachment } from "@/types";
import { attachmentService } from "@/services/attachment-service";
import { Loader2, FileText } from "lucide-react";

type ThumbnailSize = "node" | "input" | "chat";

const SIZE_MAP: Record<ThumbnailSize, string> = {
  node: "h-12 w-12",
  input: "h-10 w-10",
  chat: "", // 自适应
};

interface AttachmentThumbnailProps {
  attachment: Attachment;
  projectId: string;
  size?: ThumbnailSize;
  className?: string;
  onClick?: () => void;
}

/**
 * 附件缩略图组件：懒加载图片，支持三种尺寸
 */
export function AttachmentThumbnail({
  attachment,
  projectId,
  size = "node",
  className,
  onClick,
}: AttachmentThumbnailProps) {
  const [src, setSrc] = useState<string>(attachment.data || "");
  const [loading, setLoading] = useState(!attachment.data && attachment.type === "image");

  useEffect(() => {
    if (attachment.type !== "image") return;
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
      console.warn("加载缩略图失败:", err);
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [attachment, projectId]);

  // 文档类型：显示图标
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

  // 图片加载中
  if (loading) {
    return (
      <div
        className={`flex items-center justify-center bg-muted rounded ${SIZE_MAP[size]} ${className || ""}`}
      >
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // 图片加载失败
  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-muted rounded ${SIZE_MAP[size]} text-[8px] text-muted-foreground ${className || ""}`}
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
      loading="lazy"
    />
  );
}
