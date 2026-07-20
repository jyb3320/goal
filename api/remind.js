import webpush from "web-push";
import { Redis } from "@upstash/redis";
import {
  KEY,
  CAS_SCRIPT,
  normalize,
  versionOf,
  seoulToday,
  countMissedToday,
  countTodayGoals,
} from "./_logic.js";
import { getVapidKeys } from "./_vapid.js";

// Vercel Cron이 하루 두 번 호출한다 (vercel.json 참고):
// - ?slot=morning (아침 8시 KST): 오늘 목표 응원 푸시
// - ?slot=night (밤 9시 KST): 아직 안 찍은 도장 리마인더

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

  const slot = req.query?.slot === "morning" ? "morning" : "night";
  const raw = await kv.get(KEY);
  const state = normalize(raw);
  const today = seoulToday();

  // 슬롯별 메시지 — 보낼 게 없으면 null
  const messageFor = (name) => {
    if (slot === "morning") {
      const total = countTodayGoals(state, name);
      if (total === 0) return null;
      return {
        title: "도장판 ☀️",
        body: `좋은 아침! 오늘 찍을 도장 ${total}개 — 오늘 목표 꼭 달성하자 💪`,
        tag: "stamp-morning",
      };
    }
    const missed = countMissedToday(state, name, today);
    if (missed === 0) return null;
    return {
      title: "도장판 ⏰",
      body: `밤 9시가 넘었어요 — 아직 안 찍은 도장이 ${missed}개 있어요!`,
      tag: "stamp-reminder",
    };
  };

  let sent = 0;
  const dead = []; // 만료된 구독은 정리
  for (const [name, sub] of Object.entries(state.push)) {
    if (!state.users.includes(name)) continue;
    const message = messageFor(name);
    if (!message) continue;
    try {
      await webpush.sendNotification(sub, JSON.stringify(message));
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

  return res.status(200).json({ slot, sent, removed: dead.length });
}
