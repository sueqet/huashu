import { useState, useCallback, useRef, useEffect } from "react";
import { searchNodes, type SearchResult } from "@/services/search-service";
import { Button } from "@/components/ui/button";
import { X, Search, MessageSquare, User, Bot } from "lucide-react";

interface SearchPanelProps {
  projectId: string;
  onClose: () => void;
  onNavigate: (conversationId: string, nodeId: string) => void;
}

export function SearchPanel({
  projectId,
  onClose,
  onNavigate,
}: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const res = await searchNodes(projectId, q.trim());
        setResults(res);
      } catch (err) {
        console.error("搜索失败:", err);
      } finally {
        setSearching(false);
      }
    },
    [projectId]
  );

  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(value), 300);
    },
    [doSearch]
  );

  // 高亮关键词
  const highlightText = (text: string, q: string) => {
    if (!q) return text;
    const lowerText = text.toLowerCase();
    const lowerQ = q.toLowerCase();
    const idx = lowerText.indexOf(lowerQ);
    if (idx === -1) return text;

    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-200 text-foreground rounded px-0.5">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div className="w-[380px] border-l bg-background flex flex-col">
      {/* 头部 */}
      <div className="flex items-center gap-2 px-4 py-2 border-b">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="搜索节点内容..."
          className="flex-1 bg-transparent outline-none text-sm"
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
        />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* 结果列表 */}
      <div className="flex-1 overflow-y-auto">
        {searching && (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">搜索中...</p>
          </div>
        )}

        {!searching && query && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Search className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">未找到匹配结果</p>
          </div>
        )}

        {!searching && results.length > 0 && (
          <div className="px-2 py-2 space-y-1">
            <p className="text-xs text-muted-foreground px-2 mb-2">
              找到 {results.length} 个结果
            </p>
            {results.map((result) => (
              <button
                key={`${result.conversationId}-${result.nodeId}`}
                className="w-full text-left p-2.5 rounded-md hover:bg-accent transition-colors"
                onClick={() => onNavigate(result.conversationId, result.nodeId)}
              >
                {/* 对话名称 */}
                <div className="flex items-center gap-1.5 mb-1">
                  <MessageSquare className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground truncate">
                    {result.conversationName}
                  </span>
                  <span className="ml-auto">
                    {result.role === "user" ? (
                      <User className="h-3 w-3 text-blue-500" />
                    ) : (
                      <Bot className="h-3 w-3 text-green-500" />
                    )}
                  </span>
                </div>
                {/* 内容摘要 */}
                <p className="text-xs text-foreground/80 leading-relaxed line-clamp-3">
                  {highlightText(result.content, query)}
                </p>
              </button>
            ))}
          </div>
        )}

        {!query && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Search className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">输入关键词搜索项目内所有对话节点</p>
            <p className="text-xs mt-1">快捷键: Ctrl+F</p>
          </div>
        )}
      </div>
    </div>
  );
}
