import { Redis } from "@upstash/redis";

// Vercel Marketplace의 Upstash Redis 연동은 UPSTASH_REDIS_REST_* 또는
// (구) KV_REST_API_* 이름으로 환경변수를 심어준다. 둘 다 받아준다.
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const kv = redisUrl && redisToken
  ? new Redis({ url: redisUrl, token: redisToken })
  : null;

const KEY = "goaltracker:state";
const MAX_USERS = 2;
const GOAL_TYPES = ["daily", "weekly", "milestone"];

const DEFAULT_STATE = {
  users: [],
  goals: [],
  checkins: [],
  progress: [],
  reactions: [],
  messages: [],
};

// 두 요청이 동시에 읽고 쓰면 나중 쓰기가 앞 쓰기를 지워버리는 걸 막기 위한
// compare-and-swap 스크립트. 저장된 값의 버전이 우리가 읽었을 때와 같을 때만 덮어쓴다.
const CAS_SCRIPT = `
local cur = redis.call('GET', KEYS[1])
local curVersion = 0
if cur then
  local ok, decoded = pcall(cjson.decode, cur)
  if ok and decoded and decoded._v then curVersion = decoded._v end
end
if curVersion == tonumber(ARGV[1]) then
  redis.call('SET', KEYS[1], ARGV[2])
  return 1
else
  return 0
end
`;

function str(v, max = 80) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function int(v, fallback = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function versionOf(raw) {
  return raw && typeof raw._v === "number" ? raw._v : 0;
}

// 예전 데이터(전체 덮어쓰기 시절)와 새 스키마 모두 안전하게 읽는다
function normalize(raw) {
  const { _v, ...rest } = raw || {};
  const s = { ...DEFAULT_STATE, ...rest };
  for (const key of Object.keys(DEFAULT_STATE)) {
    if (!Array.isArray(s[key])) s[key] = [];
  }
  if (s.users.length === 0 && s.goals.length > 0) {
    s.users = [...new Set(s.goals.map((g) => g.owner))].slice(0, MAX_USERS);
  }
  s.goals = s.goals.map((g) => ({ type: "daily", ...g }));
  return s;
}

function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function applyAction(state, body) {
  const action = str(body.action, 30);

  switch (action) {
    case "join": {
      const name = str(body.name, 20);
      if (!name) return { error: "이름이 비어 있어요", status: 400 };
      if (state.users.includes(name)) return { noop: true };
      if (state.users.length >= MAX_USERS) {
        return { error: "full", users: state.users, status: 403 };
      }
      state.users.push(name);
      return {};
    }

    case "addGoal": {
      const g = body.goal || {};
      const owner = str(g.owner, 20);
      const title = str(g.title, 60);
      if (!owner || !title) return { error: "invalid goal", status: 400 };
      if (!state.users.includes(owner)) return { error: "unknown user", status: 403 };
      const goal = {
        id: newId("g"),
        owner,
        title,
        icon: str(g.icon, 4) || "🎯",
        type: GOAL_TYPES.includes(g.type) ? g.type : "daily",
        createdAt: str(g.createdAt, 10),
      };
      if (goal.type === "weekly") {
        goal.targetPerWeek = Math.min(7, Math.max(1, int(g.targetPerWeek, 3)));
      }
      if (goal.type === "milestone") {
        goal.target = Math.max(1, int(g.target, 1));
        goal.unit = str(g.unit, 10) || "개";
        goal.deadline = str(g.deadline, 10);
      }
      state.goals.push(goal);
      return {};
    }

    case "deleteGoal": {
      const goalId = str(body.goalId, 40);
      state.goals = state.goals.filter((g) => g.id !== goalId);
      state.checkins = state.checkins.filter((c) => c.goalId !== goalId);
      state.progress = state.progress.filter((p) => p.goalId !== goalId);
      state.reactions = state.reactions.filter((r) => r.goalId !== goalId);
      return {};
    }

    case "toggleCheckin": {
      const goalId = str(body.goalId, 40);
      const date = str(body.date, 10);
      if (!goalId || !date) return { error: "invalid checkin", status: 400 };
      const exists = state.checkins.some((c) => c.goalId === goalId && c.date === date);
      if (exists) {
        state.checkins = state.checkins.filter(
          (c) => !(c.goalId === goalId && c.date === date)
        );
      } else {
        state.checkins.push({ goalId, date });
      }
      return {};
    }

    case "addProgress": {
      const goalId = str(body.goalId, 40);
      const date = str(body.date, 10);
      let amount = Math.max(-999, Math.min(999, int(body.amount, 0)));
      if (!goalId || !date || amount === 0) return { error: "invalid progress", status: 400 };
      if (amount < 0) {
        // 누적치가 0 밑으로 내려가지 않게 (숨은 음수 잔액 방지)
        const current = state.progress
          .filter((p) => p.goalId === goalId)
          .reduce((sum, p) => sum + p.amount, 0);
        amount = Math.max(amount, -current);
        if (amount === 0) return { noop: true };
      }
      state.progress.push({ id: newId("p"), goalId, date, amount });
      return {};
    }

    case "toggleReaction": {
      const goalId = str(body.goalId, 40);
      const date = str(body.date, 10);
      const emoji = str(body.emoji, 4);
      const by = str(body.by, 20);
      if (!goalId || !date || !emoji || !by) return { error: "invalid reaction", status: 400 };
      const match = (r) =>
        r.goalId === goalId && r.date === date && r.emoji === emoji && r.by === by;
      if (state.reactions.some(match)) {
        state.reactions = state.reactions.filter((r) => !match(r));
      } else {
        state.reactions.push({ goalId, date, emoji, by });
      }
      return {};
    }

    case "addMessage": {
      const from = str(body.from, 20);
      const text = str(body.text, 120);
      if (!from || !text) return { error: "invalid message", status: 400 };
      state.messages.push({ id: newId("m"), from, text, createdAt: new Date().toISOString() });
      state.messages = state.messages.slice(-50);
      return {};
    }

    case "deleteMessage": {
      const id = str(body.id, 40);
      const by = str(body.by, 20);
      const msg = state.messages.find((m) => m.id === id);
      if (!msg) return { noop: true };
      if (msg.from !== by) return { error: "본인 메시지만 지울 수 있어요", status: 403 };
      state.messages = state.messages.filter((m) => m.id !== id);
      return {};
    }

    default:
      return { error: "unknown action", status: 400 };
  }
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
    return res.status(200).json(normalize(raw));
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
      const state = normalize(raw);
      const result = applyAction(state, body);

      if (result.error) {
        const { status, ...errBody } = result;
        return res.status(status || 400).json(errBody);
      }
      if (result.noop) return res.status(200).json(state);

      const payload = JSON.stringify({ ...state, _v: version + 1 });
      const ok = await kv.eval(CAS_SCRIPT, [KEY], [String(version), payload]);
      if (ok === 1) return res.status(200).json(state);
      // 실패하면(다른 요청이 먼저 씀) 최신 값을 다시 읽어 재시도
    }
    return res.status(409).json({ error: "conflict" });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).end("Method not allowed");
}
