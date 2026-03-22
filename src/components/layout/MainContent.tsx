import { ProjectList } from "@/components/project/ProjectList";
import { ProjectDetail } from "@/components/project/ProjectDetail";
import { SettingsPage } from "@/components/settings/SettingsPage";

interface MainContentProps {
  currentView: string;
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onBackToProjects: () => void;
  onOpenConversation: (projectId: string, convId: string) => void;
}

export function MainContent({
  currentView,
  selectedProjectId,
  onSelectProject,
  onBackToProjects,
  onOpenConversation,
}: MainContentProps) {
  if (currentView === "settings") {
    return <SettingsPage />;
  }

  if (currentView === "project-detail" && selectedProjectId) {
    return (
      <ProjectDetail
        projectId={selectedProjectId}
        onBack={onBackToProjects}
        onOpenConversation={onOpenConversation}
      />
    );
  }

  // 默认显示项目列表
  return <ProjectList onSelectProject={onSelectProject} />;
}
