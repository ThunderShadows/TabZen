import type { TabInfo, SessionGroup } from "./grouping-fallback";

export async function groupTabsWithLLM(
  tabs: TabInfo[],
  apiKey: string
): Promise<SessionGroup[]> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Group these browser tabs into short, descriptive named clusters. Respond with ONLY JSON matching {"groups": [{"name": string, "tabs": [{"title": string, "url": string}]}]}. Tabs:\n${JSON.stringify(tabs)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM request failed with status ${response.status}`);
  }

  const data = (await response.json()) as { content: Array<{ text: string }> };
  const text = data.content[0]?.text ?? "{}";
  const parsed = JSON.parse(text) as { groups: SessionGroup[] };
  if (!Array.isArray(parsed.groups)) {
    throw new Error("LLM response missing groups array");
  }
  return parsed.groups;
}
