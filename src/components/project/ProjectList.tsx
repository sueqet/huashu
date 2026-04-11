import { useState, useRef, useEffect } from "react";
import { useProjectStore } from "@/stores/project-store";
import { Button } from "@/components/ui/button";
import {
  FolderOpen,
  Plus,
  Trash2,
  Archive,
  ArchiveRestore,
  MoreVertical,
  Clock,
  SortAsc,
  Upload,
  BookOpen,
  MessageSquare,
} from "lucide-react";
import { exportService } from "@/services/export-service";
import type { Project } from "@/types";

interface ProjectListProps {
  onSelectProject: (projectId: string) => void;
  autoCreate?: boolean;
  onAutoCreateDone?: () => void;
}

type SortMode = "updatedAt" | "name";

export function ProjectList({ onSelectProject, autoCreate, onAutoCreateDone }: ProjectListProps) {
  const { projects, createProject, deleteProject, toggleArchive, loading } =
    useProjectStore();
  const [showArchived, setShowArchived] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("updatedAt");
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [createMode, setCreateMode] = useState<"chat" | "story">("chat");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 从侧边栏点击"新建项目"时自动打开创建表单
  useEffect(() => {
    if (autoCreate) {
      setIsCreating(true);
      onAutoCreateDone?.();
    }
  }, [autoCreate, onAutoCreateDone]);

  const filteredProjects = projects.filter(
    (p) => p.isArchived === showArchived
  );

  const sortedProjects = [...filteredProjects].sort((a, b) => {
    if (sortMode === "name") return a.name.localeCompare(b.name);
    return b.updatedAt - a.updatedAt;
  });

  const handleCreate = async () => {
    if (!newName.trim()) return;
    if (createMode === "story") {
      const project = await createProject(newName.trim(), undefined, "story", {
        worldSetting: "",
        rules: "",
        characters: [],
        openingMessage: "",
        chapterSummaries: [],
      });
      setNewName("");
      setIsCreating(false);
      setCreateMode("chat");
      onSelectProject(project.id);
    } else {
      const project = await createProject(newName.trim());
      setNewName("");
      setIsCreating(false);
      onSelectProject(project.id);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const zipData = new Uint8Array(arrayBuffer);
      const newProjectId = await exportService.importProject(zipData);
      // 刷新项目列表
      await useProjectStore.getState().loadProjects();
      onSelectProject(newProjectId);
    } catch (err) {
      console.error("导入项目失败:", err);
      alert("导入项目失败，请确认文件格式正确。");
    } finally {
      setImporting(false);
      // 重置 input 以便同一文件可再次选择
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除此项目吗？此操作不可撤销。")) return;
    await deleteProject(id);
    setMenuOpenId(null);
  };

  const handleArchive = async (id: string) => {
    await toggleArchive(id);
    setMenuOpenId(null);
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "今天";
    if (days === 1) return "昨天";
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString("zh-CN");
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-6 overflow-hidden">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">
          {showArchived ? "已归档项目" : "项目列表"}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortMode(sortMode === "updatedAt" ? "name" : "updatedAt")}
          >
            {sortMode === "updatedAt" ? (
              <Clock className="h-4 w-4 mr-1" />
            ) : (
              <SortAsc className="h-4 w-4 mr-1" />
            )}
            {sortMode === "updatedAt" ? "按时间" : "按名称"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? (
              <ArchiveRestore className="h-4 w-4 mr-1" />
            ) : (
              <Archive className="h-4 w-4 mr-1" />
            )}
            {showArchived ? "查看活跃" : "查看归档"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            <Upload className="h-4 w-4 mr-1" />
            {importing ? "导入中..." : "导入项目"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={handleImport}
          />
          <Button size="sm" onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4 mr-1" />
            新建项目
          </Button>
        </div>
      </div>

      {/* 新建项目输入 */}
      {isCreating && (
        <div className="mb-4 p-3 border rounded-lg bg-card space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="输入项目名称..."
              className="flex-1 bg-transparent outline-none text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") setIsCreating(false);
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">项目类型：</span>
            <Button
              size="sm"
              variant={createMode === "chat" ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setCreateMode("chat")}
            >
              <MessageSquare className="h-3 w-3 mr-1" />
              对话模式
            </Button>
            <Button
              size="sm"
              variant={createMode === "story" ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setCreateMode("story")}
            >
              <BookOpen className="h-3 w-3 mr-1" />
              故事模式
            </Button>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>
              创建
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setIsCreating(false);
                setCreateMode("chat");
              }}
            >
              取消
            </Button>
          </div>
        </div>
      )}

      {/* 项目列表 */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {sortedProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FolderOpen className="h-12 w-12 mb-4 opacity-50" />
            <p>
              {showArchived ? "没有归档的项目" : "还没有项目，点击上方按钮创建"}
            </p>
          </div>
        ) : (
          sortedProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              isMenuOpen={menuOpenId === project.id}
              onToggleMenu={() =>
                setMenuOpenId(menuOpenId === project.id ? null : project.id)
              }
              onSelect={() => onSelectProject(project.id)}
              onDelete={() => handleDelete(project.id)}
              onArchive={() => handleArchive(project.id)}
              formatTime={formatTime}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface ProjectCardProps {
  project: Project;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onSelect: () => void;
  onDelete: () => void;
  onArchive: () => void;
  formatTime: (t: number) => string;
}

function ProjectCard({
  project,
  isMenuOpen,
  onToggleMenu,
  onSelect,
  onDelete,
  onArchive,
  formatTime,
}: ProjectCardProps) {
  return (
    <div
      className="group flex items-center gap-3 p-3 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
      onClick={onSelect}
    >
      <FolderOpen className="h-5 w-5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center">
          <h3 className="font-medium text-sm truncate">{project.name}</h3>
          {project.mode === "story" && (
            <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded ml-1 shrink-0">
              故事
            </span>
          )}
        </div>
        {project.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {project.description}
          </p>
        )}
      </div>
      <span className="text-xs text-muted-foreground shrink-0">
        {formatTime(project.updatedAt)}
      </span>
      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onToggleMenu();
          }}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
        {isMenuOpen && (
          <div
            className="absolute right-0 top-8 z-50 w-36 rounded-md border bg-popover p-1 shadow-md"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              onClick={onArchive}
            >
              {project.isArchived ? (
                <ArchiveRestore className="h-4 w-4" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
              {project.isArchived ? "取消归档" : "归档"}
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-accent"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
              删除
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
