import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import type { Conversation, ChatNode, ChapterSummary, Attachment } from "@/types";
import { useConversationStore } from "@/stores/conversation-store";
import { useEditStore } from "@/stores/edit-store";
import { useConfigStore } from "@/stores/config-store";
import { useProjectStore } from "@/stores/project-store";
import {
  conversationService,
  buildContext,
  streamChatCompletion,
  generateImage,
  resolveGeneratedImageDataUrl,
} from "@/services";
import { searchKnowledge } from "@/services/rag-service";
import { attachmentService } from "@/services/attachment-service";
import { buildImagePromptFromContext } from "@/services/image-prompt-service";
import { useAttachments } from "@/hooks/useAttachments";
import { useDragDrop } from "@/hooks/useDragDrop";
import { StoryChoices } from "./StoryChoices";
import {
  getConversationText,
  getRecentMessagesText,
  generateChapterSummary,
  generateChapterTransition,
  indexChapterSummaries,
} from "@/services/story-service";
import { countMessagesTokens } from "@/services/token-service";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { AttachmentImage } from "@/components/ui/attachment-image";
import { AttachmentViewerSheet } from "@/components/ui/attachment-viewer";
import { Button } from "@/components/ui/button";
import { ImagePromptDialog } from "./ImagePromptDialog";
import {
  ArrowLeft,
  Send,
  Pin,
  PinOff,
  ChevronRight,
  ChevronLeft,
  Star,
  Bot,
  Square,
  RefreshCw,
  Loader2,
  ImageIcon,
  FileText,
  X,
  Paperclip,
  Wand2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ChatViewProps {
  conversation: Conversation;
  selectedNodeId: string;
  onBack: () => void;
  onSelectNode: (nodeId: string) => void;
}

function traceMessages(
  nodes: Record<string, ChatNode>,
  nodeId: string
): ChatNode[] {
  const messages: ChatNode[] = [];
  let currentId: string | null = nodeId;
  while (currentId) {
    const node: ChatNode | undefined = nodes[currentId];
    if (!node) break;
    messages.unshift(node);
    currentId = node.parentId;
  }
  return messages;
}

export function ChatView({
  conversation,
  selectedNodeId,
  onBack,
  onSelectNode,
}: ChatViewProps) {
  const { addNodeAndSave, updateNodeAndSave } = useConversationStore();
  const takeSnapshot = useEditStore((s) => s.takeSnapshot);
  const config = useConfigStore((s) => s.config);
  const projects = useProjectStore((s) => s.projects);

  const [inputText, setInputText] = useState("");
  const [imagePromptDialogOpen, setImagePromptDialogOpen] = useState(false);
  const [imagePromptDraft, setImagePromptDraft] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  // 故事模式状态
  const [isChapterTransitioning, setIsChapterTransitioning] = useState(false);
  const [generatingNodeId, setGeneratingNodeId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    attachments,
    isProcessing: isProcessingAttachments,
    processingError,
    handlePaste,
    pickImages,
    pickDocuments,
    addFiles,
    removeAttachment,
    clearAttachments,
    clearProcessingError,
  } = useAttachments(conversation.projectId, conversation.id);

  const { isDragging, dragHandlers } = useDragDrop({
    onFiles: addFiles,
  });

  const messages = useMemo(
    () => traceMessages(conversation.nodes, selectedNodeId),
    [conversation.nodes, selectedNodeId]
  );

  const currentNode = conversation.nodes[selectedNodeId];
  const project = projects.find((p) => p.id === conversation.projectId);
  const isStoryMode = project?.mode === "story";
  const storyConfig = project?.storyConfig;

  const activeProvider = config?.providers.find(
    (p) => p.id === config.activeProviderId
  );
  const activeModel = config?.activeModel || activeProvider?.defaultModel;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // 自动聚焦输入框
  useEffect(() => {
    inputRef.current?.focus();
  }, [selectedNodeId]);

  // Escape 返回编辑模式
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isGenerating) {
        const target = e.target as HTMLElement;
        const isInputFocused =
          target.tagName === "TEXTAREA" || target.tagName === "INPUT";
        // 如果在输入框中且有内容，先不退出
        if (isInputFocused && inputText.trim()) return;
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onBack, isGenerating, inputText]);

  // 故事模式：章节自动切换
  const handleChapterSwitch = useCallback(async () => {
    if (!storyConfig || !activeProvider || !activeModel) return;

    setIsChapterTransitioning(true);
    try {
      // 1. 获取当前对话内容
      const latestConv = useConversationStore.getState().conversation!;
      const convText = getConversationText(latestConv.nodes, selectedNodeId);

      // 2. 生成当前章节摘要
      const summary = await generateChapterSummary(
        convText,
        activeProvider.apiUrl,
        activeProvider.apiKey,
        activeModel
      );

      // 3. 更新 storyConfig 的 chapterSummaries
      const chapterNumber = storyConfig.chapterSummaries.length + 1;
      const newSummary: ChapterSummary = {
        conversationId: latestConv.id,
        chapterNumber,
        summary,
        createdAt: Date.now(),
      };

      const updatedSummaries = [...storyConfig.chapterSummaries, newSummary];

      // 4. 如果章节 > 5，将早期摘要索引到 RAG
      if (updatedSummaries.length > 5 && activeProvider.embedding) {
        try {
          await indexChapterSummaries(
            latestConv.projectId,
            updatedSummaries,
            activeProvider.apiUrl,
            activeProvider.apiKey,
            activeProvider.embedding.model
          );
        } catch (err) {
          console.warn("索引章节摘要到 RAG 失败:", err);
        }
      }

      // 5. 保存更新的 storyConfig
      await useProjectStore.getState().updateProject(project!.id, {
        storyConfig: {
          ...storyConfig,
          chapterSummaries: updatedSummaries,
        },
      });

      // 6. 创建新章节对话
      const newChapterName = `第${chapterNumber + 1}章`;
      const newConv = await useConversationStore.getState().createConversation(
        project!.id,
        newChapterName
      );

      // 7. 生成衔接叙述作为第一条 AI 消息
      const recentText = getRecentMessagesText(latestConv.nodes, selectedNodeId, 3);
      const transition = await generateChapterTransition(
        summary,
        recentText,
        activeProvider.apiUrl,
        activeProvider.apiKey,
        activeModel
      );

      // 8. 在新对话中添加衔接叙述节点
      const transitionNode = conversationService.createNode(
        newConv.id,
        "assistant",
        transition,
        null
      );
      transitionNode.modelName = activeModel;
      await useConversationStore.getState().addNodeAndSave(transitionNode);

      // 9. 加载新对话并跳转
      await useConversationStore.getState().loadConversation(project!.id, newConv.id);
      onSelectNode(transitionNode.id);

    } catch (err) {
      console.error("章节切换失败:", err);
      setError("章节切换失败：" + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsChapterTransitioning(false);
    }
  }, [storyConfig, activeProvider, activeModel, project, selectedNodeId, onSelectNode]);

  // 保持 chapterSwitch ref 同步，供 handleGenerate 的 onDone 回调使用
  const chapterSwitchRef = useRef(handleChapterSwitch);
  chapterSwitchRef.current = handleChapterSwitch;

  // AI 生成回复（接受可选的 overrideNodeId）
  const handleGenerate = useCallback(async (overrideNodeId?: string) => {
    if (!activeProvider || !activeModel) {
      setError("请先在设置中配置 API");
      return;
    }

    // 使用 overrideNodeId 或从闭包捕获的 selectedNodeId（调用时已确定）
    const targetNodeId = overrideNodeId || selectedNodeId;

    // 从 store 获取最新的 conversation（避免闭包中的旧值）
    const latestConv = useConversationStore.getState().conversation;
    if (!latestConv) return;

    setIsGenerating(true);
    setStreamingContent("");
    setError(null);

    // 立即创建 AbortController 并赋值，使停止按钮尽早生效
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const aiNode = conversationService.createNode(
        latestConv.id,
        "assistant",
        "",
        targetNodeId
      );
      aiNode.isPartial = true;
      aiNode.isUserEdited = false;
      aiNode.modelName = activeModel;
      setGeneratingNodeId(aiNode.id);
      await addNodeAndSave(aiNode);
      onSelectNode(aiNode.id);

      // 从 store 读取最新的 project 数据（避免闭包中旧的 project 引用）
      const freshProject = useProjectStore.getState().projects.find(
        (p) => p.id === latestConv.projectId
      );

      // RAG 检索
      let ragContext: string | undefined;
      if (freshProject?.ragEnabled && activeProvider.embedding) {
        try {
          // 再次获取最新状态（addNodeAndSave 后又更新了）
          const freshConv = useConversationStore.getState().conversation!;
          const targetNode = freshConv.nodes[targetNodeId];
          if (targetNode?.content) {
            const ragResults = await searchKnowledge(
              freshConv.projectId,
              targetNode.content,
              activeProvider.apiUrl,
              activeProvider.apiKey,
              activeProvider.embedding.model,
              5
            );
            if (ragResults.length > 0) {
              ragContext = ragResults
                .map(
                  (r, i) =>
                    `[参考${i + 1}] (相似度: ${(r.score * 100).toFixed(1)}%)\n${r.chunk.content}`
                )
                .join("\n\n");
            }
          }
        } catch (err) {
          console.warn("RAG 检索失败:", err);
        }
      }

      // 获取最新节点数据用于构建上下文
      const freshNodes = useConversationStore.getState().conversation!.nodes;
      // 获取最新的 storyConfig
      const freshIsStoryMode = freshProject?.mode === "story";
      const freshStoryConfig = freshProject?.storyConfig;

      const context = await buildContext({
        nodes: freshNodes,
        currentNodeId: targetNodeId,
        projectId: conversation.projectId,
        projectDescription: freshProject?.description,
        ragContext,
        maxTokens: activeProvider.maxContextTokens,
        model: activeModel,
        storyConfig: freshIsStoryMode ? freshStoryConfig : undefined,
        storyRagContext: undefined, // Will be populated by RAG for story mode later
      });

      let fullContent = "";

      await streamChatCompletion({
        apiUrl: activeProvider.apiUrl,
        apiKey: activeProvider.apiKey,
        model: activeModel,
        messages: context.messages,
        modelConfig: activeProvider.modelConfig,
        signal: controller.signal,
        callbacks: {
          onToken: (token) => {
            fullContent += token;
            setStreamingContent(fullContent);
          },
          onImage: async (image) => {
            return;
            // 多模态内联图片：创建 Attachment 并保存
            try {
              const attId = crypto.randomUUID();
              const isDataUrl = image.url.startsWith("data:");
              const mimeType = isDataUrl ? image.url.split(";")[0].split(":")[1] : "image/png";
              const ext = mimeType.split("/")[1] || "png";
              const filePath = `${conversation.id}/${attId}.${ext}`;

              const attachment: Attachment = {
                id: attId,
                type: "image",
                filename: `inline_${Date.now()}.${ext}`,
                mimeType,
                filePath,
                size: 0,
                data: image.url,
              };

              await attachmentService.saveAttachment(conversation.projectId, conversation.id, attachment);

              // 添加到当前 AI 节点的 attachments
              const freshConv = useConversationStore.getState().conversation!;
              if (freshConv) {
                const node = freshConv.nodes[aiNode.id];
                if (node) {
                  const existingAtts = node.attachments || [];
                  await updateNodeAndSave(aiNode.id, {
                    attachments: [...existingAtts, attachmentService.stripAttachmentData(attachment)],
                  });
                }
              }
            } catch (err) {
              console.warn("保存内联图片失败:", err);
            }
          },
          onDone: async (content) => {
            await updateNodeAndSave(aiNode.id, {
              content,
              isPartial: false,
            });
            setStreamingContent("");
            setGeneratingNodeId(null);
            setIsGenerating(false);
            abortControllerRef.current = null;

            // 故事模式：检查是否需要切换章节
            if (freshIsStoryMode && freshStoryConfig && activeProvider?.maxContextTokens) {
              const latestConv2 = useConversationStore.getState().conversation;
              if (latestConv2) {
                const chain = traceMessages(latestConv2.nodes, aiNode.id);
                const totalTokens = countMessagesTokens(
                  chain.map((n) => ({ role: n.role, content: n.content })),
                  activeModel || "gpt-4"
                );
                const threshold = activeProvider.maxContextTokens * 0.5;
                if (totalTokens > threshold) {
                  // 延迟执行章节切换，让 UI 先更新
                  setTimeout(() => chapterSwitchRef.current(), 500);
                }
              }
            }
          },
          onError: async (err) => {
            setError(err.message);
            if (fullContent) {
              await updateNodeAndSave(aiNode.id, {
                content: fullContent,
                isPartial: true,
              });
            }
            setStreamingContent("");
            setGeneratingNodeId(null);
            setIsGenerating(false);
            abortControllerRef.current = null;
          },
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStreamingContent("");
      setGeneratingNodeId(null);
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  }, [
    activeProvider,
    activeModel,
    addNodeAndSave,
    updateNodeAndSave,
    onSelectNode,
  ]);

  // 发送消息（自动触发 AI 生成）
  const handleSend = useCallback(async () => {
    if (!inputText.trim() && attachments.length === 0) return;

    const content = inputText.trim();
    const nextAttachments = attachments.length > 0 ? [...attachments] : undefined;
    const canReuseCurrentNode =
      currentNode?.role === "user" &&
      !currentNode.content.trim() &&
      (!currentNode.attachments || currentNode.attachments.length === 0) &&
      currentNode.childrenIds.length === 0;

    if (canReuseCurrentNode) {
      await updateNodeAndSave(currentNode.id, {
        content,
        attachments: nextAttachments,
        isUserEdited: true,
      });
      setInputText("");
      clearAttachments();
      clearProcessingError();
      handleGenerate(currentNode.id);
      return;
    }

    const node = conversationService.createNode(
      conversation.id,
      "user",
      content,
      selectedNodeId,
      nextAttachments
    );
    await addNodeAndSave(node);
    setInputText("");
    clearAttachments();
    clearProcessingError();
    onSelectNode(node.id);
    // 自动生成 AI 回复
    handleGenerate(node.id);
  }, [
    inputText,
    attachments,
    currentNode,
    conversation.id,
    selectedNodeId,
    addNodeAndSave,
    updateNodeAndSave,
    onSelectNode,
    clearAttachments,
    clearProcessingError,
    handleGenerate,
  ]);

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // 图片生成
  const handleGenerateImage = useCallback(() => {
    if (!activeProvider || !activeProvider.imageGeneration) return;
    const latestConv = useConversationStore.getState().conversation || conversation;
    const prompt = buildImagePromptFromContext(
      latestConv.nodes,
      selectedNodeId,
      inputText
    );
    if (!prompt) return;

    setImagePromptDraft(prompt);
    setImagePromptDialogOpen(true);
  }, [activeProvider, conversation, selectedNodeId, inputText]);

  const confirmGenerateImage = useCallback(async () => {
    if (!activeProvider || !activeProvider.imageGeneration) return;
    const prompt = imagePromptDraft.trim();
    if (!prompt) return;

    setImagePromptDialogOpen(false);

    const imgConfig = activeProvider.imageGeneration;
    setIsGenerating(true);
    setError(null);

    let imageNodeId: string | null = null;

    try {
      // 创建用户节点（显示 prompt）
      const userNode = conversationService.createNode(
        conversation.id,
        "user",
        prompt,
        selectedNodeId
      );
      await addNodeAndSave(userNode);
      setInputText("");
      onSelectNode(userNode.id);

      const aiNode = conversationService.createNode(
        conversation.id,
        "assistant",
        "Generating image...",
        userNode.id
      );
      aiNode.isPartial = true;
      aiNode.modelName = imgConfig.model;
      await addNodeAndSave(aiNode);
      imageNodeId = aiNode.id;
      onSelectNode(aiNode.id);

      // 调用图片生成 API
      const result = await generateImage(
        imgConfig.apiUrl || activeProvider.apiUrl,
        imgConfig.apiKey || activeProvider.apiKey,
        imgConfig.model,
        prompt,
        imgConfig.size
      );

      // 将图片转为 Attachment
      const attId = crypto.randomUUID();
      const ext = "png";
      const filePath = `${conversation.id}/${attId}.${ext}`;
      const dataUrl = await resolveGeneratedImageDataUrl(result);

      if (!dataUrl) throw new Error("图片生成 API 未返回图片数据");

      const attachment: Attachment = {
        id: attId,
        type: "image",
        filename: `generated_${Date.now()}.png`,
        mimeType: "image/png",
        filePath,
        size: result.b64_json?.length || 0,
        data: dataUrl,
      };

      // 保存附件到磁盘
      await attachmentService.saveAttachment(conversation.projectId, conversation.id, attachment);

      // 创建 AI 回复节点
      const aiContent = result.revised_prompt
        ? `*生成提示词: ${result.revised_prompt}*`
        : "已生成图片";
      await updateNodeAndSave(aiNode.id, {
        content: aiContent,
        isPartial: false,
        attachments: [attachmentService.stripAttachmentData(attachment)],
      });
      onSelectNode(aiNode.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      if (imageNodeId) {
        await updateNodeAndSave(imageNodeId, {
          content: `Image generation failed: ${message}`,
          isPartial: false,
        });
      }
    } finally {
      setIsGenerating(false);
    }
  }, [activeProvider, imagePromptDraft, conversation, selectedNodeId, addNodeAndSave, updateNodeAndSave, onSelectNode]);

  const handleRegenerate = useCallback(async () => {
    if (!currentNode || currentNode.role !== "assistant") return;
    const parentId = currentNode.parentId;
    if (!parentId) return;
    onSelectNode(parentId);
    handleGenerate(parentId);
  }, [currentNode, onSelectNode, handleGenerate]);

  const handleEditContent = useCallback(
    async (nodeId: string, newContent: string) => {
      if (!conversation) return;
      takeSnapshot(conversation);
      await updateNodeAndSave(nodeId, {
        content: newContent,
        isUserEdited: true,
      });
    },
    [conversation, updateNodeAndSave, takeSnapshot]
  );

  const handleEditSaved = useCallback(async (nodeId: string) => {
    const currentConfig = useConfigStore.getState().config;
    if (currentConfig?.autoGenerateOnEnter !== false) {
      await handleGenerate(nodeId);
    }
  }, [handleGenerate]);

  const togglePin = async (nodeId: string) => {
    const node = conversation.nodes[nodeId];
    if (node) await updateNodeAndSave(nodeId, { isPinned: !node.isPinned });
  };

  const toggleStar = async (nodeId: string) => {
    const node = conversation.nodes[nodeId];
    if (node) await updateNodeAndSave(nodeId, { isStarred: !node.isStarred });
  };

  const canGenerate =
    currentNode?.role === "user" && !isGenerating && !!activeProvider;

  // 分支导航：查找当前节点在兄弟节点中的位置
  const getBranchInfo = useCallback(
    (nodeId: string) => {
      const node = conversation.nodes[nodeId];
      if (!node || !node.parentId) return null;
      const parent = conversation.nodes[node.parentId];
      if (!parent || parent.childrenIds.length <= 1) return null;
      const index = parent.childrenIds.indexOf(nodeId);
      return {
        current: index + 1,
        total: parent.childrenIds.length,
        siblings: parent.childrenIds,
        index,
      };
    },
    [conversation.nodes]
  );

  // 切换到同一层的兄弟分支
  const switchBranch = useCallback(
    (nodeId: string, direction: -1 | 1) => {
      const info = getBranchInfo(nodeId);
      if (!info) return;
      const newIndex = info.index + direction;
      if (newIndex < 0 || newIndex >= info.total) return;
      onSelectNode(info.siblings[newIndex]);
    },
    [getBranchInfo, onSelectNode]
  );

  return (
    <div
      className="relative flex-1 flex flex-col overflow-hidden bg-background"
      {...dragHandlers}
    >
      <ImagePromptDialog
        open={imagePromptDialogOpen}
        prompt={imagePromptDraft}
        onPromptChange={setImagePromptDraft}
        onCancel={() => setImagePromptDialogOpen(false)}
        onConfirm={confirmGenerateImage}
        isGenerating={isGenerating}
      />
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-primary/10 backdrop-blur-sm border-2 border-dashed border-primary/50 rounded-lg">
          <div className="flex flex-col items-center gap-2 text-primary">
            <ImageIcon className="h-10 w-10" />
            <span className="text-sm font-medium">拖放图片或文档到这里</span>
          </div>
        </div>
      )}
      {/* 顶部栏 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onBack}
          title="返回画布 (Escape)"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-sm font-medium truncate">{conversation.name}</h3>
        {activeModel && (
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {activeModel}
          </span>
        )}
        {isStoryMode && (
          <span className="text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
            故事模式
          </span>
        )}
        {isChapterTransitioning && (
          <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded animate-pulse">
            切换章节中...
          </span>
        )}
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          Esc 返回画布
        </span>
      </div>

      {/* 消息列表 - 居中布局 */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {messages.map((msg) => {
            const branchInfo = getBranchInfo(msg.id);
            return (
              <div key={msg.id}>
                {/* 分支导航器 */}
                {branchInfo && (
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={branchInfo.index === 0}
                      onClick={() => switchBranch(msg.id, -1)}
                    >
                      <ChevronLeft className="h-3 w-3" />
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      分支 {branchInfo.current}/{branchInfo.total}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={branchInfo.index === branchInfo.total - 1}
                      onClick={() => switchBranch(msg.id, 1)}
                    >
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                <ChatBubble
                  node={msg}
                  isSelected={msg.id === selectedNodeId}
                  projectId={conversation.projectId}
                  autoEdit={
                    msg === messages[messages.length - 1] &&
                    msg.role === "user" &&
                    !msg.content
                  }
                  onTogglePin={() => togglePin(msg.id)}
                  onToggleStar={() => toggleStar(msg.id)}
                  onEditContent={(newContent) => handleEditContent(msg.id, newContent)}
                  onEditSaved={handleEditSaved}
                />
                {/* 故事模式选项按钮 */}
                {isStoryMode && msg.role === "assistant" && (
                  <StoryChoices
                    content={streamingContent || msg.content}
                    isStreaming={isGenerating && msg.id === generatingNodeId}
                    onSelectChoice={(text) => {
                      const node = conversationService.createNode(
                        conversation.id,
                        "user",
                        text,
                        msg.id
                      );
                      addNodeAndSave(node);
                      onSelectNode(node.id);
                      handleGenerate(node.id);
                    }}
                  />
                )}
              </div>
            );
          })}

          {/* 流式生成中 */}
          {isGenerating && streamingContent && (
            <div className="rounded-xl p-4 text-sm bg-green-50 border border-green-200">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-xs font-medium text-green-600">AI</span>
                <Loader2 className="h-3 w-3 animate-spin text-green-600" />
                <span className="text-xs text-green-600">生成中...</span>
              </div>
              <MarkdownRenderer content={streamingContent} streaming />
            </div>
          )}

          {error && (
            <div className="rounded-xl p-4 text-sm bg-red-50 border border-red-200 text-red-600">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 生成操作栏 */}
      {(canGenerate || isGenerating || currentNode?.role === "assistant") && (
        <div className="border-t bg-muted/30">
          <div className="max-w-3xl mx-auto px-4 py-2 flex items-center gap-2">
            {isGenerating ? (
              <>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>生成中...</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={handleStop}
                >
                  <Square className="h-3 w-3 mr-1" />
                  停止
                </Button>
              </>
            ) : (
              <>
                {canGenerate && (
                  <Button size="sm" onClick={() => handleGenerate()}>
                    <Bot className="h-3 w-3 mr-1" />
                    生成回复
                  </Button>
                )}
                {currentNode?.role === "assistant" && (
                  <Button size="sm" variant="outline" onClick={handleRegenerate}>
                    <RefreshCw className="h-3 w-3 mr-1" />
                    重新生成
                  </Button>
                )}
              </>
            )}
            {!activeProvider && (
              <span className="text-xs text-muted-foreground">
                请先在设置中配置 API
              </span>
            )}
          </div>
        </div>
      )}

      {/* 输入区域 */}
      <div className="border-t bg-background relative">
        <div className="max-w-3xl mx-auto p-4">
          {/* 附件预览 */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="relative group/att flex items-center gap-1.5 px-2 py-1 rounded-lg border bg-muted/50 text-xs"
                >
                  {att.type === "image" ? (
                    <AttachmentImage
                      attachment={att}
                      projectId={conversation.projectId}
                      className="h-10 w-10 object-cover rounded"
                    />
                  ) : (
                    <>
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="max-w-[120px] truncate">{att.filename}</span>
                    </>
                  )}
                  <button
                    className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity"
                    onClick={() => removeAttachment(att.id)}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {isProcessingAttachments && (
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>正在处理附件...</span>
            </div>
          )}
          {processingError && (
            <div className="mb-2 text-xs text-destructive">{processingError}</div>
          )}
          <div className="flex gap-2">
            <div className="flex items-end gap-1">
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={pickImages}
                      disabled={isGenerating || isProcessingAttachments}
                    >
                      <ImageIcon className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top"><p>上传图片</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={pickDocuments}
                      disabled={isGenerating || isProcessingAttachments}
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top"><p>上传文档</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {activeProvider?.imageGeneration && (
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-9 px-2"
                        onClick={handleGenerateImage}
                        disabled={
                          isGenerating ||
                          isProcessingAttachments ||
                          false
                        }
                      >
                        <Wand2 className="h-4 w-4 mr-1" />
                        <span className="text-xs">生图</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top"><p>生成图片</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onPaste={handlePaste}
              placeholder="输入消息...（可粘贴图片）"
              className="flex-1 min-h-[60px] max-h-[150px] p-3 border rounded-xl bg-background text-sm resize-y outline-none focus:ring-2 focus:ring-ring"
              disabled={isGenerating || isProcessingAttachments}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
                // 阻止 Escape 冒泡到全局处理（如果有内容）
                if (e.key === "Escape" && inputText.trim()) {
                  e.stopPropagation();
                  setInputText("");
                }
              }}
            />
            <Button
              size="icon"
              className="self-end h-10 w-10 rounded-xl"
              onClick={handleSend}
              disabled={
                (!inputText.trim() && attachments.length === 0) ||
                isGenerating ||
                isProcessingAttachments
              }
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Enter 发送，Shift+Enter 换行，Ctrl+V 粘贴图片，拖拽上传
          </p>
        </div>
      </div>
      <AttachmentViewerSheet />
    </div>
  );
}

/* ============ 全屏消息气泡 ============ */

interface ChatBubbleProps {
  node: ChatNode;
  isSelected: boolean;
  projectId: string;
  autoEdit?: boolean;
  onTogglePin: () => void;
  onToggleStar: () => void;
  onEditContent: (newContent: string) => Promise<void> | void;
  onEditSaved?: (nodeId: string) => Promise<void> | void;
}

function ChatBubble({
  node,
  isSelected,
  projectId,
  autoEdit,
  onTogglePin,
  onToggleStar,
  onEditContent,
  onEditSaved,
}: ChatBubbleProps) {
  const openAttachmentViewer = useCallback((att: Attachment) => {
    window.dispatchEvent(
      new CustomEvent("open-attachment-viewer", {
        detail: { attachment: att, projectId },
      })
    );
  }, [projectId]);
  const isUser = node.role === "user";
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nodeAttachments = node.attachments || [];

  const handleDoubleClick = useCallback(() => {
    setEditText(node.content);
    setIsEditing(true);
  }, [node.content]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [isEditing]);

  // 自动进入编辑模式（用于空的根节点）
  useEffect(() => {
    if (autoEdit && !isEditing) {
      setEditText(node.content);
      setIsEditing(true);
    }
  }, [autoEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveEdit = useCallback(async (source: 'enter' | 'blur' = 'blur') => {
    if (editText !== node.content) {
      await onEditContent(editText);
    }
    setIsEditing(false);
    // 仅在 Enter 保存时触发自动生成，失焦不触发
    if (source === 'enter' && editText.trim() && onEditSaved) {
      await onEditSaved(node.id);
    }
  }, [editText, node.content, node.id, onEditContent, onEditSaved]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditText("");
  }, []);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void saveEdit('enter');
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
      }
      e.stopPropagation();
    },
    [saveEdit, cancelEdit]
  );

  return (
    <div
      className={`group relative rounded-xl p-4 text-sm ${
        isUser
          ? "bg-blue-50 border border-blue-200"
          : "bg-green-50 border border-green-200"
      } ${isSelected ? "ring-2 ring-primary/50" : ""}`}
      onDoubleClick={handleDoubleClick}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <span
          className={`text-xs font-medium ${
            isUser ? "text-blue-600" : "text-green-600"
          }`}
        >
          {isUser ? "用户" : "AI"}
        </span>
        {node.isPartial && (
          <span className="text-xs text-orange-500">未完成</span>
        )}
        {node.modelName && (
          <span className="text-[10px] text-muted-foreground">
            {node.modelName}
          </span>
        )}
        {node.isUserEdited && (
          <span className="text-[10px] text-purple-500">已编辑</span>
        )}
        {nodeAttachments.length > 0 && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <Paperclip className="h-3 w-3" />
            {nodeAttachments.length}
          </span>
        )}

        <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="p-1 rounded hover:bg-background/50"
                  onClick={onToggleStar}
                >
                  <Star
                    className={`h-3.5 w-3.5 ${
                      node.isStarred
                        ? "text-yellow-500 fill-yellow-500"
                        : "text-muted-foreground"
                    }`}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>收藏：标记重要消息</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="p-1 rounded hover:bg-background/50"
                  onClick={onTogglePin}
                >
                  {node.isPinned ? (
                    <PinOff className="h-3.5 w-3.5 text-amber-500" />
                  ) : (
                    <Pin className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>锁定：上下文裁剪时保留此消息</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* 附件展示 */}
      {nodeAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {nodeAttachments.map((att) =>
            att.type === "image" ? (
              <AttachmentImage
                key={att.id}
                attachment={att}
                projectId={projectId}
                className="max-h-[200px] max-w-full rounded-lg border cursor-pointer"
                onClick={() => openAttachmentViewer(att)}
              />
            ) : (
              <span
                key={att.id}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted text-xs text-muted-foreground cursor-pointer hover:bg-muted/80"
                onClick={() => openAttachmentViewer(att)}
              >
                <FileText className="h-3 w-3" />
                {att.filename}
              </span>
            )
          )}
        </div>
      )}

      {isEditing ? (
        <div className="space-y-1.5">
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleEditKeyDown}
            onBlur={() => {
              void saveEdit('blur');
            }}
            className="w-full min-h-[80px] max-h-[300px] p-3 border rounded-lg bg-background text-sm resize-y outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="text-[10px] text-muted-foreground">
            Enter 保存，Shift+Enter 换行，Esc 取消
          </p>
        </div>
      ) : (
        node.role === "assistant" ? (
          <MarkdownRenderer content={node.content} />
        ) : (
          <div className="whitespace-pre-wrap break-words text-foreground/90 leading-relaxed">
            {node.content || "(空消息)"}
          </div>
        )
      )}

      {(node.isPinned || node.isStarred) && (
        <div className="flex items-center gap-1 mt-2">
          {node.isPinned && (
            <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
              已锁定
            </span>
          )}
          {node.isStarred && (
            <span className="text-[10px] text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded">
              已收藏
            </span>
          )}
        </div>
      )}
    </div>
  );
}
