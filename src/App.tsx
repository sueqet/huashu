import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { CanvasView } from "@/components/canvas/CanvasView";
import { fileService } from "@/services";
import { migrateAttachments } from "@/services";
import { useProjectStore } from "@/stores/project-store";
import { useConfigStore } from "@/stores/config-store";

function App() {
  const [currentView, setCurrentView] = useState("projects");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [openConvId, setOpenConvId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [autoCreate, setAutoCreate] = useState(false);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const loadConfig = useConfigStore((s) => s.loadConfig);

  useEffect(() => {
    async function init() {
      try {
        await fileService.initAppDataDir();
        await Promise.all([loadProjects(), loadConfig()]);
        // 迁移旧的 base64 内嵌附件到独立文件
        await migrateAttachments();
      } catch (err) {
        console.error("初始化失败:", err);
      } finally {
        setInitialized(true);
      }
    }
    init();
  }, [loadProjects, loadConfig]);

  const handleNavigate = (view: string) => {
    if (view === "new-project") {
      setCurrentView("projects");
      setSelectedProjectId(null);
      setOpenConvId(null);
      setAutoCreate(true);
    } else if (view === "projects") {
      setCurrentView("projects");
      setSelectedProjectId(null);
      setOpenConvId(null);
      setAutoCreate(false);
    } else {
      setCurrentView(view);
      setOpenConvId(null);
      setAutoCreate(false);
    }
  };

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setCurrentView("project-detail");
  };

  const handleBackToProjects = () => {
    setSelectedProjectId(null);
    setCurrentView("projects");
  };

  const handleOpenConversation = (projectId: string, convId: string) => {
    setSelectedProjectId(projectId);
    setOpenConvId(convId);
    setCurrentView("canvas");
  };

  const handleBackFromCanvas = () => {
    setOpenConvId(null);
    if (selectedProjectId) {
      setCurrentView("project-detail");
    } else {
      setCurrentView("projects");
    }
  };

  if (!initialized) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <p className="text-muted-foreground">正在初始化...</p>
      </div>
    );
  }

  // 画布视图全屏展示（不显示侧边栏）
  if (currentView === "canvas" && selectedProjectId && openConvId) {
    return (
      <div className="flex h-screen w-screen overflow-hidden">
        <CanvasView
          projectId={selectedProjectId}
          conversationId={openConvId}
          onBack={handleBackFromCanvas}
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        onNavigate={handleNavigate}
        currentView={currentView}
        selectedProjectId={selectedProjectId}
      />
      <MainContent
        currentView={currentView}
        selectedProjectId={selectedProjectId}
        autoCreate={autoCreate}
        onAutoCreateDone={() => setAutoCreate(false)}
        onSelectProject={handleSelectProject}
        onBackToProjects={handleBackToProjects}
        onOpenConversation={handleOpenConversation}
      />
    </div>
  );
}

export default App;
