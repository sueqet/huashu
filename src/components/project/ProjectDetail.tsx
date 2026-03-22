import { useEffect, useState } from "react";
import { useProjectStore } from "@/stores/project-store";
import { useConversationStore } from "@/stores/conversation-store";
import { KnowledgeBasePanel } from "./KnowledgeBasePanel";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Plus,
  MessageSquare,
  Trash2,
  Pencil,
  Check,
  X,
  Download,
} from "lucide-react";
import { exportService } from "@/services/export-service";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

interface ProjectDetailProps {
  projectId: string;
  onBack: () => void;
  onOpenConversation: (projectId: string, convId: string) => void;
}

export function ProjectDetail({
  projectId,
  onBack,
  onOpenConversation,
}: ProjectDetailProps) {
  const { projects, updateProject } = useProjectStore();
  const {
    conversationList,
    loadConversationList,
    createConversation,
    deleteConversation,
  } = useConversationStore();

  const project = projects.find((p) => p.id === projectId);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [isCreatingConv, setIsCreatingConv] = useState(false);
  const [newConvName, setNewConvName] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadConversationList(projectId);
  }, [projectId, loadConversationList]);

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        项目未找到
      </div>
    );
  }

  const [exportError, setExportError] = useState<string | null>(null);

  const handleExportProject = async () => {
    setExporting(true);
    setExportError(null);
    try {
      // 使用 Tauri 对话框选择保存路径
      const savePath = await save({
        defaultPath: `${project?.name || "project"}.zip`,
        filters: [{ name: "ZIP 文件", extensions: ["zip"] }],
      });
      if (!savePath) {
        // 用户取消了保存
        setExporting(false);
        return;
      }

      const zipData = await exportService.exportProject(projectId);
      // 使用 Tauri FS 写入文件到用户选择的路径
      await writeFile(savePath, new Uint8Array(zipData));
      setExportError(null);
    } catch (err) {
      console.error("导出项目失败:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setExportError(`导出失败：${msg}`);
    } finally {
      setExporting(false);
    }
  };

  const handleSaveName = async () => {
    if (editName.trim()) {
      await updateProject(projectId, { name: editName.trim() });
    }
    setIsEditingName(false);
  };

  const handleSaveDesc = async () => {
    await updateProject(projectId, { description: editDesc });
    setIsEditingDesc(false);
  };

  const handleCreateConv = async () => {
    if (!newConvName.trim()) return;
    const conv = await createConversation(projectId, newConvName.trim());
    setNewConvName("");
    setIsCreatingConv(false);
    onOpenConversation(projectId, conv.id);
  };

  const handleDeleteConv = async (convId: string) => {
    if (!confirm("确定要删除此对话吗？此操作不可撤销。")) return;
    await deleteConversation(projectId, convId);
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-hidden">
      {/* 顶部 */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {isEditingName ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="text-2xl font-semibold bg-transparent border-b-2 border-primary outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveName();
                if (e.key === "Escape") setIsEditingName(false);
              }}
            />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSaveName}>
              <Check className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsEditingName(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <h2
            className="text-2xl font-semibold cursor-pointer hover:text-primary transition-colors"
            onClick={() => {
              setEditName(project.name);
              setIsEditingName(true);
            }}
          >
            {project.name}
          </h2>
        )}

        <div className="ml-auto flex items-center gap-2">
          {exportError && (
            <span className="text-xs text-destructive">{exportError}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportProject}
            disabled={exporting}
          >
            <Download className="h-4 w-4 mr-1" />
            {exporting ? "导出中..." : "导出项目"}
          </Button>
        </div>
      </div>

      {/* 项目描述 */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium text-muted-foreground">
            项目描述（作为系统提示词前缀）
          </span>
          {!isEditingDesc && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                setEditDesc(project.description || "");
                setIsEditingDesc(true);
              }}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
        </div>
        {isEditingDesc ? (
          <div className="space-y-2">
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="输入项目描述..."
              className="w-full min-h-[100px] p-3 border rounded-md bg-background text-sm resize-y outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveDesc}>
                保存
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsEditingDesc(false)}
              >
                取消
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {project.description || "暂无描述，点击编辑按钮添加"}
          </p>
        )}
      </div>

      {/* 知识库（RAG） */}
      {project.ragEnabled && (
        <div className="mb-4">
          <div className="border rounded-lg">
            <KnowledgeBasePanel projectId={projectId} />
          </div>
          <div className="mt-2">
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => {
                if (confirm("确定要关闭 RAG 知识库吗？已有的知识库数据不会被删除，再次启用后可继续使用。")) {
                  updateProject(projectId, { ragEnabled: false });
                }
              }}
            >
              关闭 RAG 知识库
            </Button>
          </div>
        </div>
      )}

      {/* RAG 开关 */}
      {!project.ragEnabled && (
        <div className="mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => updateProject(projectId, { ragEnabled: true })}
          >
            启用 RAG 知识库
          </Button>
        </div>
      )}

      {/* 对话列表 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium">对话列表</h3>
          <Button size="sm" onClick={() => setIsCreatingConv(true)}>
            <Plus className="h-4 w-4 mr-1" />
            新建对话
          </Button>
        </div>

        {isCreatingConv && (
          <div className="mb-3 flex items-center gap-2 p-3 border rounded-lg bg-card">
            <input
              type="text"
              value={newConvName}
              onChange={(e) => setNewConvName(e.target.value)}
              placeholder="输入对话名称..."
              className="flex-1 bg-transparent outline-none text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateConv();
                if (e.key === "Escape") setIsCreatingConv(false);
              }}
            />
            <Button
              size="sm"
              onClick={handleCreateConv}
              disabled={!newConvName.trim()}
            >
              创建
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsCreatingConv(false)}
            >
              取消
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-1">
          {conversationList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageSquare className="h-10 w-10 mb-3 opacity-50" />
              <p className="text-sm">还没有对话，点击上方按钮创建</p>
            </div>
          ) : (
            conversationList.map((conv) => (
              <div
                key={conv.id}
                className="group flex items-center gap-3 p-3 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                onClick={() => onOpenConversation(projectId, conv.id)}
              >
                <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1 text-sm truncate">{conv.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatTime(conv.updatedAt)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteConv(conv.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
