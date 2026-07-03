import { Redis } from "@upstash/redis";
import { KEY, CAS_SCRIPT, normalize, sanitize, versionOf, handlePost } from "./_logic.js";
import { getVapidKeys } from "./_vapid.js";

// Vercel Marketplace의 Upstash Redis 연동은 UPSTASH_REDIS_REST_* 또는
// (구) KV_REST_API_* 이름으로 환경변수를 심어준다. 둘 다 받아준다.
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const kv = redisUrl && redisToken
  ? new Redis({ url: redisUrl, token: redisToken })
  : null;

function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      return null;
    }
  }
  return {};
}

export default async function handler(req, res) {
  if (!kv) {
    return res.status(500).json({
      error: "missing redis config",
      message: "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel.",
    });
  }

  if (req.method === "GET") {
    const raw = await kv.get(KEY);
    const vapid = await getVapidKeys(kv);
    return res.status(200).json({
      ...sanitize(normalize(raw)),
      pushKey: vapid.publicKey,
    });
  }

  if (req.method === "POST") {
    const body = parseBody(req);
    if (body === null) {
      return res.status(400).json({ error: "invalid json" });
    }

    // compare-and-swap 재시도: 두 액션이 정확히 동시에 와도 하나가 사라지지 않게 한다
    for (let attempt = 0; attempt < 3; attempt++) {
      const raw = await kv.get(KEY);
      const version = versionOf(raw);
      const out = handlePost(raw, body);

      if (!out.write) {
        return res.status(out.status).json(out.respond);
      }
      const payload = JSON.stringify({ ...out.state, _v: version + 1 });
      const ok = await kv.eval(CAS_SCRIPT, [KEY], [String(version), payload]);
      if (ok === 1) return res.status(out.status).json(out.respond);
      // 실패하면(다른 요청이 먼저 씀) 최신 값을 다시 읽어 재시도
    }
    return res.status(409).json({ error: "conflict" });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).end("Method not allowed");
}
