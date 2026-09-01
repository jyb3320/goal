// 서버(Vercel 함수)와 vite 개발 서버가 함께 쓰는 순수 로직 모듈.
// Redis 등 저장소 의존성은 여기 두지 않는다.
import {
  awardPersonalXp,
  checkAndAwardSharedDailyXp,
  getAppWeekKey,
  XP_REWARDS,
} from "./_xp.js";
import { fiveDayReviewPeriod, FIVE_DAY_REVIEW_LENGTH } from "../src/lib/reviewPeriods.js";

export const KEY = "goaltracker:state";
export const MAX_USERS = 2;
export const GOAL_TYPES = ["daily", "milestone"];
const GOAL_KINDS = ["routine", "milestone", "project", "problem"];
const REPEAT_TYPES = ["daily", "weekdays", "weekly", "biweekly", "monthly", "custom", "none"];
const GOAL_CLASSES = ["behavior", "signal", "outcome"];
const KPI_TYPES = ["number", "percentage", "money", "yesno", "formula", "cumulative"];
export const LIFE_DOMAIN_KEYS = ["health", "work", "money", "relationships", "love", "growth", "mind", "experience", "contribution"];

// 기록 보존 기간 — 지나면 컴팩션 대상
const REACTION_KEEP_DAYS = 14; // UI가 최근 7일만 보여줌
const CHECKIN_KEEP_DAYS = 400; // 기록 뷰(1년)용. 넘으면 아카이브 집계로
const PROGRESS_KEEP_DAYS = 90; // 넘으면 목표당 한 건으로 합침
const EXCUSE_KEEP_DAYS = 180; // 반성 노트 보관 기간

// 못 찍은 이유를 며칠 전 것까지 남길 수 있는지.
// 도장(성과)은 오늘/어제만 허용하지만, 이유는 여행·출장으로 며칠 비었을 때도
// 돌아와서 채울 수 있어야 기록이 통째로 사라지지 않는다.
export const EXCUSE_BACKFILL_DAYS = 7;

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
    goalMemos: [], // 언젠가 현황판에 올릴 목표 아이디어
    bigGoals: [], // 사용자별 가장 큰 목표 하나
    lifeProfiles: [], // 개인 헌법과 친구에게 필요한 지원
    lifeDomains: [], // 건강·일·돈·관계 등 인생 영역별 현재 상태
    seasons: [], // 사용자별 현재 12주 시즌
    lifeItems: [], // 시즌에 연결된 프로젝트·루틴·해결할 문제
    weeklyReviews: [], // 주간 인생 회의 기록
    monthlyReviews: [], // 월간·분기 방향 복기
    decisions: [], // 중요한 결정과 사후 결과
    kpis: [], // 주간 복기에서 기록하는 관찰 지표
    completedGoals: [], // 현황판에서 지워도 기록관에 남기는 완료 기간 목표 스냅샷
    calendarEvents: [], // 두 사람이 직접 등록해 공유하는 개인 일정
    push: {}, // name -> Web Push 구독 (클라이언트 응답에서는 제거됨)
    archive: {}, // name -> { stamps } 컴팩션된 옛 도장 집계 (XP 유지용)
    xpEvents: [], // 개인·마을 XP 원장. dedupeKey가 논리적 unique 제약 역할을 한다.
    xpVersion: 0,
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
  for (const key of [
    "users", "goals", "checkins", "progress", "reactions", "messages", "pokes",
    "excuses", "goalMemos", "bigGoals", "lifeProfiles", "lifeDomains", "seasons",
    "lifeItems", "weeklyReviews", "monthlyReviews", "decisions", "kpis", "completedGoals", "calendarEvents", "xpEvents",
  ]) {
    if (!Array.isArray(s[key])) s[key] = [];
  }
  for (const key of ["push", "archive"]) {
    if (!s[key] || typeof s[key] !== "object" || Array.isArray(s[key])) s[key] = {};
  }
  if (s.users.length === 0 && s.goals.length > 0) {
    s.users = [...new Set(s.goals.map((g) => g.owner))].slice(0, MAX_USERS);
  }
  s.goals = s.goals.map((raw) => {
    const g = { type: "daily", ...raw };
    g.kind = GOAL_KINDS.includes(g.kind)
      ? g.kind
      : g.type === "milestone" ? "milestone" : "routine";
    g.goalClass = GOAL_CLASSES.includes(g.goalClass) ? g.goalClass : "behavior";
    g.repeatType = REPEAT_TYPES.includes(g.repeatType)
      ? g.repeatType
      : g.type === "milestone" ? "none" : "daily";
    if (!Array.isArray(g.repeatDays)) g.repeatDays = [];
    if (!Array.isArray(g.customDates)) g.customDates = [];
    if (!Array.isArray(g.subtasks)) g.subtasks = [];
    if (!g.startDate) g.startDate = g.createdAt || "";
    if (!g.status) g.status = "active";
    if (g.showOnBoard === undefined) g.showOnBoard = true;
    if (g.allowSubstitute === undefined) g.allowSubstitute = true;
    return g;
  });
  // 구버전 시즌 항목은 제목이 같은 실제 목표가 있으면 참조로 연결한다.
  // 원본 항목과 목표/도장 기록은 지우거나 복제하지 않는다.
  s.lifeItems = s.lifeItems.map((item) => {
    if (item.goalId) return item;
    const linked = s.goals.find((goal) =>
      goal.owner === item.owner &&
      goal.title.trim().toLowerCase() === String(item.title || "").trim().toLowerCase()
    );
    return linked ? { ...item, goalId: linked.id } : item;
  });
  s.seasons = s.seasons.map((season) => ({
    ...season,
    desiredResults: season.desiredResults || season.outcomes || "",
    coreActions: season.coreActions || "",
    leadingIndicators: season.leadingIndicators || "",
  }));
  // 옛 목표 메모(제목/본문/승격 구조) → 자유 텍스트 메모로 마이그레이션.
  // 이미 목표로 승격된 메모는 이력일 뿐이라 버린다.
  s.goalMemos = s.goalMemos
    .filter((m) => !m.convertedAt)
    .map((m) =>
      m.text !== undefined
        ? m
        : {
            id: m.id,
            owner: m.owner,
            text: [m.title, m.body].filter(Boolean).join(" — "),
            createdAt: m.createdAt,
            updatedAt: m.updatedAt,
          }
    );
  migrateLegacyXp(s);
  return s;
}

function legacyXpFor(user, state) {
  const goals = state.goals.filter((goal) => goal.owner === user);
  const ids = new Set(goals.map((goal) => goal.id));
  const archived = state.archive?.[user]?.stamps || 0;
  let xp = (archived + state.checkins.filter((checkin) => ids.has(checkin.goalId)).length) * 10;
  for (const goal of goals) {
    if (goal.type !== "milestone") continue;
    const net = Math.max(0, progressTotal(state, goal.id));
    xp += Math.min(net, goal.target) * 2;
    if (net >= goal.target) xp += 30;
  }
  return xp;
}

function migrateLegacyXp(state) {
  if (state.xpVersion >= 1) return;
  for (const user of state.users) {
    const dedupeKey = `legacy-user-xp:${user}`;
    if (state.xpEvents.some((event) => event.dedupeKey === dedupeKey)) continue;
    const amount = legacyXpFor(user, state);
    if (amount <= 0) continue;
    state.xpEvents.push({
      id: newId("xp"),
      recipientType: "USER",
      recipientId: user,
      eventType: "LEGACY_MIGRATION",
      sourceType: "LEGACY_STATE",
      sourceId: user,
      xpAmount: amount,
      dedupeKey,
      createdAt: new Date().toISOString(),
      metadata: { formula: "legacy-checkins-and-milestone-progress" },
    });
  }
  state.xpVersion = 1;
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

function findGoalMemo(state, memoId) {
  return state.goalMemos.find((m) => m.id === memoId) || null;
}

function progressTotal(state, goalId) {
  return state.progress
    .filter((p) => p.goalId === goalId)
    .reduce((sum, p) => sum + p.amount, 0);
}

// 메모는 그냥 적어두는 자유 텍스트 — 목표 승격 같은 구조 없음
function cleanMemoInput(raw = {}) {
  return { text: str(raw.text, 400) };
}

function cleanTextFields(raw, specs) {
  const out = {};
  for (const [key, max] of Object.entries(specs)) out[key] = str(raw?.[key], max);
  return out;
}

function cleanDate(value) {
  const date = str(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function cleanTime(value) {
  const time = str(value, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : "";
}

function cleanRepeatDays(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((day) => int(day, -1)).filter((day) => day >= 0 && day <= 6))].slice(0, 7);
}

function cleanSubtasks(value, previous = []) {
  if (!Array.isArray(value)) return previous;
  return value.slice(0, 40).map((task, index) => {
    const old = previous.find((item) => item.id === str(task?.id, 50));
    return {
      id: old?.id || str(task?.id, 50) || newId("task"),
      title: str(task?.title, 120),
      done: task?.done === true,
      deadline: cleanDate(task?.deadline),
      scheduledDate: cleanDate(task?.scheduledDate),
      scheduledWeek: cleanDate(task?.scheduledWeek),
      order: index,
      completedAt: task?.done === true ? old?.completedAt || new Date().toISOString() : "",
    };
  }).filter((task) => task.title);
}

function applyGoalFields(goal, input, { creating = false } = {}) {
  const kind = GOAL_KINDS.includes(input.kind)
    ? input.kind
    : input.type === "milestone" || goal.type === "milestone" ? "milestone" : "routine";
  goal.kind = kind;
  goal.type = kind === "milestone" ? "milestone" : "daily";
  if (input.title !== undefined) goal.title = str(input.title, 120);
  if (input.icon !== undefined) goal.icon = str(input.icon, 4) || "🎯";
  if (input.goalClass !== undefined || creating) {
    goal.goalClass = GOAL_CLASSES.includes(input.goalClass) ? input.goalClass : "behavior";
  }
  if (input.target !== undefined || creating) goal.target = Math.max(1, int(input.target, 1));
  if (input.unit !== undefined || creating) goal.unit = str(input.unit, 16) || "개";
  if (input.startDate !== undefined || creating) goal.startDate = cleanDate(input.startDate) || goal.createdAt;
  if (input.deadline !== undefined || creating) goal.deadline = cleanDate(input.deadline);
  if (input.repeatType !== undefined || creating) {
    const fallback = kind === "routine" ? "daily" : "none";
    goal.repeatType = REPEAT_TYPES.includes(input.repeatType) ? input.repeatType : fallback;
  }
  if (input.repeatDays !== undefined || creating) goal.repeatDays = cleanRepeatDays(input.repeatDays);
  if (input.repeatCount !== undefined || creating) goal.repeatCount = Math.max(1, Math.min(31, int(input.repeatCount, 1)));
  if (input.customDates !== undefined || creating) {
    goal.customDates = Array.isArray(input.customDates) ? input.customDates.map(cleanDate).filter(Boolean).slice(0, 100) : [];
  }
  if (input.executionTime !== undefined || creating) goal.executionTime = str(input.executionTime, 5);
  if (kind === "routine" || kind === "problem") {
    if (input.cue !== undefined || creating) goal.cue = str(input.cue, 100);
    if (input.minimumVersion !== undefined || creating) goal.minimumVersion = str(input.minimumVersion, 120);
  } else {
    delete goal.cue;
    delete goal.minimumVersion;
  }
  if (input.domainKey !== undefined || creating) goal.domainKey = str(input.domainKey, 30);
  if (input.seasonId !== undefined || creating) goal.seasonId = str(input.seasonId, 50);
  if (input.showOnBoard !== undefined || creating) goal.showOnBoard = input.showOnBoard !== false;
  if (input.allowSubstitute !== undefined || creating) goal.allowSubstitute = input.allowSubstitute !== false;
  if (input.reminder !== undefined || creating) goal.reminder = input.reminder === true;
  if (input.scheduledDate !== undefined || creating) goal.scheduledDate = cleanDate(input.scheduledDate);
  if (input.scheduledWeek !== undefined || creating) goal.scheduledWeek = cleanDate(input.scheduledWeek);
  if (input.subtasks !== undefined || creating) goal.subtasks = cleanSubtasks(input.subtasks, goal.subtasks || []);
  if (input.status !== undefined && ["active", "paused", "completed", "failed"].includes(input.status)) {
    goal.status = input.status;
  }
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

  state.weeklyReviews = state.weeklyReviews.slice(-104);
  state.monthlyReviews = state.monthlyReviews.slice(-48);
  state.decisions = state.decisions.slice(-120);
  state.lifeItems = state.lifeItems.slice(-160);
}

// user는 인증된 사용자 — owner/by/from은 클라이언트 값을 믿지 않고 여기서 강제한다
export function applyAction(state, body, user) {
  const action = str(body.action, 30);
  const today = seoulToday();

  switch (action) {
    case "addCalendarEvent": {
      const title = str(body.event?.title, 120);
      const date = cleanDate(body.event?.date);
      if (!title || !date) return { error: "일정 이름과 날짜를 확인해주세요", status: 400 };
      const allDay = body.event?.allDay !== false;
      const startTime = allDay ? "" : cleanTime(body.event?.startTime);
      const endTime = allDay ? "" : cleanTime(body.event?.endTime);
      if (!allDay && !startTime) return { error: "시작 시간을 선택해주세요", status: 400 };
      if (startTime && endTime && endTime <= startTime) return { error: "종료 시간은 시작 시간보다 늦어야 해요", status: 400 };
      state.calendarEvents.push({
        id: newId("cal"),
        owner: user,
        title,
        date,
        allDay,
        startTime,
        endTime,
        note: str(body.event?.note, 500),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return {};
    }

    case "updateCalendarEvent": {
      const event = state.calendarEvents.find((item) => item.id === str(body.eventId, 50));
      if (!event) return { error: "일정을 찾을 수 없어요", status: 404 };
      if (event.owner !== user) return { error: "본인 일정만 수정할 수 있어요", status: 403 };
      const title = str(body.event?.title, 120);
      const date = cleanDate(body.event?.date);
      if (!title || !date) return { error: "일정 이름과 날짜를 확인해주세요", status: 400 };
      const allDay = body.event?.allDay !== false;
      const startTime = allDay ? "" : cleanTime(body.event?.startTime);
      const endTime = allDay ? "" : cleanTime(body.event?.endTime);
      if (!allDay && !startTime) return { error: "시작 시간을 선택해주세요", status: 400 };
      if (startTime && endTime && endTime <= startTime) return { error: "종료 시간은 시작 시간보다 늦어야 해요", status: 400 };
      Object.assign(event, { title, date, allDay, startTime, endTime, note: str(body.event?.note, 500), updatedAt: new Date().toISOString() });
      return {};
    }

    case "deleteCalendarEvent": {
      const eventId = str(body.eventId, 50);
      const event = state.calendarEvents.find((item) => item.id === eventId);
      if (!event) return { noop: true };
      if (event.owner !== user) return { error: "본인 일정만 삭제할 수 있어요", status: 403 };
      state.calendarEvents = state.calendarEvents.filter((item) => item.id !== eventId);
      return {};
    }

    case "setLifeProfile": {
      const fields = cleanTextFields(body.profile, {
        identity: 500,
        values: 500,
        principles: 700,
        nonNegotiables: 500,
        stopDoing: 500,
        supportNeeded: 500,
      });
      if (!Object.values(fields).some(Boolean)) {
        return { error: "개인 헌법 내용을 하나 이상 적어주세요", status: 400 };
      }
      const existing = state.lifeProfiles.find((p) => p.owner === user);
      const record = { owner: user, ...fields, updatedAt: new Date().toISOString() };
      if (existing) Object.assign(existing, record);
      else state.lifeProfiles.push(record);
      return {};
    }

    case "setLifeDomain": {
      const key = str(body.domain?.key, 30);
      if (!LIFE_DOMAIN_KEYS.includes(key)) return { error: "올바른 인생 영역을 선택해주세요", status: 400 };
      const fields = cleanTextFields(body.domain, {
        current: 500,
        desired: 500,
        nextStep: 300,
      });
      const score = Math.max(1, Math.min(5, int(body.domain?.score, 3)));
      const existing = state.lifeDomains.find((d) => d.owner === user && d.key === key);
      const record = { owner: user, key, score, ...fields, updatedAt: new Date().toISOString() };
      if (existing) Object.assign(existing, record);
      else state.lifeDomains.push(record);
      return {};
    }

    case "setSeason": {
      const fields = cleanTextFields(body.season, {
        title: 100,
        focusAreas: 200,
        outcomes: 700,
        desiredResults: 1000,
        coreActions: 800,
        leadingIndicators: 600,
        why: 500,
        notDoing: 500,
      });
      fields.desiredResults = fields.desiredResults || fields.outcomes;
      fields.outcomes = fields.desiredResults;
      if (!fields.title || !fields.desiredResults) {
        return { error: "시즌 이름과 12주 뒤 원하는 결과를 적어주세요", status: 400 };
      }
      const startDate = str(body.season?.startDate, 10) || today;
      const endDate = str(body.season?.endDate, 10) || shiftDate(startDate, 83);
      if (endDate < startDate) return { error: "시즌 종료일을 확인해주세요", status: 400 };
      const current = state.seasons.find((s) => s.owner === user && s.status === "active");
      const record = {
        id: current?.id || newId("season"),
        owner: user,
        ...fields,
        startDate,
        endDate,
        status: "active",
        createdAt: current?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (current) Object.assign(current, record);
      else state.seasons.push(record);
      const auto = body.season?.autoCreate || {};
      const makeGoal = (input) => {
        const duplicate = state.goals.find((goal) =>
          goal.owner === user && goal.seasonId === record.id && goal.title === input.title && goal.status !== "failed"
        );
        if (duplicate) return duplicate;
        const goal = {
          id: newId("g"),
          owner: user,
          title: input.title,
          icon: input.icon || "🎯",
          createdAt: today,
          status: "active",
        };
        applyGoalFields(goal, { ...input, seasonId: record.id }, { creating: true });
        state.goals.push(goal);
        return goal;
      };
      const firstResult = fields.desiredResults.split("\n").map((line) => line.replace(/^[•\-\s]+/, "").trim()).find(Boolean);
      const firstAction = fields.coreActions.split("\n").map((line) => line.replace(/^[•\-\s]+/, "").trim()).find(Boolean);
      const firstKpi = fields.leadingIndicators.split(/[,\n]/).map((line) => line.replace(/^[•\-\s]+/, "").trim()).find(Boolean);
      const weekdayMap = { 일: 0, 일요일: 0, 월: 1, 월요일: 1, 화: 2, 화요일: 2, 수: 3, 수요일: 3, 목: 4, 목요일: 4, 금: 5, 금요일: 5, 토: 6, 토요일: 6 };
      const inferredDays = [...new Set((firstAction || "").split(/[\s·,/&+]+/).map((token) => weekdayMap[token]).filter((day) => day !== undefined))];
      if (auto.project && firstResult) {
        const goal = makeGoal({ title: firstResult, kind: "project", repeatType: "none", goalClass: "outcome", deadline: endDate });
        if (!state.lifeItems.some((item) => item.goalId === goal.id)) {
          state.lifeItems.push({ id: newId("life"), owner: user, title: goal.title, kind: "project", domainKey: "", seasonId: record.id, goalId: goal.id, doneDefinition: firstResult, status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        }
      }
      if (auto.routine && firstAction) {
        const goal = makeGoal({
          title: firstAction,
          kind: "routine",
          repeatType: inferredDays.length ? "weekdays" : "weekly",
          repeatDays: inferredDays,
          repeatCount: inferredDays.length || 1,
          goalClass: "behavior",
        });
        if (!state.lifeItems.some((item) => item.goalId === goal.id)) {
          state.lifeItems.push({ id: newId("life"), owner: user, title: goal.title, kind: "routine", domainKey: "", seasonId: record.id, goalId: goal.id, doneDefinition: firstAction, status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        }
      }
      if (auto.milestone && firstResult) {
        makeGoal({ title: firstResult, kind: "milestone", repeatType: "none", goalClass: "outcome", target: 1, unit: "회", deadline: endDate });
      }
      if (auto.kpi && firstKpi && !state.kpis.some((kpi) => kpi.owner === user && kpi.seasonId === record.id && kpi.title === firstKpi)) {
        state.kpis.push({ id: newId("kpi"), owner: user, seasonId: record.id, title: firstKpi, type: "number", unit: "", formula: "", entries: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      }
      return {};
    }

    case "closeSeason": {
      const current = state.seasons.find((s) => s.owner === user && s.status === "active");
      if (!current) return { noop: true };
      current.status = "completed";
      current.closedAt = new Date().toISOString();
      current.updatedAt = current.closedAt;
      return {};
    }

    case "applyAiGoalDraft": {
      const draft = body.draft || {};
      const selectedSeason = draft.season?.selected !== false ? draft.season : null;
      let seasonId = str(draft.seasonId, 50);

      if (selectedSeason) {
        const title = str(selectedSeason.title, 100);
        const outcomes = Array.isArray(selectedSeason.outcomes)
          ? selectedSeason.outcomes.map((item) => str(item, 300)).filter(Boolean).slice(0, 2).join("\n")
          : str(selectedSeason.outcomes, 700);
        if (!title || !outcomes) return { error: "AI 시즌 초안의 이름과 완료 기준을 확인해주세요", status: 400 };
        const current = state.seasons.find((season) => season.owner === user && season.status === "active");
        const record = {
          id: current?.id || newId("season"),
          owner: user,
          title,
          focusAreas: str(selectedSeason.focusAreas, 200),
          outcomes,
          why: str(selectedSeason.why, 500),
          notDoing: str(selectedSeason.notDoing, 500),
          startDate: current?.startDate || today,
          endDate: current?.endDate || shiftDate(today, 83),
          status: "active",
          createdAt: current?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (current) Object.assign(current, record);
        else state.seasons.push(record);
        seasonId = record.id;
      } else if (seasonId && !state.seasons.some((season) => season.id === seasonId && season.owner === user)) {
        return { error: "본인의 현재 시즌에만 연결할 수 있어요", status: 403 };
      }

      const selectedItems = [...(Array.isArray(draft.projects) ? draft.projects : []), ...(Array.isArray(draft.routines) ? draft.routines : [])]
        .filter((item) => item?.selected !== false)
        .slice(0, 6);
      for (const raw of selectedItems) {
        const title = str(raw.title, 120);
        if (!title) continue;
        const kind = raw.kind === "routine" ? "routine" : "project";
        const domainKey = LIFE_DOMAIN_KEYS.includes(str(raw.domainKey, 30)) ? str(raw.domainKey, 30) : "";
        const duplicate = state.lifeItems.some(
          (item) => item.owner === user && item.status !== "completed" && item.title === title
        );
        if (duplicate) continue;
        state.lifeItems.push({
          id: newId("life"),
          owner: user,
          title,
          kind,
          domainKey,
          seasonId,
          doneDefinition: str(raw.doneDefinition, 400),
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      return {};
    }

    case "addLifeItem": {
      const item = body.item || {};
      const title = str(item.title, 120);
      const kind = ["project", "routine", "problem"].includes(item.kind) ? item.kind : "project";
      if (!title) return { error: "항목 이름을 적어주세요", status: 400 };
      const domainKey = str(item.domainKey, 30);
      const seasonId = str(item.seasonId, 50);
      if (domainKey && !LIFE_DOMAIN_KEYS.includes(domainKey)) {
        return { error: "올바른 인생 영역을 선택해주세요", status: 400 };
      }
      if (seasonId && !state.seasons.some((season) => season.id === seasonId && season.owner === user)) {
        return { error: "본인 시즌에만 연결할 수 있어요", status: 403 };
      }
      let goalId = "";
      if (item.createGoal !== false && kind !== "problem") {
        const goal = {
          id: newId("g"),
          owner: user,
          title,
          icon: str(item.icon, 4) || (kind === "routine" ? "🔁" : "📌"),
          createdAt: today,
          status: "active",
        };
        applyGoalFields(goal, {
          ...item,
          title,
          kind,
          domainKey,
          seasonId,
          repeatType: kind === "routine" ? item.repeatType || "daily" : "none",
          showOnBoard: item.showOnBoard !== false,
        }, { creating: true });
        state.goals.push(goal);
        goalId = goal.id;
      }
      state.lifeItems.push({
        id: newId("life"),
        owner: user,
        title,
        kind,
        domainKey,
        seasonId,
        doneDefinition: str(item.doneDefinition, 400),
        goalId,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return {};
    }

    case "updateLifeItem": {
      const item = state.lifeItems.find((x) => x.id === str(body.itemId, 50));
      if (!item) return { noop: true };
      if (item.owner !== user) return { error: "본인 항목만 수정할 수 있어요", status: 403 };
      if (body.status !== undefined) {
        const status = str(body.status, 20);
        if (!["active", "completed", "paused"].includes(status)) {
          return { error: "올바른 상태가 아니에요", status: 400 };
        }
        item.status = status;
      }
      if (body.item) {
        const title = str(body.item.title, 120);
        if (title) item.title = title;
        item.domainKey = str(body.item.domainKey, 30);
        item.seasonId = str(body.item.seasonId, 50);
        item.doneDefinition = str(body.item.doneDefinition, 400);
        if (item.goalId) {
          const goal = findGoal(state, item.goalId);
          if (goal) applyGoalFields(goal, { ...body.item, title: title || goal.title });
        }
      }
      item.updatedAt = new Date().toISOString();
      return {};
    }

    case "deleteLifeItem": {
      const id = str(body.itemId, 50);
      const item = state.lifeItems.find((x) => x.id === id);
      if (!item) return { noop: true };
      if (item.owner !== user) return { error: "본인 항목만 삭제할 수 있어요", status: 403 };
      state.lifeItems = state.lifeItems.filter((x) => x.id !== id);
      // 연결 목표는 과거 도장 보존을 위해 삭제하지 않고 시즌 연결만 해제한다.
      if (item.goalId) {
        const goal = findGoal(state, item.goalId);
        if (goal) goal.seasonId = "";
      }
      return {};
    }

    case "updateGoalContext": {
      const goal = findGoal(state, str(body.goalId, 40));
      if (!goal) return { noop: true };
      if (goal.owner !== user) return { error: "본인 목표만 연결할 수 있어요", status: 403 };
      const domainKey = str(body.domainKey, 30);
      const seasonId = str(body.seasonId, 50);
      if (domainKey && !LIFE_DOMAIN_KEYS.includes(domainKey)) {
        return { error: "올바른 인생 영역을 선택해주세요", status: 400 };
      }
      if (seasonId && !state.seasons.some((season) => season.id === seasonId && season.owner === user)) {
        return { error: "본인 시즌에만 연결할 수 있어요", status: 403 };
      }
      goal.domainKey = domainKey;
      goal.seasonId = seasonId;
      return {};
    }

    case "setWeeklyReview": {
      const requestedStart = str(body.review?.weekStart, 10);
      if (!requestedStart) return { error: "회고 기준일이 필요해요", status: 400 };
      const requestedFiveDay = body.review?.cadence === "five-day" || Number(body.review?.periodDays) === FIVE_DAY_REVIEW_LENGTH;
      const requestedPeriod = requestedFiveDay ? fiveDayReviewPeriod(requestedStart) : null;
      const weekStart = requestedPeriod?.start || requestedStart;
      const fields = cleanTextFields(body.review, {
        facts: 800,
        wins: 600,
        avoidance: 600,
        timeMoney: 600,
        worry: 500,
        honestTalk: 500,
        promises: 600,
        priority: 300,
        summary: 800,
        winsReasonPlan: 800,
        avoidanceReason: 600,
        did: 800,
        goodConditions: 600,
        blockers: 600,
        keep: 500,
        reduce: 500,
      });
      if (!Object.values(fields).some(Boolean)) return { error: "복기 내용을 적어주세요", status: 400 };
      const existing = state.weeklyReviews.find((r) => r.owner === user && r.weekStart === weekStart);
      const periodDays = requestedFiveDay || existing?.periodDays === FIVE_DAY_REVIEW_LENGTH ? FIVE_DAY_REVIEW_LENGTH : 7;
      const cadence = periodDays === FIVE_DAY_REVIEW_LENGTH ? "five-day" : existing?.cadence || "weekly";
      const record = {
        id: existing?.id || newId("week"), owner: user, weekStart, ...fields,
        ...(periodDays === FIVE_DAY_REVIEW_LENGTH ? { cadence, periodDays } : existing?.periodDays ? { cadence, periodDays } : {}),
        updatedAt: new Date().toISOString(),
      };
      if (existing) Object.assign(existing, record);
      else state.weeklyReviews.push(record);
      if (body.review?.createPromises === true) {
        const nextWeekStart = shiftDate(weekStart, periodDays);
        const promises = Array.isArray(body.review.promiseItems)
          ? body.review.promiseItems.map((item) => str(item, 120)).filter(Boolean).slice(0, 3)
          : fields.promises.split("\n").map((item) => item.replace(/^\s*[-•\d.)]+\s*/, "").trim()).filter(Boolean).slice(0, 3);
        for (const title of promises) {
          if (state.goals.some((goal) => goal.owner === user && goal.title === title && goal.scheduledWeek === nextWeekStart)) continue;
          const goal = { id: newId("g"), owner: user, title, icon: "約", createdAt: today, status: "active" };
          applyGoalFields(goal, {
            kind: "routine", goalClass: "behavior", repeatType: "none",
            scheduledWeek: nextWeekStart, startDate: nextWeekStart, showOnBoard: true,
          }, { creating: true });
          state.goals.push(goal);
        }
      }
      if (existing) return {};
      const periodKey = periodDays === FIVE_DAY_REVIEW_LENGTH ? `5d:${weekStart}` : getAppWeekKey(weekStart);
      const award = awardPersonalXp(state, {
        recipientId: user,
        eventType: "WEEKLY_REVIEW_COMPLETED",
        sourceType: "WEEKLY_REVIEW",
        sourceId: record.id,
        weekKey: periodKey,
        amount: XP_REWARDS.WEEKLY_REVIEW_COMPLETED,
        dedupeKey: `weekly-review:${user}:${periodKey}`,
      });
      return { xpAwards: [award] };
    }

    case "setMonthlyReview": {
      const month = str(body.review?.month, 7);
      if (!month) return { error: "복기할 달이 필요해요", status: 400 };
      const fields = cleanTextFields(body.review, {
        improvement: 800,
        postponed: 600,
        pattern: 600,
        stillImportant: 500,
        stop: 500,
        nextFocus: 500,
      });
      if (!Object.values(fields).some(Boolean)) return { error: "복기 내용을 적어주세요", status: 400 };
      const existing = state.monthlyReviews.find((r) => r.owner === user && r.month === month);
      const record = { id: existing?.id || newId("month"), owner: user, month, ...fields, updatedAt: new Date().toISOString() };
      if (existing) Object.assign(existing, record);
      else state.monthlyReviews.push(record);
      return {};
    }

    case "addDecision": {
      const fields = cleanTextFields(body.decision, {
        title: 120,
        context: 700,
        options: 700,
        expectation: 500,
        fear: 500,
        reason: 700,
        reviewDate: 10,
      });
      if (!fields.title || !fields.reason) return { error: "결정과 결정 이유를 적어주세요", status: 400 };
      state.decisions.push({
        id: newId("decision"),
        owner: user,
        ...fields,
        result: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return {};
    }

    case "updateDecision": {
      const decision = state.decisions.find((d) => d.id === str(body.decisionId, 50));
      if (!decision) return { noop: true };
      if (decision.owner !== user) return { error: "본인 결정만 수정할 수 있어요", status: 403 };
      decision.result = str(body.result, 800);
      decision.updatedAt = new Date().toISOString();
      return {};
    }

    case "deleteDecision": {
      const id = str(body.decisionId, 50);
      const decision = state.decisions.find((d) => d.id === id);
      if (!decision) return { noop: true };
      if (decision.owner !== user) return { error: "본인 결정만 삭제할 수 있어요", status: 403 };
      state.decisions = state.decisions.filter((d) => d.id !== id);
      return {};
    }

    case "setBigGoal": {
      const text = str(body.text, 160);
      if (!text) return { error: "가장 큰 목표를 적어주세요", status: 400 };
      const existing = state.bigGoals.find((g) => g.owner === user);
      if (existing) {
        existing.text = text;
        existing.updatedAt = new Date().toISOString();
      } else {
        state.bigGoals.push({
          owner: user,
          text,
          updatedAt: new Date().toISOString(),
        });
      }
      return {};
    }

    case "addGoal": {
      const g = body.goal || {};
      const title = str(g.title, 120);
      if (!title) return { error: "invalid goal", status: 400 };
      const domainKey = str(g.domainKey, 30);
      const seasonId = str(g.seasonId, 50);
      if (domainKey && !LIFE_DOMAIN_KEYS.includes(domainKey)) {
        return { error: "올바른 인생 영역을 선택해주세요", status: 400 };
      }
      if (seasonId && !state.seasons.some((season) => season.id === seasonId && season.owner === user)) {
        return { error: "본인 시즌에만 연결할 수 있어요", status: 403 };
      }
      const goal = {
        id: newId("g"),
        owner: user,
        title,
        icon: str(g.icon, 4) || "🎯",
        createdAt: today,
        status: "active",
      };
      applyGoalFields(goal, { ...g, title, domainKey, seasonId }, { creating: true });
      state.goals.push(goal);
      if ((goal.kind === "project" || goal.kind === "routine") && goal.seasonId && !state.lifeItems.some((item) => item.goalId === goal.id)) {
        state.lifeItems.push({
          id: newId("life"), owner: user, title: goal.title, kind: goal.kind,
          domainKey: goal.domainKey, seasonId: goal.seasonId, goalId: goal.id,
          doneDefinition: str(g.doneDefinition, 400), status: "active",
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
      }
      return {};
    }

    case "updateGoal": {
      const goal = findGoal(state, str(body.goalId, 40));
      if (!goal) return { noop: true };
      if (goal.owner !== user) return { error: "본인 목표만 수정할 수 있어요", status: 403 };
      const input = body.goal && typeof body.goal === "object" ? body.goal : body;
      const domainKey = input.domainKey === undefined ? goal.domainKey : str(input.domainKey, 30);
      const seasonId = input.seasonId === undefined ? goal.seasonId : str(input.seasonId, 50);
      if (domainKey && !LIFE_DOMAIN_KEYS.includes(domainKey)) return { error: "올바른 인생 영역을 선택해주세요", status: 400 };
      if (seasonId && !state.seasons.some((season) => season.id === seasonId && season.owner === user)) {
        return { error: "본인 시즌에만 연결할 수 있어요", status: 403 };
      }
      applyGoalFields(goal, { ...input, domainKey, seasonId });
      if (!goal.title) return { error: "목표 이름을 적어주세요", status: 400 };
      goal.updatedAt = new Date().toISOString();
      const linked = state.lifeItems.find((item) => item.goalId === goal.id);
      if (linked) {
        linked.title = goal.title;
        linked.kind = goal.kind === "milestone" ? linked.kind : goal.kind;
        linked.domainKey = goal.domainKey;
        linked.seasonId = goal.seasonId;
        linked.status = goal.status;
        linked.updatedAt = goal.updatedAt;
      }
      return {};
    }

    case "duplicateGoal": {
      const original = findGoal(state, str(body.goalId, 40));
      if (!original) return { noop: true };
      if (original.owner !== user) return { error: "본인 목표만 복제할 수 있어요", status: 403 };
      const copy = {
        ...original,
        id: newId("g"),
        title: `${original.title} 복사본`,
        status: "active",
        createdAt: today,
        updatedAt: new Date().toISOString(),
        subtasks: (original.subtasks || []).map((task) => ({ ...task, id: newId("task"), done: false, completedAt: "" })),
      };
      delete copy.completedAt;
      delete copy.failedAt;
      state.goals.push(copy);
      return {};
    }

    case "setGoalStatus": {
      const goal = findGoal(state, str(body.goalId, 40));
      if (!goal) return { noop: true };
      if (goal.owner !== user) return { error: "본인 목표만 수정할 수 있어요", status: 403 };
      const status = str(body.status, 20);
      if (!["active", "paused", "completed", "failed"].includes(status)) return { error: "올바른 상태가 아니에요", status: 400 };
      goal.status = status;
      goal.updatedAt = new Date().toISOString();
      if (status === "completed") goal.completedAt = goal.completedAt || goal.updatedAt;
      return {};
    }

    case "scheduleGoal": {
      const goal = findGoal(state, str(body.goalId, 40));
      if (!goal) return { noop: true };
      if (goal.owner !== user) return { error: "본인 목표만 옮길 수 있어요", status: 403 };
      if (body.destination === "today") goal.scheduledDate = today;
      if (body.destination === "week") goal.scheduledWeek = seoulWeekDates(today)[0];
      goal.updatedAt = new Date().toISOString();
      return {};
    }

    case "toggleSubtask": {
      const goal = findGoal(state, str(body.goalId, 40));
      if (!goal) return { noop: true };
      if (goal.owner !== user) return { error: "본인 프로젝트만 수정할 수 있어요", status: 403 };
      const task = (goal.subtasks || []).find((item) => item.id === str(body.taskId, 50));
      if (!task) return { noop: true };
      task.done = body.done === true;
      task.completedAt = task.done ? new Date().toISOString() : "";
      goal.updatedAt = new Date().toISOString();
      if (goal.subtasks.length > 0 && goal.subtasks.every((item) => item.done)) goal.completionSuggested = true;
      else goal.completionSuggested = false;
      return {};
    }

    case "scheduleSubtask": {
      const goal = findGoal(state, str(body.goalId, 40));
      if (!goal) return { noop: true };
      if (goal.owner !== user) return { error: "본인 프로젝트만 수정할 수 있어요", status: 403 };
      const task = (goal.subtasks || []).find((item) => item.id === str(body.taskId, 50));
      if (!task) return { noop: true };
      if (body.destination === "today") task.scheduledDate = today;
      if (body.destination === "week") task.scheduledWeek = seoulWeekDates(today)[0];
      goal.updatedAt = new Date().toISOString();
      return {};
    }

    case "setKpi": {
      const raw = body.kpi || {};
      const id = str(raw.id, 50);
      const title = str(raw.title, 100);
      if (!title) return { error: "지표 이름을 적어주세요", status: 400 };
      const type = KPI_TYPES.includes(raw.type) ? raw.type : "number";
      const seasonId = str(raw.seasonId, 50);
      const existing = id ? state.kpis.find((item) => item.id === id && item.owner === user) : null;
      const record = {
        id: existing?.id || newId("kpi"), owner: user, title, type,
        unit: str(raw.unit, 16), formula: str(raw.formula, 200), seasonId,
        entries: existing?.entries || [], createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (existing) Object.assign(existing, record);
      else state.kpis.push(record);
      return {};
    }

    case "recordKpi": {
      const kpi = state.kpis.find((item) => item.id === str(body.kpiId, 50));
      if (!kpi) return { noop: true };
      if (kpi.owner !== user) return { error: "본인 지표만 기록할 수 있어요", status: 403 };
      const weekStart = cleanDate(body.weekStart) || seoulWeekDates(today)[0];
      const value = str(body.value, 60);
      const existing = kpi.entries.find((entry) => entry.weekStart === weekStart);
      if (existing) Object.assign(existing, { value, updatedAt: new Date().toISOString() });
      else kpi.entries.push({ id: newId("ke"), weekStart, value, createdAt: new Date().toISOString() });
      kpi.entries = kpi.entries.slice(-52);
      kpi.updatedAt = new Date().toISOString();
      return {};
    }

    case "addGoalMemo": {
      const input = cleanMemoInput(body.memo || {});
      if (!input.text) return { error: "invalid memo", status: 400 };
      state.goalMemos.push({
        id: newId("memo"),
        owner: user,
        ...input,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return {};
    }

    case "updateGoalMemo": {
      const memo = findGoalMemo(state, str(body.memoId, 50));
      if (!memo) return { noop: true };
      if (memo.owner !== user) return { error: "본인 메모만 수정할 수 있어요", status: 403 };
      const input = cleanMemoInput(body.memo || {});
      if (!input.text) return { error: "invalid memo", status: 400 };
      Object.assign(memo, input, { updatedAt: new Date().toISOString() });
      return {};
    }

    case "deleteGoalMemo": {
      const memo = findGoalMemo(state, str(body.memoId, 50));
      if (!memo) return { noop: true };
      if (memo.owner !== user) return { error: "본인 메모만 삭제할 수 있어요", status: 403 };
      state.goalMemos = state.goalMemos.filter((m) => m.id !== memo.id);
      return {};
    }

    case "deleteGoal": {
      const goal = findGoal(state, str(body.goalId, 40));
      if (!goal) return { noop: true };
      if (goal.owner !== user) return { error: "본인 목표만 지울 수 있어요", status: 403 };
      const preserveCompletion = goal.type === "milestone" && goal.status === "completed";
      if (preserveCompletion && !state.completedGoals.some((item) => item.id === goal.id)) {
        state.completedGoals.push({
          ...goal,
          archivedAt: new Date().toISOString(),
        });
      }
      state.goals = state.goals.filter((g) => g.id !== goal.id);
      state.checkins = state.checkins.filter((c) => c.goalId !== goal.id);
      if (!preserveCompletion) {
        state.progress = state.progress.filter((p) => p.goalId !== goal.id);
      }
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
        // min:true = 바쁜 날 최소 버전만 수행. 연속은 살지만 정직하게 따로 표시한다.
        const checkin = { goalId: goal.id, date, completedAt: new Date().toISOString() };
        if (body.min === true) checkin.min = true;
        state.checkins.push(checkin);
        const personal = awardPersonalXp(state, {
          recipientId: user,
          eventType: "DAILY_GOAL_COMPLETE",
          sourceType: "DAILY_GOAL",
          sourceId: goal.id,
          dateKey: date,
          amount: XP_REWARDS.DAILY_GOAL_COMPLETE,
          dedupeKey: `daily-goal:${user}:${goal.id}:${date}`,
          metadata: { goalTitle: goal.title },
        });
        const shared = checkAndAwardSharedDailyXp(state, date);
        return { xpAwards: [personal, shared] };
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
      const awards = [];
      if (amount > 0) {
        awards.push(awardPersonalXp(state, {
          recipientId: user,
          eventType: "PERIOD_GOAL_PROGRESS",
          sourceType: "MILESTONE_GOAL",
          sourceId: goal.id,
          dateKey: today,
          amount: XP_REWARDS.PERIOD_GOAL_PROGRESS,
          dedupeKey: `period-progress:${user}:${goal.id}:${today}`,
          metadata: { goalTitle: goal.title },
        }));
      }
      if (next >= goal.target) {
        goal.status = "completed";
        goal.completedAt = goal.completedAt || new Date().toISOString();
        awards.push(awardPersonalXp(state, {
          recipientId: user,
          eventType: "PERIOD_GOAL_COMPLETE",
          sourceType: "MILESTONE_GOAL",
          sourceId: goal.id,
          dateKey: today,
          amount: XP_REWARDS.PERIOD_GOAL_COMPLETE,
          dedupeKey: `period-complete:${user}:${goal.id}`,
          metadata: { goalTitle: goal.title },
        }));
      } else if (goal.status === "completed") {
        goal.status = "active";
        delete goal.completedAt;
      }
      return { xpAwards: awards };
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
        const reaction = { id: newId("r"), goalId: goal.id, date: today, emoji, by: user };
        state.reactions.push(reaction);
        const award = awardPersonalXp(state, {
          recipientId: user,
          eventType: "CHEER_SENT",
          sourceType: "REACTION",
          sourceId: reaction.id,
          dateKey: today,
          amount: XP_REWARDS.CHEER_SENT,
          dedupeKey: `cheer:${user}:${goal.id}:${today}:${emoji}`,
          metadata: { goalTitle: goal.title },
        });
        return { xpAwards: [award] };
      }
      return {};
    }

    case "addMessage": {
      const text = str(body.text, 120);
      if (!text) return { error: "invalid message", status: 400 };
      const replyToId = str(body.replyToId, 40);
      const original = replyToId ? state.messages.find((message) => message.id === replyToId) : null;
      if (replyToId && (!original || original.from === user)) {
        return { error: "받은 한마디에만 답장할 수 있어요", status: 400 };
      }
      const message = { id: newId("m"), from: user, text, createdAt: new Date().toISOString() };
      if (original) message.replyToId = original.id;
      state.messages.push(message);
      state.messages = state.messages.slice(-50);
      if (!original) return {};
      const award = awardPersonalXp(state, {
        recipientId: user,
        eventType: "CHEER_REPLY",
        sourceType: "MESSAGE",
        sourceId: original.id,
        dateKey: today,
        amount: XP_REWARDS.CHEER_REPLY,
        dedupeKey: `reply:${user}:${original.id}`,
      });
      return { xpAwards: [award] };
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
      const poke = { id: newId("k"), from: user, date: today, at: new Date().toISOString() };
      state.pokes.push(poke);
      state.pokes = state.pokes.slice(-20);
      const award = awardPersonalXp(state, {
        recipientId: user,
        eventType: "POKE_SENT",
        sourceType: "POKE",
        sourceId: poke.id,
        dateKey: today,
        amount: XP_REWARDS.CHEER_SENT,
        dedupeKey: `poke:${user}:${poke.id}`,
      });
      return { xpAwards: [award] };
    }

    case "addExcuse": {
      // 최근 EXCUSE_BACKFILL_DAYS일 안에 못 찍은 매일 목표에 이유를 남긴다.
      // 도장은 여전히 오늘/어제만 — 성과는 소급 못 하지만 "왜 못 했는지"는 며칠 뒤에도 남길 수 있다.
      // 여행·출장으로 이틀 이상 비었을 때 기록이 통째로 사라지는 걸 막는다. (기록 탭 반성 노트에 쌓임)
      const goal = findGoal(state, str(body.goalId, 40));
      const text = str(body.text, 100);
      const date = cleanDate(body.date) || shiftDate(today, -1);
      if (!goal || !text) return { error: "invalid excuse", status: 400 };
      if (goal.owner !== user) return { error: "본인 목표에만 쓸 수 있어요", status: 403 };
      if (goal.type !== "daily") return { error: "매일 목표에만 이유를 남겨요", status: 400 };
      if (date >= today || date < shiftDate(today, -EXCUSE_BACKFILL_DAYS)) {
        return { error: `지난 ${EXCUSE_BACKFILL_DAYS}일 안의 지나간 날에만 이유를 남길 수 있어요`, status: 400 };
      }
      if (goal.createdAt && goal.createdAt > date) {
        return { error: "그날은 없던 목표예요", status: 400 };
      }
      if (state.checkins.some((c) => c.goalId === goal.id && c.date === date)) {
        return { error: "그날 도장을 이미 찍었어요", status: 400 };
      }
      const existing = state.excuses.find((x) => x.goalId === goal.id && x.date === date);
      if (existing) existing.text = text;
      else state.excuses.push({ id: newId("x"), goalId: goal.id, owner: user, date, text });
      if (existing) return {};
      const award = awardPersonalXp(state, {
        recipientId: user,
        eventType: "FAILURE_REASON_RECORDED",
        sourceType: "DAILY_GOAL",
        sourceId: goal.id,
        dateKey: date,
        amount: XP_REWARDS.FAILURE_REASON_RECORDED,
        dedupeKey: `failure-reason:${user}:${goal.id}:${date}`,
        metadata: { goalTitle: goal.title },
      });
      return { xpAwards: [award] };
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
  const awards = (result.xpAwards || []).filter((award) => award?.awarded || award?.capped);
  return {
    status: 200,
    respond: { ...sanitize(state), xpAwards: awards },
    state,
    write: true,
  };
}

// 아침 응원: 오늘 찍어야 할 매일 목표 수
export function countTodayGoals(state, user) {
  const today = seoulToday();
  return state.goals.filter((g) => g.owner === user && g.type === "daily" && dueOn(g, today)).length;
}

// 밤 9시 리마인더: 아직 오늘 몫을 안 채운 매일 목표 수
export function countMissedToday(state, user, today = seoulToday()) {
  const checked = new Set(state.checkins.map((c) => `${c.goalId}_${c.date}`));
  let missed = 0;
  for (const g of state.goals) {
    if (g.owner !== user) continue;
    if (g.type !== "daily") continue;
    if (!dueOn(g, today)) continue;
    if (checked.has(`${g.id}_${today}`)) continue;
    missed++;
  }
  return missed;
}

function dueOn(goal, date) {
  if (goal.status === "paused" || goal.status === "failed" || goal.status === "completed") return false;
  if (goal.showOnBoard === false) return false;
  if (goal.startDate && date < goal.startDate) return false;
  if (goal.deadline && date > goal.deadline && goal.kind === "routine") return false;
  if (goal.scheduledDate === date) return true;
  const repeat = goal.repeatType || "daily";
  if (repeat === "daily" || repeat === "weekly" || repeat === "monthly") return true;
  if (repeat === "weekdays") {
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    return (goal.repeatDays || []).map(Number).includes(dow);
  }
  if (repeat === "none") return goal.createdAt === date || goal.scheduledDate === date;
  if (repeat === "custom") return (goal.customDates || []).includes(date);
  return true;
}
