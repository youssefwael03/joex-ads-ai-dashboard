import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

router.post("/ai/chat", async (req, res): Promise<void> => {
  const token = req.headers["x-meta-token"];
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { messages, context } = req.body as {
    messages: { role: "user" | "assistant"; content: string }[];
    context?: Record<string, unknown>;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  const contextBlock = context
    ? `\n\nCURRENT ACCOUNT PERFORMANCE CONTEXT:\n${JSON.stringify(context, null, 2)}\n`
    : "";

  const systemPrompt = `You are JOEX AI — an elite senior Meta Ads media buyer and performance marketing strategist with 10+ years of experience managing $50M+ in ad spend.

Your role: analyze Meta advertising data and deliver sharp, profit-maximizing recommendations exactly like a top-tier performance marketer reviewing a real account.
${contextBlock}
Your expertise:
- Campaign optimization: budget reallocation, bid strategies, horizontal & vertical scaling
- Creative strategy: ad fatigue detection, hook analysis, winning angles, UGC vs polished
- Audience targeting: lookalikes, retargeting funnels, exclusions, overlap elimination
- ROAS/CPA improvement: bid cap vs cost cap, CBO vs ABO trade-offs
- Funnel analysis: ToFu/MoFu/BoFu attribution, pixel event quality
- Platform algorithm: learning phase management, auction dynamics, broad vs interest
- Anomaly detection: sudden CPM spikes, CTR drops, frequency warnings

Response style:
- Be direct, concise, and specific — talk like a senior colleague reviewing the account
- Always reference specific numbers when data is available
- Prioritize by revenue impact (highest-ROI actions first)
- Give concrete next actions with expected outcomes
- Use clear headers/bullets for scannability
- No filler text or generic advice — every sentence must add value`;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "AI error";
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.end();
  }
});

export default router;
