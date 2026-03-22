import { useEffect, useState } from "react";
import { useConfigStore } from "@/stores/config-store";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Trash2,
  Pencil,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { ApiProvider, ModelConfig } from "@/types";

export function SettingsPage() {
  const {
    config,
    loadConfig,
    addProvider,
    updateProvider,
    removeProvider,
    setActiveProvider,
  } = useConfigStore();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  if (!config) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        加载配置中...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto">
      <h2 className="text-2xl font-semibold mb-6">设置</h2>

      {/* API 厂商列表 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">API 配置</h3>
          <Button size="sm" onClick={() => setIsAdding(true)}>
            <Plus className="h-4 w-4 mr-1" />
            添加厂商
          </Button>
        </div>

        {isAdding && (
          <ProviderForm
            onSave={async (data) => {
              await addProvider(data);
              setIsAdding(false);
            }}
            onCancel={() => setIsAdding(false)}
          />
        )}

        {config.providers.length === 0 && !isAdding ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>还没有配置任何 API 厂商</p>
            <p className="text-sm mt-1">点击上方按钮添加 OpenAI、Anthropic 等厂商配置</p>
          </div>
        ) : (
          config.providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              isActive={config.activeProviderId === provider.id}
              isExpanded={expandedId === provider.id}
              activeModel={config.activeModel}
              onToggleExpand={() =>
                setExpandedId(expandedId === provider.id ? null : provider.id)
              }
              onSetActive={(model) => setActiveProvider(provider.id, model)}
              onUpdate={(updates) => updateProvider(provider.id, updates)}
              onDelete={() => {
                if (confirm(`确定要删除 ${provider.name} 的配置吗？`)) {
                  removeProvider(provider.id);
                }
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ============ Provider Form (添加/编辑) ============ */

interface ProviderFormProps {
  initial?: Partial<ApiProvider>;
  onSave: (data: Omit<ApiProvider, "id">) => Promise<void>;
  onCancel: () => void;
}

function ProviderForm({ initial, onSave, onCancel }: ProviderFormProps) {
  const [name, setName] = useState(initial?.name || "");
  const [apiUrl, setApiUrl] = useState(
    initial?.apiUrl || "https://api.openai.com/v1"
  );
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState(initial?.models?.join(", ") || "");
  const [defaultModel, setDefaultModel] = useState(
    initial?.defaultModel || ""
  );
  const [maxContextTokens, setMaxContextTokens] = useState(
    initial?.maxContextTokens || 128000
  );
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const defaultConfig: ModelConfig = initial?.modelConfig || {
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
  };

  const [modelConfig, setModelConfig] = useState<ModelConfig>(defaultConfig);

  const handleSubmit = async () => {
    if (!name.trim() || !apiUrl.trim()) return;
    setSaving(true);
    try {
      const modelList = models
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean);
      await onSave({
        name: name.trim(),
        apiUrl: apiUrl.trim(),
        models: modelList,
        defaultModel: defaultModel || modelList[0] || "",
        maxContextTokens,
        modelConfig,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-card">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            厂商名称
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：OpenAI"
            className="w-full mt-1 px-3 py-1.5 border rounded-md bg-background text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            API 地址
          </label>
          <input
            type="text"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="w-full mt-1 px-3 py-1.5 border rounded-md bg-background text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">
          API 密钥
        </label>
        <div className="relative mt-1">
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="w-full px-3 py-1.5 pr-10 border rounded-md bg-background text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setShowKey(!showKey)}
          >
            {showKey ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          密钥将安全存储在本地（暂存内存，后续接入 stronghold 加密）
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            模型列表（逗号分隔）
          </label>
          <input
            type="text"
            value={models}
            onChange={(e) => setModels(e.target.value)}
            placeholder="gpt-4o, gpt-4o-mini"
            className="w-full mt-1 px-3 py-1.5 border rounded-md bg-background text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            默认模型
          </label>
          <input
            type="text"
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            placeholder="gpt-4o"
            className="w-full mt-1 px-3 py-1.5 border rounded-md bg-background text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">
          最大上下文 Token 数
        </label>
        <input
          type="number"
          value={maxContextTokens}
          onChange={(e) => setMaxContextTokens(Number(e.target.value))}
          className="w-full mt-1 px-3 py-1.5 border rounded-md bg-background text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* 模型参数 */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          模型参数
        </label>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">温度</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={modelConfig.temperature}
              onChange={(e) =>
                setModelConfig({ ...modelConfig, temperature: Number(e.target.value) })
              }
              className="w-full mt-1 px-2 py-1 border rounded text-sm bg-background outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">最大生成 Token</label>
            <input
              type="number"
              value={modelConfig.maxTokens}
              onChange={(e) =>
                setModelConfig({ ...modelConfig, maxTokens: Number(e.target.value) })
              }
              className="w-full mt-1 px-2 py-1 border rounded text-sm bg-background outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Top P</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={modelConfig.topP}
              onChange={(e) =>
                setModelConfig({ ...modelConfig, topP: Number(e.target.value) })
              }
              className="w-full mt-1 px-2 py-1 border rounded text-sm bg-background outline-none"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button size="sm" onClick={handleSubmit} disabled={saving || !name.trim()}>
          {saving ? "保存中..." : "保存"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  );
}

/* ============ Provider Card ============ */

interface ProviderCardProps {
  provider: ApiProvider;
  isActive: boolean;
  isExpanded: boolean;
  activeModel?: string;
  onToggleExpand: () => void;
  onSetActive: (model: string) => void;
  onUpdate: (updates: Partial<ApiProvider>) => Promise<void>;
  onDelete: () => void;
}

function ProviderCard({
  provider,
  isActive,
  isExpanded,
  activeModel,
  onToggleExpand,
  onSetActive,
  onUpdate,
  onDelete,
}: ProviderCardProps) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors ${
        isActive ? "border-primary/50 bg-primary/5" : ""
      }`}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/50"
        onClick={onToggleExpand}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="font-medium text-sm flex-1">{provider.name}</span>
        {isActive && (
          <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">
            当前使用: {activeModel}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {provider.models.length} 个模型
        </span>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t p-3 space-y-3">
          {isEditing ? (
            <ProviderForm
              initial={provider}
              onSave={async (data) => {
                await onUpdate(data);
                setIsEditing(false);
              }}
              onCancel={() => setIsEditing(false)}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">API 地址：</span>
                  <span className="break-all">{provider.apiUrl}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">上下文限制：</span>
                  <span>{provider.maxContextTokens.toLocaleString()} tokens</span>
                </div>
              </div>

              {/* 模型选择 */}
              <div>
                <span className="text-xs font-medium text-muted-foreground">
                  可用模型（点击激活）
                </span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {provider.models.map((model) => (
                    <button
                      key={model}
                      className={`px-2 py-1 text-xs rounded border transition-colors ${
                        isActive && activeModel === model
                          ? "bg-primary text-primary-foreground border-primary"
                          : "hover:bg-accent border-border"
                      }`}
                      onClick={() => onSetActive(model)}
                    >
                      {model}
                    </button>
                  ))}
                </div>
              </div>

              {/* 参数显示 */}
              <div className="text-xs text-muted-foreground">
                温度: {provider.modelConfig.temperature} | 最大Token:{" "}
                {provider.modelConfig.maxTokens} | Top P:{" "}
                {provider.modelConfig.topP}
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  编辑
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  删除
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
