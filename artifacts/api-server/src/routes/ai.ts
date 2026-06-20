import { Router, type IRouter } from "express";
import {
  callWithFallback,
  callProvider,
  getProviderStatus,
  type AIMessage,
  type ProviderName,
} from "../providers";
import { loadBrain, clearBrain } from "../ai/brain";
import { TOOLS, ACTION_TOOLS } from "../ai/tools/schemas";
import { detectTaskMode, toOAITools, getToolsForMode } from "../ai/mode";
import { toolCallLabel, toolDoneLabel, type ToolResult } from "../ai/labels";
import { executeTool } from "../ai/tools/executor";
import { buildSystemPrompt } from "../ai/prompt";
import { trimData } from "../ai/utils";

const router: IRouter = Router();

// ── Brain REST endpoints ───────────────────────────────────────────────────────

router.get("/ai/brain/:accountId", async (req, res): Promise<void> => {
  const accountId = String(req.params.accountId).replace(/^act_/, "");
  const brain = await loadBrain(accountId);
  res.json({ brain: brain ?? null });
});

router.delete("/ai/brain/:accountId", async (req, res): Promise<void> => {
  const rawToken = req.headers["x-meta-token"];
  if (!rawToken) { res.status(401).json({ error: "Unauthorized" }); return; }
  const accountId = String(req.params.accountId).replace(/^act_/, "");
  await clearBrain(accountId);
  res.json({ success: true });
});

// ── Models endpoint ───────────────────────────────────────────────────────────

router.get("/ai/models", (_req, res): void => {
  res.json({
    provider: "multi",
    models: [
      {
        id:          "auto",
        name:        "Auto (Multi-Provider)",
        description: "Groq → Gemini → DeepSeek → Cerebras → Mistral → OpenRouter",
      },
    ],
  });
});

// ── Provider status endpoint ──────────────────────────────────────────────────

router.get("/provider-status", (_req, res): void => {
  res.json(getProviderStatus());
});

// ── Main AI chat route ────────────────────────────────────────────────────────

router.post("/ai/chat", async (req, res): Promise<void> => {
  const rawToken = req.headers["x-meta-token"];
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { messages, context, selectedProvider } = req.body as {
    messages: { role: "user" | "assistant"; content: string }[];
    model?: string;
    selectedProvider?: string;
    context?: {
      accountId?: string;
      accountName?: string;
      currency?: string;
      since?: string;
      until?: string;
    };
  };

  const VALID_PROVIDERS: ProviderName[] = ["groq", "gemini", "deepseek", "cerebras", "mistral", "openrouter_free"];
  const forcedProvider: ProviderName | null =
    selectedProvider && selectedProvider !== "auto" && VALID_PROVIDERS.includes(selectedProvider as ProviderName)
      ? (selectedProvider as ProviderName)
      : null;

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  const accountId   = context?.accountId   ? String(context.accountId).replace(/^act_/, "") : "";
  const since       = context?.since       ?? "";
  const until       = context?.until       ?? "";
  const currency    = context?.currency    ?? "USD";
  const accountName = context?.accountName ?? "this account";

  const taskMode = detectTaskMode(messages);
  console.log(`[AI] taskMode="${taskMode}" | msg="${messages.filter(m => m.role === "user").at(-1)?.content?.slice(0, 80) ?? ""}"`);

  const brain = accountId ? await loadBrain(accountId) : null;

  const systemPrompt = buildSystemPrompt({ accountId, accountName, currency, since, until, brain });

  const allOAITools    = accountId ? toOAITools(TOOLS) : [];
  const selectedTools  = getToolsForMode(taskMode, allOAITools);
  console.log(`[AI] tools=[${selectedTools.map((t: any) => t.function?.name).join(", ")}]`);

  // SSE setup
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const emit = (data: object) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch { /* client disconnected */ }
  };

  try {
    const currentMessages: AIMessage[] = messages.map((m) => ({
      role:    m.role as "user" | "assistant",
      content: m.content,
    }));

    let lastProvider: ProviderName = "openrouter_free";
    let lastModel = "auto";
    const tokensTotal = { prompt: 0, completion: 0, total: 0 };
    const startTime = Date.now();

    emit({ type: "model", model: forcedProvider ?? "auto", provider: forcedProvider ?? "auto", mode: taskMode });

    // Agentic loop — max 5 iterations
    for (let iter = 0; iter < 5; iter++) {
      const aiResult = forcedProvider
        ? await callProvider(forcedProvider, currentMessages, selectedTools, systemPrompt)
        : await callWithFallback(currentMessages, selectedTools, systemPrompt, taskMode);

      lastProvider = aiResult.provider;
      lastModel    = aiResult.model;
      tokensTotal.total += aiResult.tokens;

      emit({ type: "model", model: aiResult.model, provider: aiResult.provider, mode: taskMode });

      // Stream text content in small chunks
      if (aiResult.content) {
        const chunkSize = 4;
        for (let i = 0; i < aiResult.content.length; i += chunkSize) {
          emit({ content: aiResult.content.slice(i, i + chunkSize) });
        }
      }

      // No tool calls or explicit stop → done
      if (!aiResult.toolCalls?.length || aiResult.finishReason === "stop") {
        break;
      }

      // Add assistant turn with tool_calls to history
      currentMessages.push({
        role:       "assistant",
        content:    aiResult.content || null,
        tool_calls: aiResult.toolCalls,
      });

      // Execute each tool call sequentially
      for (const toolCall of aiResult.toolCalls) {
        const toolName = toolCall.function.name;
        let toolInput: Record<string, any> = {};
        try { toolInput = JSON.parse(toolCall.function.arguments || "{}") ?? {}; } catch {}

        const isAction = ACTION_TOOLS.has(toolName);
        emit({ type: "tool_call", tool: toolName, label: toolCallLabel(toolName, toolInput), isAction, input: toolInput });

        const result: ToolResult = await executeTool(toolName, toolInput, token, accountId, since, until);
        emit({ type: "tool_done", tool: toolName, label: toolDoneLabel(toolName, toolInput, result), isAction, success: result.success, error: result.error, input: toolInput });

        currentMessages.push({
          role:         "tool",
          tool_call_id: toolCall.id,
          content: result.success
            ? JSON.stringify(trimData(result.data))
            : JSON.stringify({ error: result.error }),
        });
      }
    }

    const duration = Date.now() - startTime;
    emit({ done: true, model: lastModel, provider: lastProvider, tokens: tokensTotal, duration });
    res.end();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "AI error";
    emit({ error: msg });
    res.end();
  }
});

export default router;
