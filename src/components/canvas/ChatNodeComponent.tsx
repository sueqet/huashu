import { memo, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronRight, Pin, Star, Paperclip } from "lucide-react";
import type { ChatNodeData } from "@/lib/tree-layout";

/** Dispatch a custom event to toggle collapse for a node on the canvas */
function dispatchToggleCollapse(nodeId: string) {
  window.dispatchEvent(
    new CustomEvent("toggle-collapse", { detail: { nodeId } })
  );
}

/**
 * 自定义 React Flow 节点组件
 * - 用户消息：蓝色边框，前 50 字符预览
 * - AI 回复：绿色边框，前 80 字符预览
 * - 不完整节点：橙色边框
 */
/** Circled number characters for batch selection overlay */
const CIRCLED_NUMBERS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩",
  "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];

export const ChatNodeComponent = memo(function ChatNodeComponent({
  data,
}: NodeProps) {
  const nodeData = data as unknown as ChatNodeData;
  const { chatNode, isCollapsed, hasChildren, batchIndex } = nodeData;
  const [showPreview, setShowPreview] = useState(false);
  const [previewPos, setPreviewPos] = useState({ top: 0, left: 0 });
  const isBatchSelected = batchIndex != null;
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null);

  const isUser = chatNode.role === "user";
  const previewLength = isUser ? 50 : 80;
  const preview =
    chatNode.content.length > previewLength
      ? chatNode.content.slice(0, previewLength) + "..."
      : chatNode.content;

  // 边框颜色
  let borderColor = isUser ? "border-blue-400" : "border-green-400";
  if (chatNode.isPartial) borderColor = "border-orange-400";

  // 背景色
  const bgColor = isUser ? "bg-blue-50" : "bg-green-50";

  const handleMouseEnter = useCallback(() => {
    hoverTimerRef.current = setTimeout(() => {
      if (nodeRef.current) {
        const rect = nodeRef.current.getBoundingClientRect();
        setPreviewPos({ top: rect.bottom + 4, left: rect.left });
      }
      setShowPreview(true);
    }, 200);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setShowPreview(false);
  }, []);

  return (
    <div
      ref={nodeRef}
      className={`relative rounded-lg border-2 ${borderColor} ${bgColor} shadow-sm w-[240px] select-none ${
        isBatchSelected ? "ring-2 ring-purple-500 ring-offset-1 animate-[batch-pulse_2s_ease-in-out_infinite]" : ""
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 批量选择序号标记 */}
      {isBatchSelected && (
        <div className="absolute -top-3 -right-3 z-10 flex items-center justify-center w-7 h-7 rounded-full bg-purple-600 text-white text-sm font-bold shadow-md">
          {batchIndex < CIRCLED_NUMBERS.length
            ? CIRCLED_NUMBERS[batchIndex]
            : batchIndex + 1}
        </div>
      )}
      {/* 顶部连接点（接收来自父节点的边） */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-gray-400 !w-2 !h-2"
      />

      {/* 节点内容 */}
      <div className="px-3 py-2">
        {/* 角色标签 + 状态图标 */}
        <div className="flex items-center gap-1.5 mb-1">
          <span
            className={`text-xs font-medium ${
              isUser ? "text-blue-600" : "text-green-600"
            }`}
          >
            {isUser ? "用户" : "AI"}
          </span>
          {chatNode.isPartial && (
            <span className="text-xs text-orange-500">未完成</span>
          )}
          {chatNode.isPinned && (
            <Pin className="h-3 w-3 text-amber-500" />
          )}
          {chatNode.isStarred && (
            <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
          )}
          {chatNode.attachments && chatNode.attachments.length > 0 && (
            <Paperclip className="h-3 w-3 text-muted-foreground" />
          )}
          {chatNode.modelName && (
            <span className="ml-auto text-[10px] text-muted-foreground truncate max-w-[80px]">
              {chatNode.modelName}
            </span>
          )}
        </div>

        {/* 消息预览 */}
        <p className="text-xs text-foreground/80 leading-relaxed line-clamp-2">
          {preview || "(空消息)"}
        </p>

        {/* 折叠/展开按钮 */}
        {hasChildren && (
          <div
            className="flex justify-center mt-1 cursor-pointer rounded hover:bg-background/50 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              dispatchToggleCollapse(chatNode.id);
            }}
            title={isCollapsed ? "展开子节点" : "折叠子节点"}
          >
            {isCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
        )}
      </div>

      {/* 底部连接点（连接到子节点） */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-gray-400 !w-2 !h-2"
      />

      {/* 悬停预览面板 - 使用 Portal 渲染到 body，确保在最上层 */}
      {showPreview && chatNode.content.length > previewLength && createPortal(
        <div
          className="fixed z-[9999] w-[320px] max-h-[300px] overflow-y-auto rounded-lg border bg-popover p-3 shadow-xl pointer-events-none"
          style={{ top: previewPos.top, left: previewPos.left }}
        >
          <p className="text-xs whitespace-pre-wrap break-words">
            {chatNode.content.slice(0, 500)}
            {chatNode.content.length > 500 && "..."}
          </p>
        </div>,
        document.body
      )}
    </div>
  );
});
