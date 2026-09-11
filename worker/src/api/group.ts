import type { Env } from "../index";
import { groupTabsFallback, type TabInfo } from "../lib/grouping-fallback";
import { groupTabsWithLLM } from "../lib/llmGrouping";
import { checkAndIncrementRateLimit } from "../lib/rateLimit";

const FREE_DAILY_LIMIT = 1;

export async function handleGroup(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { tabs: TabInfo[]; licenseKey?: string };
  const rateLimitKey = `ratelimit:${body.licenseKey ?? request.headers.get("cf-connecting-ip") ?? "anonymous"}`;

  const isPaid = Boolean(body.licenseKey);
  if (!isPaid) {
    const allowed = await checkAndIncrementRateLimit(env.TABZEN_KV, rateLimitKey, FREE_DAILY_LIMIT);
    if (!allowed) {
      return Response.json({ error: "rate_limited" }, { status: 429 });
    }
  }

  let groups;
  try {
    groups = await groupTabsWithLLM(body.tabs, env.ANTHROPIC_API_KEY);
  } catch {
    groups = groupTabsFallback(body.tabs);
  }

  return Response.json({ groups });
}
