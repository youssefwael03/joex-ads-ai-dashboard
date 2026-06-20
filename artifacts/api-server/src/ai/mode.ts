import { type ToolDef } from "./tools/schemas";

export type TaskMode = "analyze" | "execute" | "plan" | "chat";

export function detectTaskMode(messages: { role: string; content: string }[]): TaskMode {
  const last = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
  const t = last.toLowerCase();

  // Brain update — always execute mode (check first so it wins over analyze)
  if (
    /(حدث عقلك|حدث العقل|احفظ|حفظ البيانات)/.test(t) ||
    /\b(save brain|update brain)\b/.test(t)
  ) return "execute";

  // Execute — Arabic (no \b) + English (\b only for Latin words)
  if (
    /\b(create|build|launch|make|set up|setup|execute|new campaign|duplicate|scale up|pause all|enable all|deploy|run)\b/.test(t) ||
    /(نفذ|اعمل|انشئ|فعل|ابدا|ابدأ|عدل|غير|زود|قلل|نسخ|اعمله|اطلقه|وقف الحمله|وقف الحملة|شغل الحمله|شغل الحملة|ارفع الميزانيه|خفض الميزانيه|حملة كاتلوج|حمله كاتلوج|حملة جديده|حمله جديده|اعمل كامبين|اضف ادسيت)/.test(t)
  ) return "execute";

  // Analyze — Arabic (no \b) + English (\b only)
  if (
    /\b(audit|analyze|analyse|check|review|report|show|tell|what is|what's|how is|how are|performance|stats|breakdown|trend|compare|explain|why|roas|ctr|cpm|spend|budget|daily|which campaign|fetch|get|load)\b/.test(t) ||
    /(صرفت|جابت|شوفلي|كام|اليوم|انهردا|الحمله|الحملة|بيانات|أداء|ادا|نتايج|نتائج|تقرير|إيه|ايه|عامله|عامل|شغاله|شغال|كيف|وقف|اتوقف|فين|مين|امتى|الميزانيه|الميزانية|البادجت|يومي|شغل|اديني|فحص|راجع)/.test(t)
  ) return "analyze";

  // Plan — strategy / recommendations
  if (
    /\b(plan|strategy|recommend|suggest|structure|approach|best way|how should|what should|advise|idea|next step|blueprint|buyer persona|segments|roadmap|forecast)\b/.test(t) ||
    /(خطه|خطة|استراتيجيه|استراتيجية|نصيحه|نصيحة|ايه الافضل|ايه احسن|اقترح|افضل طريقه|باير بيرسونا|سيجمنتات|توقعات)/.test(t)
  ) return "plan";

  return "chat";
}

const TOOL_GROUPS: Record<TaskMode, string[]> = {
  analyze: [
    "get_account_overview", "get_breakdown", "get_daily_insights",
    "get_account_info", "get_campaigns", "get_adsets", "get_ads",
    "get_adcreatives", "save_account_brain",
  ],
  execute: [
    "create_campaign", "pause_campaign", "enable_campaign", "set_campaign_budget",
    "delete_campaign", "duplicate_campaign", "set_spend_cap",
    "create_adset", "pause_adset", "enable_adset", "set_adset_budget", "delete_adset",
    "create_ad", "pause_ad", "enable_ad", "delete_ad",
    "execute_campaign_template", "save_account_brain",
    "get_campaigns", "get_adsets", "get_adspixels",
  ],
  plan: [
    "get_account_overview", "get_campaigns", "get_adsets",
    "get_daily_insights", "get_breakdown", "save_account_brain",
  ],
  chat: [],
};

export function toOAITools(tools: ToolDef[]): object[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name:        t.name,
      description: t.description,
      parameters:  t.input_schema,
    },
  }));
}

export function getToolsForMode(mode: TaskMode, allOAITools: any[]): any[] {
  const names = TOOL_GROUPS[mode];
  if (!names || names.length === 0) return [];
  return allOAITools.filter((t: any) => names.includes(t.function?.name));
}
