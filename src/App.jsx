import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
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
import GoalMemoPanel from "./components/GoalMemoPanel.jsx";
import MissedPanel from "./components/MissedPanel.jsx";
import VillageHero from "./components/VillageHero.jsx";
import VillageBackdrop from "./components/VillageBackdrop.jsx";
import Toast from "./components/Toast.jsx";
import BigGoalPanel from "./components/BigGoalPanel.jsx";
import SeasonBoard from "./components/SeasonBoard.jsx";
import ReflectionHub from "./components/ReflectionHub.jsx";
import AIAdvisor from "./components/AIAdvisor.jsx";
import WeekView from "./components/WeekView.jsx";
import CalendarView from "./components/CalendarView.jsx";
import ProjectGoalCard from "./components/ProjectGoalCard.jsx";
import PhotoDuo from "./components/PhotoDuo.jsx";
import { goalKind, isGoalDueOn } from "./lib/goals.js";
import { reducedMotion } from "./lib/fx.js";
import { XP_EVENT_LABELS } from "../shared/xp-config.js";

// 서버(api/_logic.js)의 EXCUSE_BACKFILL_DAYS와 같은 값이어야 한다.
const EXCUSE_BACKFILL_DAYS = 7;

const API = "/api/state";
const EMPTY_STATE = {
  users: [], goals: [], checkins: [], progress: [], reactions: [], messages: [],
  pokes: [], excuses: [], goalMemos: [], bigGoals: [], lifeProfiles: [],
  lifeDomains: [], seasons: [], lifeItems: [], weeklyReviews: [],
  monthlyReviews: [], decisions: [], completedGoals: [], xpEvents: [], xpVersion: 0, archive: {},
  kpis: [], calendarEvents: [],
};

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
    goalMemos: data.goalMemos || [],
    bigGoals: data.bigGoals || [],
    lifeProfiles: data.lifeProfiles || [],
    lifeDomains: data.lifeDomains || [],
    seasons: data.seasons || [],
    lifeItems: data.lifeItems || [],
    weeklyReviews: data.weeklyReviews || [],
    monthlyReviews: data.monthlyReviews || [],
    decisions: data.decisions || [],
    completedGoals: data.completedGoals || [],
    calendarEvents: data.calendarEvents || [],
    kpis: data.kpis || [],
    xpEvents: data.xpEvents || [],
    xpVersion: data.xpVersion || 0,
    archive: data.archive || {},
  };
}

export default function App() {
  const [me, setMe] = useState(() => localStorage.getItem("sg_username") || "");
  const [view, setView] = useState("board"); // board | week | calendar | design | history | village
  const [designTab, setDesignTab] = useState("season"); // 설계실 내부: season | reflection | advisor
  const [nameInput, setNameInput] = useState("");
  const [gateError, setGateError] = useState("");
  const [state, setState] = useState(EMPTY_STATE);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [goalDraftMemo, setGoalDraftMemo] = useState(null);
  const [dismissedReminder, setDismissedReminder] = useState(false);
  const [dismissedPokeId, setDismissedPokeId] = useState(null);
  const [pushKey, setPushKey] = useState(null);
  const [pushOn, setPushOn] = useState(false);
  const [toast, setToast] = useState(null);
  const [clock, setClock] = useState(Date.now()); // 리마인더가 9시 정각에 나타나게 하는 분 단위 틱
  const pollRef = useRef(null);
  const toastTimerRef = useRef(null);
  const busyRef = useRef(0); // 진행 중인 액션 수 — 폴링이 낙관적 갱신을 되돌리지 않게
  const mutationQueueRef = useRef(Promise.resolve()); // 응답 역전으로 최신 상태가 덮이는 것을 방지

  const showToast = (text) => {
    setToast({ text, id: Date.now() });
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  };

  const showXpFeedback = (awards = []) => {
    const earned = awards.filter((award) => award.awarded && award.event);
    const capped = awards.some((award) => award.capped);
    if (earned.length > 0) {
      showToast(earned.map((award) => {
        const label = XP_EVENT_LABELS[award.event.eventType] || "좋은 활동을 남겼어요";
        const owner = award.event.recipientType === "VILLAGE" ? "우리 마을" : "개인";
        return `${label}\n${owner} XP +${award.amount}`;
      }).join("\n\n"));
    } else if (capped) {
      showToast("마음은 잘 전달했어요.\n오늘 받을 수 있는 응원 XP는 모두 모았어요.");
    }
  };

  // 탭 전환을 브라우저의 View Transition으로 감싼다.
  // 화면이 툭 바뀌는 대신 한 장면에서 다음 장면으로 넘어가는 느낌이 된다.
  // 미지원 브라우저·움직임 최소화 설정에서는 그냥 즉시 전환된다.
  const switchView = (next) => {
    if (typeof document === "undefined" || !document.startViewTransition || reducedMotion()) {
      setView(next);
      return;
    }
    document.startViewTransition(() => flushSync(() => setView(next)));
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
  const mutate = (payload, optimistic) => {
    if (optimistic) setState(optimistic);
    busyRef.current++;

    const run = async () => {
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
          showXpFeedback(data.xpAwards || []);
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

    // 한 기기에서 보낸 액션은 순서대로 저장한다. 앞선 응답이 늦게 도착해
    // 더 최신 액션의 화면 상태를 되돌리는 문제를 원천적으로 막는다.
    const task = mutationQueueRef.current.then(run, run);
    mutationQueueRef.current = task.then(() => undefined, () => undefined);
    return task;
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

  const visibleGoal = (g) => g.type !== "weekly" && g.status !== "failed" && g.status !== "paused";
  const myGoals = state.goals.filter((g) => g.owner === me && visibleGoal(g));
  const otherGoals = otherName ? state.goals.filter((g) => g.owner === otherName && visibleGoal(g)) : [];
  const myGoalMemos = state.goalMemos.filter((m) => m.owner === me);
  const myActiveSeason = state.seasons.find((season) => season.owner === me && season.status === "active") || null;
  const today = todayStr(0);
  const todayGoals = myGoals.filter((goal) =>
    goal.showOnBoard !== false &&
    goal.status !== "completed" &&
    goalKind(goal) !== "milestone" &&
    (goal.scheduledDate === today || isGoalDueOn(goal, today))
  );
  const activeMilestones = myGoals.filter((goal) => goalKind(goal) === "milestone" && goal.status !== "failed");

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
        const active = elapsed.filter((d) => d >= weekStart && (!g.createdAt || d >= g.createdAt) && isGoalDueOn(g, d));
        if (active.length === 0) continue;
        total++;
        if (active.some((d) => checkinSet.has(`${g.id}_${d}`))) completed++;
      }
      return { user, completed, total, rate: total > 0 ? completed / total : null };
    };

    const mine = statsFor(me);
    const theirs = otherName ? statsFor(otherName) : null;
    const moved = mine.completed + (theirs?.completed || 0);
    const verdict = theirs
      ? moved > 0
        ? `둘이 이번 주 ${moved}개 목표를 움직였어요`
        : "이번 주의 첫 실행을 함께 시작해봐요"
      : null;
    return { mine, theirs, verdict };
  }, [state.goals, progressSum, checkinSet, me, otherName]);

  // ----- 리마인더 배너 (밤 9시 이후 안 찍은 도장) -----
  const reminder = useMemo(() => {
    if (new Date(clock).getHours() < 21) return null;
    const today = todayStr(0);
    const missed = todayGoals.filter((g) => goalKind(g) !== "project" && !checkinSet.has(`${g.id}_${today}`));
    if (missed.length === 0) return null;
    return `밤 9시가 넘었어요 — 아직 안 찍은 도장이 ${missed.length}개 있어요!`;
  }, [todayGoals, checkinSet, clock]);

  // ----- 시점 프롬프트: 주기가 된 인생 설계 작업을 오늘 화면으로 불러온다 -----
  // 탭을 찾아가는 대신, 복기·시즌 같은 저빈도 작업이 때가 되면 먼저 말을 건다.
  const cadencePrompt = useMemo(() => {
    if (!loaded) return null;
    const dow = new Date(clock).getDay(); // 0=일, 5=금, 6=토
    const thisWeekStart = weekDates(0)[0];

    // 1) 주말이 되면 이번 주 복기 유도 (아직 이번 주 복기를 안 썼을 때만)
    const wroteThisWeek = state.weeklyReviews.some(
      (r) => r.owner === me && r.weekStart === thisWeekStart
    );
    if ((dow === 5 || dow === 6 || dow === 0) && !wroteThisWeek) {
      return {
        key: `weekly_${thisWeekStart}`,
        icon: "省",
        text: "이번 주를 돌아볼 시간이에요. 5분이면 충분해요.",
        cta: "주간 복기 열기",
        tab: "reflection",
      };
    }

    // 2) 활성 12주 시즌이 없으면 방향 설정 유도 (목표가 하나라도 있을 때만)
    if (!myActiveSeason && myGoals.length > 0) {
      return {
        key: "season_setup",
        icon: "旬",
        text: "오늘의 도장이 어디로 향하는지 정해두면 덜 흔들려요.",
        cta: "12주 시즌 정하기",
        tab: "season",
      };
    }
    return null;
  }, [loaded, clock, state.weeklyReviews, me, myActiveSeason, myGoals.length]);

  const [dismissedCadence, setDismissedCadence] = useState(null);
  const [advisorMode, setAdvisorMode] = useState("weekly");

  const goToDesign = (tab, aiMode) => {
    if (aiMode) setAdvisorMode(aiMode);
    setDesignTab(tab);
    switchView("design");
  };

  const friendActiveSeason = useMemo(
    () => (otherName ? state.seasons.find((s) => s.owner === otherName && s.status === "active") || null : null),
    [state.seasons, otherName]
  );

  // ----- 게임 HUD: XP / 레벨 / 오늘 진행률 -----
  const myXP = computeXP(me, state);
  const myLevel = levelOf(myXP);
  const xpBase = xpForLevel(myLevel);
  const xpNeed = xpForLevel(myLevel + 1) - xpBase;
  const xpPct = Math.round(((myXP - xpBase) / xpNeed) * 100);
  const todayStampGoals = todayGoals.filter((g) => goalKind(g) !== "project");
  const todayDone = todayStampGoals.filter((g) => checkinSet.has(`${g.id}_${todayStr(0)}`)).length;
  const perfectToday = todayStampGoals.length > 0 && todayDone === todayStampGoals.length;

  // 마을 히어로용 — 쌓인 도장(나무)과 친구의 오늘 기척
  const myGoalIdSet = useMemo(() => new Set(myGoals.map((g) => g.id)), [myGoals]);
  const friendActiveToday = useMemo(() => {
    if (!otherName) return false;
    const ids = new Set(state.goals.filter((g) => g.owner === otherName).map((g) => g.id));
    const today = todayStr(0);
    return state.checkins.some((c) => ids.has(c.goalId) && c.date === today);
  }, [state.goals, state.checkins, otherName]);

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

  const addGoal = async (goal) => {
    const ok = await mutate({ action: "addGoal", goal });
    if (ok) {
      setAdding(false);
      showToast(goal.scheduledWeek ? "목표가 이번 주에 추가되었습니다." : "목표가 저장되었습니다.");
      if (goalDraftMemo) {
        await mutate({ action: "deleteGoalMemo", memoId: goalDraftMemo.id });
        setGoalDraftMemo(null);
      }
    }
    return ok;
  };

  const deleteGoal = (goal) => {
    const keepsCompletion = goal.type === "milestone" && goal.status === "completed";
    const ok = window.confirm(
      keepsCompletion
        ? `"${goal.title}" 목표를 현황판에서 지울까요? 달성 기록과 최종 수량은 기록에 남아요.`
        : `"${goal.title}" 목표를 지울까요? 쌓인 도장 기록도 같이 사라져요.`
    );
    if (!ok) return;
    mutate({ action: "deleteGoal", goalId: goal.id });
  };

  const toggleCheckin = (goalId, date, min = false) => {
    const exists = checkinSet.has(`${goalId}_${date}`);
    const nextCheckins = exists
      ? state.checkins.filter((c) => !(c.goalId === goalId && c.date === date))
      : [...state.checkins, min ? { goalId, date, min: true } : { goalId, date }];
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
    mutate({ action: "toggleCheckin", goalId, date, min }, { ...state, checkins: nextCheckins });
  };

  const updateGoal = (goalId, fields) =>
    mutate({ action: "updateGoal", goalId, ...fields });

  const saveGoalEdit = async (goalId, goal) => {
    const ok = await mutate({ action: "updateGoal", goalId, goal });
    if (ok) {
      setEditingGoal(null);
      showToast("목표 수정이 저장되었습니다.");
    }
    return ok;
  };

  const goalAction = async (goal, action) => {
    if (action === "duplicate") {
      const ok = await mutate({ action: "duplicateGoal", goalId: goal.id });
      if (ok) showToast("목표를 복제했습니다.");
      return ok;
    }
    if (action === "today" || action === "week") {
      const ok = await mutate({ action: "scheduleGoal", goalId: goal.id, destination: action });
      if (ok) showToast(action === "today" ? "목표를 오늘로 보냈습니다." : "목표가 이번 주에 추가되었습니다.");
      return ok;
    }
    const status = action === "pause" ? "paused" : action === "complete" ? "completed" : "active";
    const ok = await mutate({ action: "setGoalStatus", goalId: goal.id, status });
    if (ok) showToast(status === "paused" ? "목표를 잠시 멈췄습니다." : status === "completed" ? "목표를 완료했습니다." : "목표를 다시 시작했습니다.");
    return ok;
  };

  const toggleSubtask = (goalId, taskId, done) =>
    mutate({ action: "toggleSubtask", goalId, taskId, done });

  const scheduleSubtask = async (goalId, taskId, destination) => {
    const ok = await mutate({ action: "scheduleSubtask", goalId, taskId, destination });
    if (ok) showToast(destination === "today" ? "하위 작업을 오늘로 보냈습니다." : "하위 작업을 이번 주로 보냈습니다.");
    return ok;
  };

  const saveKpi = async (kpi) => {
    const ok = await mutate({ action: "setKpi", kpi });
    if (ok) showToast("KPI가 저장되었습니다.");
    return ok;
  };

  const recordKpi = async (kpiId, value, weekStart) => {
    const ok = await mutate({ action: "recordKpi", kpiId, value, weekStart });
    if (ok) showToast("이번 주 KPI를 기록했습니다.");
    return ok;
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

  const saveFailureReason = (goalId, text) =>
    mutate({ action: "addFailureReason", goalId, text });

  const sendMessage = (text, replyToId = "") =>
    mutate({ action: "addMessage", text, replyToId });

  const addGoalMemo = (memo) =>
    mutate({ action: "addGoalMemo", memo });

  const updateGoalMemo = (memoId, memo) =>
    mutate({ action: "updateGoalMemo", memoId, memo });

  const saveBigGoal = (text) =>
    mutate({ action: "setBigGoal", text });

  const saveSeason = async (season) => {
    const ok = await mutate({ action: "setSeason", season });
    if (ok) showToast("12주 시즌이 저장되었습니다.");
    return ok;
  };

  const closeSeason = () => {
    const ok = window.confirm("현재 12주 시즌을 마감할까요? 기록은 남고 새 시즌을 시작할 수 있어요.");
    if (!ok) return Promise.resolve(false);
    return mutate({ action: "closeSeason" });
  };

  const addLifeItem = (item) =>
    mutate({ action: "addLifeItem", item });

  const updateLifeItem = (itemId, status) =>
    mutate({ action: "updateLifeItem", itemId, status });

  const deleteLifeItem = (itemId) => {
    const ok = window.confirm("이 시즌 항목을 삭제할까요?");
    if (!ok) return Promise.resolve(false);
    return mutate({ action: "deleteLifeItem", itemId });
  };

  const linkGoal = (goalId, domainKey, seasonId) =>
    mutate({ action: "updateGoalContext", goalId, domainKey, seasonId });

  const applyAiGoalDraft = (draft) =>
    mutate({ action: "applyAiGoalDraft", draft });

  const saveWeeklyReview = async (review) => {
    const ok = await mutate({ action: "setWeeklyReview", review });
    if (ok) showToast(review.createPromises ? "복기와 다음 주 약속을 저장했습니다." : "이번 주 복기를 저장했습니다.");
    return ok;
  };

  const saveMonthlyReview = (review) =>
    mutate({ action: "setMonthlyReview", review });

  const addDecision = (decision) =>
    mutate({ action: "addDecision", decision });

  const updateDecision = (decisionId, result) =>
    mutate({ action: "updateDecision", decisionId, result });

  const deleteDecision = (decisionId) => {
    const ok = window.confirm("이 결정 기록을 삭제할까요?");
    if (!ok) return Promise.resolve(false);
    return mutate({ action: "deleteDecision", decisionId });
  };

  const deleteGoalMemo = (memoId) => {
    const ok = window.confirm("이 메모를 삭제할까요?");
    if (!ok) return;
    mutate({ action: "deleteGoalMemo", memoId });
  };

  const poke = async () => {
    vibrate(10);
    await mutate({ action: "poke" });
  };

  const cheerGoal = (goalId) => {
    const alreadySent = state.reactions.some(
      (item) => item.goalId === goalId && item.by === me && item.date === todayStr(0)
    );
    if (alreadySent) {
      showToast("오늘 이미 응원을 보냈어요.");
      return;
    }
    toggleReaction(goalId, "🔥");
    showToast("🔥 응원을 보냈어요.");
  };

  const addCalendarEvent = (event) => mutate({ action: "addCalendarEvent", event });
  const updateCalendarEvent = (eventId, event) => mutate({ action: "updateCalendarEvent", eventId, event });
  const deleteCalendarEvent = (eventId) => {
    if (!window.confirm("이 일정을 삭제할까요?")) return Promise.resolve(false);
    return mutate({ action: "deleteCalendarEvent", eventId });
  };

  const villageNavigate = (destination, target = "") => {
    if (destination === "reflection") {
      setDesignTab("reflection");
      switchView("design");
      return;
    }
    switchView(destination);
    if (destination !== "board" || !target) return;
    const ids = {
      top: "board-top",
      mine: "my-goals",
      friend: "friend-goals",
      memos: "goal-memos",
      messages: "message-board",
    };
    window.setTimeout(() => document.getElementById(ids[target])?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const startGoalFromMemo = (memo) => {
    setGoalDraftMemo(memo);
    setAdding(true);
    villageNavigate("board", "mine");
  };

  const saveExcuse = (goalId, date, text) => {
    mutate({ action: "addExcuse", goalId, date, text });
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

  // 최근 며칠 못 찍은 매일 목표 — 이유를 남기거나(7일 전까지) 소급 도장(어제만)을 찍어야 사라짐.
  // 여행·출장으로 이틀 이상 비어도 돌아와서 기록을 채울 수 있게 어제 하루만 보지 않는다.
  const missedRecent = useMemo(() => {
    const days = [];
    for (let back = 1; back <= EXCUSE_BACKFILL_DAYS; back++) {
      const date = todayStr(-back);
      const goals = myGoals.filter(
        (g) =>
          g.type === "daily" &&
          isGoalDueOn(g, date) &&
          (!g.createdAt || g.createdAt <= date) &&
          !checkinSet.has(`${g.id}_${date}`) &&
          !state.excuses.some((x) => x.goalId === g.id && x.date === date)
      );
      if (goals.length > 0) days.push({ date, goals });
    }
    return days;
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
                <p className="gate-kicker">둘이 쓰는 인생 운영실</p>
                <h1>도장판</h1>
              </div>
            </div>
            <div className="gate-preview">
              <div className="preview-head">
                <span>현재 인생 시즌</span>
                <strong>12週</strong>
              </div>
              <div className="preview-stamps" aria-hidden="true">
                {["월", "화", "수", "목", "금", "토", "일"].map((d, i) => (
                  <span key={d} className={i < 4 ? "filled" : i === 4 ? "today" : ""}>
                    {d}
                  </span>
                ))}
              </div>
              <div className="preview-row">
                <span>이번 방향</span>
                <b>체력과 커리어 기반</b>
              </div>
              <div className="preview-row">
                <span>주간 인생 회의</span>
                <b>현실 확인 · 다음 약속</b>
              </div>
            </div>
            <PhotoDuo compact />
          </section>
          <form className="gate-card" onSubmit={submitName}>
            <h2>입장하기</h2>
            <p>
              삶의 방향부터 오늘의 실행까지 함께 기록해요.
              <br />
              같은 링크를 친구에게 보내면 둘이 같은 운영실을 씁니다.
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

  // 목표가 연결된 활성 시즌(내 것이든 친구 것이든)을 찾아 카드에 수직선으로 보여준다
  const seasonOf = (goal) =>
    goal.seasonId
      ? state.seasons.find((s) => s.id === goal.seasonId && s.status === "active") || null
      : null;

  const renderGoalCard = (goal, isMine) =>
    goalKind(goal) === "project" ? (
      <ProjectGoalCard
        key={goal.id}
        goal={goal}
        season={seasonOf(goal)}
        isMine={isMine}
        onToggleTask={toggleSubtask}
        onScheduleTask={scheduleSubtask}
        onEdit={setEditingGoal}
        onAction={goalAction}
        onDelete={deleteGoal}
      />
    ) : goal.type === "milestone" ? (
      <MilestoneGoalCard
        key={goal.id}
        goal={goal}
        isMine={isMine}
        current={progressSum[goal.id] || 0}
        reactions={state.reactions}
        me={me}
        season={seasonOf(goal)}
        onAddProgress={addProgress}
        onSaveFailureReason={saveFailureReason}
        onToggleReaction={toggleReaction}
        onDelete={deleteGoal}
        onEdit={setEditingGoal}
        onAction={goalAction}
      />
    ) : (
      <StampGoalCard
        key={goal.id}
        goal={goal}
        isMine={isMine}
        checkinSet={checkinSet}
        checkins={state.checkins}
        reactions={state.reactions}
        excuses={state.excuses}
        me={me}
        season={seasonOf(goal)}
        onToggleCheckin={toggleCheckin}
        onToggleReaction={toggleReaction}
        onUpdateGoal={updateGoal}
        onDelete={deleteGoal}
        onEdit={setEditingGoal}
        onAction={goalAction}
        onPeekExcuse={peekExcuse}
      />
    );

  return (
    <>
      {/* 모든 탭이 같은 세계 위에 뜬다 — 탭을 바꿔도 마을은 이어진다 */}
      <VillageBackdrop
        done={todayDone}
        total={todayStampGoals.length}
        treeCount={state.checkins.filter((c) => myGoalIdSet.has(c.goalId)).length}
        friendActiveToday={friendActiveToday}
        otherName={otherName}
      />
      <div className="shell">
      <div className="masthead">
        <h1>
          <span className="stamp-dot" />
          도장판
          <small>둘의 인생 운영실</small>
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
      <PhotoDuo users={state.users} />

      <nav className="view-tabs" aria-label="주요 화면">
        <button type="button" className={view === "board" ? "active" : ""} onClick={() => switchView("board")}>
          <span>今日</span> 오늘
        </button>
        <button type="button" className={view === "week" ? "active" : ""} onClick={() => switchView("week")}>
          <span>週</span> 이번 주
        </button>
        <button type="button" className={view === "calendar" ? "active" : ""} onClick={() => switchView("calendar")}>
          <span>曆</span> 캘린더
        </button>
        <button type="button" className={view === "design" ? "active" : ""} onClick={() => switchView("design")}>
          <span>設</span> 설계실
        </button>
        <button type="button" className={view === "history" ? "active" : ""} onClick={() => switchView("history")}>
          <span>記</span> 기록
        </button>
        <button type="button" className={view === "village" ? "active" : ""} onClick={() => switchView("village")}>
          <span>村</span> 마을 <span className="tab-level">Lv.{myLevel}</span>
        </button>
      </nav>

      {view === "week" && (
        <WeekView
          state={state}
          me={me}
          progressSum={progressSum}
          checkins={state.checkins}
          activeSeason={myActiveSeason}
          onEdit={setEditingGoal}
          onAction={goalAction}
          onAdd={() => setAdding(true)}
          onOpenReview={() => goToDesign("reflection")}
          onSaveKpi={saveKpi}
          onRecordKpi={recordKpi}
          onCheer={cheerGoal}
          onPoke={poke}
        />
      )}

      {view === "calendar" && (
        <CalendarView
          state={state}
          me={me}
          onAdd={addCalendarEvent}
          onUpdate={updateCalendarEvent}
          onDelete={deleteCalendarEvent}
        />
      )}

      {view === "design" && (
        <div className="design-room">
          <div className="design-intro">
            <p className="eyebrow">인생 설계실</p>
            <h2>계획을 세우고 실행을 돌아보는 곳</h2>
            <p className="design-sub">12주 계획을 정하고, 주기가 되면 복기하고, 막힐 땐 AI 참모에게 물어보세요.</p>
          </div>
          <div className="design-subnav" role="tablist" aria-label="설계실 메뉴">
            <button type="button" role="tab" aria-selected={designTab === "season"} className={designTab === "season" ? "active" : ""} onClick={() => setDesignTab("season")}>
              <span>旬</span> 12주
            </button>
            <button type="button" role="tab" aria-selected={designTab === "reflection"} className={designTab === "reflection" ? "active" : ""} onClick={() => setDesignTab("reflection")}>
              <span>省</span> 복기
            </button>
            <button type="button" role="tab" aria-selected={designTab === "advisor"} className={designTab === "advisor" ? "active" : ""} onClick={() => setDesignTab("advisor")}>
              <span>參</span> AI 참모
            </button>
          </div>

          {designTab === "season" && (
            <SeasonBoard
              state={state}
              me={me}
              otherName={otherName}
              goals={myGoals}
              onSaveSeason={saveSeason}
              onCloseSeason={closeSeason}
              onAddItem={addLifeItem}
              onUpdateItem={updateLifeItem}
              onDeleteItem={deleteLifeItem}
              onLinkGoal={linkGoal}
            />
          )}

          {designTab === "reflection" && (
            <ReflectionHub
              state={state}
              me={me}
              otherName={otherName}
              onSaveWeekly={saveWeeklyReview}
              onSaveMonthly={saveMonthlyReview}
              onAddDecision={addDecision}
              onUpdateDecision={updateDecision}
              onDeleteDecision={deleteDecision}
            />
          )}

          {designTab === "advisor" && (
            <AIAdvisor
              state={state}
              me={me}
              otherName={otherName}
              onApplyDraft={applyAiGoalDraft}
              onToast={showToast}
            />
          )}
        </div>
      )}

      {view === "village" && (
        <Village
          state={state}
          me={me}
          otherName={otherName}
          onNavigate={villageNavigate}
          onPoke={poke}
          onCheer={cheerGoal}
          onAddProgress={addProgress}
          onSendMessage={sendMessage}
          onStartMemo={startGoalFromMemo}
          onEditMemo={() => villageNavigate("board", "memos")}
          onDeleteMemo={deleteGoalMemo}
        />
      )}

      {view === "history" && (
        <HistoryView
          goals={[...state.goals, ...state.completedGoals]}
          checkins={state.checkins}
          progress={state.progress}
          excuses={state.excuses}
          me={me}
          otherName={otherName}
        />
      )}

      {view === "board" && (
        <>
          <VillageHero
            me={me}
            otherName={otherName}
            done={todayDone}
            total={todayStampGoals.length}
            perfect={perfectToday}
            level={myLevel}
            xpPct={xpPct}
            xpLeft={xpNeed - (myXP - xpBase)}
            treeCount={state.checkins.filter((c) => myGoalIdSet.has(c.goalId)).length}
            friendActiveToday={friendActiveToday}
            onEnterVillage={() => switchView("village")}
          />

          {cadencePrompt && cadencePrompt.key !== dismissedCadence && (
            <div className="cadence-prompt">
              <span className="cadence-icon" aria-hidden="true">{cadencePrompt.icon}</span>
              <div className="cadence-body">
                <p>{cadencePrompt.text}</p>
                <button type="button" className="cadence-cta" onClick={() => goToDesign(cadencePrompt.tab)}>
                  {cadencePrompt.cta} →
                </button>
              </div>
              <button
                type="button"
                className="cadence-dismiss"
                onClick={() => setDismissedCadence(cadencePrompt.key)}
                aria-label="나중에"
              >
                ✕
              </button>
            </div>
          )}

          {loaded && (
            <BigGoalPanel
              goals={state.bigGoals}
              me={me}
              otherName={otherName}
              onSave={saveBigGoal}
            />
          )}

          {incomingPoke && incomingPoke.id !== dismissedPokeId && (
            <div className="reminder-banner poke-banner">
              <span>👉 {otherName}이(가) 콕 찔렀어요! 오늘 도장 찍으라는 뜻인 듯.</span>
              <button type="button" onClick={() => setDismissedPokeId(incomingPoke.id)} aria-label="닫기">
                ✕
              </button>
            </div>
          )}

          {missedRecent.length > 0 && (
            <MissedPanel
              days={missedRecent}
              yesterday={todayStr(-1)}
              onStamp={(goalId, min) => toggleCheckin(goalId, todayStr(-1), min)}
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
            <section className="goal-column" id="my-goals">
              <div className="column-head">
                <h3>내 목표</h3>
                <span className="tag">
                  {me} · Lv.{myLevel}
                </span>
              </div>
              <div className="goal-list">
                {loaded && todayGoals.length === 0 && (
                  <div className="empty-note">
                    오늘 예정된 실행이 없어요.
                    <br />
                    이번 주 화면에서 다음 약속을 확인해보세요.
                  </div>
                )}
                {todayGoals.map((g) => renderGoalCard(g, true))}
                <div className="add-action-row">
                  <button className="add-goal-trigger" onClick={() => setAdding(true)} type="button">
                    + 오늘의 실행 만들기
                  </button>
                </div>
                {activeMilestones.length > 0 && <details className="board-collapsible"><summary>진행 중인 기간 목표 <b>{activeMilestones.length}</b></summary><div className="goal-list">{activeMilestones.map((goal) => renderGoalCard(goal, true))}</div></details>}
                <div id="goal-memos">
                  <GoalMemoPanel
                    memos={myGoalMemos}
                    onAdd={addGoalMemo}
                    onUpdate={updateGoalMemo}
                    onDelete={deleteGoalMemo}
                  />
                </div>
              </div>
            </section>

            <section className="goal-column friend-column" id="friend-goals">
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
              <div className="friend-today-summary">
                <strong>{otherName || "친구"} 오늘 {otherGoals.filter((goal) => goal.type !== "milestone" && checkinSet.has(`${goal.id}_${today}`)).length}/{otherGoals.filter((goal) => goal.type !== "milestone" && isGoalDueOn(goal, today)).length} 완료</strong>
                {otherName && <button type="button" onClick={poke}>응원하기</button>}
              </div>
              <details className="board-collapsible"><summary>친구 목표 자세히 보기</summary><div className="goal-list">
                {loaded && otherGoals.length === 0 && (
                  <div className="empty-note">
                    {otherName
                      ? "아직 목표 없음."
                      : "친구가 아직 접속 안 함. 링크 보내고 이름 입력하면 여기 나타남."}
                  </div>
                )}
                {otherGoals.map((g) => renderGoalCard(g, false))}
              </div></details>
            </section>
          </div>

          <div id="message-board">
            <MessageBoard
              messages={state.messages}
              me={me}
              otherName={otherName}
              onSend={sendMessage}
              onDelete={deleteMessage}
            />
          </div>

          <div className="footer-note">
            오늘·어제 칸 체크 가능 · 못 찍은 날엔 이유 남기기 · 친구 도장엔 리액션·응원·콕 찌르기
          </div>
        </>
      )}

      {(adding || editingGoal) && (
        <AddGoalForm
          onAdd={addGoal}
          onSave={saveGoalEdit}
          onCancel={() => {
            setAdding(false);
            setEditingGoal(null);
            setGoalDraftMemo(null);
          }}
          activeSeason={myActiveSeason}
          initialGoal={editingGoal}
          initialTitle={goalDraftMemo?.text || ""}
        />
      )}

      <Toast toast={toast} />
      </div>
    </>
  );
}
