// 서버(Vercel 함수)와 vite 개발 서버가 함께 쓰는 순수 로직 모듈.
// Redis 등 저장소 의존성은 여기 두지 않는다.

export const KEY = "goaltracker:state";
export const MAX_USERS = 2;
export const GOAL_TYPES = ["daily", "milestone"];

// 기록 보존 기간 — 지나면 컴팩션 대상
const REACTION_KEEP_DAYS = 14; // UI가 최근 7일만 보여줌
const CHECKIN_KEEP_DAYS = 400; // 기록 뷰(1년)용. 넘으면 아카이브 집계로
const PROGRESS_KEEP_DAYS = 90; // 넘으면 목표당 한 건으로 합침
const EXCUSE_KEEP_DAYS = 180; // 반성 노트 보관 기간

// 매번 새 객체를 만든다 — 모듈 레벨 상수를 공유하면 normalize 결과를 통해
// 기본값의 배열/객체가 참조로 새어나가 뮤테이션에 오염된다 (웜 인스턴스에서 실제 버그)
export function emptyState() {
  return {
    users: [],
    goals: [],
    checkins: [],
    progress: [],
    reactions: [],
    messages: [],
    pokes: [], // 콕 찌르기 (오늘/어제 것만 보관)
    excuses: [], // 못 찍은 날의 이유 — 기록 탭 반성 노트용
    push: {}, // name -> Web Push 구독 (클라이언트 응답에서는 제거됨)
    archive: {}, // name -> { stamps } 컴팩션된 옛 도장 집계 (XP 유지용)
  };
}

// 두 요청이 동시에 읽고 쓰면 나중 쓰기가 앞 쓰기를 지워버리는 걸 막기 위한
// compare-and-swap 스크립트. 저장된 값의 버전이 우리가 읽었을 때와 같을 때만 덮어쓴다.
export const CAS_SCRIPT = `
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

export function str(v, max = 80) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function int(v, fallback = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function versionOf(raw) {
  return raw && typeof raw._v === "number" ? raw._v : 0;
}

export function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// 서버는 UTC로 돌지만 사용자는 한국 기준으로 하루를 산다
export function seoulToday(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
}

export function shiftDate(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 월요일 시작, 서울 기준 이번 주 날짜들
export function seoulWeekDates(today = seoulToday()) {
  const d = new Date(today + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7;
  const days = [];
  for (let i = 0; i < 7; i++) days.push(shiftDate(today, i - dow));
  return days;
}

// 예전 데이터(인증 도입 전)와 새 스키마 모두 안전하게 읽는다
export function normalize(raw) {
  const { _v, ...rest } = raw || {};
  const s = { ...emptyState(), ...rest };
  for (const key of ["users", "goals", "checkins", "progress", "reactions", "messages", "pokes", "excuses"]) {
    if (!Array.isArray(s[key])) s[key] = [];
  }
  for (const key of ["push", "archive"]) {
    if (!s[key] || typeof s[key] !== "object" || Array.isArray(s[key])) s[key] = {};
  }
  if (s.users.length === 0 && s.goals.length > 0) {
    s.users = [...new Set(s.goals.map((g) => g.owner))].slice(0, MAX_USERS);
  }
  s.goals = s.goals.map((g) => ({ type: "daily", ...g }));
  return s;
}

// 클라이언트로 나가면 안 되는 필드 제거
export function sanitize(state) {
  const { push, ...pub } = state;
  return pub;
}

// 둘이서만 쓰는 개인 앱이라 비밀번호 없이 이름만으로 신원을 확인한다.
// (누구든 이름을 알면 그 사람 행세를 할 수 있다는 뜻 — 링크를 아는 두 사람만
// 쓴다는 전제하에 받아들인 트레이드오프. 서버는 여전히 소유권 검증은 한다:
// 내 목표에만 도장/기록/삭제 가능, 친구 목표에만 응원 가능, 도장은 오늘/어제만.)
function authenticate(state, body) {
  const name = str(body.name, 20);
  if (!name || !state.users.includes(name)) return null;
  return name;
}

function findGoal(state, goalId) {
  return state.goals.find((g) => g.id === goalId) || null;
}

function progressTotal(state, goalId) {
  return state.progress
    .filter((p) => p.goalId === goalId)
    .reduce((sum, p) => sum + p.amount, 0);
}

// 상태가 무한히 크지 않게: 오래된 기록을 지우거나 집계로 합친다.
// XP는 아카이브 집계(archive[user].stamps)로 보존된다.
export function compact(state, today = seoulToday()) {
  const reactionCutoff = shiftDate(today, -REACTION_KEEP_DAYS);
  state.reactions = state.reactions.filter((r) => r.date >= reactionCutoff);

  const checkinCutoff = shiftDate(today, -CHECKIN_KEEP_DAYS);
  const ownerOf = new Map(state.goals.map((g) => [g.id, g.owner]));
  const keep = [];
  for (const c of state.checkins) {
    if (c.date >= checkinCutoff) {
      keep.push(c);
      continue;
    }
    const owner = ownerOf.get(c.goalId);
    if (owner) {
      if (!state.archive[owner]) state.archive[owner] = { stamps: 0 };
      state.archive[owner].stamps += 1;
    }
  }
  state.checkins = keep;

  const progressCutoff = shiftDate(today, -PROGRESS_KEEP_DAYS);
  const oldSums = new Map();
  const keepP = [];
  for (const p of state.progress) {
    if (p.date >= progressCutoff) keepP.push(p);
    else oldSums.set(p.goalId, (oldSums.get(p.goalId) || 0) + p.amount);
  }
  for (const [goalId, amount] of oldSums) {
    if (amount !== 0) {
      keepP.unshift({ id: newId("p"), goalId, date: shiftDate(progressCutoff, -1), amount });
    }
  }
  state.progress = keepP;

  // 콕 찌르기는 하루짜리 신호 — 오늘/어제 것만 남긴다
  const pokeCutoff = shiftDate(today, -1);
  state.pokes = state.pokes.filter((p) => p.date >= pokeCutoff).slice(-20);

  const excuseCutoff = shiftDate(today, -EXCUSE_KEEP_DAYS);
  state.excuses = state.excuses.filter((x) => x.date >= excuseCutoff).slice(-300);
}

// user는 인증된 사용자 — owner/by/from은 클라이언트 값을 믿지 않고 여기서 강제한다
export function applyAction(state, body, user) {
  const action = str(body.action, 30);
  const today = seoulToday();

  switch (action) {
    case "addGoal": {
      const g = body.goal || {};
      const title = str(g.title, 60);
      if (!title) return { error: "invalid goal", status: 400 };
      const goal = {
        id: newId("g"),
        owner: user,
        title,
        icon: str(g.icon, 4) || "🎯",
        type: GOAL_TYPES.includes(g.type) ? g.type : "daily",
        createdAt: today,
      };
      if (goal.type === "milestone") {
        goal.target = Math.max(1, int(g.target, 1));
        goal.unit = str(g.unit, 10) || "개";
        goal.deadline = str(g.deadline, 10);
        goal.status = "active";
      }
      state.goals.push(goal);
      return {};
    }

    case "deleteGoal": {
      const goal = findGoal(state, str(body.goalId, 40));
      if (!goal) return { noop: true };
      if (goal.owner !== user) return { error: "본인 목표만 지울 수 있어요", status: 403 };
      state.goals = state.goals.filter((g) => g.id !== goal.id);
      state.checkins = state.checkins.filter((c) => c.goalId !== goal.id);
      state.progress = state.progress.filter((p) => p.goalId !== goal.id);
      state.reactions = state.reactions.filter((r) => r.goalId !== goal.id);
      state.excuses = state.excuses.filter((x) => x.goalId !== goal.id);
      return {};
    }

    case "toggleCheckin": {
      const goal = findGoal(state, str(body.goalId, 40));
      const date = str(body.date, 10);
      if (!goal || !date) return { error: "invalid checkin", status: 400 };
      if (goal.owner !== user) return { error: "본인 목표에만 도장을 찍을 수 있어요", status: 403 };
      if (goal.type === "milestone") return { error: "기간 목표는 수량으로 기록해요", status: 400 };
      // 소급 조작 방지: 오늘/어제만 허용
      if (date !== today && date !== shiftDate(today, -1)) {
        return { error: "오늘과 어제 도장만 찍을 수 있어요", status: 400 };
      }
      const exists = state.checkins.some((c) => c.goalId === goal.id && c.date === date);
      if (exists) {
        state.checkins = state.checkins.filter(
          (c) => !(c.goalId === goal.id && c.date === date)
        );
      } else {
        state.checkins.push({ goalId: goal.id, date });
      }
      return {};
    }

    case "addProgress": {
      const goal = findGoal(state, str(body.goalId, 40));
      let amount = Math.max(-999, Math.min(999, int(body.amount, 0)));
      if (!goal || amount === 0) return { error: "invalid progress", status: 400 };
      if (goal.owner !== user) return { error: "본인 목표만 기록할 수 있어요", status: 403 };
      if (goal.type !== "milestone") return { error: "기간 목표가 아니에요", status: 400 };
      if (goal.status === "failed") return { error: "실패 기록이 끝난 목표예요", status: 400 };
      if (amount < 0) {
        // 누적치가 0 밑으로 내려가지 않게 (숨은 음수 잔액 방지)
        const current = progressTotal(state, goal.id);
        amount = Math.max(amount, -current);
        if (amount === 0) return { noop: true };
      }
      state.progress.push({ id: newId("p"), goalId: goal.id, date: today, amount });
      const next = progressTotal(state, goal.id);
      if (next >= goal.target) {
        goal.status = "completed";
        goal.completedAt = goal.completedAt || new Date().toISOString();
      } else if (goal.status === "completed") {
        goal.status = "active";
        delete goal.completedAt;
      }
      return {};
    }

    case "addFailureReason": {
      const goal = findGoal(state, str(body.goalId, 40));
      const text = str(body.text, 300);
      if (!goal || !text) return { error: "invalid failure reason", status: 400 };
      if (goal.owner !== user) return { error: "본인 목표에만 쓸 수 있어요", status: 403 };
      if (goal.type !== "milestone") return { error: "기간 목표에만 실패 이유를 남겨요", status: 400 };
      if (!goal.deadline || today <= goal.deadline) {
        return { error: "아직 마감일이 지나지 않았어요", status: 400 };
      }
      const finalAmount = Math.max(0, progressTotal(state, goal.id));
      if (finalAmount >= goal.target) {
        goal.status = "completed";
        goal.completedAt = goal.completedAt || new Date().toISOString();
        return { error: "이미 달성한 목표예요", status: 400 };
      }
      goal.status = "failed";
      goal.failureReason = text;
      goal.failedAt = new Date().toISOString();
      goal.failedDate = today;
      goal.expiredAt = goal.expiredAt || today;
      goal.originalDeadline = goal.originalDeadline || goal.deadline;
      goal.finalAmount = finalAmount;
      return {};
    }

    case "toggleReaction": {
      const goal = findGoal(state, str(body.goalId, 40));
      const emoji = str(body.emoji, 4);
      if (!goal || !emoji) return { error: "invalid reaction", status: 400 };
      if (goal.owner === user) return { error: "자기 목표에는 응원할 수 없어요", status: 403 };
      const match = (r) =>
        r.goalId === goal.id && r.date === today && r.emoji === emoji && r.by === user;
      if (state.reactions.some(match)) {
        state.reactions = state.reactions.filter((r) => !match(r));
      } else {
        state.reactions.push({ goalId: goal.id, date: today, emoji, by: user });
      }
      return {};
    }

    case "addMessage": {
      const text = str(body.text, 120);
      if (!text) return { error: "invalid message", status: 400 };
      state.messages.push({ id: newId("m"), from: user, text, createdAt: new Date().toISOString() });
      state.messages = state.messages.slice(-50);
      return {};
    }

    case "deleteMessage": {
      const id = str(body.id, 40);
      const msg = state.messages.find((m) => m.id === id);
      if (!msg) return { noop: true };
      if (msg.from !== user) return { error: "본인 메시지만 지울 수 있어요", status: 403 };
      state.messages = state.messages.filter((m) => m.id !== id);
      return {};
    }

    case "poke": {
      const target = state.users.find((u) => u !== user);
      if (!target) return { error: "아직 친구가 안 들어왔어요", status: 400 };
      state.pokes.push({ id: newId("k"), from: user, date: today, at: new Date().toISOString() });
      state.pokes = state.pokes.slice(-20);
      return {};
    }

    case "addExcuse": {
      // 어제 못 찍은 매일 목표에 이유를 남긴다 (기록 탭 반성 노트에 쌓임)
      const goal = findGoal(state, str(body.goalId, 40));
      const text = str(body.text, 100);
      const yesterday = shiftDate(today, -1);
      if (!goal || !text) return { error: "invalid excuse", status: 400 };
      if (goal.owner !== user) return { error: "본인 목표에만 쓸 수 있어요", status: 403 };
      if (goal.type !== "daily") return { error: "매일 목표에만 이유를 남겨요", status: 400 };
      if (goal.createdAt && goal.createdAt > yesterday) {
        return { error: "어제는 없던 목표예요", status: 400 };
      }
      if (state.checkins.some((c) => c.goalId === goal.id && c.date === yesterday)) {
        return { error: "어제 도장을 이미 찍었어요", status: 400 };
      }
      const existing = state.excuses.find((x) => x.goalId === goal.id && x.date === yesterday);
      if (existing) existing.text = text;
      else state.excuses.push({ id: newId("x"), goalId: goal.id, owner: user, date: yesterday, text });
      return {};
    }

    case "subscribePush": {
      const sub = body.subscription;
      if (
        !sub ||
        typeof sub.endpoint !== "string" ||
        !sub.endpoint.startsWith("https://") ||
        sub.endpoint.length > 1000 ||
        !sub.keys ||
        typeof sub.keys.p256dh !== "string" ||
        typeof sub.keys.auth !== "string"
      ) {
        return { error: "invalid subscription", status: 400 };
      }
      state.push[user] = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
      return {};
    }

    case "unsubscribePush": {
      if (!state.push[user]) return { noop: true };
      delete state.push[user];
      return {};
    }

    default:
      return { error: "unknown action", status: 400 };
  }
}

// POST 하나를 처리해 { status, respond, state?, write? }를 돌려준다.
// write가 true면 호출자가 state를 저장해야 한다 (Redis CAS든 메모리든).
export function handlePost(rawState, body) {
  const state = normalize(rawState);
  const action = str(body.action, 30);

  if (action === "join") {
    const name = str(body.name, 20);
    if (!name) return { status: 400, respond: { error: "이름이 비어 있어요" } };
    if (state.users.includes(name)) {
      return { status: 200, respond: sanitize(state) };
    }
    if (state.users.length >= MAX_USERS) {
      return { status: 403, respond: { error: "full", users: state.users } };
    }
    state.users.push(name);
    return { status: 200, respond: sanitize(state), state, write: true };
  }

  const user = authenticate(state, body);
  if (!user) return { status: 401, respond: { error: "auth" } };

  const result = applyAction(state, body, user);
  if (result.error) {
    const { status, ...rest } = result;
    return { status: status || 400, respond: rest };
  }
  if (result.noop) return { status: 200, respond: sanitize(state) };

  compact(state);
  return { status: 200, respond: sanitize(state), state, write: true };
}

// 밤 9시 리마인더: 아직 오늘 몫을 안 채운 매일 목표 수
export function countMissedToday(state, user, today = seoulToday()) {
  const checked = new Set(state.checkins.map((c) => `${c.goalId}_${c.date}`));
  let missed = 0;
  for (const g of state.goals) {
    if (g.owner !== user) continue;
    if (g.type !== "daily") continue;
    if (checked.has(`${g.id}_${today}`)) continue;
    missed++;
  }
  return missed;
}
