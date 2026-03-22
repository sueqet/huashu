import { useEditStore } from "@/stores/edit-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Pencil,
  PencilOff,
  Undo2,
  Redo2,
  Trash2,
  Layers,
  GitBranch,
  Trash,
  X,
} from "lucide-react";

interface EditToolbarProps {
  onDeleteSelected: () => void;
  hasSelection: boolean;
  onBatchBuildTree: () => void;
  onBatchDelete: () => void;
  batchCount: number;
}

export function EditToolbar({
  onDeleteSelected,
  hasSelection,
  onBatchBuildTree,
  onBatchDelete,
  batchCount,
}: EditToolbarProps) {
  const isEditMode = useEditStore((s) => s.isEditMode);
  const toggleEditMode = useEditStore((s) => s.toggleEditMode);
  const isBatchMode = useEditStore((s) => s.isBatchMode);
  const toggleBatchMode = useEditStore((s) => s.toggleBatchMode);
  const clearBatchSelection = useEditStore((s) => s.clearBatchSelection);
  const canUndo = useEditStore((s) => s.canUndo());
  const canRedo = useEditStore((s) => s.canRedo());
  const undoCount = useEditStore((s) => s.undoStack.length);
  const redoCount = useEditStore((s) => s.redoStack.length);

  return (
    <div className="flex items-center gap-1.5">
      {/* 编辑模式切换 */}
      <Button
        variant={isEditMode ? "default" : "outline"}
        size="sm"
        onClick={toggleEditMode}
        title="切换编辑模式 (Ctrl+E)"
      >
        {isEditMode ? (
          <>
            <PencilOff className="h-4 w-4 mr-1" />
            退出编辑
          </>
        ) : (
          <>
            <Pencil className="h-4 w-4 mr-1" />
            编辑模式
          </>
        )}
      </Button>

      {isEditMode && (
        <>
          {/* 撤销 */}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              // 撤销操作由 CanvasView 的键盘处理统一管理
              // 这里触发一个自定义事件
              window.dispatchEvent(new CustomEvent("edit-undo"));
            }}
            disabled={!canUndo}
            title="撤销 (Ctrl+Z)"
          >
            <Undo2 className="h-4 w-4" />
          </Button>

          {/* 重做 */}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("edit-redo"));
            }}
            disabled={!canRedo}
            title="重做 (Ctrl+Y)"
          >
            <Redo2 className="h-4 w-4" />
          </Button>

          {/* 删除选中节点 */}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={onDeleteSelected}
            disabled={!hasSelection}
            title="删除选中节点 (Delete)"
          >
            <Trash2 className="h-4 w-4" />
          </Button>

          {/* 分隔线 */}
          <div className="w-px h-6 bg-border mx-0.5" />

          {/* 批量操作按钮 */}
          <Button
            variant={isBatchMode ? "default" : "outline"}
            size="sm"
            onClick={toggleBatchMode}
            title="批量操作模式 (Ctrl+B)"
            className={isBatchMode ? "bg-purple-600 hover:bg-purple-700" : ""}
          >
            <Layers className="h-4 w-4 mr-1" />
            批量操作
            {isBatchMode && batchCount > 0 && (
              <Badge
                variant="secondary"
                className="ml-1.5 h-5 px-1.5 text-[10px] bg-purple-100 text-purple-700"
              >
                {batchCount}
              </Badge>
            )}
          </Button>

          {/* 批量操作工具栏 */}
          {isBatchMode && (
            <>
              {/* 构建新树 */}
              <Button
                variant="outline"
                size="sm"
                onClick={onBatchBuildTree}
                disabled={batchCount < 2}
                title="将选中节点构建为新的线性树"
              >
                <GitBranch className="h-4 w-4 mr-1" />
                构建新树
              </Button>

              {/* 批量删除 */}
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={onBatchDelete}
                disabled={batchCount === 0}
                title="批量删除选中节点及其子树"
              >
                <Trash className="h-4 w-4 mr-1" />
                批量删除
              </Button>

              {/* 清空选择 */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={clearBatchSelection}
                disabled={batchCount === 0}
                title="清空批量选择"
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          )}

          {/* 快照计数 */}
          {(undoCount > 0 || redoCount > 0) && (
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
              {undoCount}/{undoCount + redoCount}
            </Badge>
          )}
        </>
      )}
    </div>
  );
}
