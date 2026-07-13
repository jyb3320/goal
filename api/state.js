import { Redis } from "@upstash/redis";
import webpush from "web-push";
import { KEY, CAS_SCRIPT, normalize, sanitize, versionOf, handlePost, str } from "./_logic.js";
import { getVapidKeys } from "./_vapid.js";

// Vercel Marketplace의 Upstash Redis 연동은 UPSTASH_REDIS_REST_* 또는
// (구) KV_REST_API_* 이름으로 환경변수를 심어준다. 둘 다 받아준다.
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const kv = redisUrl && redisToken
  ? new Redis({ url: redisUrl, token: redisToken })
  : null;

function pushBody(text, max = 80) {
  const clean = str(text, 120);
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

async function sendPush(sub, payload) {
  const vapid = await getVapidKeys(kv);
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    vapid.publicKey,
    vapid.privateKey
  );
  await webpush.sendNotification(sub, JSON.stringify({ url: "/", ...payload }));
}

async function removeDeadPush(name) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await kv.get(KEY);
    const version = versionOf(raw);
    const state = normalize(raw);
    if (!state.push[name]) return;
    delete state.push[name];
    const payload = JSON.stringify({ ...state, _v: version + 1 });
    const ok = await kv.eval(CAS_SCRIPT, [KEY], [String(version), payload]);
    if (ok === 1) return;
  }
}

// 콕 찌르기: 상대에게 즉시 푸시. 실패해도 액션 자체는 성공으로 둔다 (구독 안 했을 수 있음).
async function sendPokePush(state, fromName) {
  const target = state.users.find((u) => u !== fromName);
  const sub = target && state.push[target];
  if (!sub) return;
  await sendPush(sub, {
    title: "도장판 👉",
    body: `${fromName}이(가) 콕 찔렀어요 — 오늘 도장 잊지 마!`,
    tag: `poke-${Date.now()}`, // 매번 새 태그 = 찌를 때마다 알림
  });
}

// 응원 한마디: 메시지 저장 성공 후 상대에게 즉시 푸시.
async function sendMessagePush(state, fromName, text) {
  const target = state.users.find((u) => u !== fromName);
  const sub = target && state.push[target];
  if (!sub) return;
  await sendPush(sub, {
    title: "새 응원이 도착했어요",
    body: `${fromName}: ${pushBody(text)}`,
    tag: `message-${Date.now()}`,
  });
}

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
      if (ok === 1) {
        if (str(body.action, 30) === "poke") {
          await sendPokePush(out.state, str(body.name, 20)).catch((e) =>
            console.error("poke push failed", e.statusCode || e.message)
          );
        }
        if (str(body.action, 30) === "addMessage") {
          await sendMessagePush(out.state, str(body.name, 20), body.text).catch(async (e) => {
            const target = out.state.users.find((u) => u !== str(body.name, 20));
            if (target && (e.statusCode === 404 || e.statusCode === 410)) {
              await removeDeadPush(target);
            } else {
              console.error("message push failed", e.statusCode || e.message);
            }
          });
        }
        return res.status(out.status).json(out.respond);
      }
      // 실패하면(다른 요청이 먼저 씀) 최신 값을 다시 읽어 재시도
    }
    return res.status(409).json({ error: "conflict" });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).end("Method not allowed");
}
