import webpush from "web-push";
import { Redis } from "@upstash/redis";
import {
  KEY,
  CAS_SCRIPT,
  normalize,
  versionOf,
  seoulToday,
  countMissedToday,
} from "./_logic.js";
import { getVapidKeys } from "./_vapid.js";

// 매일 밤 9시(KST)에 Vercel Cron이 호출한다 (vercel.json 참고).
// 오늘 몫을 안 채운 사용자에게 웹 푸시를 보낸다.

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const kv = redisUrl && redisToken
  ? new Redis({ url: redisUrl, token: redisToken })
  : null;

export default async function handler(req, res) {
  // CRON_SECRET을 설정해두면 크론 외의 호출을 막는다
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  if (!kv) {
    return res.status(500).json({ error: "missing redis config" });
  }
  const vapid = await getVapidKeys(kv);
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    vapid.publicKey,
    vapid.privateKey
  );

  const raw = await kv.get(KEY);
  const state = normalize(raw);
  const today = seoulToday();

  let sent = 0;
  const dead = []; // 만료된 구독은 정리
  for (const [name, sub] of Object.entries(state.push)) {
    if (!state.users.includes(name)) continue;
    const missed = countMissedToday(state, name, today);
    if (missed === 0) continue;
    try {
      await webpush.sendNotification(
        sub,
        JSON.stringify({
          title: "도장판 ⏰",
          body: `밤 9시가 넘었어요 — 아직 안 찍은 도장이 ${missed}개 있어요!`,
        })
      );
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) dead.push(name);
      else console.error("push failed for", name, e.statusCode || e.message);
    }
  }

  if (dead.length > 0) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await kv.get(KEY);
      const version = versionOf(cur);
      const st = normalize(cur);
      for (const name of dead) delete st.push[name];
      const payload = JSON.stringify({ ...st, _v: version + 1 });
      const ok = await kv.eval(CAS_SCRIPT, [KEY], [String(version), payload]);
      if (ok === 1) break;
    }
  }

  return res.status(200).json({ sent, removed: dead.length });
}
