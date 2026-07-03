// 게임 손맛: 효과음(웹오디오 합성 — 파일 없음), 진동, 파티클, 플로팅 텍스트

const COLORS = ["#b53228", "#d9a94a", "#2e6b5e", "#a97a24", "#f8f2e2"];

export function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// ---------- 효과음 ----------
let actx = null;

function audio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!actx) actx = new AC();
  // 모바일은 사용자 제스처 전까지 suspended — 클릭 핸들러에서 호출되므로 여기서 깨운다
  if (actx.state === "suspended") actx.resume();
  return actx;
}

// 도장 "쿵" — 낮은 사인파 피치 드롭 + 짧은 종이 노이즈
export function stampSound() {
  try {
    const ctx = audio();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(170, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.12);
    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.18);

    const len = Math.floor(ctx.sampleRate * 0.04);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const ng = ctx.createGain();
    ng.gain.value = 0.12;
    src.connect(ng).connect(ctx.destination);
    src.start(t);
  } catch {
    /* 소리는 못 나도 앱은 계속 */
  }
}

// 레벨업/달성 — 골든 아르페지오
export function fanfareSound() {
  try {
    const ctx = audio();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const t = t0 + i * 0.09;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  } catch {
    /* noop */
  }
}

// ---------- 햅틱 ----------
export function vibrate(pattern = 15) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* noop */
  }
}

// ---------- 파티클 (풀스크린 오버레이 캔버스 하나 재사용) ----------
let canvas = null;
let cctx = null;
let parts = [];
let raf = 0;
let lastT = 0;

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:999";
  document.body.appendChild(canvas);
  cctx = canvas.getContext("2d");
}

function sizeCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

function loop(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  cctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt / p.dur;
    if (p.life <= 0) {
      parts.splice(i, 1);
      continue;
    }
    p.vy += 640 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    cctx.save();
    cctx.globalAlpha = Math.min(1, p.life * 2);
    cctx.translate(p.x, p.y);
    cctx.rotate(p.rot);
    cctx.fillStyle = p.color;
    if (p.shape === 0) {
      cctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    } else {
      cctx.beginPath();
      cctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
      cctx.fill();
    }
    cctx.restore();
  }
  if (parts.length > 0) {
    raf = requestAnimationFrame(loop);
  } else {
    raf = 0;
    cctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
}

// 화면 좌표 (x, y)에서 팡 터지는 파티클
export function burst(x, y, count = 18) {
  if (reducedMotion()) return;
  ensureCanvas();
  sizeCanvas();
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 90 + Math.random() * 220;
    parts.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 140, // 위로 치솟는 맛
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 12,
      size: 4 + Math.random() * 5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      shape: Math.random() < 0.6 ? 0 : 1,
      life: 1,
      dur: 0.7 + Math.random() * 0.5,
    });
  }
  if (!raf) {
    lastT = performance.now();
    raf = requestAnimationFrame(loop);
  }
}

// 축하용 — 화면 곳곳에서 연달아 터짐
export function bigBurst() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  burst(w / 2, h * 0.32, 56);
  setTimeout(() => burst(w * 0.22, h * 0.28, 30), 130);
  setTimeout(() => burst(w * 0.78, h * 0.28, 30), 260);
}

// ---------- 플로팅 텍스트 ("+10 XP" 등) ----------
export function floatText(x, y, text, color) {
  if (reducedMotion()) return;
  const el = document.createElement("span");
  el.className = "fx-float";
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  if (color) el.style.color = color;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 950);
}
