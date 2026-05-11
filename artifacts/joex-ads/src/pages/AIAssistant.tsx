import { useState, useRef, useEffect, useCallback } from "react";
import { useAccountStore } from "@/store/accountStore";
import { useDateStore } from "@/store/dateStore";
import { useInsights, useCampaigns, useAdSets, useAccountInfo } from "@/hooks/useMeta";
import { useAccountCurrency } from "@/hooks/useCurrency";
import { metaApi } from "@/lib/metaApi";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import {
  BrainCircuit, Send, User, Sparkles, Loader2, RotateCcw, ChevronDown,
  Play, Pause, Settings2, Wallet, TrendingUp, AlertTriangle
} from "lucide-react";
import { safeNum, getPurchaseRoas, getAction, fmtCurrency } from "@/lib/metaApi";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED_PROMPTS = [
  "Analyze my account performance and tell me what to fix first",
  "Which campaigns should I scale and which should I pause?",
  "Why might my ROAS be declining? What should I check?",
  "Give me a creative refresh strategy for fatigued ad sets",
  "How should I structure my budget across campaigns?",
  "What audience targeting changes would improve my CPA?",
];

function buildContext(insights: any, campaigns: any[], adSets: any[], accountInfo: any, currency: string) {
  const d = insights?.data?.[0];
  if (!d && campaigns.length === 0) return null;

  const spend = safeNum(d?.spend);
  const roas = getPurchaseRoas(d?.purchase_roas);
  const ctr = safeNum(d?.ctr);
  const cpc = safeNum(d?.cpc);
  const cpm = safeNum(d?.cpm);
  const frequency = safeNum(d?.frequency);
  const impressions = safeNum(d?.impressions);
  const clicks = safeNum(d?.clicks);
  const reach = safeNum(d?.reach);
  const purchases = getAction(d?.actions, "offsite_conversion.fb_pixel_purchase") || getAction(d?.actions, "purchase");
  const leads = getAction(d?.actions, "lead") || getAction(d?.actions, "onsite_conversion.lead_grouped");
  const revenue = spend * roas;
  const cpa = purchases > 0 ? spend / purchases : 0;

  const topCampaigns = campaigns.slice(0, 10).map((c: any) => {
    const ci = c.insights?.data?.[0] ?? {};
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective,
      spend: safeNum(ci.spend),
      roas: getPurchaseRoas(ci.purchase_roas),
      ctr: safeNum(ci.ctr),
      frequency: safeNum(ci.frequency),
      cpc: safeNum(ci.cpc),
      purchases: getAction(ci.actions, "offsite_conversion.fb_pixel_purchase") || getAction(ci.actions, "purchase"),
    };
  });

  const topAdSets = adSets.slice(0, 15).map((a: any) => {
    const ai = a.insights?.data?.[0] ?? {};
    return {
      id: a.id,
      name: a.name,
      status: a.status,
      campaign_id: a.campaign_id,
      daily_budget: safeNum(a.daily_budget) / 100,
      spend: safeNum(ai.spend),
      roas: getPurchaseRoas(ai.purchase_roas),
      ctr: safeNum(ai.ctr),
      cpm: safeNum(ai.cpm),
      frequency: safeNum(ai.frequency),
      cpc: safeNum(ai.cpc),
    };
  });

  const balanceRaw = safeNum(accountInfo?.balance);

  return {
    currency,
    accountSummary: {
      totalSpend: fmtCurrency(spend, currency),
      totalRevenue: fmtCurrency(revenue, currency),
      roas: `${roas.toFixed(2)}x`,
      ctr: `${ctr.toFixed(2)}%`,
      cpc: fmtCurrency(cpc, currency),
      cpm: fmtCurrency(cpm, currency),
      frequency: frequency.toFixed(2),
      impressions: impressions.toLocaleString(),
      clicks: clicks.toLocaleString(),
      reach: reach.toLocaleString(),
      purchases,
      leads,
      cpa: cpa > 0 ? fmtCurrency(cpa, currency) : "N/A",
      balance: balanceRaw > 0 ? fmtCurrency(balanceRaw, currency) : "N/A",
    },
    topCampaigns,
    topAdSets,
  };
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-1">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="h-2 w-2 rounded-full bg-primary/60"
          animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }}
        />
      ))}
    </div>
  );
}

function MessageBubble({ msg, isStreaming }: { msg: ChatMessage; isStreaming?: boolean }) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      <div className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center ${
        isUser ? "bg-primary/20 border border-primary/30" : "bg-secondary/20 border border-secondary/30"
      }`}>
        {isUser
          ? <User className="h-4 w-4 text-primary" />
          : <BrainCircuit className="h-4 w-4 text-secondary" />
        }
      </div>
      <div className={`max-w-[78%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        <div className={`px-4 py-3 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-primary/15 border border-primary/20 text-foreground rounded-tr-sm"
            : "bg-card/60 border border-card-border text-card-foreground rounded-tl-sm"
        }`}>
          {msg.content}
          {isStreaming && <span className="inline-block ml-0.5 w-0.5 h-4 bg-primary/70 animate-pulse align-middle" />}
        </div>
      </div>
    </motion.div>
  );
}

interface ActionState {
  loading: boolean;
  done: boolean;
  error: string | null;
}

function QuickActionsPanel({ campaigns, adSets, currency }: {
  campaigns: any[];
  adSets: any[];
  currency: string;
}) {
  const [actionState, setActionState] = useState<Record<string, ActionState>>({});

  const runAction = async (key: string, fn: () => Promise<any>) => {
    setActionState((s) => ({ ...s, [key]: { loading: true, done: false, error: null } }));
    try {
      await fn();
      setActionState((s) => ({ ...s, [key]: { loading: false, done: true, error: null } }));
    } catch (e: any) {
      setActionState((s) => ({ ...s, [key]: { loading: false, done: false, error: e.message } }));
    }
  };

  const lowRoasCampaigns = campaigns.filter((c: any) => {
    const ci = c.insights?.data?.[0] ?? {};
    const roas = getPurchaseRoas(ci.purchase_roas);
    const spend = safeNum(ci.spend);
    return spend > 0 && roas > 0 && roas < 1.5 && c.status === "ACTIVE";
  }).slice(0, 3);

  const highFreqAdSets = adSets.filter((a: any) => {
    const ai = a.insights?.data?.[0] ?? {};
    const freq = safeNum(ai.frequency);
    return freq > 3.5 && a.status === "ACTIVE";
  }).slice(0, 3);

  if (lowRoasCampaigns.length === 0 && highFreqAdSets.length === 0) return null;

  return (
    <Card className="bg-card/30 border-card-border shrink-0">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Settings2 className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Quick Actions</span>
          <Badge variant="outline" className="text-[10px] ml-auto border-yellow-500/30 text-yellow-400">AI Suggested</Badge>
        </div>
        <div className="space-y-2">
          {lowRoasCampaigns.map((c: any) => {
            const key = `pause-campaign-${c.id}`;
            const state = actionState[key];
            const ci = c.insights?.data?.[0] ?? {};
            const roas = getPurchaseRoas(ci.purchase_roas);
            return (
              <div key={key} className="flex items-center justify-between gap-2 py-2 border-b border-border/40 last:border-0">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground truncate max-w-[180px]">{c.name}</div>
                  <div className="text-[10px] text-red-400 flex items-center gap-1">
                    <TrendingUp className="h-2.5 w-2.5" />
                    ROAS {roas.toFixed(2)}x — below breakeven
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 h-7 text-xs border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                  disabled={state?.loading || state?.done}
                  onClick={() => runAction(key, () => metaApi.actions.setCampaignStatus(c.id, "PAUSED"))}
                >
                  {state?.loading ? <Loader2 className="h-3 w-3 animate-spin" /> :
                   state?.done ? "Paused ✓" :
                   state?.error ? "Error" :
                   <><Pause className="h-3 w-3 mr-1" />Pause</>}
                </Button>
              </div>
            );
          })}
          {highFreqAdSets.map((a: any) => {
            const key = `pause-adset-${a.id}`;
            const state = actionState[key];
            const ai = a.insights?.data?.[0] ?? {};
            const freq = safeNum(ai.frequency);
            return (
              <div key={key} className="flex items-center justify-between gap-2 py-2 border-b border-border/40 last:border-0">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground truncate max-w-[180px]">{a.name}</div>
                  <div className="text-[10px] text-orange-400 flex items-center gap-1">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    Frequency {freq.toFixed(1)} — ad fatigue risk
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 h-7 text-xs border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                  disabled={state?.loading || state?.done}
                  onClick={() => runAction(key, () => metaApi.actions.setAdSetStatus(a.id, "PAUSED"))}
                >
                  {state?.loading ? <Loader2 className="h-3 w-3 animate-spin" /> :
                   state?.done ? "Paused ✓" :
                   state?.error ? "Error" :
                   <><Pause className="h-3 w-3 mr-1" />Pause</>}
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AIAssistant() {
  const { selectedAccountId } = useAccountStore();
  const { since, until } = useDateStore();
  const currency = useAccountCurrency();
  const { data: insightsData } = useInsights(selectedAccountId, since, until);
  const { data: campaignData } = useCampaigns(selectedAccountId, since, until);
  const { data: adSetsData } = useAdSets(selectedAccountId, since, until);
  const { data: accountInfoData } = useAccountInfo(selectedAccountId);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const campaigns: any[] = campaignData?.data ?? [];
  const adSets: any[] = adSetsData?.data ?? [];
  const context = buildContext(insightsData, campaigns, adSets, accountInfoData, currency);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    setStreamingContent("");

    const token = localStorage.getItem("joex_ads_token");

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "X-Meta-Token": token } : {}),
        },
        body: JSON.stringify({
          messages: newMessages,
          context: context ?? undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const parsed = JSON.parse(line.slice(6));
                if (parsed.content) {
                  accumulated += parsed.content;
                  setStreamingContent(accumulated);
                }
                if (parsed.done) {
                  setMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: accumulated },
                  ]);
                  setStreamingContent("");
                }
                if (parsed.error) {
                  throw new Error(parsed.error);
                }
              } catch {
                // skip malformed lines
              }
            }
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${msg}. Please try again.` },
      ]);
      setStreamingContent("");
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  }, [messages, isLoading, context]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setStreamingContent("");
    setInput("");
  };

  const isEmpty = messages.length === 0 && !isLoading;

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-112px)] gap-3">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <BrainCircuit className="h-8 w-8 text-secondary" />
            AI Media Buyer
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Your senior performance marketing strategist — powered by Claude.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {context && (
            <Badge variant="outline" className="text-xs border-green-500/30 text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 mr-1.5 inline-block" />
              {campaigns.length} campaigns · {adSets.length} ad sets loaded
            </Badge>
          )}
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearChat} className="gap-2 text-muted-foreground">
              <RotateCcw className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Quick Actions Panel */}
      {context && campaigns.length > 0 && (
        <QuickActionsPanel campaigns={campaigns} adSets={adSets} currency={currency} />
      )}

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-8 text-center py-10">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-3"
            >
              <div className="h-16 w-16 mx-auto rounded-2xl bg-secondary/10 border border-secondary/20 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-secondary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Ask your AI media buyer anything</h3>
                <p className="text-muted-foreground text-sm mt-1 max-w-sm">
                  {context
                    ? "Your account data is loaded — I can analyze your specific performance numbers and ad sets."
                    : "Connect an ad account above for data-driven analysis, or ask general strategy questions."}
                </p>
              </div>
            </motion.div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
              {SUGGESTED_PROMPTS.map((prompt, i) => (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  onClick={() => sendMessage(prompt)}
                  className="text-left px-4 py-3 rounded-lg border border-card-border bg-card/40 hover:bg-card/80 hover:border-primary/30 transition-all text-sm text-muted-foreground hover:text-foreground group"
                >
                  <ChevronDown className="h-3 w-3 rotate-[-90deg] inline mr-2 text-primary/50 group-hover:text-primary transition-colors" />
                  {prompt}
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5 pb-4 px-1">
            <AnimatePresence>
              {messages.map((msg, i) => (
                <MessageBubble key={i} msg={msg} />
              ))}
            </AnimatePresence>
            {isLoading && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
                <div className="h-8 w-8 shrink-0 rounded-full bg-secondary/20 border border-secondary/30 flex items-center justify-center">
                  <BrainCircuit className="h-4 w-4 text-secondary" />
                </div>
                <div className="px-4 py-3 rounded-xl rounded-tl-sm bg-card/60 border border-card-border">
                  {streamingContent ? (
                    <div className="text-sm leading-relaxed whitespace-pre-wrap text-card-foreground max-w-[70vw]">
                      {streamingContent}
                      <span className="inline-block ml-0.5 w-0.5 h-4 bg-primary/70 animate-pulse align-middle" />
                    </div>
                  ) : (
                    <TypingIndicator />
                  )}
                </div>
              </motion.div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 pt-3 border-t border-border">
        <Card className="bg-card/40 border-card-border">
          <CardContent className="p-3">
            <div className="flex gap-3 items-end">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your campaigns, creative strategy, scaling opportunities..."
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
              Press Enter to send, Shift+Enter for new line. Uses Replit AI (Claude).
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
