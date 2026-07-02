import { useEffect, useMemo, useRef, useState } from "react";
import Village, { computeXP, levelOf } from "./Village.jsx";

const API = "/api/state";
const ICONS = ["🏃", "💧", "📖", "🧘", "🛌", "💪", "🥗", "✍️", "🎯", "🌱"];
const REACTIONS = [
  { emoji: "🔥", label: "응원" },
  { emoji: "👏", label: "대박" },
  { emoji: "💪", label: "파이팅" },
];
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const EMPTY_STATE = { users: [], goals: [], checkins: [], progress: [], reactions: [], messages: [] };
const GOAL_TYPE_LABEL = { daily: "매일", weekly: "주 N회", milestone: "기간 목표" };

// 로컬 시간대 기준 날짜 (toISOString은 UTC라 새벽에 전날로 찍히는 버그가 있었음)
function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return fmtDate(d);
}

function last14() {
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(todayStr(-i));
  return days;
}

function lastNSet(n) {
  const s = new Set();
  for (let i = 0; i < n; i++) s.add(todayStr(-i));
  return s;
}

function dowOf(dateStr) {
  return DOW[new Date(dateStr + "T00:00:00").getDay()];
}

// 월요일 시작 주
function weekDates(offsetWeeks = 0) {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow + offsetWeeks * 7);
  const days = [];
  for (let i = 0; i < 7; i++) {
    days.push(fmtDate(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function computeStreak(goalId, checkinSet) {
  let streak = 0;
  let cursor = 0;
  if (!checkinSet.has(`${goalId}_${todayStr(0)}`)) cursor = -1;
  while (checkinSet.has(`${goalId}_${todayStr(cursor)}`)) {
    streak++;
    cursor--;
  }
  return streak;
}

// 주 N회 목표: 목표 회수를 채운 연속 주 수 (이번 주는 채웠을 때만 포함)
function computeWeeklyStreak(goal, checkinSet) {
  let streak = 0;
  let offset = 0;
  const countWeek = (off) =>
    weekDates(off).filter((d) => checkinSet.has(`${goal.id}_${d}`)).length;
  if (countWeek(0) >= goal.targetPerWeek) {
    streak++;
    offset = -1;
  } else {
    offset = -1;
  }
  while (countWeek(offset) >= goal.targetPerWeek) {
    streak++;
    offset--;
  }
  return streak;
}

function ddayLabel(deadline) {
  if (!deadline) return null;
  const today = new Date(todayStr(0) + "T00:00:00");
  const end = new Date(deadline + "T00:00:00");
  const diff = Math.round((end - today) / 86400000);
  if (diff > 0) return `D-${diff}`;
  if (diff === 0) return "D-DAY";
  return `마감 +${-diff}일`;
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

// 한글 조합(IME) 확정용 Enter에는 반응하지 않게 — 조합 중 Enter로 중복 추가/전송되는 것 방지
function onEnter(e, fn) {
  if (e.key === "Enter" && !e.nativeEvent.isComposing) fn();
}

function pickState(data) {
  return {
    users: data.users || [],
    goals: data.goals || [],
    checkins: data.checkins || [],
    progress: data.progress || [],
    reactions: data.reactions || [],
    messages: data.messages || [],
  };
}

export default function App() {
  const [me, setMe] = useState(() => localStorage.getItem("sg_username") || "");
  const [view, setView] = useState("board"); // 'board' | 'village'
  const [nameInput, setNameInput] = useState("");
  const [gateError, setGateError] = useState("");
  const [state, setState] = useState(EMPTY_STATE);
  const [loaded, setLoaded] = useState(false);
  const [addingFor, setAddingFor] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [newIcon, setNewIcon] = useState(ICONS[0]);
  const [newType, setNewType] = useState("daily");
  const [newTargetPerWeek, setNewTargetPerWeek] = useState(3);
  const [newTarget, setNewTarget] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [stampingKey, setStampingKey] = useState(null);
  const [msgInput, setMsgInput] = useState("");
  const [amountInputs, setAmountInputs] = useState({}); // goalId -> 기록할 수량
  const [dismissedReminder, setDismissedReminder] = useState(false);
  const pollRef = useRef(null);
  const stampTimerRef = useRef(null);
  const busyRef = useRef(0); // 진행 중인 액션 수 — 폴링이 낙관적 갱신을 되돌리지 않게

  const load = async () => {
    try {
      const res = await fetch(API);
      const data = await res.json();
      if (busyRef.current === 0) setState(pickState(data));
    } catch (e) {
      console.error("load failed", e);
    } finally {
      setLoaded(true);
    }
  };

  // 서버에 액션 하나만 보내고, 돌아온 최신 상태로 갱신 (전체 덮어쓰기 X)
  const mutate = async (payload, optimistic) => {
    if (optimistic) setState(optimistic);
    busyRef.current++;
    let refresh = false;
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setState(pickState(data));
      } else {
        console.error("action rejected", data);
        refresh = true;
      }
    } catch (e) {
      console.error("save failed", e);
      refresh = true; // 낙관적 갱신을 서버 상태로 되돌림
    } finally {
      busyRef.current--;
    }
    if (refresh) load();
  };

  const join = async (name) => {
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "join", name }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "full") {
          setGateError(
            `이 도장판은 이미 두 명(${(data.users || []).join(", ")})이 쓰고 있어요. 둘 중 하나의 이름으로 들어와야 해요.`
          );
        } else {
          setGateError(data.error || "접속에 실패했어요. 다시 시도해줘.");
        }
        localStorage.removeItem("sg_username");
        setMe("");
        return;
      }
      localStorage.setItem("sg_username", name);
      setGateError("");
      setMe(name);
      setState(pickState(data));
      setLoaded(true);
    } catch (e) {
      console.error("join failed", e);
      setGateError("서버에 연결할 수 없어요. 잠시 후 다시 시도해줘.");
    }
  };

  useEffect(() => {
    if (!me) return;
    join(me); // 재접속 시에도 서버 명단과 동기화 (이미 있으면 그대로 통과)
    pollRef.current = setInterval(load, 12000);
    // 폰 화면을 다시 켜거나 탭으로 돌아오면 12초 기다리지 않고 바로 동기화
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(pollRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  useEffect(() => () => clearTimeout(stampTimerRef.current), []);

  const checkinSet = useMemo(
    () => new Set(state.checkins.map((c) => `${c.goalId}_${c.date}`)),
    [state.checkins]
  );

  const otherName = useMemo(
    () => state.users.find((u) => u !== me) || null,
    [state.users, me]
  );

  const myGoals = state.goals.filter((g) => g.owner === me);
  const otherGoals = otherName ? state.goals.filter((g) => g.owner === otherName) : [];

  const progressSum = useMemo(() => {
    const map = {};
    for (const p of state.progress) {
      map[p.goalId] = (map[p.goalId] || 0) + p.amount;
    }
    for (const k of Object.keys(map)) map[k] = Math.max(0, map[k]);
    return map;
  }, [state.progress]);

  // ----- 주간 요약 -----
  const weeklySummary = useMemo(() => {
    const thisWeek = weekDates(0);
    const elapsed = thisWeek.filter((d) => d <= todayStr(0));
    const weekSet = new Set(thisWeek);

    const statsFor = (user) => {
      const goals = state.goals.filter((g) => g.owner === user);
      let done = 0;
      let possible = 0;
      let stamps = 0;
      for (const g of goals) {
        if (g.type === "milestone") {
          stamps += state.progress.filter((p) => p.goalId === g.id && weekSet.has(p.date) && p.amount > 0).length;
          continue;
        }
        const weekChecks = thisWeek.filter((d) => checkinSet.has(`${g.id}_${d}`)).length;
        stamps += weekChecks;
        if (g.type === "weekly") {
          possible += g.targetPerWeek;
          done += Math.min(g.targetPerWeek, weekChecks);
        } else {
          // 주중에 새로 만든 목표는 만들기 전 요일을 미달성으로 치지 않음
          const active = elapsed.filter((d) => !g.createdAt || d >= g.createdAt);
          possible += active.length;
          done += active.filter((d) => checkinSet.has(`${g.id}_${d}`)).length;
        }
      }
      return { user, stamps, done, possible, rate: possible > 0 ? done / possible : null };
    };

    const mine = statsFor(me);
    const theirs = otherName ? statsFor(otherName) : null;
    let verdict = null;
    if (theirs && mine.rate !== null && theirs.rate !== null) {
      if (mine.rate > theirs.rate) verdict = `이번 주는 ${me}이(가) 앞서는 중 🔥`;
      else if (mine.rate < theirs.rate) verdict = `이번 주는 ${otherName}이(가) 앞서는 중 🔥`;
      else verdict = "막상막하! 🤜🤛";
    }
    return { mine, theirs, verdict };
  }, [state.goals, state.progress, checkinSet, me, otherName]);

  // ----- 리마인더 배너 (밤 9시 이후 안 찍은 도장) -----
  const reminder = useMemo(() => {
    if (new Date().getHours() < 21) return null;
    const today = todayStr(0);
    const missed = myGoals.filter(
      (g) => g.type !== "milestone" && !checkinSet.has(`${g.id}_${today}`)
    );
    if (missed.length === 0) return null;
    return `밤 9시가 넘었어요 — 아직 안 찍은 도장이 ${missed.length}개 있어요!`;
  }, [myGoals, checkinSet]);

  const submitName = (e) => {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    join(trimmed);
  };

  const resetAddForm = () => {
    setNewTitle("");
    setNewIcon(ICONS[0]);
    setNewType("daily");
    setNewTargetPerWeek(3);
    setNewTarget("");
    setNewUnit("");
    setNewDeadline("");
    setAddingFor(null);
  };

  const addGoal = (owner) => {
    if (!newTitle.trim()) return;
    if (newType === "milestone" && (!newTarget || parseInt(newTarget, 10) < 1)) return;
    const goal = {
      owner,
      title: newTitle.trim(),
      icon: newIcon,
      type: newType,
      createdAt: todayStr(0),
    };
    if (newType === "weekly") goal.targetPerWeek = newTargetPerWeek;
    if (newType === "milestone") {
      goal.target = parseInt(newTarget, 10);
      goal.unit = newUnit.trim() || "개";
      goal.deadline = newDeadline;
    }
    mutate({ action: "addGoal", goal });
    resetAddForm();
  };

  const deleteGoal = (goal) => {
    const ok = window.confirm(
      `"${goal.title}" 목표를 지울까요? 쌓인 도장 기록도 같이 사라져요.`
    );
    if (!ok) return;
    mutate({ action: "deleteGoal", goalId: goal.id });
  };

  const toggleCheckin = (goalId, date) => {
    const key = `${goalId}_${date}`;
    const exists = checkinSet.has(key);
    let nextCheckins;
    if (exists) {
      nextCheckins = state.checkins.filter((c) => !(c.goalId === goalId && c.date === date));
    } else {
      nextCheckins = [...state.checkins, { goalId, date }];
      setStampingKey(key);
      clearTimeout(stampTimerRef.current);
      stampTimerRef.current = setTimeout(() => setStampingKey(null), 400);
    }
    mutate({ action: "toggleCheckin", goalId, date }, { ...state, checkins: nextCheckins });
  };

  const toggleReaction = (goalId, date, emoji) => {
    const match = (r) => r.goalId === goalId && r.date === date && r.emoji === emoji && r.by === me;
    const exists = state.reactions.some(match);
    const nextReactions = exists
      ? state.reactions.filter((r) => !match(r))
      : [...state.reactions, { goalId, date, emoji, by: me }];
    mutate(
      { action: "toggleReaction", goalId, date, emoji, by: me },
      { ...state, reactions: nextReactions }
    );
  };

  const addProgress = (goalId, amount) => {
    if (!amount) return;
    mutate({ action: "addProgress", goalId, date: todayStr(0), amount });
  };

  const sendMessage = () => {
    const text = msgInput.trim();
    if (!text) return;
    mutate({ action: "addMessage", from: me, text });
    setMsgInput("");
  };

  const deleteMessage = (id) => {
    mutate(
      { action: "deleteMessage", id, by: me },
      { ...state, messages: state.messages.filter((m) => m.id !== id) }
    );
  };

  if (!me) {
    return (
      <div className="gate">
        <form className="gate-card" onSubmit={submitName}>
          <div className="stamp-mark">印</div>
          <h2>도장판</h2>
          <p>
            둘이서 매일 습관 찍고, 서로 도장 확인하는 곳.
            <br />
            먼저 네 이름 알려줘.
          </p>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="이름 (예: 햄)"
            autoFocus
          />
          {gateError && <div className="gate-error">{gateError}</div>}
          <button type="submit" className="btn-primary">
            시작하기
          </button>
          <div className="gate-hint">같은 링크를 친구한테 보내고, 친구는 친구 이름으로 시작하면 됨</div>
        </form>
      </div>
    );
  }

  const days = last14();
  const last7 = lastNSet(7);
  const thisWeekDates = weekDates(0);
  const myLevel = levelOf(computeXP(me, state));
  const otherLevel = otherName ? levelOf(computeXP(otherName, state)) : null;

  const renderReactions = (goal, isMine) => (
    <div className="reactions">
      {REACTIONS.map((r) => {
        // 최근 7일 응원을 모아서 보여줌 (어제 받은 🔥도 안 사라짐)
        const recent = state.reactions.filter(
          (x) => x.goalId === goal.id && x.emoji === r.emoji && last7.has(x.date)
        );
        const activeByMe = recent.some((x) => x.date === todayStr(0) && x.by === me);
        if (isMine && recent.length === 0) return null;
        return (
          <button
            key={r.emoji}
            type="button"
            className={`reaction-chip ${activeByMe ? "active" : ""}`}
            onClick={() => !isMine && toggleReaction(goal.id, todayStr(0), r.emoji)}
            disabled={isMine}
            title={isMine ? "최근 7일간 받은 응원" : `${r.label} (최근 7일 합계)`}
          >
            {r.emoji} {recent.length > 0 && <span className="count">{recent.length}</span>}
          </button>
        );
      })}
    </div>
  );

  const renderStampGoal = (goal, isMine) => {
    const isWeekly = goal.type === "weekly";
    const weekDone = thisWeekDates.filter((d) => checkinSet.has(`${goal.id}_${d}`)).length;
    const badge = isWeekly
      ? (() => {
          const streak = computeWeeklyStreak(goal, checkinSet);
          const base = `이번 주 ${Math.min(weekDone, goal.targetPerWeek)}/${goal.targetPerWeek}`;
          return streak > 0 ? `${base} · ${streak}주 연속` : base;
        })()
      : (() => {
          const streak = computeStreak(goal.id, checkinSet);
          return streak > 0 ? `연속 ${streak}일` : "오늘부터";
        })();

    return (
      <div className="goal-card" key={goal.id}>
        <div className="goal-top">
          <div className="goal-title">
            <span className="icon">{goal.icon}</span>
            {goal.title}
            {isWeekly && <span className="type-tag">주 {goal.targetPerWeek}회</span>}
          </div>
          <div className={`streak-badge ${badge.startsWith("오늘부터") ? "zero" : ""}`}>{badge}</div>
        </div>
        <div className="stamp-row">
          {days.map((d) => {
            const key = `${goal.id}_${d}`;
            const isToday = d === todayStr(0);
            const isYesterday = d === todayStr(-1);
            const filled = checkinSet.has(key);
            // 어제 깜빡한 도장은 소급해서 찍을 수 있게
            const clickable = isMine && (isToday || isYesterday);
            return (
              <div className="stamp-cell" key={d}>
                <span className="dow">{dowOf(d)}</span>
                <button
                  type="button"
                  className={[
                    "stamp-circle",
                    filled ? "filled" : "",
                    isToday ? "today" : "",
                    clickable ? "clickable" : "",
                    stampingKey === key ? "stamping" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={!clickable}
                  onClick={() => clickable && toggleCheckin(goal.id, d)}
                  aria-label={`${d} ${filled ? "완료" : "미완료"}`}
                  title={isYesterday && isMine ? "어제 것도 소급해서 찍을 수 있어요" : undefined}
                />
              </div>
            );
          })}
        </div>
        <div className="goal-foot">
          {renderReactions(goal, isMine)}
          {isMine && (
            <button className="delete-goal" onClick={() => deleteGoal(goal)} type="button">
              삭제
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderMilestoneGoal = (goal, isMine) => {
    const current = progressSum[goal.id] || 0;
    const pct = Math.min(100, Math.round((current / goal.target) * 100));
    const done = current >= goal.target;
    const dday = ddayLabel(goal.deadline);
    const amount = amountInputs[goal.id] ?? 1;
    const setAmount = (v) =>
      setAmountInputs((prev) => ({ ...prev, [goal.id]: Math.max(1, Math.min(999, v || 1)) }));

    return (
      <div className={`goal-card ${done ? "milestone-done" : ""}`} key={goal.id}>
        <div className="goal-top">
          <div className="goal-title">
            <span className="icon">{goal.icon}</span>
            {goal.title}
            <span className="type-tag">기간 목표</span>
          </div>
          <div className={`streak-badge ${done ? "done" : ""}`}>
            {done ? "달성! 🎉" : dday || "기한 없음"}
          </div>
        </div>
        <div className="milestone-bar">
          <div className="milestone-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="milestone-meta">
          <span className="milestone-count">
            {current} / {goal.target} {goal.unit}
          </span>
          <span className="milestone-pct">{pct}%</span>
        </div>
        <div className="goal-foot">
          {renderReactions(goal, isMine)}
          <div className="foot-right">
            {isMine && !done && (
              <div className="progress-controls">
                <button type="button" className="amt-btn" onClick={() => addProgress(goal.id, -amount)} title="기록 되돌리기">
                  −
                </button>
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={amount}
                  onChange={(e) => setAmount(parseInt(e.target.value, 10))}
                  aria-label="기록할 수량"
                />
                <button type="button" className="amt-btn plus" onClick={() => addProgress(goal.id, amount)} title="진행 기록하기">
                  +
                </button>
              </div>
            )}
            {isMine && (
              <button className="delete-goal" onClick={() => deleteGoal(goal)} type="button">
                삭제
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderGoalCard = (goal, isMine) =>
    goal.type === "milestone" ? renderMilestoneGoal(goal, isMine) : renderStampGoal(goal, isMine);

  const addForm = (owner) => (
    <div className="add-goal">
      <div className="type-selector">
        {Object.entries(GOAL_TYPE_LABEL).map(([type, label]) => (
          <button
            key={type}
            type="button"
            className={newType === type ? "selected" : ""}
            onClick={() => setNewType(type)}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        autoFocus
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
        placeholder={
          newType === "milestone"
            ? "목표 이름 (예: 회사 지원서 제출)"
            : "목표 이름 (예: 아침 러닝 30분)"
        }
        onKeyDown={(e) => onEnter(e, () => addGoal(owner))}
      />
      {newType === "weekly" && (
        <div className="field-row">
          <label>일주일에</label>
          <select
            value={newTargetPerWeek}
            onChange={(e) => setNewTargetPerWeek(parseInt(e.target.value, 10))}
          >
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n}회
              </option>
            ))}
          </select>
        </div>
      )}
      {newType === "milestone" && (
        <>
          <div className="field-row">
            <label>목표량</label>
            <input
              type="number"
              min="1"
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              placeholder="5"
            />
            <input
              className="unit-input"
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              placeholder="단위 (개, 페이지…)"
              maxLength={10}
            />
          </div>
          <div className="field-row">
            <label>마감일</label>
            <input
              type="date"
              value={newDeadline}
              min={todayStr(0)}
              onChange={(e) => setNewDeadline(e.target.value)}
            />
          </div>
        </>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <div className="icon-picker" style={{ marginBottom: 0 }}>
          {ICONS.map((ic) => (
            <button
              key={ic}
              type="button"
              className={newIcon === ic ? "selected" : ""}
              onClick={() => setNewIcon(ic)}
            >
              {ic}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn-primary" style={{ flex: 1 }} onClick={() => addGoal(owner)} type="button">
          추가
        </button>
        <button className="btn-ghost" type="button" onClick={resetAddForm}>
          취소
        </button>
      </div>
    </div>
  );

  const recentMessages = [...state.messages].slice(-5).reverse();

  return (
    <div className="shell">
      <div className="masthead">
        <h1>
          <span className="stamp-dot" />
          도장판
        </h1>
        <div className="who">
          {me}로 접속 중
          <button
            onClick={() => {
              localStorage.removeItem("sg_username");
              setMe("");
              setState(EMPTY_STATE);
              setLoaded(false);
            }}
          >
            다른 이름으로
          </button>
        </div>
      </div>
      <div className="dateline">
        {new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
        {" · "}
        <span className="range-full">최근 14일 기록</span>
        <span className="range-short">최근 7일 기록</span>
      </div>

      <div className="view-tabs">
        <button
          type="button"
          className={view === "board" ? "active" : ""}
          onClick={() => setView("board")}
        >
          📋 도장판
        </button>
        <button
          type="button"
          className={view === "village" ? "active" : ""}
          onClick={() => setView("village")}
        >
          🏡 마을 <span className="tab-level">Lv.{myLevel}</span>
        </button>
      </div>

      {view === "village" && <Village state={state} me={me} otherName={otherName} />}

      {view === "board" && (
      <>
      {reminder && !dismissedReminder && (
        <div className="reminder-banner">
          <span>⏰ {reminder}</span>
          <button type="button" onClick={() => setDismissedReminder(true)} aria-label="닫기">
            ✕
          </button>
        </div>
      )}

      {otherName && weeklySummary.theirs && (
        <div className="week-summary">
          <div className="week-summary-head">
            <span className="ws-title">이번 주 요약</span>
            {weeklySummary.verdict && <span className="ws-verdict">{weeklySummary.verdict}</span>}
          </div>
          <div className="ws-rows">
            {[weeklySummary.mine, weeklySummary.theirs].map((s) => (
              <div className="ws-row" key={s.user}>
                <span className="ws-name">{s.user}</span>
                <div className="ws-bar">
                  <div
                    className="ws-bar-fill"
                    style={{ width: `${s.rate !== null ? Math.round(s.rate * 100) : 0}%` }}
                  />
                </div>
                <span className="ws-stat">
                  {s.rate !== null ? `${Math.round(s.rate * 100)}%` : "—"} · 도장 {s.stamps}개
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="columns">
        <div>
          <div className="column-head">
            <h3>내 목표</h3>
            <span className="tag">
              {me} · Lv.{myLevel}
            </span>
          </div>
          <div className="goal-list">
            {loaded && myGoals.length === 0 && addingFor !== "me" && (
              <div className="empty-note">
                아직 목표 없음.
                <br />
                아래에서 첫 목표 추가해봐.
              </div>
            )}
            {myGoals.map((g) => renderGoalCard(g, true))}
            {addingFor === "me" ? (
              addForm(me)
            ) : (
              <button className="add-goal-trigger" onClick={() => setAddingFor("me")} type="button">
                + 목표 추가
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="column-head">
            <h3>{otherName || "친구"} 목표</h3>
            <span className="tag">{otherName ? `${otherName} · Lv.${otherLevel}` : "대기 중"}</span>
          </div>
          <div className="goal-list">
            {loaded && otherGoals.length === 0 && (
              <div className="empty-note">
                {otherName
                  ? "아직 목표 없음."
                  : "친구가 아직 접속 안 함. 링크 보내고 이름 입력하면 여기 나타남."}
              </div>
            )}
            {otherGoals.map((g) => renderGoalCard(g, false))}
          </div>
        </div>
      </div>

      <div className="message-board">
        <div className="column-head">
          <h3>응원 한마디</h3>
        </div>
        <div className="message-input">
          <input
            value={msgInput}
            onChange={(e) => setMsgInput(e.target.value)}
            placeholder={otherName ? `${otherName}에게 한마디…` : "친구가 오면 보일 한마디…"}
            maxLength={120}
            onKeyDown={(e) => onEnter(e, sendMessage)}
          />
          <button className="btn-primary" type="button" onClick={sendMessage}>
            보내기
          </button>
        </div>
        {recentMessages.length > 0 && (
          <ul className="message-list">
            {recentMessages.map((m) => (
              <li key={m.id} className={m.from === me ? "mine" : ""}>
                <span className="msg-from">{m.from}</span>
                <span className="msg-text">{m.text}</span>
                <span className="msg-time">{timeAgo(m.createdAt)}</span>
                {m.from === me && (
                  <button
                    type="button"
                    className="msg-delete"
                    onClick={() => deleteMessage(m.id)}
                    aria-label="메시지 삭제"
                    title="삭제"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="footer-note">
        오늘·어제 칸 체크 가능 · 기간 목표는 수량으로 기록 · 친구 도장엔 리액션과 응원만
      </div>
      </>
      )}
    </div>
  );
}
