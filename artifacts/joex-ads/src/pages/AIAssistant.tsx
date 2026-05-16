import { useState, useRef, useEffect, useCallback } from "react";
import { useAccountStore } from "@/store/accountStore";
import { useDateStore } from "@/store/dateStore";
import { useAccountCurrency } from "@/hooks/useCurrency";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import {
  BrainCircuit, Send, User, Sparkles, Loader2, RotateCcw,
  Database, CheckCircle2, XCircle, Zap, Play, Pause, DollarSign,
  TrendingUp, BarChart3, Globe, Smartphone, Calendar, Users,
  Cpu, Clock, AlertTriangle, ChevronDown, Trash2, FlaskConical,
  Layers, Search, Target, MessageSquare, Activity,
} from "lucide-react";

// ── Provider options ──────────────────────────────────────────────────────────

const PROVIDER_OPTIONS = [
  { value: "auto",            label: "Auto",          description: "Claude → Groq → Mistral → Cloudflare → DeepSeek → OpenRouter" },
  { value: "claude",          label: "Claude",        description: "claude-haiku-4-5 via Replit AI Integrations" },
  { value: "groq",            label: "Groq",          description: "llama-3.3-70b-versatile via Groq" },
  { value: "mistral",         label: "Mistral",       description: "mistral-small-latest via Mistral AI" },
  { value: "cloudflare",      label: "Cloudflare",    description: "llama-3.3-70b via Cloudflare Workers AI" },
  { value: "deepseek",        label: "DeepSeek",      description: "deepseek-v4-flash:free via OpenRouter" },
  { value: "openrouter_free", label: "OpenRouter Free", description: "gemini-2.0-flash-001:free via OpenRouter" },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiMessage {
  role: "user" | "assistant";
  content: string;
}

interface BrainData {
  auditSummary?: string;
  kpiSnapshot?: Record<string, any>;
  winningCampaigns?: any[];
  losingCampaigns?: any[];
  audienceInsights?: Record<string, any>;
  recommendations?: any[];
  fatigueInfo?: Record<string, any>;
  lastDateRange?: string;
  updatedAt?: string;
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

type TaskMode = "analyze" | "execute" | "plan" | "chat" | "";

type ProviderName = "claude" | "gemini" | "groq" | "mistral" | "cloudflare" | "deepseek" | "openrouter_free";

type DisplayItem =
  | { kind: "user"; content: string }
  | { kind: "assistant"; content: string; toolEvents: ToolEvent[]; model?: string; provider?: string; tokens?: TokenUsage; duration?: number; fallbacks?: string[]; mode?: TaskMode }
  | { kind: "streaming"; content: string; toolEvents: ToolEvent[]; model?: string; provider?: string; fallbacks?: string[]; mode?: TaskMode };

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
  { icon: BarChart3,        label: "Full audit",            text: "Do a full audit of my account — fetch all campaigns, ad sets, breakdowns by device and country, and tell me exactly what to fix first.", mode: "analyze" as TaskMode },
  { icon: Zap,              label: "Quick wins",            text: "Fetch everything — campaigns, adsets, and all breakdowns — then give me the top 5 actions I can take RIGHT NOW for maximum impact.", mode: "analyze" as TaskMode },
  { icon: TrendingUp,       label: "Scale winners",         text: "Fetch all my campaigns and ad sets, identify the top 3 performers by ROAS, and increase their budgets by 20%.", mode: "execute" as TaskMode },
  { icon: Pause,            label: "Kill underperformers",  text: "Get all campaigns and ad sets, find everything with ROAS below 1.5x after significant spend, and pause them with explanation.", mode: "execute" as TaskMode },
  { icon: Layers,           label: "Build broad campaign",  text: "Create a broad scaling campaign called 'Broad Scale Test' with 500 daily budget targeting Egypt, paused for review.", mode: "execute" as TaskMode },
  { icon: Target,           label: "Retargeting campaign",  text: "Create a retargeting campaign called 'Retarget - 7 & 30 Day' with 200 daily budget targeting Egypt, paused.", mode: "execute" as TaskMode },
  { icon: Globe,            label: "Country breakdown",     text: "Fetch the country breakdown of my spend and ROAS. Which countries are wasting budget and which should I scale?", mode: "analyze" as TaskMode },
  { icon: Search,           label: "Plan next strategy",    text: "Based on my account data, recommend a complete campaign strategy for the next 30 days — structure, budgets, and priorities.", mode: "plan" as TaskMode },
];

// ── Tool icon map ─────────────────────────────────────────────────────────────

function getToolIcon(tool: string, isAction: boolean) {
  if (tool === "save_account_brain")        return BrainCircuit;
  if (tool === "execute_campaign_template") return Layers;
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

// ── Mode badge ────────────────────────────────────────────────────────────────

const MODE_CONFIG: Record<string, { label: string; color: string }> = {
  analyze: { label: "Analyze",  color: "border-blue-500/30 text-blue-400 bg-blue-500/10" },
  execute: { label: "Execute",  color: "border-green-500/30 text-green-400 bg-green-500/10" },
  plan:    { label: "Plan",     color: "border-violet-500/30 text-violet-400 bg-violet-500/10" },
  chat:    { label: "Chat",     color: "border-secondary/30 text-secondary bg-secondary/10" },
};

function ModeBadge({ mode }: { mode?: TaskMode }) {
  if (!mode) return null;
  const cfg = MODE_CONFIG[mode];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border uppercase tracking-wider ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ── Provider badge ─────────────────────────────────────────────────────────────

const PROVIDER_CONFIG: Record<string, { label: string; color: string }> = {
  claude:          { label: "Claude",      color: "border-purple-500/40 text-purple-400 bg-purple-500/10" },
  gemini:          { label: "Gemini",      color: "border-blue-500/40 text-blue-400 bg-blue-500/10" },
  groq:            { label: "Groq",        color: "border-orange-500/40 text-orange-400 bg-orange-500/10" },
  mistral:         { label: "Mistral",     color: "border-pink-500/40 text-pink-400 bg-pink-500/10" },
  cloudflare:      { label: "Cloudflare",  color: "border-yellow-500/40 text-yellow-400 bg-yellow-500/10" },
  deepseek:        { label: "DeepSeek",    color: "border-green-500/40 text-green-400 bg-green-500/10" },
  openrouter_free: { label: "OpenRouter",  color: "border-gray-500/40 text-gray-400 bg-gray-500/10" },
};

function ProviderBadge({ provider }: { provider?: string }) {
  if (!provider || !PROVIDER_CONFIG[provider]) return null;
  const cfg = PROVIDER_CONFIG[provider];
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border uppercase tracking-wider ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ── Brain status panel ─────────────────────────────────────────────────────────

function BrainPanel({
  brain,
  onClear,
  isClearing,
}: {
  brain: BrainData | null;
  onClear: () => void;
  isClearing: boolean;
}) {
  if (!brain) return null;

  const ageMs  = brain.updatedAt ? Date.now() - new Date(brain.updatedAt).getTime() : null;
  const ageMin = ageMs !== null ? Math.round(ageMs / 60_000) : null;
  const ageStr = ageMin === null ? "–" : ageMin < 60 ? `${ageMin}m ago` : `${Math.round(ageMin / 60)}h ago`;
  const isFresh = ageMin !== null && ageMin < 120;

  const kpi = brain.kpiSnapshot as Record<string, any> | undefined;
  const winners = Array.isArray(brain.winningCampaigns) ? brain.winningCampaigns.slice(0, 2) : [];
  const recs    = Array.isArray(brain.recommendations)  ? brain.recommendations.slice(0, 2)  : [];

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="mb-3 rounded-xl border bg-card/30 border-secondary/20 overflow-hidden"
    >
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <BrainCircuit className={`h-3.5 w-3.5 shrink-0 ${isFresh ? "text-secondary" : "text-muted-foreground"}`} />
          <span className="text-xs font-medium text-foreground">Account Brain</span>
          <Badge
            variant="outline"
            className={`text-[10px] h-4 px-1.5 ${isFresh ? "border-secondary/30 text-secondary" : "border-yellow-500/30 text-yellow-400"}`}
          >
            {isFresh ? "Trained" : "Stale"}
          </Badge>
          <span className="text-[10px] text-muted-foreground/50">{ageStr}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={isClearing}
          className="h-5 px-2 text-[10px] text-muted-foreground hover:text-destructive"
        >
          {isClearing ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Trash2 className="h-2.5 w-2.5" />}
        </Button>
      </div>

      {/* KPI strip */}
      {kpi && (
        <div className="px-3 pb-1.5 flex flex-wrap gap-2">
          {kpi.spend     && <span className="text-[10px] text-muted-foreground">Spend: <span className="text-foreground font-medium">{kpi.spend}</span></span>}
          {kpi.roas      && <span className="text-[10px] text-muted-foreground">ROAS: <span className="text-green-400 font-medium">{kpi.roas}x</span></span>}
          {kpi.ctr       && <span className="text-[10px] text-muted-foreground">CTR: <span className="text-foreground font-medium">{kpi.ctr}%</span></span>}
          {kpi.cpm       && <span className="text-[10px] text-muted-foreground">CPM: <span className="text-foreground font-medium">{kpi.cpm}</span></span>}
          {kpi.purchases && <span className="text-[10px] text-muted-foreground">Purchases: <span className="text-foreground font-medium">{kpi.purchases}</span></span>}
        </div>
      )}

      {/* Summary */}
      {brain.auditSummary && (
        <div className="px-3 pb-1.5">
          <p className="text-[10px] text-muted-foreground line-clamp-1">{brain.auditSummary}</p>
        </div>
      )}

      {/* Winners + recs row */}
      {(winners.length > 0 || recs.length > 0) && (
        <div className="px-3 pb-2 flex gap-4 flex-wrap">
          {winners.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <TrendingUp className="h-2.5 w-2.5 text-green-400 shrink-0" />
              {winners.map((w: any, i: number) => (
                <span key={i} className="text-[10px] text-green-400">{w.name || w}{i < winners.length - 1 ? "," : ""}</span>
              ))}
            </div>
          )}
          {recs.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <Zap className="h-2.5 w-2.5 text-primary/70 shrink-0" />
              {recs.map((r: any, i: number) => (
                <span key={i} className="text-[10px] text-muted-foreground">{r.action || r}{i < recs.length - 1 ? " ·" : ""}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
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
  provider,
  tokens,
  duration,
  fallbacks,
  mode,
}: {
  content: string;
  toolEvents: ToolEvent[];
  isStreaming?: boolean;
  model?: string;
  provider?: string;
  tokens?: TokenUsage;
  duration?: number;
  fallbacks?: string[];
  mode?: TaskMode;
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
        {/* Mode + provider + fallback row */}
        {(mode || provider || fallbackPairs.length > 0) && (
          <div className="flex items-center gap-2 flex-wrap">
            <ModeBadge mode={mode} />
            <ProviderBadge provider={provider} />
            {fallbackPairs.map((pair, i) => (
              <FallbackBadge key={i} from={pair.from} to={pair.to} />
            ))}
          </div>
        )}

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

  const [displayItems,    setDisplayItems]    = useState<DisplayItem[]>([]);
  const [apiMessages,     setApiMessages]     = useState<ApiMessage[]>([]);
  const [isLoading,       setIsLoading]       = useState(false);
  const [input,           setInput]           = useState("");
  const [currentModel,    setCurrentModel]    = useState<string>("");
  const [selectedProvider, setSelectedProvider] = useState<string>("auto");
  const [brain,           setBrain]           = useState<BrainData | null>(null);
  const [isClearing,     setIsClearing]     = useState(false);
  const [showProviderStatus, setShowProviderStatus] = useState(false);
  const [providerStatus,     setProviderStatus]     = useState<Record<string, { used: number; limit: number; available: boolean }> | null>(null);

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch brain for the selected account
  const fetchBrain = useCallback(async (accountId: string) => {
    try {
      const res = await fetch(`/api/ai/brain/${accountId}`);
      if (!res.ok) return;
      const d = await res.json() as { brain: BrainData | null };
      setBrain(d.brain ?? null);
    } catch { /* non-fatal */ }
  }, []);

  // Clear (forget) brain for the selected account
  const handleClearBrain = useCallback(async () => {
    if (!selectedAccountId || isClearing) return;
    setIsClearing(true);
    try {
      const token = localStorage.getItem("joex_ads_token");
      await fetch(`/api/ai/brain/${selectedAccountId}`, {
        method: "DELETE",
        headers: token ? { "X-Meta-Token": token } : {},
      });
      setBrain(null);
    } catch { /* non-fatal */ } finally {
      setIsClearing(false);
    }
  }, [selectedAccountId, isClearing]);


  // Load brain whenever selected account changes
  useEffect(() => {
    if (selectedAccountId) {
      fetchBrain(selectedAccountId);
    } else {
      setBrain(null);
    }
  }, [selectedAccountId, fetchBrain]);

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
            selectedProvider,
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
        let accText            = "";
        let accModel: string | undefined;
        let accProvider: string | undefined;
        let accMode: TaskMode = "";
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
                accModel    = parsed.model;
                accProvider = parsed.provider;
                accMode     = parsed.mode ?? "";
                setCurrentModel(parsed.model ?? "");
                setDisplayItems((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.kind === "streaming") {
                    next[next.length - 1] = { ...last, model: parsed.model, provider: parsed.provider, mode: parsed.mode ?? "" };
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

              // ── Model error (skipped to next) ──────────────────────────────
              if (parsed.type === "model_error") {
                // Add to fallbacks list so UI shows which models were skipped
                if (parsed.model && !accFallbacks.includes(parsed.model + "_err")) {
                  accFallbacks.push(parsed.model + "_err", parsed.model + "_err");
                }
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
                const finalProvider   = parsed.provider ?? accProvider;
                const finalTokens     = parsed.tokens as TokenUsage | undefined;
                const finalDuration   = parsed.duration as number | undefined;
                const finalToolEvents = [...accToolEvents];
                const finalFallbacks  = [...accFallbacks];

                setApiMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: finalText },
                ]);
                const finalMode = accMode;
                setDisplayItems((prev) => {
                  const next    = [...prev];
                  const lastIdx = next.findLastIndex((i) => i.kind === "streaming");
                  if (lastIdx !== -1) {
                    next[lastIdx] = {
                      kind:       "assistant",
                      content:    finalText,
                      toolEvents: finalToolEvents,
                      model:      finalModel,
                      provider:   finalProvider,
                      tokens:     finalTokens,
                      duration:   finalDuration,
                      fallbacks:  finalFallbacks,
                      mode:       finalMode,
                    };
                  }
                  return next;
                });

                // Refresh brain if AI may have called save_account_brain
                const brainSaved = finalToolEvents.some(
                  (e) => e.tool === "save_account_brain" && e.type === "tool_done" && e.success !== false,
                );
                if (brainSaved && selectedAccountId) {
                  fetchBrain(selectedAccountId);
                }
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
    [apiMessages, isLoading, selectedAccountId, selectedAccountName, currency, since, until, selectedProvider, fetchBrain],
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

          {/* Provider selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs border-card-border bg-card/40 hover:bg-card/80 text-muted-foreground hover:text-foreground"
              >
                <Cpu className="h-3 w-3 shrink-0" />
                <span>
                  {selectedProvider === "auto"
                    ? (currentModel && isLoading ? fmtModel(currentModel) : "Auto")
                    : (PROVIDER_OPTIONS.find((p) => p.value === selectedProvider)?.label ?? "Auto")}
                </span>
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">
                AI Provider
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={selectedProvider} onValueChange={setSelectedProvider}>
                {PROVIDER_OPTIONS.map((p) => (
                  <DropdownMenuRadioItem key={p.value} value={p.value} className="flex-col items-start gap-0">
                    <span className="font-medium text-sm">{p.label}</span>
                    <span className="text-xs text-muted-foreground">{p.description}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Active model badge (when chatting) */}
          {currentModel && isLoading && (
            <Badge variant="outline" className="text-xs border-secondary/30 text-secondary gap-1.5 animate-pulse">
              <Cpu className="h-2.5 w-2.5" />
              {fmtModel(currentModel)}
            </Badge>
          )}

          {/* Provider status button */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs border-card-border bg-card/40 hover:bg-card/80 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setShowProviderStatus(true);
              fetch("/api/provider-status")
                .then((r) => r.json())
                .then((d) => setProviderStatus(d))
                .catch(() => {});
            }}
          >
            <Activity className="h-3 w-3 shrink-0" />
            <span className="hidden sm:inline">Providers</span>
          </Button>

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

      {/* ── Brain panel ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {brain && hasAccount && (
          <BrainPanel brain={brain} onClear={handleClearBrain} isClearing={isClearing} />
        )}
      </AnimatePresence>

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
                  {hasAccount
                    ? brain ? "Account brain trained — memory-first mode" : "Full account access ready"
                    : "Ask your AI media buyer anything"}
                </h3>
                <p className="text-muted-foreground text-xs sm:text-sm mt-1 max-w-md px-4">
                  {hasAccount
                    ? brain
                      ? `I remember ${selectedAccountName || "your account"}. I'll answer from memory and only fetch fresh data when needed.`
                      : `Connected to ${selectedAccountName || "your account"} (${currency}). Run a full audit and I'll save the intelligence for faster future responses.`
                    : "Select an ad account from the top bar to enable full data access and actions."}
                </p>
              </div>
              {/* Brain / model info */}
              <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground/40">
                {brain
                  ? <><BrainCircuit className="h-3 w-3 text-secondary/60" /><span className="text-secondary/60">Memory active</span><span className="mx-1">·</span></>
                  : <><FlaskConical className="h-3 w-3" /><span>No memory yet — run an audit to train</span><span className="mx-1">·</span></>
                }
                <Cpu className="h-3 w-3" />
                <span>Free models with auto-fallback</span>
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
                      {p.mode && MODE_CONFIG[p.mode] && (
                        <span className={`ml-auto inline-flex items-center px-1 py-px rounded text-[8px] font-bold border uppercase tracking-wider ${MODE_CONFIG[p.mode].color}`}>
                          {MODE_CONFIG[p.mode].label}
                        </span>
                      )}
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
                      provider={item.provider}
                      tokens={item.tokens}
                      duration={item.duration}
                      fallbacks={item.fallbacks}
                      mode={item.mode}
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
                      provider={item.provider}
                      fallbacks={item.fallbacks}
                      mode={item.mode}
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
              Enter to send · Shift+Enter for new line · Multi-provider chain: Claude → Gemini → Groq → Mistral → Cloudflare → DeepSeek → OpenRouter
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Provider Status Modal ─────────────────────────────────────────── */}
      <Dialog open={showProviderStatus} onOpenChange={setShowProviderStatus}>
        <DialogContent className="sm:max-w-md bg-card border-card-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-secondary" />
              Provider Status
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {!providerStatus ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              Object.entries(providerStatus).map(([name, info]) => {
                const cfg = PROVIDER_CONFIG[name];
                const pct = Math.min(100, Math.round((info.used / info.limit) * 100));
                return (
                  <div key={name} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-muted/20 border border-card-border">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border uppercase tracking-wider shrink-0 ${cfg?.color ?? "border-gray-500/40 text-gray-400 bg-gray-500/10"}`}>
                        {cfg?.label ?? name}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {info.used.toLocaleString()} / {(info.limit / 1_000_000).toFixed(1)}M tokens
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct >= 90 ? "bg-red-500" : pct >= 60 ? "bg-yellow-500" : "bg-green-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={`text-[10px] font-medium ${info.available ? "text-green-400" : "text-red-400"}`}>
                        {info.available ? "Available" : "Limit reached"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
            <p className="text-[10px] text-muted-foreground/50 px-1 pt-1">
              Usage resets daily at midnight. Providers are tried in order until one succeeds.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
