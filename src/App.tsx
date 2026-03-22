import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { CanvasView } from "@/components/canvas/CanvasView";
import { fileService } from "@/services";
import { useProjectStore } from "@/stores/project-store";

function App() {
  const [currentView, setCurrentView] = useState("projects");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [openConvId, setOpenConvId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const loadProjects = useProjectStore((s) => s.loadProjects);

  useEffect(() => {
    async function init() {
      try {
        await fileService.initAppDataDir();
        await loadProjects();
      } catch (err) {
        console.error("初始化失败:", err);
      } finally {
        setInitialized(true);
      }
    }
    init();
  }, [loadProjects]);

  const handleNavigate = (view: string) => {
    if (view === "projects" || view === "new-project") {
      setCurrentView("projects");
      setSelectedProjectId(null);
      setOpenConvId(null);
    } else {
      setCurrentView(view);
      setOpenConvId(null);
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
      <Sidebar onNavigate={handleNavigate} currentView={currentView} />
      <MainContent
        currentView={currentView}
        selectedProjectId={selectedProjectId}
        onSelectProject={handleSelectProject}
        onBackToProjects={handleBackToProjects}
        onOpenConversation={handleOpenConversation}
      />
    </div>
  );
}

export default App;
