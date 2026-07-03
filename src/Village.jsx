import { useEffect, useMemo, useRef } from "react";
import { computeXP, xpForLevel, levelOf, nextUnlock } from "./lib/xp.js";

// ---------- 월드 상수 ----------
const WORLD_W = 1400;
const WORLD_H = 1000;
const HOUSE_ME = { x: 320, y: 300 };
const HOUSE_FR = { x: 1080, y: 300 };
const POND = { x: 700, y: 680, rx: 150, ry: 90 };
const MAX_DECOR = 400;

const C = {
  ground: "#e6dbb8",
  groundDot: "rgba(36,31,24,0.045)",
  path: "#d9cba0",
  pond: "#8db8ae",
  pondIn: "#a8ccc3",
  ink: "#241f18",
  red: "#b53228",
  redDeep: "#8a241d",
  teal: "#2e6b5e",
  gold: "#d9a94a",
  goldDeep: "#a97a24",
  green: "#4a8f61",
  greenDeep: "#2e6b5e",
  paper: "#f8f2e2",
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
  return nearHouse(HOUSE_ME) || nearHouse(HOUSE_FR) || inPond;
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

export default function Village({ state, me, otherName }) {
  const canvasRef = useRef(null);
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
    const pointer = { active: false, x: 0, y: 0 };
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
    const onPointerDown = (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointer.active = true;
      const p = toWorld(e);
      pointer.x = p.x;
      pointer.y = p.y;
    };
    const onPointerMove = (e) => {
      if (!pointer.active) return;
      const p = toWorld(e);
      pointer.x = p.x;
      pointer.y = p.y;
    };
    const onPointerUp = () => (pointer.active = false);
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

    function drawHouse(h, roofCol, level, label) {
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
      ctx.fillStyle = "#cfe3dd";
      ctx.strokeStyle = "#8a6a3d";
      ctx.fillRect(-34, 2, 16, 14);
      ctx.strokeRect(-34, 2, 16, 14);
      ctx.fillRect(18, 2, 16, 14);
      ctx.strokeRect(18, 2, 16, 14);
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
      ctx.fillStyle = "rgba(36,31,24,0.65)";
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = "center";
      ctx.fillText(label, 0, 60);
      ctx.restore();
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
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(248,242,226,0.9)";
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

      // 바닥
      ctx.fillStyle = C.ground;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      ctx.fillStyle = C.groundDot;
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
      ctx.strokeStyle = C.path;
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
          drawHouse(HOUSE_ME, C.red, myLevelRef.current, `${meName} 집`);
        } else if (it.kind === "houseFr") {
          drawHouse(
            HOUSE_FR,
            C.teal,
            frLevelRef.current,
            otherRef.current ? `${otherRef.current} 집` : "친구 기다리는 중…"
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

      // 밤: 어두운 오버레이 + 반딧불이
      const hour = new Date().getHours();
      const night = hour >= 20 || hour < 6;
      if (night) {
        ctx.fillStyle = "rgba(24,32,58,0.30)";
        ctx.fillRect(0, 0, vw, vh);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 12; i++) {
          const r = mulberry32(i * 137);
          const fx = ((r() * WORLD_W + Math.sin(t * 0.6 + i) * 60 - cam.x) % (vw + 80)) - 40;
          const fy = ((r() * WORLD_H + Math.cos(t * 0.5 + i * 2) * 40 - cam.y) % (vh + 80)) - 40;
          const glow = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.4 + i * 1.7));
          ctx.fillStyle = `rgba(255, 224, 130, ${0.5 * glow})`;
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
    <div className="village-wrap">
      <canvas ref={canvasRef} className="village-canvas" />
      <div className="village-hud">
        <div className="hud-card">
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
        </div>
        {otherName && (
          <div className="hud-card hud-friend">
            <div className="hud-name">
              {otherName} <span className="hud-level">Lv.{frLevel}</span>
            </div>
            <div className="hud-sub">{frXP} XP</div>
          </div>
        )}
      </div>
      <div className="village-hint">
        방향키·WASD 또는 드래그로 이동 · 도장 1개 = 10 XP = 마을에 식물 하나 🌱 (지금 {decorCount}개)
      </div>
    </div>
  );
}
