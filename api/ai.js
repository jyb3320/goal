import { Redis } from "@upstash/redis";
import { KEY, normalize, str } from "./_logic.js";
import {
  AI_TASKS,
  buildAiMessages,
  buildEvidenceBundle,
  requestAI,
  validateGoalDraft,
  validateReport,
} from "./_ai.js";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const kv = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

function parseBody(req) {
  if (req.body && typeof req.body === "object") {
    if (JSON.stringify(req.body).length > 12000) return null;
    return req.body;
  }
  if (typeof req.body === "string" && req.body.length <= 12000) {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      return null;
    }
  }
  return {};
}

function friendlyError(error) {
  if (error?.code === "missing_config") return { status: 503, code: "not_configured", message: "아직 Kimi 연결 키가 설정되지 않았어요." };
  if (error?.code === "rate_limited") return { status: 429, code: "provider_limit", message: error.message };
  if (error?.code === "timeout") return { status: 504, code: "timeout", message: error.message };
  return { status: 502, code: "ai_failed", message: "Kimi가 이번 요청을 끝내지 못했어요. 잠시 후 다시 시도해주세요." };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  if (!kv) return res.status(500).json({ error: "missing redis config" });

  const body = parseBody(req);
  if (!body) return res.status(400).json({ error: "invalid json" });

  const task = str(body.task, 30);
  const name = str(body.name, 20);
  if (!AI_TASKS.includes(task)) return res.status(400).json({ error: "지원하지 않는 AI 작업이에요." });

  const requiredPin = process.env.AI_ACCESS_PIN || "";
  if (requiredPin && str(body.pin, 80) !== requiredPin) {
    return res.status(403).json({ error: "ai_pin", message: "AI 잠금 PIN을 확인해주세요." });
  }

  const state = normalize(await kv.get(KEY));
  if (!name || !state.users.includes(name)) return res.status(401).json({ error: "auth" });

  const friendName = state.users.find((user) => user !== name) || "";
  const bundle = buildEvidenceBundle(state, name, {
    task,
    scopes: body.scopes,
    decisionId: body.decisionId,
    friendName,
  });
  const objective = str(body.objective, 500) || state.bigGoals.find((item) => item.owner === name)?.text || "";
  if (task === "goal_architect" && !objective) {
    return res.status(400).json({ error: "큰 목표를 먼저 적어주세요." });
  }
  if (task !== "goal_architect" && bundle.evidence.length === 0) {
    return res.status(400).json({ error: "분석할 기록이 아직 없어요. 목표나 복기를 먼저 남겨주세요." });
  }

  const limit = Math.max(1, Math.min(20, Number(process.env.AI_DAILY_LIMIT || 5)));
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const rateKey = `goaltracker:ai:${day}:${name}`;
  const used = await kv.incr(rateKey);
  if (used === 1) await kv.expire(rateKey, 172800);
  if (used > limit) {
    return res.status(429).json({
      error: "daily_limit",
      message: `오늘의 AI 참모 사용 ${limit}회를 모두 썼어요. 내일 다시 열립니다.`,
      remaining: 0,
    });
  }

  try {
    const messages = buildAiMessages(task, bundle, objective);
    const ai = await requestAI(messages);
    const result = task === "goal_architect"
      ? validateGoalDraft(ai.content)
      : validateReport(ai.content, bundle);
    result.model = ai.model;
    return res.status(200).json({
      task,
      result,
      meta: {
        provider: ai.provider,
        model: ai.model,
        evidenceCount: bundle.evidence.length,
        remaining: Math.max(0, limit - used),
      },
    });
  } catch (error) {
    await kv.decr(rateKey).catch(() => {});
    console.error("ai request failed", {
      code: error?.code || "unknown",
      status: error?.status || 0,
      providerBody: error?.providerBody || "",
    });
    const out = friendlyError(error);
    return res.status(out.status).json({ error: out.code, message: out.message });
  }
}
