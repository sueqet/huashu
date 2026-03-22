import { useEditStore } from "@/stores/edit-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Pencil,
  PencilOff,
  Undo2,
  Redo2,
  Trash2,
} from "lucide-react";

interface EditToolbarProps {
  onDeleteSelected: () => void;
  hasSelection: boolean;
}

export function EditToolbar({ onDeleteSelected, hasSelection }: EditToolbarProps) {
  const isEditMode = useEditStore((s) => s.isEditMode);
  const toggleEditMode = useEditStore((s) => s.toggleEditMode);
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
