import { useEffect, useMemo, useRef, useState } from "react";
import Village from "./Village.jsx";
import { computeXP, levelOf, xpForLevel } from "./lib/xp.js";
import { todayStr, weekDates } from "./lib/dates.js";
import { pushSupported, subscribePush, currentSubscription } from "./lib/push.js";
import { bigBurst, fanfareSound, vibrate } from "./lib/fx.js";
import StampGoalCard from "./components/StampGoalCard.jsx";
import MilestoneGoalCard from "./components/MilestoneGoalCard.jsx";
import AddGoalForm from "./components/AddGoalForm.jsx";
import MessageBoard from "./components/MessageBoard.jsx";
import WeekSummary from "./components/WeekSummary.jsx";
import HistoryView from "./components/HistoryView.jsx";
import MissedPanel from "./components/MissedPanel.jsx";
import Toast from "./components/Toast.jsx";

const API = "/api/state";
const EMPTY_STATE = { users: [], goals: [], checkins: [], progress: [], reactions: [], messages: [], pokes: [], excuses: [], archive: {} };

function pickState(data) {
  return {
    users: data.users || [],
    goals: data.goals || [],
    checkins: data.checkins || [],
    progress: data.progress || [],
    reactions: data.reactions || [],
    messages: data.messages || [],
    pokes: data.pokes || [],
    excuses: data.excuses || [],
    archive: data.archive || {},
  };
}

export default function App() {
  const [me, setMe] = useState(() => localStorage.getItem("sg_username") || "");
  const [view, setView] = useState("board"); // 'board' | 'village' | 'history'
  const [nameInput, setNameInput] = useState("");
  const [gateError, setGateError] = useState("");
  const [state, setState] = useState(EMPTY_STATE);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dismissedReminder, setDismissedReminder] = useState(false);
  const [dismissedPokeId, setDismissedPokeId] = useState(null);
  const [pushKey, setPushKey] = useState(null);
  const [pushOn, setPushOn] = useState(false);
  const [toast, setToast] = useState(null);
  const [clock, setClock] = useState(Date.now()); // 리마인더가 9시 정각에 나타나게 하는 분 단위 틱
  const pollRef = useRef(null);
  const toastTimerRef = useRef(null);
  const busyRef = useRef(0); // 진행 중인 액션 수 — 폴링이 낙관적 갱신을 되돌리지 않게

  const showToast = (text) => {
    setToast({ text, id: Date.now() });
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  };

  const logout = () => {
    localStorage.removeItem("sg_username");
    setMe("");
    setState(EMPTY_STATE);
    setLoaded(false);
  };

  const load = async () => {
    try {
      const res = await fetch(API);
      const data = await res.json();
      if (busyRef.current === 0) setState(pickState(data));
      if (data.pushKey !== undefined) setPushKey(data.pushKey);
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
    let ok = false;
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, name: me }),
      });
      const data = await res.json();
      if (res.ok) {
        setState(pickState(data));
        ok = true;
      } else if (data.error === "auth") {
        showToast("접속 인증이 풀렸어요 — 다시 들어와줘.");
        logout();
      } else {
        console.error("action rejected", data);
        showToast(typeof data.error === "string" && /[가-힣]/.test(data.error)
          ? data.error
          : "저장에 실패했어요 — 다시 시도해줘.");
        refresh = true;
      }
    } catch (e) {
      console.error("save failed", e);
      showToast("저장에 실패했어요 — 연결 확인하고 다시 시도해줘.");
      refresh = true; // 낙관적 갱신을 서버 상태로 되돌림
    } finally {
      busyRef.current--;
    }
    if (refresh) load();
    return ok;
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
    load(); // pushKey 포함 최신 상태
    pollRef.current = setInterval(load, 12000);
    // 폰 화면을 다시 켜거나 탭으로 돌아오면 12초 기다리지 않고 바로 동기화
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    const tick = setInterval(() => setClock(Date.now()), 60000);
    return () => {
      clearInterval(pollRef.current);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  // 이미 알림을 켜뒀는지 확인
  useEffect(() => {
    if (!me || !pushSupported()) return;
    currentSubscription()
      .then((sub) => setPushOn(!!sub))
      .catch(() => {});
  }, [me]);

  const enablePush = async () => {
    try {
      const sub = await subscribePush(pushKey);
      if (!sub) {
        showToast("알림 권한이 거부됐어요 — 브라우저 설정에서 허용해줘.");
        return;
      }
      const ok = await mutate({ action: "subscribePush", subscription: sub });
      if (ok) {
        setPushOn(true);
        showToast("도장 리마인더와 응원 알림을 켰어요 🔔");
      }
    } catch (e) {
      console.error("push subscribe failed", e);
      showToast("알림 설정에 실패했어요.");
    }
  };

  const checkinSet = useMemo(
    () => new Set(state.checkins.map((c) => `${c.goalId}_${c.date}`)),
    [state.checkins]
  );

  const otherName = useMemo(
    () => state.users.find((u) => u !== me) || null,
    [state.users, me]
  );

  const visibleGoal = (g) => g.type !== "weekly" && g.status !== "failed";
  const myGoals = state.goals.filter((g) => g.owner === me && visibleGoal(g));
  const otherGoals = otherName ? state.goals.filter((g) => g.owner === otherName && visibleGoal(g)) : [];

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
    const weekStart = thisWeek[0];
    const elapsed = thisWeek.filter((d) => d <= todayStr(0));
    const today = todayStr(0);

    const statsFor = (user) => {
      const goals = state.goals.filter(
        (g) => g.owner === user && visibleGoal(g) && (!g.createdAt || g.createdAt <= today)
      );
      let completed = 0;
      let total = 0;
      for (const g of goals) {
        if (g.type === "milestone") {
          total++;
          if ((progressSum[g.id] || 0) >= g.target) completed++;
          continue;
        }
        if (g.type !== "daily") continue;
        const active = elapsed.filter((d) => d >= weekStart && (!g.createdAt || d >= g.createdAt));
        if (active.length === 0) continue;
        total++;
        if (active.some((d) => checkinSet.has(`${g.id}_${d}`))) completed++;
      }
      return { user, completed, total, rate: total > 0 ? completed / total : null };
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
  }, [state.goals, progressSum, checkinSet, me, otherName]);

  // ----- 리마인더 배너 (밤 9시 이후 안 찍은 도장) -----
  const reminder = useMemo(() => {
    if (new Date(clock).getHours() < 21) return null;
    const today = todayStr(0);
    const missed = myGoals.filter((g) => {
      if (g.type === "milestone" || checkinSet.has(`${g.id}_${today}`)) return false;
      return true;
    });
    if (missed.length === 0) return null;
    return `밤 9시가 넘었어요 — 아직 안 찍은 도장이 ${missed.length}개 있어요!`;
  }, [myGoals, checkinSet, clock]);

  // ----- 게임 HUD: XP / 레벨 / 오늘 진행률 -----
  const myXP = computeXP(me, state);
  const myLevel = levelOf(myXP);
  const xpBase = xpForLevel(myLevel);
  const xpNeed = xpForLevel(myLevel + 1) - xpBase;
  const xpPct = Math.round(((myXP - xpBase) / xpNeed) * 100);
  const todayStampGoals = myGoals.filter((g) => g.type !== "milestone");
  const todayDone = todayStampGoals.filter((g) => checkinSet.has(`${g.id}_${todayStr(0)}`)).length;
  const perfectToday = todayStampGoals.length > 0 && todayDone === todayStampGoals.length;

  // 레벨업 축하 — 첫 로딩 때의 레벨은 기준선으로만 쓰고 축하하지 않음
  const levelRef = useRef(null);
  useEffect(() => {
    if (!loaded) return;
    if (levelRef.current !== null && myLevel > levelRef.current) {
      bigBurst();
      fanfareSound();
      vibrate([30, 50, 30]);
      showToast(`레벨 업! Lv.${myLevel} 🎉`);
    }
    levelRef.current = myLevel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLevel, loaded]);

  const submitName = (e) => {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    join(trimmed);
  };

  const addGoal = (goal) => {
    mutate({ action: "addGoal", goal });
    setAdding(false);
  };

  const deleteGoal = (goal) => {
    const ok = window.confirm(
      `"${goal.title}" 목표를 지울까요? 쌓인 도장 기록도 같이 사라져요.`
    );
    if (!ok) return;
    mutate({ action: "deleteGoal", goalId: goal.id });
  };

  const toggleCheckin = (goalId, date) => {
    const exists = checkinSet.has(`${goalId}_${date}`);
    const nextCheckins = exists
      ? state.checkins.filter((c) => !(c.goalId === goalId && c.date === date))
      : [...state.checkins, { goalId, date }];
    // 이 도장으로 오늘 목표를 전부 채우면 올클리어 축하
    if (!exists && date === todayStr(0)) {
      const nextSet = new Set(nextCheckins.map((c) => `${c.goalId}_${c.date}`));
      const allClear =
        todayStampGoals.length > 0 &&
        todayStampGoals.every((g) => nextSet.has(`${g.id}_${date}`));
      if (allClear) {
        setTimeout(() => {
          bigBurst();
          fanfareSound();
          vibrate([20, 40, 20, 40, 60]);
          showToast("오늘 도장 올클리어! ✨");
        }, 300);
      }
    }
    mutate({ action: "toggleCheckin", goalId, date }, { ...state, checkins: nextCheckins });
  };

  const toggleReaction = (goalId, emoji) => {
    const date = todayStr(0);
    const match = (r) => r.goalId === goalId && r.date === date && r.emoji === emoji && r.by === me;
    const exists = state.reactions.some(match);
    const nextReactions = exists
      ? state.reactions.filter((r) => !match(r))
      : [...state.reactions, { goalId, date, emoji, by: me }];
    mutate({ action: "toggleReaction", goalId, emoji }, { ...state, reactions: nextReactions });
  };

  const addProgress = (goalId, amount) => {
    if (!amount) return;
    mutate({ action: "addProgress", goalId, amount });
  };

  const saveFailureReason = (goalId, text) => {
    mutate({ action: "addFailureReason", goalId, text });
  };

  const sendMessage = (text) => {
    mutate({ action: "addMessage", text });
  };

  const poke = async () => {
    vibrate(10);
    const ok = await mutate({ action: "poke" });
    if (ok) showToast(`👉 ${otherName}을(를) 콕 찔렀어요!`);
  };

  const saveExcuse = (goalId, text) => {
    mutate({ action: "addExcuse", goalId, text });
  };

  // ✕ 칸을 누르면 그날 못 찍은 이유를 토스트로
  const peekExcuse = (date, text) => {
    const [, m, d] = date.split("-");
    showToast(`${parseInt(m, 10)}/${parseInt(d, 10)} 못 찍은 이유 — ${text}`);
  };

  // 상대가 오늘 나를 콕 찔렀으면 배너로 (푸시를 못 받는 환경 대비)
  const incomingPoke = useMemo(() => {
    if (!otherName) return null;
    const today = todayStr(0);
    const fromFriend = state.pokes.filter((p) => p.from === otherName && p.date === today);
    return fromFriend.length > 0 ? fromFriend[fromFriend.length - 1] : null;
  }, [state.pokes, otherName]);

  // 어제 못 찍은 매일 목표 — 이유를 남기거나 소급 도장을 찍어야 사라짐
  const missedYesterday = useMemo(() => {
    const yesterday = todayStr(-1);
    return myGoals.filter(
      (g) =>
        g.type === "daily" &&
        (!g.createdAt || g.createdAt <= yesterday) &&
        !checkinSet.has(`${g.id}_${yesterday}`) &&
        !state.excuses.some((x) => x.goalId === g.id && x.date === yesterday)
    );
  }, [myGoals, checkinSet, state.excuses]);

  const deleteMessage = (id) => {
    mutate(
      { action: "deleteMessage", id },
      { ...state, messages: state.messages.filter((m) => m.id !== id) }
    );
  };

  if (!me) {
    return (
      <div className="gate">
        <div className="gate-shell">
          <section className="gate-panel" aria-label="도장판 소개">
            <div className="gate-brand">
              <span className="stamp-mark">印</span>
              <div>
                <p className="gate-kicker">둘이 쓰는 습관 도장판</p>
                <h1>도장판</h1>
              </div>
            </div>
            <div className="gate-preview">
              <div className="preview-head">
                <span>오늘 기록</span>
                <strong>4 / 5</strong>
              </div>
              <div className="preview-stamps" aria-hidden="true">
                {["월", "화", "수", "목", "금", "토", "일"].map((d, i) => (
                  <span key={d} className={i < 4 ? "filled" : i === 4 ? "today" : ""}>
                    {d}
                  </span>
                ))}
              </div>
              <div className="preview-row">
                <span>친구 응원</span>
                <b>👏 🔥 +2</b>
              </div>
              <div className="preview-row">
                <span>마을 성장</span>
                <b>Lv.3 · 새싹 18</b>
              </div>
            </div>
          </section>
          <form className="gate-card" onSubmit={submitName}>
            <h2>입장하기</h2>
            <p>
              이름만 정하면 바로 시작해요.
              <br />
              같은 링크를 친구에게 보내면 둘이 같은 도장판을 씁니다.
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
            <div className="gate-hint">먼저 들어온 두 이름만 이 도장판에 남아요.</div>
          </form>
        </div>
      </div>
    );
  }

  const otherLevel = otherName ? levelOf(computeXP(otherName, state)) : null;

  const renderGoalCard = (goal, isMine) =>
    goal.type === "milestone" ? (
      <MilestoneGoalCard
        key={goal.id}
        goal={goal}
        isMine={isMine}
        current={progressSum[goal.id] || 0}
        reactions={state.reactions}
        me={me}
        onAddProgress={addProgress}
        onSaveFailureReason={saveFailureReason}
        onToggleReaction={toggleReaction}
        onDelete={deleteGoal}
      />
    ) : (
      <StampGoalCard
        key={goal.id}
        goal={goal}
        isMine={isMine}
        checkinSet={checkinSet}
        reactions={state.reactions}
        excuses={state.excuses}
        me={me}
        onToggleCheckin={toggleCheckin}
        onToggleReaction={toggleReaction}
        onDelete={deleteGoal}
        onPeekExcuse={peekExcuse}
      />
    );

  return (
    <div className="shell">
      <div className="masthead">
        <h1>
          <span className="stamp-dot" />
          도장판
        </h1>
        <div className="who">
          {me}로 접속 중
          <button onClick={logout} type="button">
            다른 이름으로
          </button>
        </div>
      </div>
      <div className="dateline">
        {new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
        {" · "}
        <span className="range-full">최근 14일 기록</span>
        <span className="range-short">최근 7일 기록</span>
        {pushKey && pushSupported() && !pushOn && (
          <button type="button" className="notify-btn" onClick={enablePush}>
            🔔 알림 켜기
          </button>
        )}
      </div>

      <div className="view-tabs">
        <button type="button" className={view === "board" ? "active" : ""} onClick={() => setView("board")}>
          📋 도장판
        </button>
        <button type="button" className={view === "village" ? "active" : ""} onClick={() => setView("village")}>
          🏡 마을 <span className="tab-level">Lv.{myLevel}</span>
        </button>
        <button type="button" className={view === "history" ? "active" : ""} onClick={() => setView("history")}>
          📅 기록
        </button>
      </div>

      {view === "village" && <Village state={state} me={me} otherName={otherName} />}

      {view === "history" && (
        <HistoryView
          goals={state.goals}
          checkins={state.checkins}
          progress={state.progress}
          excuses={state.excuses}
          me={me}
          otherName={otherName}
        />
      )}

      {view === "board" && (
        <>
          <section className="board-head">
            <div className="board-head-top">
              <div>
                <p className="eyebrow">오늘의 도장판</p>
                <h2>
                  {perfectToday
                    ? "오늘 몫은 다 찍었어요"
                    : todayStampGoals.length > 0
                      ? `오늘 ${todayStampGoals.length - todayDone}개 남았어요`
                      : "첫 목표를 만들어볼까요"}
                </h2>
              </div>
              <div className={`today-seal ${perfectToday ? "done" : ""}`} aria-label="오늘 진행">
                <strong>
                  {todayDone}
                  <span>/{todayStampGoals.length}</span>
                </strong>
                <span className="today-seal-label">{perfectToday ? "완" : "오늘"}</span>
              </div>
            </div>
            <button type="button" className="xp-line" onClick={() => setView("village")} title="마을 보러가기">
              <span className="hud-lv">Lv.{myLevel}</span>
              <div className="hud-board-xp">
                <div className="hud-board-fill" style={{ width: `${xpPct}%` }} />
              </div>
              <span className="xp-line-meta">다음 레벨까지 {xpNeed - (myXP - xpBase)} XP · 마을 →</span>
            </button>
          </section>

          {incomingPoke && incomingPoke.id !== dismissedPokeId && (
            <div className="reminder-banner poke-banner">
              <span>👉 {otherName}이(가) 콕 찔렀어요! 오늘 도장 찍으라는 뜻인 듯.</span>
              <button type="button" onClick={() => setDismissedPokeId(incomingPoke.id)} aria-label="닫기">
                ✕
              </button>
            </div>
          )}

          {missedYesterday.length > 0 && (
            <MissedPanel
              goals={missedYesterday}
              onStamp={(goalId) => toggleCheckin(goalId, todayStr(-1))}
              onSaveReason={saveExcuse}
            />
          )}

          {reminder && !dismissedReminder && (
            <div className="reminder-banner">
              <span>⏰ {reminder}</span>
              <button type="button" onClick={() => setDismissedReminder(true)} aria-label="닫기">
                ✕
              </button>
            </div>
          )}

          {otherName && <WeekSummary summary={weeklySummary} />}

          <div className="columns">
            <section className="goal-column">
              <div className="column-head">
                <h3>내 목표</h3>
                <span className="tag">
                  {me} · Lv.{myLevel}
                </span>
              </div>
              <div className="goal-list">
                {loaded && myGoals.length === 0 && !adding && (
                  <div className="empty-note">
                    아직 목표 없음.
                    <br />
                    아래에서 첫 목표 추가해봐.
                  </div>
                )}
                {myGoals.map((g) => renderGoalCard(g, true))}
                {adding ? (
                  <AddGoalForm onAdd={addGoal} onCancel={() => setAdding(false)} />
                ) : (
                  <button className="add-goal-trigger" onClick={() => setAdding(true)} type="button">
                    + 목표 추가
                  </button>
                )}
              </div>
            </section>

            <section className="goal-column friend-column">
              <div className="column-head">
                <h3>{otherName || "친구"} 목표</h3>
                <div className="column-head-right">
                  {otherName && (
                    <button type="button" className="poke-btn" onClick={poke} title="찌르면 친구 폰에 알림이 가요">
                      👉 콕
                    </button>
                  )}
                  <span className="tag">{otherName ? `${otherName} · Lv.${otherLevel}` : "대기 중"}</span>
                </div>
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
            </section>
          </div>

          <MessageBoard
            messages={state.messages}
            me={me}
            otherName={otherName}
            onSend={sendMessage}
            onDelete={deleteMessage}
          />

          <div className="footer-note">
            오늘·어제 칸 체크 가능 · 못 찍은 날엔 이유 남기기 · 친구 도장엔 리액션·응원·콕 찌르기
          </div>
        </>
      )}

      <Toast toast={toast} />
    </div>
  );
}
