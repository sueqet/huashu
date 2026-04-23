import React, { useState, useCallback, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.css";

interface MarkdownRendererProps {
  content: string;
  className?: string;
  /** 是否正在流式输出中 */
  streaming?: boolean;
}

/**
 * 流式输出时使用防抖的 Markdown 渲染，避免每个 token 都重新解析
 * 在流式输出期间，底部的新增内容用纯文本显示，定期（300ms）刷新 Markdown 渲染
 */
export function MarkdownRenderer({ content, className, streaming }: MarkdownRendererProps) {
  if (!content) return <span className="text-muted-foreground">(空消息)</span>;

  if (streaming) {
    return <StreamingMarkdown content={content} className={className} />;
  }

  return (
    <div className={`markdown-body prose prose-sm max-w-none dark:prose-invert leading-relaxed ${className || ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/**
 * 流式输出时使用防抖渲染：每 300ms 更新一次 Markdown，
 * 避免每个 token 都触发昂贵的 Markdown+KaTeX+highlight 重新解析
 */
function StreamingMarkdown({ content, className }: { content: string; className?: string }) {
  const [rendered, setRendered] = useState(content);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef(content);

  latestRef.current = content;

  useEffect(() => {
    if (timerRef.current) return; // 已有定时器在跑
    timerRef.current = setTimeout(() => {
      setRendered(latestRef.current);
      timerRef.current = null;
    }, 300);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [content]);

  // 卸载时确保显示最终内容
  useEffect(() => {
    return () => {
      setRendered(latestRef.current);
    };
  }, []);

  return (
    <div className={`markdown-body prose prose-sm max-w-none dark:prose-invert leading-relaxed ${className || ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={markdownComponents}
      >
        {rendered}
      </ReactMarkdown>
      {/* 显示尚未渲染的尾部增量内容（纯文本） */}
      {rendered !== content && (
        <span className="text-foreground/90">{content.slice(rendered.length)}</span>
      )}
    </div>
  );
}

// 共享的 Markdown 组件配置，避免重复定义
const markdownComponents = {
  code({ className, children, ...props }: any) {
    const isInline = !className;
    if (isInline) {
      return (
        <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono" {...props}>
          {children}
        </code>
      );
    }
    return <CodeBlock className={className}>{children}</CodeBlock>;
  },
  pre({ children }: any) {
    return <>{children}</>;
  },
  table({ children }: any) {
    return (
      <div className="overflow-x-auto my-2">
        <table className="min-w-full border-collapse border border-border text-sm">
          {children}
        </table>
      </div>
    );
  },
  th({ children }: any) {
    return (
      <th className="border border-border px-3 py-1.5 bg-muted font-medium text-left">
        {children}
      </th>
    );
  },
  td({ children }: any) {
    return (
      <td className="border border-border px-3 py-1.5">
        {children}
      </td>
    );
  },
  p({ children }: any) {
    return <p className="my-2 leading-relaxed">{children}</p>;
  },
  ul({ children }: any) {
    return <ul className="list-disc pl-6 my-2 space-y-1">{children}</ul>;
  },
  ol({ children }: any) {
    return <ol className="list-decimal pl-6 my-2 space-y-1">{children}</ol>;
  },
  blockquote({ children }: any) {
    return (
      <blockquote className="border-l-4 border-muted-foreground/30 pl-4 my-2 text-muted-foreground italic">
        {children}
      </blockquote>
    );
  },
  h1({ children }: any) { return <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>; },
  h2({ children }: any) { return <h2 className="text-lg font-bold mt-3 mb-2">{children}</h2>; },
  h3({ children }: any) { return <h3 className="text-base font-bold mt-3 mb-1">{children}</h3>; },
  a({ href, children }: any) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">
        {children}
      </a>
    );
  },
  hr() {
    return <hr className="my-4 border-border" />;
  },
  img({ src, alt }: any) {
    return (
      <img
        src={src}
        alt={alt || ""}
        className="max-h-[300px] max-w-full rounded-lg border cursor-pointer"
        loading="lazy"
        onClick={() => {
          window.dispatchEvent(
            new CustomEvent("open-attachment-viewer", {
              detail: { type: "image", src, alt: alt || "" },
            })
          );
        }}
      />
    );
  },
};

// Code block with copy button
function CodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const language = className?.replace("language-", "") || "";

  const handleCopy = useCallback(() => {
    const text = String(children).replace(/\n$/, "");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [children]);

  return (
    <div className="relative group/code my-2 rounded-lg overflow-hidden border border-border">
      {language && (
        <div className="flex items-center justify-between px-3 py-1 bg-muted text-xs text-muted-foreground border-b border-border">
          <span>{language}</span>
          <button
            onClick={handleCopy}
            className="px-2 py-0.5 rounded hover:bg-background/50 transition-colors"
          >
            {copied ? "已复制!" : "复制"}
          </button>
        </div>
      )}
      {!language && (
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 px-2 py-0.5 rounded text-xs bg-muted/80 hover:bg-muted opacity-0 group-hover/code:opacity-100 transition-opacity"
        >
          {copied ? "已复制!" : "复制"}
        </button>
      )}
      <pre className="overflow-x-auto p-3 text-sm">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}
