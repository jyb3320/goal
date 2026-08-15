import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  computeXP,
  xpForLevel,
  levelOf,
  nextUnlock,
  recentXpEvents,
  villageXpSummary,
} from "./lib/xp.js";
import { VILLAGE_ID } from "../shared/xp-config.js";
import { buildVillageStatus } from "./lib/village.js";
import { skyPhase } from "./lib/sky.js";
import VillagePanel from "./components/VillagePanel.jsx";

// three.js는 마을 탭을 열 때만 내려받는다 — 매일 쓰는 다른 탭의 번들을 늘리지 않는다
const Village3D = lazy(() => import("./components/Village3D.jsx"));

// ---------- 월드 상수 ----------
const WORLD_W = 1400;
const WORLD_H = 1000;
const HOUSE_ME = { x: 320, y: 300 };
const HOUSE_FR = { x: 1080, y: 300 };
const POND = { x: 700, y: 680, rx: 150, ry: 90 };
const BOARD = { x: 700, y: 335 };
const MAILBOX = { x: 500, y: 455 };
const GARDEN = { x: 255, y: 620 };
const ARCHIVE = { x: 1110, y: 650 };
const MAX_DECOR = 400;

// 단청 광물 안료 — 오늘 화면 히어로와 같은 팔레트
const C = {
  ground: "#e6dbb8",
  groundDot: "rgba(20,25,54,0.05)",
  path: "#d9cba0",
  pond: "#4f9e93",
  pondIn: "#7cc0b5",
  ink: "#1d2138",
  red: "#c03a2b",
  redDeep: "#94271b",
  teal: "#2f8577",
  gold: "#e0ab4c",
  goldDeep: "#b0812e",
  green: "#4a9b6c",
  greenDeep: "#2f7d5c",
  paper: "#fbf5e7",
};

// 시간대별 마을 공기 — 히어로와 같은 하늘 아래 있게 한다.
// 밝은 바닥에 어두운 막을 씌우면 탁해지므로 바닥색 자체를 바꾼다.
const PHASE_AIR = {
  dawn: { ground: "#b8ab93", path: "#a2947c", dot: "rgba(20,25,54,0.06)", tint: "rgba(96,74,122,0.16)", firefly: 0.35 },
  day: { ground: "#e6dbb8", path: "#d9cba0", dot: "rgba(20,25,54,0.05)", tint: "rgba(255,244,214,0.05)", firefly: 0 },
  dusk: { ground: "#9c8163", path: "#8a7053", dot: "rgba(20,25,54,0.08)", tint: "rgba(150,74,46,0.2)", firefly: 0.7 },
  night: { ground: "#2b3350", path: "#39405c", dot: "rgba(240,233,214,0.05)", tint: "rgba(20,25,54,0.28)", firefly: 1 },
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function insideExclusion(x, y) {
  const nearHouse = (h) => Math.abs(x - h.x) < 120 && Math.abs(y - h.y) < 110;
  const inPond =
    ((x - POND.x) / (POND.rx + 40)) ** 2 + ((y - POND.y) / (POND.ry + 40)) ** 2 < 1;
  const nearPlace = [BOARD, MAILBOX, GARDEN, ARCHIVE].some(
    (place) => Math.abs(x - place.x) < 110 && Math.abs(y - place.y) < 90
  );
  return nearHouse(HOUSE_ME) || nearHouse(HOUSE_FR) || inPond || nearPlace;
}

function decorFor(i) {
  const rng = mulberry32(i * 7919 + 3);
  let x = 0;
  let y = 0;
  for (let tries = 0; tries < 6; tries++) {
    x = 70 + rng() * (WORLD_W - 140);
    y = 150 + rng() * (WORLD_H - 220);
    if (!insideExclusion(x, y)) break;
  }
  const m = i % 12;
  const kind = m === 11 ? "tree" : m === 3 || m === 7 ? "mushroom" : m % 4 === 1 ? "grass" : "flower";
  return { x, y, kind, v: rng() };
}

function easeOutBack(t) {
  const c = 1.70158;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

export default function Village({
  state,
  me,
  otherName,
  onNavigate,
  onPoke,
  onCheer,
  onAddProgress,
  onSendMessage,
  onStartMemo,
  onEditMemo,
  onDeleteMemo,
}) {
  const canvasRef = useRef(null);
  const [location, setLocation] = useState(null);
  const [xpOpen, setXpOpen] = useState(false);
  const [xpTab, setXpTab] = useState("personal");
  const villageStatus = useMemo(() => buildVillageStatus(state, me, otherName), [state, me, otherName]);
  const treeCount = useMemo(() => {
    const ids = new Set(villageStatus.mine.goals.map((goal) => goal.id));
    return state.checkins.filter((item) => ids.has(item.goalId)).length;
  }, [state.checkins, villageStatus]);
  const readKey = `goal-village-mail-read:${me}`;
  const [readEventKeys, setReadEventKeys] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(readKey) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const readEventSet = useMemo(() => new Set(readEventKeys), [readEventKeys]);
  const unread = villageStatus.mailbox.events.filter((event) => !readEventSet.has(event.key)).length;
  const openLocation = useCallback((next) => {
    setLocation(next);
    if (next === "mailbox") {
      const keys = villageStatus.mailbox.events.slice(0, 100).map((event) => event.key);
      setReadEventKeys(keys);
      try {
        localStorage.setItem(readKey, JSON.stringify(keys));
      } catch {
        // 브라우저 저장소를 막아둔 경우 이번 화면에서만 읽음 처리한다.
      }
    }
  }, [readKey, villageStatus.mailbox.events]);
  const openLocationRef = useRef(openLocation);
  openLocationRef.current = openLocation;
  const villageStatusRef = useRef(villageStatus);
  villageStatusRef.current = villageStatus;
  const unreadRef = useRef(unread);
  unreadRef.current = unread;
  const stateRef = useRef(state);
  stateRef.current = state;
  const otherRef = useRef(otherName);
  otherRef.current = otherName;

  // 컴팩션으로 아카이브된 옛 도장도 마을 식물로 남는다
  const archivedStamps = Object.values(state.archive || {}).reduce(
    (s, a) => s + (a.stamps || 0),
    0
  );
  const decorCount = Math.min(
    MAX_DECOR,
    archivedStamps + state.checkins.length + state.progress.filter((p) => p.amount > 0).length
  );

  const myXP = computeXP(me, state);
  const myLevel = levelOf(myXP);
  const frXP = otherName ? computeXP(otherName, state) : 0;
  const frLevel = otherName ? levelOf(frXP) : 1;
  const curBase = xpForLevel(myLevel);
  const nextNeed = xpForLevel(myLevel + 1) - curBase;
  const intoLevel = myXP - curBase;
  const unlock = nextUnlock(myLevel);
  const villageSummary = villageXpSummary(state);
  const xpHistory = recentXpEvents(
    state,
    xpTab === "personal" ? "USER" : "VILLAGE",
    xpTab === "personal" ? me : VILLAGE_ID
  );

  const levelsRef = useRef({ me: myLevel, fr: frLevel });

  const frWeekStamps = useMemo(() => {
    if (!otherName) return 0;
    const ids = new Set(state.goals.filter((g) => g.owner === otherName).map((g) => g.id));
    const now = new Date();
    const dow = (now.getDay() + 6) % 7;
    const mon = new Date(now);
    mon.setDate(now.getDate() - dow);
    const monStr = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;
    return state.checkins.filter((c) => ids.has(c.goalId) && c.date >= monStr).length;
  }, [state.checkins, state.goals, otherName]);
  const frWeekRef = useRef(frWeekStamps);
  frWeekRef.current = frWeekStamps;

  const decorCountRef = useRef(decorCount);
  decorCountRef.current = decorCount;
  const myLevelRef = useRef(myLevel);
  myLevelRef.current = myLevel;
  const frLevelRef = useRef(frLevel);
  frLevelRef.current = frLevel;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const meName = me;
    let running = true;
    let raf = 0;

    const keys = new Set();
    const player = { x: HOUSE_ME.x + 40, y: HOUSE_ME.y + 110, fx: 1, phase: 0, moving: false };
    const friend = {
      x: HOUSE_FR.x - 40,
      y: HOUSE_FR.y + 110,
      tx: null,
      ty: null,
      waitUntil: 0,
      fx: -1,
      phase: 0,
      moving: false,
    };
    const pointer = { active: false, x: 0, y: 0, sx: 0, sy: 0, moved: false };
    const particles = [];
    const spawnTimes = new Map(); // 새 장식 pop 애니메이션
    let decors = [];
    let decorsBuilt = -1;
    let prevDecorCount = decorCountRef.current;
    let prevMyLevel = myLevelRef.current;
    let prevFrLevel = frLevelRef.current;
    let playerBubble = null; // {text, until}
    let friendBubble = null;
    let lastMsgId = null;
    let nextFriendTalk = performance.now() / 1000 + 5;
    let vw = 0;
    let vh = 0;

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      vw = canvas.clientWidth;
      vh = canvas.clientHeight;
      canvas.width = vw * dpr;
      canvas.height = vh * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    const KEYMAP = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
      W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
    };
    const onKeyDown = (e) => {
      if (KEYMAP[e.key]) {
        keys.add(e.key);
        e.preventDefault();
      }
    };
    const onKeyUp = (e) => keys.delete(e.key);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let cam = { x: 0, y: 0 };
    const toWorld = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left + cam.x, y: e.clientY - r.top + cam.y };
    };
    const locationAt = (p) => {
      if (Math.abs(p.x - HOUSE_ME.x) < 78 && Math.abs(p.y - HOUSE_ME.y) < 90) return "meHouse";
      if (Math.abs(p.x - HOUSE_FR.x) < 78 && Math.abs(p.y - HOUSE_FR.y) < 90) return "friendHouse";
      if (Math.abs(p.x - BOARD.x) < 82 && Math.abs(p.y - BOARD.y) < 72) return "board";
      if (Math.abs(p.x - MAILBOX.x) < 54 && Math.abs(p.y - MAILBOX.y) < 58) return "mailbox";
      if (Math.abs(p.x - GARDEN.x) < 100 && Math.abs(p.y - GARDEN.y) < 70) return "garden";
      if (Math.abs(p.x - ARCHIVE.x) < 92 && Math.abs(p.y - ARCHIVE.y) < 82) return "archive";
      if (((p.x - POND.x) / (POND.rx + 30)) ** 2 + ((p.y - POND.y) / (POND.ry + 30)) ** 2 < 1) return "square";
      return null;
    };
    const onPointerDown = (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointer.active = true;
      const p = toWorld(e);
      pointer.x = p.x;
      pointer.y = p.y;
      pointer.sx = e.clientX;
      pointer.sy = e.clientY;
      pointer.moved = false;
    };
    const onPointerMove = (e) => {
      const p = toWorld(e);
      if (!pointer.active) {
        canvas.style.cursor = locationAt(p) ? "pointer" : "grab";
        return;
      }
      pointer.x = p.x;
      pointer.y = p.y;
      if (Math.hypot(e.clientX - pointer.sx, e.clientY - pointer.sy) > 8) pointer.moved = true;
    };
    const onPointerUp = (e) => {
      const p = toWorld(e);
      pointer.active = false;
      if (!pointer.moved) {
        const selected = locationAt(p);
        if (selected) openLocationRef.current(selected);
      }
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    function burst(x, y, colors) {
      for (let i = 0; i < 26; i++) {
        const a = (Math.PI * 2 * i) / 26 + Math.random() * 0.4;
        const sp = 70 + Math.random() * 130;
        particles.push({
          x, y: y - 20,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 60,
          life: 1,
          col: colors[i % colors.length],
          r: 2.5 + Math.random() * 2.5,
        });
      }
    }

    function update(dt, t) {
      // 도장이 늘면 새 장식 pop
      const dc = decorCountRef.current;
      if (dc !== prevDecorCount) {
        for (let i = prevDecorCount; i < dc; i++) spawnTimes.set(i, t);
        prevDecorCount = dc;
      }
      if (decorsBuilt !== dc) {
        decors = [];
        for (let i = 0; i < dc; i++) decors.push({ ...decorFor(i), i });
        decors.sort((a, b) => a.y - b.y);
        decorsBuilt = dc;
      }

      // 레벨 업 감지
      if (myLevelRef.current > prevMyLevel) {
        burst(player.x, player.y, [C.red, C.gold, C.teal, C.paper]);
        playerBubble = { text: `레벨 업! Lv.${myLevelRef.current} 🎉`, until: t + 4 };
      }
      prevMyLevel = myLevelRef.current;
      if (frLevelRef.current > prevFrLevel) {
        burst(friend.x, friend.y, [C.teal, C.gold, C.paper]);
        friendBubble = { text: `레벨 업! Lv.${frLevelRef.current} 🎉`, until: t + 4 };
      }
      prevFrLevel = frLevelRef.current;

      // 내 캐릭터 이동 (키보드 + 터치/드래그)
      let dx = 0;
      let dy = 0;
      for (const k of keys) {
        const v = KEYMAP[k];
        if (v) {
          dx += v[0];
          dy += v[1];
        }
      }
      if (pointer.active) {
        const px = pointer.x - player.x;
        const py = pointer.y - player.y;
        const dist = Math.hypot(px, py);
        if (dist > 6) {
          dx = px / dist;
          dy = py / dist;
        }
      }
      const len = Math.hypot(dx, dy);
      player.moving = len > 0.01;
      if (player.moving) {
        player.x += (dx / len) * 175 * dt;
        player.y += (dy / len) * 175 * dt;
        if (Math.abs(dx) > 0.01) player.fx = dx > 0 ? 1 : -1;
        player.phase += dt * 11;
      }
      player.x = Math.max(30, Math.min(WORLD_W - 30, player.x));
      player.y = Math.max(70, Math.min(WORLD_H - 20, player.y));

      // 친구 캐릭터: 마을을 어슬렁거리는 AI
      if (otherRef.current) {
        if (friend.tx === null && t > friend.waitUntil) {
          const rng = mulberry32(Math.floor(t * 997));
          for (let tries = 0; tries < 6; tries++) {
            const nx = 80 + rng() * (WORLD_W - 160);
            const ny = 160 + rng() * (WORLD_H - 240);
            if (!insideExclusion(nx, ny)) {
              friend.tx = nx;
              friend.ty = ny;
              break;
            }
          }
        }
        friend.moving = false;
        if (friend.tx !== null) {
          const fx = friend.tx - friend.x;
          const fy = friend.ty - friend.y;
          const d = Math.hypot(fx, fy);
          if (d < 6) {
            friend.tx = null;
            friend.waitUntil = t + 2 + Math.random() * 4;
          } else {
            friend.x += (fx / d) * 62 * dt;
            friend.y += (fy / d) * 62 * dt;
            friend.fx = fx > 0 ? 1 : -1;
            friend.phase += dt * 8;
            friend.moving = true;
          }
        }

        // 친구 말풍선: 새 응원 메시지 or 이번 주 자랑
        const msgs = stateRef.current.messages || [];
        const lastFromFriend = [...msgs].reverse().find((m) => m.from === otherRef.current);
        if (lastFromFriend && lastFromFriend.id !== lastMsgId) {
          lastMsgId = lastFromFriend.id;
          friendBubble = { text: lastFromFriend.text.slice(0, 22), until: t + 7 };
        } else if (t > nextFriendTalk) {
          nextFriendTalk = t + 18 + Math.random() * 14;
          const n = frWeekRef.current;
          friendBubble = {
            text: n > 0 ? `이번 주 도장 ${n}개 찍음 😎` : "이번 주 아직 0개… 🥲",
            until: t + 5,
          };
        }
      }

      // 파티클
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt / 1.2;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 220 * dt;
        if (p.life <= 0) particles.splice(i, 1);
      }

      // 카메라: 플레이어 따라가기
      cam.x = Math.max(0, Math.min(WORLD_W - vw, player.x - vw / 2));
      cam.y = Math.max(0, Math.min(WORLD_H - vh, player.y - vh / 2));
      if (vw >= WORLD_W) cam.x = (WORLD_W - vw) / 2;
      if (vh >= WORLD_H) cam.y = (WORLD_H - vh) / 2;
    }

    // ---------- 그리기 ----------
    function drawFlower(x, y, v, s) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.strokeStyle = C.greenDeep;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(2, -7, 0, -13);
      ctx.stroke();
      const cols = [C.red, C.goldDeep, "#7a5ba6", C.teal];
      const col = cols[Math.floor(v * cols.length)];
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 * i) / 5;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 3.4, -13 + Math.sin(a) * 3.4, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      ctx.arc(0, -13, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawGrass(x, y, s) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.strokeStyle = C.green;
      ctx.lineWidth = 1.6;
      for (const [ox, h] of [[-4, 9], [0, 13], [4, 9]]) {
        ctx.beginPath();
        ctx.moveTo(ox, 0);
        ctx.quadraticCurveTo(ox + 2, -h / 2, ox, -h);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawMushroom(x, y, s) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.fillStyle = "#efe6cf";
      ctx.fillRect(-2.5, -8, 5, 8);
      ctx.fillStyle = C.red;
      ctx.beginPath();
      ctx.arc(0, -8, 7, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = C.paper;
      ctx.beginPath();
      ctx.arc(-3, -10, 1.4, 0, Math.PI * 2);
      ctx.arc(3, -9.5, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawTree(x, y, v, s) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.fillStyle = "rgba(36,31,24,0.1)";
      ctx.beginPath();
      ctx.ellipse(0, 2, 18, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8a6a3d";
      ctx.fillRect(-3.5, -26, 7, 26);
      const g = v > 0.5 ? C.green : C.greenDeep;
      ctx.fillStyle = g;
      for (const [ox, oy, r] of [[-11, -32, 12], [11, -32, 12], [0, -44, 14]]) {
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (v > 0.6) {
        ctx.fillStyle = C.red;
        for (const [ox, oy] of [[-8, -34], [10, -28], [3, -46]]) {
          ctx.beginPath();
          ctx.arc(ox, oy, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    function drawHouse(h, roofCol, level, label, activity) {
      const big = level >= 6 ? 1.15 : 1;
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.scale(big, big);
      ctx.fillStyle = "rgba(36,31,24,0.12)";
      ctx.beginPath();
      ctx.ellipse(0, 46, 55, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f0e7cf";
      ctx.strokeStyle = "#c9b98c";
      ctx.lineWidth = 2;
      ctx.fillRect(-42, -10, 84, 55);
      ctx.strokeRect(-42, -10, 84, 55);
      ctx.fillStyle = roofCol;
      ctx.beginPath();
      ctx.moveTo(-52, -8);
      ctx.lineTo(0, -52);
      ctx.lineTo(52, -8);
      ctx.closePath();
      ctx.fill();
      // 문/창문
      ctx.fillStyle = "#8a6a3d";
      ctx.fillRect(-11, 15, 22, 30);
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      ctx.arc(6, 31, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = activity?.activeToday ? "#f2c96d" : "#cfe3dd";
      if (activity?.activeToday) {
        ctx.shadowColor = "rgba(242, 201, 109, 0.85)";
        ctx.shadowBlur = 13;
      }
      ctx.strokeStyle = "#8a6a3d";
      ctx.fillRect(-34, 2, 16, 14);
      ctx.strokeRect(-34, 2, 16, 14);
      ctx.fillRect(18, 2, 16, 14);
      ctx.strokeRect(18, 2, 16, 14);
      ctx.shadowBlur = 0;
      if (activity?.allDoneToday) {
        ctx.save();
        ctx.translate(35, -34);
        ctx.rotate(-0.1);
        ctx.fillStyle = C.paper;
        ctx.strokeStyle = C.red;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = C.redDeep;
        ctx.font = 'bold 11px "Noto Sans KR", sans-serif';
        ctx.textAlign = "center";
        ctx.fillText("完", 0, 4);
        ctx.restore();
      }
      if (level >= 3) {
        ctx.fillStyle = "#8a6a3d";
        ctx.fillRect(20, -46, 10, 20);
      }
      if (level >= 6) {
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -52);
        ctx.lineTo(0, -74);
        ctx.stroke();
        ctx.fillStyle = roofCol;
        ctx.beginPath();
        ctx.moveTo(0, -74);
        ctx.lineTo(22, -68);
        ctx.lineTo(0, -62);
        ctx.closePath();
        ctx.fill();
      }
      // 밤 바닥에서도 읽히게 밝은 테두리 + 진한 글씨
      ctx.font = '11px "Noto Sans KR", sans-serif';
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(251,245,231,0.92)";
      ctx.strokeText(label, 0, 60);
      ctx.fillStyle = "rgba(29,33,56,0.85)";
      ctx.fillText(label, 0, 60);
      ctx.restore();
    }

    function drawBoard() {
      const milestones = villageStatusRef.current.activeMilestones.length;
      ctx.save();
      ctx.translate(BOARD.x, BOARD.y);
      ctx.fillStyle = "rgba(36,31,24,0.12)";
      ctx.beginPath();
      ctx.ellipse(0, 48, 62, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#7f6038";
      ctx.fillRect(-52, -38, 7, 85);
      ctx.fillRect(45, -38, 7, 85);
      ctx.fillStyle = "#9a7442";
      ctx.strokeStyle = "#654b2e";
      ctx.lineWidth = 3;
      ctx.fillRect(-68, -48, 136, 70);
      ctx.strokeRect(-68, -48, 136, 70);
      ctx.fillStyle = C.paper;
      for (let i = 0; i < Math.min(3, Math.max(1, milestones)); i++) {
        const x = -53 + i * 39;
        ctx.save();
        ctx.translate(x, -35 + (i % 2) * 5);
        ctx.rotate((i - 1) * 0.04);
        ctx.fillRect(0, 0, 34, 42);
        ctx.fillStyle = i === 0 ? C.red : C.teal;
        ctx.fillRect(5, 8, 24, 3);
        ctx.fillStyle = "#a6997b";
        ctx.fillRect(5, 17, 20, 2);
        ctx.fillRect(5, 23, 16, 2);
        ctx.restore();
        ctx.fillStyle = C.paper;
      }
      if (villageStatusRef.current.completedMilestones > 0) {
        ctx.fillStyle = C.red;
        ctx.fillRect(54, -60, 22, 10);
        ctx.beginPath();
        ctx.moveTo(54, -50);
        ctx.lineTo(65, -42);
        ctx.lineTo(76, -50);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = C.ink;
      ctx.font = 'bold 12px "Noto Sans KR", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("마을 게시판", 0, 38);
      ctx.restore();
    }

    function drawMailbox(t) {
      const count = unreadRef.current;
      ctx.save();
      ctx.translate(MAILBOX.x, MAILBOX.y);
      ctx.fillStyle = "rgba(36,31,24,0.12)";
      ctx.beginPath();
      ctx.ellipse(0, 34, 30, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#755434";
      ctx.fillRect(-3, 2, 6, 33);
      ctx.fillStyle = count > 0 ? C.red : "#9a7442";
      ctx.strokeStyle = C.redDeep;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-23, -23, 46, 31, 9);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#633f27";
      ctx.fillRect(13, -14, 10, 4);
      if (count > 0) {
        const lift = Math.sin(t * 5) * 1.5;
        ctx.fillStyle = C.paper;
        ctx.fillRect(-13, -31 - lift, 26, 16);
        ctx.strokeRect(-13, -31 - lift, 26, 16);
        ctx.strokeStyle = "#b9a982";
        ctx.beginPath();
        ctx.moveTo(-13, -31 - lift);
        ctx.lineTo(0, -21 - lift);
        ctx.lineTo(13, -31 - lift);
        ctx.stroke();
        ctx.fillStyle = C.gold;
        ctx.fillRect(25, -35, 3, 28);
        ctx.fillStyle = C.red;
        ctx.beginPath();
        ctx.moveTo(28, -35);
        ctx.lineTo(45, -30);
        ctx.lineTo(28, -25);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    function drawGarden() {
      const stage = villageStatusRef.current.seedStage;
      ctx.save();
      ctx.translate(GARDEN.x, GARDEN.y);
      ctx.fillStyle = "#987044";
      ctx.strokeStyle = "#6f5032";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-78, -24, 156, 56, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#6d5434";
      ctx.beginPath();
      ctx.roundRect(-69, -15, 138, 38, 8);
      ctx.fill();
      const sprouts = stage === 0 ? 0 : stage === 1 ? 2 : 5;
      for (let i = 0; i < sprouts; i++) {
        const x = -48 + i * 24;
        ctx.strokeStyle = C.greenDeep;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, 10);
        ctx.lineTo(x, -8 - (i % 2) * 5);
        ctx.stroke();
        ctx.fillStyle = C.green;
        ctx.beginPath();
        ctx.ellipse(x - 5, -8, 7, 4, -0.5, 0, Math.PI * 2);
        ctx.ellipse(x + 5, -11, 7, 4, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = C.paper;
      ctx.strokeStyle = "#6f5032";
      ctx.fillRect(82, -13, 46, 24);
      ctx.strokeRect(82, -13, 46, 24);
      ctx.fillStyle = C.ink;
      ctx.font = '10px "Noto Sans KR", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("목표 씨앗", 105, 3);
      ctx.restore();
    }

    function drawArchive() {
      const stage = villageStatusRef.current.archive.bookStage;
      const openBook = villageStatusRef.current.archive.hasWeeklyReview;
      ctx.save();
      ctx.translate(ARCHIVE.x, ARCHIVE.y);
      ctx.fillStyle = "rgba(36,31,24,0.12)";
      ctx.beginPath();
      ctx.ellipse(0, 48, 64, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#efe4ca";
      ctx.strokeStyle = "#9c8257";
      ctx.lineWidth = 2;
      ctx.fillRect(-54, -33, 108, 80);
      ctx.strokeRect(-54, -33, 108, 80);
      ctx.fillStyle = "#766041";
      ctx.fillRect(-42, -20, 84, 4);
      ctx.fillRect(-42, 10, 84, 4);
      const books = stage === 0 ? 0 : stage === 1 ? 4 : 8;
      const colors = [C.red, C.teal, C.goldDeep, "#735c87"];
      for (let i = 0; i < books; i++) {
        const shelfY = i < 4 ? -17 : 13;
        const x = -37 + (i % 4) * 18;
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(x, shelfY - 19, 12, 19);
      }
      if (openBook) {
        ctx.fillStyle = C.paper;
        ctx.beginPath();
        ctx.moveTo(-22, -45);
        ctx.quadraticCurveTo(-8, -52, 0, -43);
        ctx.quadraticCurveTo(8, -52, 22, -45);
        ctx.lineTo(20, -31);
        ctx.quadraticCurveTo(8, -37, 0, -30);
        ctx.quadraticCurveTo(-8, -37, -20, -31);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = C.ink;
      ctx.font = 'bold 11px "Noto Sans KR", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("기록관", 0, 62);
      ctx.restore();
    }

    function drawSquareDetails(t) {
      const status = villageStatusRef.current;
      if (status.sharedThisWeek >= 5) {
        for (const [x, y] of [[POND.x - 55, POND.y - 15], [POND.x + 45, POND.y + 24]]) {
          ctx.fillStyle = "#708e55";
          ctx.beginPath();
          ctx.ellipse(x, y, 17, 8, 0.1, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#c88387";
          ctx.beginPath();
          ctx.arc(x, y - 5, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (status.bothActiveDays >= 3) {
        ctx.fillStyle = C.ink;
        ctx.fillRect(POND.x - 208, POND.y - 58, 5, 48);
        ctx.fillRect(POND.x + 203, POND.y - 58, 5, 48);
        const glow = status.bothActiveToday ? 0.75 + Math.sin(t * 3) * 0.12 : 0;
        for (const x of [POND.x - 206, POND.x + 206]) {
          ctx.fillStyle = status.bothActiveToday ? `rgba(242,201,109,${glow})` : "#b7aa8e";
          ctx.beginPath();
          ctx.arc(x, POND.y - 62, 9, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    function drawChar(ch, bodyCol, level, name, t, bubble) {
      const { x, y } = ch;
      const bob = ch.moving ? Math.sin(ch.phase) * 2.5 : Math.sin(t * 2) * 1.2;
      const accCol = bodyCol === C.red ? C.goldDeep : C.red;
      ctx.save();
      ctx.translate(x, y);
      // 그림자
      ctx.fillStyle = "rgba(36,31,24,0.16)";
      ctx.beginPath();
      ctx.ellipse(0, 4, 14, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // 발
      ctx.fillStyle = C.ink;
      const step = ch.moving ? Math.sin(ch.phase) * 4 : 0;
      ctx.beginPath();
      ctx.ellipse(-6 + step, 2, 4, 3, 0, 0, Math.PI * 2);
      ctx.ellipse(6 - step, 2, 4, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.translate(0, -14 + bob);
      // 망토 (Lv.7)
      if (level >= 7) {
        ctx.fillStyle = accCol;
        ctx.beginPath();
        ctx.moveTo(-13, -6);
        ctx.quadraticCurveTo(-20 - ch.fx * 4, 10 + Math.sin(t * 6) * 2, -10, 16);
        ctx.lineTo(10, 16);
        ctx.quadraticCurveTo(20 - ch.fx * 4, 10 - Math.sin(t * 6) * 2, 13, -6);
        ctx.closePath();
        ctx.fill();
      }
      // 몸통
      ctx.fillStyle = bodyCol;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.arc(-5, -6, 6, 0, Math.PI * 2);
      ctx.fill();
      // 목도리 (Lv.5)
      if (level >= 5) {
        ctx.strokeStyle = accCol;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 8, 12, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      }
      // 얼굴
      const ex = ch.fx * 4;
      const blink = Math.sin(t * 1.7) > 0.97;
      ctx.fillStyle = "#fdf6e8";
      if (blink) {
        ctx.strokeStyle = "#fdf6e8";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(ex - 7, -3);
        ctx.lineTo(ex - 3, -3);
        ctx.moveTo(ex + 3, -3);
        ctx.lineTo(ex + 7, -3);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(ex - 5, -3, 2.6, 0, Math.PI * 2);
        ctx.arc(ex + 5, -3, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.ink;
        ctx.beginPath();
        ctx.arc(ex - 5 + ch.fx, -3, 1.3, 0, Math.PI * 2);
        ctx.arc(ex + 5 + ch.fx, -3, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.arc(ex - 9, 2, 2.4, 0, Math.PI * 2);
      ctx.arc(ex + 9, 2, 2.4, 0, Math.PI * 2);
      ctx.fill();
      // 머리 장식: 왕관(10) > 밀짚모자(3) > 새싹(2)
      if (level >= 10) {
        ctx.fillStyle = C.gold;
        ctx.beginPath();
        ctx.moveTo(-9, -15);
        ctx.lineTo(-9, -24);
        ctx.lineTo(-4.5, -18);
        ctx.lineTo(0, -26);
        ctx.lineTo(4.5, -18);
        ctx.lineTo(9, -24);
        ctx.lineTo(9, -15);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = C.red;
        ctx.beginPath();
        ctx.arc(0, -19, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (level >= 3) {
        ctx.fillStyle = C.gold;
        ctx.beginPath();
        ctx.ellipse(0, -13, 15, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -15, 9, Math.PI, 0);
        ctx.fill();
        ctx.strokeStyle = C.redDeep;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-9, -16);
        ctx.lineTo(9, -16);
        ctx.stroke();
      } else if (level >= 2) {
        ctx.strokeStyle = C.greenDeep;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -15);
        ctx.quadraticCurveTo(1, -19, 0, -22);
        ctx.stroke();
        ctx.fillStyle = C.green;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(side * 4, -22, 4.5, 2.6, side * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      // 이름표
      ctx.font = '11px "Noto Sans KR", sans-serif';
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(251,245,231,0.92)";
      const label = `Lv.${level} ${name}`;
      ctx.strokeText(label, x, y - 48 + bob);
      ctx.fillStyle = C.ink;
      ctx.fillText(label, x, y - 48 + bob);
      // 말풍선
      if (bubble && bubble.until > t) {
        ctx.font = '12px "Noto Sans KR", sans-serif';
        const w = ctx.measureText(bubble.text).width + 18;
        const bx = x;
        const by = y - 72 + bob;
        ctx.fillStyle = "rgba(253,246,232,0.96)";
        ctx.strokeStyle = "#c9b98c";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(bx - w / 2, by - 20, w, 24, 8);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bx - 4, by + 4);
        ctx.lineTo(bx + 4, by + 4);
        ctx.lineTo(bx, by + 10);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = C.ink;
        ctx.textAlign = "center";
        ctx.fillText(bubble.text, bx, by - 3);
      }
    }

    function draw(t) {
      ctx.clearRect(0, 0, vw, vh);
      ctx.save();
      ctx.translate(-cam.x, -cam.y);

      // 바닥 — 지금 시각의 땅빛
      const air = PHASE_AIR[skyPhase().key] || PHASE_AIR.night;
      ctx.fillStyle = air.ground;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      ctx.fillStyle = air.dot;
      for (let gx = 40; gx < WORLD_W; gx += 90) {
        for (let gy = 40; gy < WORLD_H; gy += 90) {
          const r = mulberry32(gx * 31 + gy);
          ctx.beginPath();
          ctx.arc(gx + r() * 40, gy + r() * 40, 1.5 + r() * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // 울타리 (월드 경계)
      ctx.strokeStyle = "#c9b98c";
      ctx.lineWidth = 3;
      ctx.strokeRect(12, 12, WORLD_W - 24, WORLD_H - 24);

      // 길
      ctx.strokeStyle = air.path;
      ctx.lineWidth = 26;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(HOUSE_ME.x, HOUSE_ME.y + 60);
      ctx.quadraticCurveTo(WORLD_W / 2, HOUSE_ME.y + 150, HOUSE_FR.x, HOUSE_FR.y + 60);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(WORLD_W / 2, HOUSE_ME.y + 105);
      ctx.quadraticCurveTo(WORLD_W / 2 - 60, 500, POND.x - 40, POND.y - POND.ry - 30);
      ctx.stroke();

      // 연못
      ctx.fillStyle = C.pond;
      ctx.beginPath();
      ctx.ellipse(POND.x, POND.y, POND.rx, POND.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.pondIn;
      ctx.beginPath();
      ctx.ellipse(POND.x - 10, POND.y - 6, POND.rx * 0.72, POND.ry * 0.68, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const rr = 18 + ((t * 14 + i * 26) % 78);
        ctx.globalAlpha = Math.max(0, 1 - rr / 78) * 0.6;
        ctx.beginPath();
        ctx.ellipse(POND.x + 20, POND.y + 8, rr, rr * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      drawSquareDetails(t);
      drawBoard();
      drawMailbox(t);
      drawGarden();
      drawArchive();

      // y 정렬해서 장식/집/캐릭터 그리기
      const items = [];
      for (const d of decors) items.push({ y: d.y, kind: "decor", d });
      items.push({ y: HOUSE_ME.y + 45, kind: "houseMe" });
      items.push({ y: HOUSE_FR.y + 45, kind: "houseFr" });
      items.push({ y: player.y, kind: "player" });
      if (otherRef.current) items.push({ y: friend.y, kind: "friend" });
      items.sort((a, b) => a.y - b.y);

      for (const it of items) {
        if (it.kind === "decor") {
          const d = it.d;
          let s = 0.8 + d.v * 0.5;
          const st = spawnTimes.get(d.i);
          if (st !== undefined && t - st < 0.6) s *= easeOutBack(Math.min(1, (t - st) / 0.6));
          if (d.kind === "tree") drawTree(d.x, d.y, d.v, s);
          else if (d.kind === "mushroom") drawMushroom(d.x, d.y, s);
          else if (d.kind === "grass") drawGrass(d.x, d.y, s);
          else drawFlower(d.x, d.y, d.v, s);
        } else if (it.kind === "houseMe") {
          drawHouse(HOUSE_ME, C.red, myLevelRef.current, `${meName} 집`, villageStatusRef.current.mine);
        } else if (it.kind === "houseFr") {
          drawHouse(
            HOUSE_FR,
            C.teal,
            frLevelRef.current,
            otherRef.current ? `${otherRef.current} 집` : "친구 기다리는 중…",
            villageStatusRef.current.friend
          );
        } else if (it.kind === "player") {
          drawChar(player, C.red, myLevelRef.current, meName, t, playerBubble);
        } else if (it.kind === "friend") {
          drawChar(friend, C.teal, frLevelRef.current, otherRef.current, t, friendBubble);
        }
      }

      // 파티클
      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.restore();

      // 시간대별 공기 — 오늘 화면 히어로와 같은 하늘 아래
      ctx.fillStyle = air.tint;
      ctx.fillRect(0, 0, vw, vh);
      if (air.firefly > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 12; i++) {
          const r = mulberry32(i * 137);
          const fx = ((r() * WORLD_W + Math.sin(t * 0.6 + i) * 60 - cam.x) % (vw + 80)) - 40;
          const fy = ((r() * WORLD_H + Math.cos(t * 0.5 + i * 2) * 40 - cam.y) % (vh + 80)) - 40;
          const glow = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.4 + i * 1.7));
          ctx.fillStyle = `rgba(246, 220, 130, ${0.5 * glow * air.firefly})`;
          ctx.beginPath();
          ctx.arc(fx, fy, 2 + glow * 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    let prev = performance.now();
    function frame(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      update(dt, now / 1000);
      draw(now / 1000);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
    <Suspense fallback={<div className="village3d village3d-loading" />}>
      <Village3D me={me} otherName={otherName} status={villageStatus} treeCount={treeCount} />
    </Suspense>
    <div className="village-wrap">
      <canvas ref={canvasRef} className="village-canvas" />
      <div className="village-hud">
        <button type="button" className="hud-card" onClick={() => { setXpTab("personal"); setXpOpen(true); }}>
          <div className="hud-name">
            {me} <span className="hud-level">Lv.{myLevel}</span>
          </div>
          <div className="hud-xpbar">
            <div className="hud-xpfill" style={{ width: `${Math.round((intoLevel / nextNeed) * 100)}%` }} />
          </div>
          <div className="hud-sub">
            다음 레벨까지 {nextNeed - intoLevel} XP
            {unlock && ` · Lv.${unlock[0]}에 ${unlock[1]} 획득`}
          </div>
        </button>
        {otherName && (
          <div className="hud-card hud-friend">
            <div className="hud-name">
              {otherName} <span className="hud-level">Lv.{frLevel}</span>
            </div>
            <div className="hud-sub">{frXP} XP</div>
          </div>
        )}
        <button type="button" className="hud-card hud-village" onClick={() => { setXpTab("village"); setXpOpen(true); }}>
          <div className="hud-name">우리 마을 <span className="hud-level">Lv.{villageSummary.level}</span></div>
          <div className="hud-xpbar village">
            <div className="hud-xpfill" style={{ width: `${Math.round((villageSummary.intoLevel / villageSummary.needed) * 100)}%` }} />
          </div>
          <div className="hud-sub">{villageSummary.xp} / {villageSummary.next} XP</div>
        </button>
      </div>
      {xpOpen && (
        <div className="xp-ledger" role="dialog" aria-label="XP 내역">
          <button type="button" className="xp-ledger-close" onClick={() => setXpOpen(false)} aria-label="XP 내역 닫기">×</button>
          <div className="xp-ledger-tabs">
            <button type="button" className={xpTab === "personal" ? "active" : ""} onClick={() => setXpTab("personal")}>내 XP</button>
            <button type="button" className={xpTab === "village" ? "active" : ""} onClick={() => setXpTab("village")}>마을 XP</button>
          </div>
          <ul>
            {xpHistory.map((event) => (
              <li key={event.id}><span>{event.label}</span><strong>+{event.xpAmount}</strong></li>
            ))}
            {xpHistory.length === 0 && <li className="empty">아직 쌓인 XP 기록이 없어요.</li>}
          </ul>
        </div>
      )}
      <div className="village-place-dock" aria-label="마을 장소">
        {[
          ["meHouse", "🏠", "내 집"],
          ["friendHouse", "🏡", otherName ? `${otherName} 집` : "친구 집"],
          ["board", "📌", "게시판"],
          ["mailbox", unread > 0 ? "💌" : "📭", "우체통"],
          ["garden", villageStatus.seedStage > 0 ? "🌱" : "🪴", "목표 씨앗"],
          ["square", villageStatus.bothActiveToday ? "🏮" : "🪷", "연못 광장"],
          ["archive", villageStatus.archive.bookStage > 0 ? "📚" : "🏛️", "기록관"],
        ].map(([key, icon, label]) => (
          <button
            key={key}
            type="button"
            className={location === key ? "selected" : ""}
            onClick={() => openLocation(key)}
            aria-label={`${label} 열기`}
          >
            <span aria-hidden="true">{icon}</span>
            <small>{label}</small>
            {key === "mailbox" && unread > 0 && <b>{Math.min(9, unread)}{unread > 9 ? "+" : ""}</b>}
          </button>
        ))}
      </div>
      <div className="village-hint">
        장소를 누르면 오늘의 상태를 먼저 볼 수 있어요 · 방향키·WASD 또는 드래그로 산책
      </div>
      <VillagePanel
        location={location}
        status={villageStatus}
        me={me}
        otherName={otherName}
        unread={unread}
        onClose={() => setLocation(null)}
        onNavigate={onNavigate}
        onPoke={onPoke}
        onCheer={onCheer}
        onAddProgress={onAddProgress}
        onSendMessage={onSendMessage}
        onStartMemo={onStartMemo}
        onEditMemo={onEditMemo}
        onDeleteMemo={onDeleteMemo}
      />
    </div>
    </>
  );
}
