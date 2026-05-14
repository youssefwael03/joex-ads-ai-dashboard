import { useState, useRef, useEffect, useCallback } from "react";
import { useAccountStore } from "@/store/accountStore";
import { useDateStore } from "@/store/dateStore";
import { useAccountCurrency } from "@/hooks/useCurrency";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import {
  BrainCircuit, Send, User, Sparkles, Loader2, RotateCcw,
  Database, CheckCircle2, XCircle, Zap, Play, Pause, DollarSign,
  TrendingUp, BarChart3, Globe, Smartphone, Calendar, Users,
  Cpu, Clock, AlertTriangle,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiMessage {
  role: "user" | "assistant";
  content: string;
}

interface ToolEvent {
  id: string;
  type: "tool_call" | "tool_done";
  tool: string;
  label: string;
  isAction: boolean;
  success?: boolean;
  error?: string;
  input?: Record<string, any>;
}

interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

type DisplayItem =
  | { kind: "user"; content: string }
  | { kind: "assistant"; content: string; toolEvents: ToolEvent[]; model?: string; tokens?: TokenUsage; duration?: number; fallbacks?: string[] }
  | { kind: "streaming"; content: string; toolEvents: ToolEvent[]; model?: string; fallbacks?: string[] };

// ── Model display names ────────────────────────────────────────────────────────

function fmtModel(model: string): string {
  if (model.includes("deepseek-chat-v3")) return "DeepSeek V3";
  if (model.includes("gemini-2.0-flash")) return "Gemini 2.0 Flash";
  if (model.includes("qwen3-32b"))        return "Qwen3 32B";
  if (model.includes("llama-3.3-70b"))    return "Llama 3.3 70B";
  return model.split("/").pop()?.split(":")[0] ?? model;
}

function fmtDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

// ── Suggested prompts ─────────────────────────────────────────────────────────

const SUGGESTED_PROMPTS = [
  { icon: BarChart3,   label: "Full account audit",  text: "Do a full audit of my account — fetch all campaigns, ad sets, breakdowns by device and country, and tell me exactly what to fix first." },
  { icon: TrendingUp,  label: "Scale winners",        text: "Fetch all my campaigns and ad sets, identify the top 3 performers by ROAS, and increase their budgets by 20%." },
  { icon: Pause,       label: "Kill underperformers", text: "Get all campaigns and ad sets, find everything with ROAS below 1.5x after significant spend, and pause them with explanation." },
  { icon: Globe,       label: "Country breakdown",    text: "Fetch the country breakdown of my spend and ROAS. Which countries are wasting budget and which should I scale?" },
  { icon: Smartphone,  label: "Device analysis",      text: "Get the device and platform breakdown. Where is my spend going vs where my ROAS is highest? Recommend budget shifts." },
  { icon: Calendar,    label: "Daily trends",         text: "Fetch my daily performance data for this period. Identify any anomalies, CPM spikes, ROAS drops, and explain what likely caused them." },
  { icon: Users,       label: "Age & gender",         text: "Get age and gender breakdowns. Which demographic is my best performer? Should I exclude or reduce budget for any segment?" },
  { icon: Zap,         label: "Quick wins",           text: "Fetch everything — campaigns, adsets, and all breakdowns — then give me the top 5 actions I can take RIGHT NOW for maximum impact." },
];

// ── Tool icon map ─────────────────────────────────────────────────────────────

function getToolIcon(tool: string, isAction: boolean) {
  if (isAction) {
    if (tool.includes("pause"))  return Pause;
    if (tool.includes("enable")) return Play;
    if (tool.includes("budget")) return DollarSign;
  }
  if (tool.includes("campaign"))  return TrendingUp;
  if (tool.includes("adset"))     return BarChart3;
  if (tool.includes("breakdown")) return Globe;
  if (tool.includes("daily"))     return Calendar;
  if (tool.includes("overview") || tool.includes("info")) return Database;
  if (tool.includes("ads"))       return Sparkles;
  return Database;
}

// ── Tool event row ────────────────────────────────────────────────────────────

function ToolEventRow({ event }: { event: ToolEvent }) {
  const isRunning = event.type === "tool_call";
  const isAction  = event.isAction;
  const Icon      = getToolIcon(event.tool, isAction);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${
        isRunning
          ? "bg-primary/5 border border-primary/10"
          : event.success === false
          ? "bg-destructive/5 border border-destructive/10"
          : isAction
          ? "bg-green-500/10 border border-green-500/20"
          : "bg-muted/30 border border-border/40"
      }`}
    >
      {isRunning ? (
        <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
      ) : event.success === false ? (
        <XCircle className="h-3 w-3 text-destructive shrink-0" />
      ) : (
        <Icon className={`h-3 w-3 shrink-0 ${isAction ? "text-green-400" : "text-muted-foreground"}`} />
      )}
      <span className={`truncate ${
        isRunning          ? "text-primary/80"    :
        event.success === false ? "text-destructive"  :
        isAction           ? "text-green-400 font-medium" :
        "text-muted-foreground"
      }`}>
        {event.label}
      </span>
      {!isRunning && event.success !== false && isAction && (
        <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0 ml-auto" />
      )}
    </motion.div>
  );
}

// ── Model badge ───────────────────────────────────────────────────────────────

function ModelBadge({ model, isStreaming }: { model?: string; isStreaming?: boolean }) {
  if (!model) return null;
  return (
    <div className={`flex items-center gap-1 text-[10px] text-muted-foreground/60 ${isStreaming ? "animate-pulse" : ""}`}>
      <Cpu className="h-2.5 w-2.5" />
      <span>{fmtModel(model)}</span>
    </div>
  );
}

// ── Fallback notification ─────────────────────────────────────────────────────

function FallbackBadge({ from, to }: { from: string; to: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-[10px] text-yellow-400"
    >
      <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
      <span>Switched from {fmtModel(from)} → {fmtModel(to)}</span>
    </motion.div>
  );
}

// ── Stats footer ──────────────────────────────────────────────────────────────

function StatsFooter({ tokens, duration, model }: { tokens?: TokenUsage; duration?: number; model?: string }) {
  if (!tokens && !duration) return null;
  return (
    <div className="flex items-center gap-3 pt-1 text-[10px] text-muted-foreground/40 flex-wrap">
      {model && (
        <span className="flex items-center gap-1">
          <Cpu className="h-2.5 w-2.5" />
          {fmtModel(model)}
        </span>
      )}
      {tokens && tokens.total > 0 && (
        <span className="flex items-center gap-1">
          <Database className="h-2.5 w-2.5" />
          {tokens.total.toLocaleString()} tokens
        </span>
      )}
      {duration && (
        <span className="flex items-center gap-1">
          <Clock className="h-2.5 w-2.5" />
          {fmtDuration(duration)}
        </span>
      )}
    </div>
  );
}

// ── Assistant bubble ──────────────────────────────────────────────────────────

function AssistantBubble({
  content,
  toolEvents,
  isStreaming,
  model,
  tokens,
  duration,
  fallbacks,
}: {
  content: string;
  toolEvents: ToolEvent[];
  isStreaming?: boolean;
  model?: string;
  tokens?: TokenUsage;
  duration?: number;
  fallbacks?: string[];
}) {
  const latestByTool = new Map<string, ToolEvent>();
  for (const e of toolEvents) {
    latestByTool.set(e.tool + e.id, e);
  }
  const displayEvents = Array.from(latestByTool.values());

  // Build fallback pairs from the fallbacks array (alternating from/to)
  const fallbackPairs: { from: string; to: string }[] = [];
  if (fallbacks) {
    for (let i = 0; i + 1 < fallbacks.length; i += 2) {
      fallbackPairs.push({ from: fallbacks[i], to: fallbacks[i + 1] });
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3"
    >
      <div className="h-8 w-8 shrink-0 rounded-full bg-secondary/20 border border-secondary/30 flex items-center justify-center mt-0.5">
        <BrainCircuit className="h-4 w-4 text-secondary" />
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Fallback notifications */}
        {fallbackPairs.map((pair, i) => (
          <FallbackBadge key={i} from={pair.from} to={pair.to} />
        ))}

        {/* Tool events */}
        {displayEvents.length > 0 && (
          <div className="space-y-1">
            {displayEvents.map((e) => (
              <ToolEventRow key={e.tool + e.id + e.type} event={e} />
            ))}
          </div>
        )}

        {/* Text content */}
        {content && (
          <div className="px-4 py-3 rounded-xl rounded-tl-sm bg-card/60 border border-card-border text-card-foreground text-sm leading-relaxed whitespace-pre-wrap">
            {content}
            {isStreaming && (
              <span className="inline-block ml-0.5 w-0.5 h-4 bg-primary/70 animate-pulse align-middle" />
            )}
          </div>
        )}

        {/* Loading dots */}
        {isStreaming && !content && displayEvents.length === 0 && (
          <div className="px-4 py-3 rounded-xl rounded-tl-sm bg-card/60 border border-card-border">
            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="h-2 w-2 rounded-full bg-primary/60"
                  animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Stats footer (only on completed messages) */}
        {!isStreaming && (tokens || duration) && (
          <StatsFooter tokens={tokens} duration={duration} model={model} />
        )}

        {/* Streaming model indicator */}
        {isStreaming && <ModelBadge model={model} isStreaming />}
      </div>
    </motion.div>
  );
}

function UserBubble({ content }: { content: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3 flex-row-reverse"
    >
      <div className="h-8 w-8 shrink-0 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center mt-0.5">
        <User className="h-4 w-4 text-primary" />
      </div>
      <div className="max-w-[78%]">
        <div className="px-4 py-3 rounded-xl rounded-tr-sm bg-primary/15 border border-primary/20 text-foreground text-sm leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      </div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AIAssistant() {
  const { selectedAccountId, selectedAccountName } = useAccountStore();
  const { since, until }  = useDateStore();
  const currency          = useAccountCurrency();

  const [displayItems, setDisplayItems] = useState<DisplayItem[]>([]);
  const [apiMessages,  setApiMessages]  = useState<ApiMessage[]>([]);
  const [isLoading,    setIsLoading]    = useState(false);
  const [input,        setInput]        = useState("");
  const [currentModel, setCurrentModel] = useState<string>("");

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayItems]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userText = text.trim();
      const newApiMessages: ApiMessage[] = [
        ...apiMessages,
        { role: "user", content: userText },
      ];

      setDisplayItems((prev) => [...prev, { kind: "user", content: userText }]);
      setApiMessages(newApiMessages);
      setInput("");
      setIsLoading(true);

      setDisplayItems((prev) => [
        ...prev,
        { kind: "streaming", content: "", toolEvents: [], model: undefined, fallbacks: [] },
      ]);

      const token = localStorage.getItem("joex_ads_token");

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { "X-Meta-Token": token } : {}),
          },
          body: JSON.stringify({
            messages: newApiMessages,
            context: {
              accountId:   selectedAccountId ?? undefined,
              accountName: selectedAccountName ?? undefined,
              currency,
              since,
              until,
            },
          }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader  = res.body?.getReader();
        const decoder = new TextDecoder();
        let accText          = "";
        let accModel: string | undefined;
        const accToolEvents: ToolEvent[] = [];
        const accFallbacks: string[]    = [];
        let toolCounter = 0;

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              let parsed: any;
              try { parsed = JSON.parse(line.slice(6)); } catch { continue; }

              // ── Content chunk ──────────────────────────────────────────────
              if (parsed.content) {
                accText += parsed.content;
                setDisplayItems((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.kind === "streaming") {
                    next[next.length - 1] = { ...last, content: accText };
                  }
                  return next;
                });
              }

              // ── Model identified ───────────────────────────────────────────
              if (parsed.type === "model") {
                accModel = parsed.model;
                setCurrentModel(parsed.model ?? "");
                setDisplayItems((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.kind === "streaming") {
                    next[next.length - 1] = { ...last, model: parsed.model };
                  }
                  return next;
                });
              }

              // ── Model fallback ─────────────────────────────────────────────
              if (parsed.type === "fallback") {
                accModel = parsed.to;
                accFallbacks.push(parsed.from, parsed.to);
                setCurrentModel(parsed.to ?? "");
                setDisplayItems((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.kind === "streaming") {
                    next[next.length - 1] = { ...last, model: parsed.to, fallbacks: [...accFallbacks] };
                  }
                  return next;
                });
              }

              // ── Tool call started ──────────────────────────────────────────
              if (parsed.type === "tool_call") {
                toolCounter++;
                const evt: ToolEvent = {
                  id:       String(toolCounter),
                  type:     "tool_call",
                  tool:     parsed.tool,
                  label:    parsed.label,
                  isAction: !!parsed.isAction,
                  input:    parsed.input,
                };
                accToolEvents.push(evt);
                setDisplayItems((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.kind === "streaming") {
                    next[next.length - 1] = { ...last, toolEvents: [...accToolEvents] };
                  }
                  return next;
                });
              }

              // ── Tool call done ─────────────────────────────────────────────
              if (parsed.type === "tool_done") {
                const callIdx = accToolEvents.findLastIndex(
                  (e) => e.tool === parsed.tool && e.type === "tool_call",
                );
                if (callIdx !== -1) {
                  accToolEvents[callIdx] = {
                    ...accToolEvents[callIdx],
                    type:    "tool_done",
                    label:   parsed.label,
                    success: parsed.success,
                    error:   parsed.error,
                  };
                }
                setDisplayItems((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.kind === "streaming") {
                    next[next.length - 1] = { ...last, toolEvents: [...accToolEvents] };
                  }
                  return next;
                });
              }

              // ── Done ───────────────────────────────────────────────────────
              if (parsed.done) {
                const finalText       = accText;
                const finalModel      = parsed.model ?? accModel;
                const finalTokens     = parsed.tokens as TokenUsage | undefined;
                const finalDuration   = parsed.duration as number | undefined;
                const finalToolEvents = [...accToolEvents];
                const finalFallbacks  = [...accFallbacks];

                setApiMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: finalText },
                ]);
                setDisplayItems((prev) => {
                  const next    = [...prev];
                  const lastIdx = next.findLastIndex((i) => i.kind === "streaming");
                  if (lastIdx !== -1) {
                    next[lastIdx] = {
                      kind:       "assistant",
                      content:    finalText,
                      toolEvents: finalToolEvents,
                      model:      finalModel,
                      tokens:     finalTokens,
                      duration:   finalDuration,
                      fallbacks:  finalFallbacks,
                    };
                  }
                  return next;
                });
              }

              // ── Error ──────────────────────────────────────────────────────
              if (parsed.error) throw new Error(parsed.error);
            }
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Something went wrong";
        setDisplayItems((prev) => {
          const next    = [...prev];
          const lastIdx = next.findLastIndex((i) => i.kind === "streaming");
          if (lastIdx !== -1) {
            next[lastIdx] = {
              kind:       "assistant",
              content:    `Error: ${msg}. Please try again.`,
              toolEvents: [],
            };
          }
          return next;
        });
      } finally {
        setIsLoading(false);
        textareaRef.current?.focus();
      }
    },
    [apiMessages, isLoading, selectedAccountId, selectedAccountName, currency, since, until],
  );

  const clearChat = () => {
    setDisplayItems([]);
    setApiMessages([]);
    setInput("");
    setCurrentModel("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const hasAccount = !!selectedAccountId;
  const isEmpty    = displayItems.length === 0 && !isLoading;
  const toolCount  = displayItems.reduce((n, item) => {
    if (item.kind === "assistant") return n + item.toolEvents.filter((e) => e.type === "tool_done").length;
    return n;
  }, 0);

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-112px)] gap-0">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-4 shrink-0 flex-wrap gap-2">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <BrainCircuit className="h-7 w-7 sm:h-8 sm:w-8 text-secondary" />
            AI Media Buyer
          </h2>
          <p className="text-muted-foreground mt-1 text-xs sm:text-sm">
            Full live access to your Meta account — fetches data & executes actions in real time.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Live access badge */}
          {hasAccount && (
            <Badge variant="outline" className="text-xs border-green-500/30 text-green-400 gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
              Live · {currency}
            </Badge>
          )}
          {/* Current model badge */}
          {currentModel && (
            <Badge variant="outline" className="text-xs border-secondary/30 text-secondary gap-1.5">
              <Cpu className="h-2.5 w-2.5" />
              {fmtModel(currentModel)}
            </Badge>
          )}
          {/* Tool count */}
          {toolCount > 0 && (
            <Badge variant="outline" className="text-xs border-primary/30 text-primary gap-1">
              <Database className="h-2.5 w-2.5" />
              {toolCount} queries
            </Badge>
          )}
          {/* Clear */}
          {displayItems.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearChat}
              className="gap-2 text-muted-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
          )}
        </div>
      </div>

      {/* ── Chat area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 sm:gap-8 text-center py-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-3"
            >
              <div className="h-14 w-14 sm:h-16 sm:w-16 mx-auto rounded-2xl bg-secondary/10 border border-secondary/20 flex items-center justify-center">
                <Sparkles className="h-7 w-7 sm:h-8 sm:w-8 text-secondary" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-foreground">
                  {hasAccount ? "Full account access ready" : "Ask your AI media buyer anything"}
                </h3>
                <p className="text-muted-foreground text-xs sm:text-sm mt-1 max-w-md px-4">
                  {hasAccount
                    ? `Connected to ${selectedAccountName || "your account"} (${currency}). I can fetch live data, analyze every campaign and ad set, and execute actions directly.`
                    : "Select an ad account from the top bar to enable full data access and actions."}
                </p>
              </div>
              {/* Model chain info */}
              <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground/40">
                <Cpu className="h-3 w-3" />
                <span>DeepSeek V3 → Gemini Flash → Qwen3 → Llama 3.3 (auto-fallback)</span>
              </div>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl px-2">
              {SUGGESTED_PROMPTS.map((p, i) => {
                const Icon = p.icon;
                return (
                  <motion.button
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => sendMessage(p.text)}
                    disabled={!hasAccount && i > 1}
                    className="text-left px-4 py-3 rounded-lg border border-card-border bg-card/40 hover:bg-card/80 hover:border-primary/30 transition-all text-sm text-muted-foreground hover:text-foreground group disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <Icon className="h-3.5 w-3.5 text-primary/60 group-hover:text-primary transition-colors shrink-0" />
                      <span className="font-medium text-foreground text-xs">{p.label}</span>
                    </div>
                    <span className="text-xs leading-relaxed line-clamp-2">{p.text}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-5 pb-4 px-1">
            <AnimatePresence>
              {displayItems.map((item, i) => {
                if (item.kind === "user") {
                  return <UserBubble key={i} content={item.content} />;
                }
                if (item.kind === "assistant") {
                  return (
                    <AssistantBubble
                      key={i}
                      content={item.content}
                      toolEvents={item.toolEvents}
                      model={item.model}
                      tokens={item.tokens}
                      duration={item.duration}
                      fallbacks={item.fallbacks}
                    />
                  );
                }
                if (item.kind === "streaming") {
                  return (
                    <AssistantBubble
                      key={i}
                      content={item.content}
                      toolEvents={item.toolEvents}
                      model={item.model}
                      fallbacks={item.fallbacks}
                      isStreaming
                    />
                  );
                }
                return null;
              })}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Input ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 pt-3 border-t border-border">
        {!hasAccount && (
          <div className="mb-2 px-3 py-2 rounded-lg bg-yellow-500/5 border border-yellow-500/20 text-xs text-yellow-400 flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 shrink-0" />
            Select an ad account above to enable live data fetching and actions
          </div>
        )}
        <Card className="bg-card/40 border-card-border">
          <CardContent className="p-3">
            <div className="flex gap-3 items-end">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  hasAccount
                    ? "Ask me to analyze campaigns, find issues, or execute actions..."
                    : "Ask general Meta Ads strategy questions..."
                }
                className="min-h-[52px] max-h-[160px] resize-none border-0 bg-transparent p-0 focus-visible:ring-0 text-sm placeholder:text-muted-foreground/60"
                rows={2}
              />
              <Button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isLoading}
                size="icon"
                className="shrink-0 h-9 w-9 bg-primary hover:bg-primary/90"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/50 mt-2">
              Enter to send · Shift+Enter for new line · Powered by OpenRouter free models with auto-fallback
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
