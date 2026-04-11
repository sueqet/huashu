import { useEffect, useState, useRef, useCallback } from "react";
import type { KnowledgeBase, KBDocument } from "@/types";
import { useConfigStore } from "@/stores/config-store";
import {
  getKnowledgeBase,
  initKnowledgeBase,
  addDocument,
  removeDocument,
} from "@/services/rag-service";
import { SUPPORTED_FILE_TYPES } from "@/services/document-parser";
import { Button } from "@/components/ui/button";
import {
  Upload,
  Trash2,
  FileText,
  AlertCircle,
  CheckCircle,
  Loader2,
  Database,
  RefreshCw,
} from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";

interface KnowledgeBasePanelProps {
  projectId: string;
}

export function KnowledgeBasePanel({ projectId }: KnowledgeBasePanelProps) {
  const config = useConfigStore((s) => s.config);
  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  const activeProvider = config?.providers.find(
    (p) => p.id === config.activeProviderId
  );
  const embeddingConfig = activeProvider?.embedding;

  const loadKB = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getKnowledgeBase(projectId);
      setKb(data);
    } catch (err) {
      console.error("加载知识库失败:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadKB();
  }, [loadKB]);

  const handleInit = async () => {
    if (!embeddingConfig) {
      setError("请先在设置中配置 Embedding 模型");
      return;
    }
    try {
      const newKb = await initKnowledgeBase(projectId, embeddingConfig);
      setKb(newKb);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "初始化失败");
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!activeProvider || !embeddingConfig) {
      setError("请先在设置中配置 Embedding 模型");
      return;
    }

    setError(null);
    for (const file of Array.from(files)) {
      setProcessing(`处理: ${file.name}`);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const content = new Uint8Array(arrayBuffer);
        await addDocument(
          projectId,
          file.name,
          content,
          activeProvider.apiUrl,
          activeProvider.apiKey,
          embeddingConfig.model,
          (stage) => setProcessing(`${file.name}: ${stage}`)
        );
      } catch (err) {
        setError(
          `${file.name} 处理失败: ${err instanceof Error ? err.message : "未知错误"}`
        );
      }
    }
    setProcessing(null);
    await loadKB();
  };

  const handleRemoveDoc = async (docId: string, docName: string) => {
    if (!await confirm({ title: `确定要删除文档 "${docName}" 吗？`, description: "相关的向量索引也会被删除。" })) return;
    try {
      await removeDocument(projectId, docId);
      await loadKB();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const statusIcon = (status: KBDocument["status"]) => {
    switch (status) {
      case "ready":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "processing":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Loader2 className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
        加载知识库...
      </div>
    );
  }

  // 知识库未初始化
  if (!kb) {
    return (
      <div className="p-4">
        <div className="text-center py-8">
          <Database className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground mb-3">
            知识库尚未初始化
          </p>
          {!embeddingConfig && (
            <p className="text-xs text-orange-500 mb-3">
              请先在设置中配置 Embedding 模型
            </p>
          )}
          <Button size="sm" onClick={handleInit} disabled={!embeddingConfig}>
            <Database className="h-4 w-4 mr-1" />
            初始化知识库
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* 头部信息 */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium">知识库</h4>
          <p className="text-xs text-muted-foreground">
            Embedding: {kb.embeddingModel} ({kb.embeddingDimension}维)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadKB()}
            title="刷新"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Button size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-3 w-3 mr-1" />
            上传文档
          </Button>
        </div>
      </div>

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={SUPPORTED_FILE_TYPES.join(",")}
        className="hidden"
        onChange={(e) => handleUpload(e.target.files)}
      />

      {/* 处理状态 */}
      {processing && (
        <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          {processing}
        </div>
      )}

      {/* 错误信息 */}
      {error && (
        <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
          <button
            className="ml-auto text-xs underline"
            onClick={() => setError(null)}
          >
            关闭
          </button>
        </div>
      )}

      {/* 文档列表 */}
      <div className="space-y-1">
        {kb.documents.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">还没有上传文档</p>
            <p className="text-xs mt-1">
              支持 {SUPPORTED_FILE_TYPES.join(", ")}
            </p>
          </div>
        ) : (
          kb.documents.map((doc) => (
            <div
              key={doc.id}
              className="group flex items-center gap-2 p-2 border rounded hover:bg-accent/50 transition-colors"
            >
              {statusIcon(doc.status)}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{doc.filename}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatSize(doc.fileSize)} ·{" "}
                  {doc.chunkCount > 0
                    ? `${doc.chunkCount} 个片段`
                    : doc.status === "error"
                      ? doc.errorMessage || "处理失败"
                      : "处理中..."}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100"
                onClick={() => handleRemoveDoc(doc.id, doc.filename)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))
        )}
      </div>

      {/* 统计 */}
      {kb.documents.length > 0 && (
        <div className="text-xs text-muted-foreground border-t pt-2">
          共 {kb.documents.length} 个文档，
          {kb.documents
            .filter((d) => d.status === "ready")
            .reduce((sum, d) => sum + d.chunkCount, 0)}{" "}
          个文本片段
        </div>
      )}
      {ConfirmDialog}
    </div>
  );
}
