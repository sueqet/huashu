import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AttachmentThumbnail } from "@/components/ui/attachment-thumbnail";
import { conversationService } from "@/services/conversation-service";
import type { Attachment } from "@/types";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  ImageIcon,
  Plus,
  Settings,
} from "lucide-react";

interface SidebarProps {
  onNavigate: (view: string) => void;
  currentView: string;
  selectedProjectId?: string | null;
}

interface SidebarAttachmentItem {
  key: string;
  conversationName: string;
  attachment: Attachment;
}

const COLLAPSED_WIDTH = 48;
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 220;
const MAX_WIDTH = 520;

export function Sidebar({ onNavigate, currentView, selectedProjectId }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [attachments, setAttachments] = useState<SidebarAttachmentItem[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const dragStartRef = useRef<{ x: number; width: number } | null>(null);

  const effectiveWidth = collapsed ? COLLAPSED_WIDTH : width;

  useEffect(() => {
    if (!selectedProjectId || collapsed) {
      setAttachments([]);
      return;
    }

    const projectId = selectedProjectId;
    let cancelled = false;
    setLoadingAttachments(true);

    async function loadAttachments() {
      try {
        const conversations = await conversationService.listConversations(projectId);
        const items: SidebarAttachmentItem[] = [];

        for (const summary of conversations) {
          const conversation = await conversationService.getConversation(
            projectId,
            summary.id
          );
          for (const node of Object.values(conversation.nodes)) {
            for (const attachment of node.attachments || []) {
              items.push({
                key: `${conversation.id}:${node.id}:${attachment.id}`,
                conversationName: conversation.name,
                attachment,
              });
            }
          }
        }

        if (!cancelled) {
          setAttachments(items.slice(0, 80));
        }
      } catch (err) {
        console.warn("加载侧边栏附件失败", err);
        if (!cancelled) setAttachments([]);
      } finally {
        if (!cancelled) setLoadingAttachments(false);
      }
    }

    loadAttachments();
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, collapsed]);

  const imageCount = useMemo(
    () => attachments.filter((item) => item.attachment.type === "image").length,
    [attachments]
  );
  const documentCount = attachments.length - imageCount;

  const handleResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (collapsed) return;
    dragStartRef.current = { x: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [collapsed, width]);

  const handleResizeMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const nextWidth = dragStartRef.current.width + event.clientX - dragStartRef.current.x;
    setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, nextWidth)));
  }, []);

  const handleResizeEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    dragStartRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return (
    <div
      className="relative flex shrink-0 flex-col border-r border-border bg-sidebar-background transition-[width] duration-200"
      style={{ width: effectiveWidth }}
    >
      <div className="flex items-center justify-between border-b border-border p-3">
        {!collapsed && (
          <h1 className="text-lg font-bold text-sidebar-foreground">话树</h1>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <nav className="space-y-1 p-2">
        <Button
          variant={currentView === "projects" ? "secondary" : "ghost"}
          className={`w-full ${collapsed ? "justify-center px-0" : "justify-start"}`}
          onClick={() => onNavigate("projects")}
        >
          <FolderOpen className="h-4 w-4" />
          {!collapsed && <span>项目列表</span>}
        </Button>

        <Button
          variant="ghost"
          className={`w-full ${collapsed ? "justify-center px-0" : "justify-start"}`}
          onClick={() => onNavigate("new-project")}
        >
          <Plus className="h-4 w-4" />
          {!collapsed && <span>新建项目</span>}
        </Button>
      </nav>

      {!collapsed && (
        <div className="flex min-h-0 flex-1 flex-col border-t border-border">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">项目附件</span>
            <span className="text-[11px] text-muted-foreground">
              {imageCount} 图 · {documentCount} 文档
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {!selectedProjectId ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">选择项目后显示图片和文档</p>
            ) : loadingAttachments ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">正在加载附件...</p>
            ) : attachments.length === 0 ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">暂无图片或文档</p>
            ) : (
              <div className="space-y-1.5">
                {attachments.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-sidebar-accent"
                    title={`${item.attachment.filename}\n${item.conversationName}`}
                  >
                    {item.attachment.type === "image" ? (
                      <AttachmentThumbnail
                        attachment={item.attachment}
                        projectId={selectedProjectId}
                        size="input"
                        className="shrink-0"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 text-xs">
                        {item.attachment.type === "image" ? (
                          <ImageIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                        ) : (
                          <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate">{item.attachment.filename}</span>
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {item.conversationName}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="border-t border-border p-2">
        <Button
          variant={currentView === "settings" ? "secondary" : "ghost"}
          className={`w-full ${collapsed ? "justify-center px-0" : "justify-start"}`}
          onClick={() => onNavigate("settings")}
        >
          <Settings className="h-4 w-4" />
          {!collapsed && <span>设置</span>}
        </Button>
      </div>

      {!collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          className="absolute right-[-3px] top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/30"
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
        />
      )}
    </div>
  );
}
