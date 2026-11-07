// Провайдеры ИИ для ассистента. Ключи читаются ТОЛЬКО из переменных окружения сервера.
//
//   AI_PROVIDER=bedrock , DeepSeek V3.2 в Amazon Bedrock (Converse API)
//                           авторизация: AWS_BEARER_TOKEN_BEDROCK (API-ключ Bedrock, «ABSK…»)
//                                     или AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (IAM, подпись SigV4)
//   AI_PROVIDER=deepseek, прямой API DeepSeek (OpenAI-совместимый), DEEPSEEK_API_KEY
//
// Если AI_PROVIDER не задан, выбирается по наличию ключей. Нет ключей, ассистент в офлайн-режиме.
import { AwsClient } from "aws4fetch";

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type CompletionResult = { text: string; tokens?: number };

export type ProviderInfo = { id: "bedrock" | "deepseek"; label: string } | null;

export function aiProvider(): ProviderInfo {
  const explicit = process.env.AI_PROVIDER?.trim().toLowerCase();
  const hasBedrock = !!(process.env.AWS_BEARER_TOKEN_BEDROCK || (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY));
  const hasDeepseek = !!process.env.DEEPSEEK_API_KEY;
  if ((explicit === "bedrock" || (!explicit && hasBedrock)) && hasBedrock) return { id: "bedrock", label: "DeepSeek V3.2 · Amazon Bedrock" };
  if ((explicit === "deepseek" || (!explicit && hasDeepseek)) && hasDeepseek) return { id: "deepseek", label: "DeepSeek" };
  return null;
}

/** Converse требует: начинать с user, роли чередуются. Склеиваем подряд идущие реплики одной роли. */
function normalizeTurns(history: ChatTurn[]): ChatTurn[] {
  const out: ChatTurn[] = [];
  for (const m of history) {
    if (!out.length && m.role !== "user") continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else out.push({ ...m });
  }
  return out;
}

async function bedrockConverse(system: string, history: ChatTurn[], maxTokens: number): Promise<CompletionResult> {
  const region = process.env.AWS_REGION || "us-east-1";
  const modelId = process.env.BEDROCK_MODEL_ID || "deepseek.v3.2";
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`;
  const body = JSON.stringify({
    system: [{ text: system }],
    messages: normalizeTurns(history).map((m) => ({ role: m.role, content: [{ text: m.content }] })),
    inferenceConfig: { maxTokens, temperature: 0.3 },
  });
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body,
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  };

  let res: Response;
  const bearer = process.env.AWS_BEARER_TOKEN_BEDROCK;
  if (bearer) {
    res = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${bearer}` } });
  } else {
    const aws = new AwsClient({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      sessionToken: process.env.AWS_SESSION_TOKEN || undefined,
      region,
      service: "bedrock",
    });
    res = await aws.fetch(url, init);
  }
  if (!res.ok) {
    // текст ошибки AWS без секретов, для логов сервера
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`bedrock-${res.status}: ${detail}`);
  }
  const json = (await res.json()) as {
    output?: { message?: { content?: { text?: string }[] } };
    usage?: { totalTokens?: number };
  };
  const text = (json.output?.message?.content ?? [])
    .map((c) => (typeof c.text === "string" ? c.text : ""))
    .join("")
    .trim();
  return { text, tokens: json.usage?.totalTokens };
}

async function deepseekChat(system: string, history: ChatTurn[], maxTokens: number): Promise<CompletionResult> {
  const base = (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
      messages: [{ role: "system", content: system }, ...history],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: maxTokens,
      stream: false,
    }),
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`deepseek-${res.status}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: number } };
  return { text: json.choices?.[0]?.message?.content?.trim() ?? "", tokens: json.usage?.total_tokens };
}

export async function complete(system: string, history: ChatTurn[], maxTokens = 900): Promise<CompletionResult> {
  const p = aiProvider();
  if (!p) throw new Error("no-key");
  return p.id === "bedrock" ? bedrockConverse(system, history, maxTokens) : deepseekChat(system, history, maxTokens);
}

/** Достаём JSON-объект из ответа модели (бывает обёрнут в ```json … ``` или с пояснениями вокруг). */
export function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
