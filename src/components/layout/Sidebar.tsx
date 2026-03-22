import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  FolderOpen,
  Plus,
  Settings,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
} from "lucide-react";

interface SidebarProps {
  onNavigate: (view: string) => void;
  currentView: string;
}

export function Sidebar({ onNavigate, currentView }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={`flex flex-col border-r border-border bg-sidebar-background transition-all duration-200 ${
        collapsed ? "w-12" : "w-60"
      }`}
    >
      {/* 顶部标题 */}
      <div className="flex items-center justify-between p-3 border-b border-border">
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

      {/* 导航按钮 */}
      <nav className="flex-1 p-2 space-y-1">
        <Button
          variant={currentView === "projects" ? "secondary" : "ghost"}
          className={`w-full ${collapsed ? "justify-center px-0" : "justify-start"}`}
          onClick={() => onNavigate("projects")}
        >
          <FolderOpen className="h-4 w-4" />
          {!collapsed && <span>项目列表</span>}
        </Button>

        <Button
          variant={currentView === "conversations" ? "secondary" : "ghost"}
          className={`w-full ${collapsed ? "justify-center px-0" : "justify-start"}`}
          onClick={() => onNavigate("conversations")}
        >
          <MessageSquare className="h-4 w-4" />
          {!collapsed && <span>对话</span>}
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

      {/* 底部设置 */}
      <div className="p-2 border-t border-border">
        <Button
          variant={currentView === "settings" ? "secondary" : "ghost"}
          className={`w-full ${collapsed ? "justify-center px-0" : "justify-start"}`}
          onClick={() => onNavigate("settings")}
        >
          <Settings className="h-4 w-4" />
          {!collapsed && <span>设置</span>}
        </Button>
      </div>
    </div>
  );
}
