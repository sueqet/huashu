import { ProjectList } from "@/components/project/ProjectList";
import { ProjectDetail } from "@/components/project/ProjectDetail";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { CharacterLibrary } from "@/components/characters/CharacterLibrary";
import { CharacterEditor } from "@/components/characters/CharacterEditor";

interface MainContentProps {
  currentView: string;
  selectedProjectId: string | null;
  autoCreate?: boolean;
  onAutoCreateDone?: () => void;
  onSelectProject: (projectId: string) => void;
  onBackToProjects: () => void;
  onOpenConversation: (projectId: string, convId: string) => void;
  editingCharacterId: string | null;
  onEditCharacter: (characterId: string) => void;
  onBackToCharacters: () => void;
}

export function MainContent({
  currentView,
  selectedProjectId,
  autoCreate,
  onAutoCreateDone,
  onSelectProject,
  onBackToProjects,
  onOpenConversation,
  editingCharacterId,
  onEditCharacter,
  onBackToCharacters,
}: MainContentProps) {
  if (currentView === "settings") {
    return <SettingsPage />;
  }

  if (currentView === "character-edit" && editingCharacterId) {
    return <CharacterEditor key={editingCharacterId} characterId={editingCharacterId} onBack={onBackToCharacters} />;
  }

  if (currentView === "characters" || currentView === "character-edit") {
    return <CharacterLibrary onEdit={onEditCharacter} />;
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
  return <ProjectList onSelectProject={onSelectProject} autoCreate={autoCreate} onAutoCreateDone={onAutoCreateDone} />;
}
