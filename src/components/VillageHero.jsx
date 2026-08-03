import { useEffect, useMemo, useRef } from "react";
import { skyPhase, villageGreeting } from "../lib/sky.js";
import { reducedMotion } from "../lib/fx.js";

// 오늘 화면의 문 — 열면 그 시각의 마을에 도착한다.
// 도장 하나 = 등불 하나, 쌓인 기록 = 자라는 나무.
export default function VillageHero({
  me,
  otherName,
  done,
  total,
  perfect,
  level,
  xpPct,
  xpLeft,
  treeCount,
  friendActiveToday,
  onEnterVillage,
}) {
  const canvasRef = useRef(null);
  const dataRef = useRef({});
  const phase = useMemo(() => skyPhase(), []);
  const greeting = villageGreeting(phase, { done, total, perfect });

  // 캔버스 루프가 최신 값을 읽도록 ref로 넘긴다 (재시작 없이 반영)
  dataRef.current = { done, total, treeCount, friendActiveToday, phase };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    const still = reducedMotion();
    let raf = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // 결정적 난수 — 매 프레임 같은 배치
    const seeded = (seed) => () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    const roof = (x, y, rw, rh, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x - rw * 0.62, y);
      ctx.quadraticCurveTo(x - rw * 0.5, y - rh * 0.7, x, y - rh);
      ctx.quadraticCurveTo(x + rw * 0.5, y - rh * 0.7, x + rw * 0.62, y);
      ctx.quadraticCurveTo(x + rw * 0.3, y - rh * 0.12, x, y - rh * 0.16);
      ctx.quadraticCurveTo(x - rw * 0.3, y - rh * 0.12, x - rw * 0.62, y);
      ctx.closePath();
      ctx.fill();
    };

    const character = (x, y, color, t, i) => {
      const bob = still ? 0 : Math.sin(t * 2 + i * 1.6) * 1.4;
      ctx.save();
      ctx.translate(x, y + bob);
      ctx.fillStyle = "rgba(0,0,0,.28)";
      ctx.beginPath();
      ctx.ellipse(0, 4, 9, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, -8, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.22)";
      ctx.beginPath();
      ctx.arc(-4, -11, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fdf6e8";
      ctx.beginPath();
      ctx.arc(-3.6, -9, 1.9, 0, Math.PI * 2);
      ctx.arc(3.6, -9, 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#241a14";
      ctx.beginPath();
      ctx.arc(-3.6, -9, 0.95, 0, Math.PI * 2);
      ctx.arc(3.6, -9, 0.95, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const draw = (nowMs) => {
      const t = nowMs / 1000;
      const { done: d, total: tot, treeCount: trees, friendActiveToday: fr, phase: ph } = dataRef.current;
      ctx.clearRect(0, 0, w, h);

      // 하늘
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, ph.sky[0]);
      sky.addColorStop(0.42, ph.sky[1]);
      sky.addColorStop(0.72, ph.sky[2]);
      sky.addColorStop(1, ph.sky[3]);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // 달
      if (ph.moon) {
        ctx.save();
        ctx.globalAlpha = ph.moon.alpha;
        ctx.shadowColor = "rgba(240,233,214,.7)";
        ctx.shadowBlur = 24;
        ctx.fillStyle = "#f2ecd6";
        ctx.beginPath();
        ctx.arc(w * ph.moon.x, h * ph.moon.y, ph.moon.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 별
      if (ph.star > 0) {
        const rs = seeded(3);
        ctx.fillStyle = "#f0e9d6";
        for (let i = 0; i < 26; i += 1) {
          const sx = rs() * w;
          const sy = rs() * (h * 0.42);
          const tw = still ? 0.7 : 0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + i));
          ctx.globalAlpha = tw * ph.star * 0.8;
          ctx.fillRect(sx, sy, 1.6, 1.6);
        }
        ctx.globalAlpha = 1;
      }

      // 먼 능선
      ctx.fillStyle = ph.hill[0];
      ctx.beginPath();
      ctx.moveTo(0, h * 0.5);
      ctx.quadraticCurveTo(w * 0.25, h * 0.39, w * 0.5, h * 0.49);
      ctx.quadraticCurveTo(w * 0.78, h * 0.59, w, h * 0.47);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.fill();
      ctx.fillStyle = ph.hill[1];
      ctx.beginPath();
      ctx.moveTo(0, h * 0.6);
      ctx.quadraticCurveTo(w * 0.35, h * 0.51, w * 0.62, h * 0.61);
      ctx.quadraticCurveTo(w * 0.85, h * 0.67, w, h * 0.6);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.fill();

      // 기와지붕 마을
      const roofY = h * 0.72;
      const tones = ["#20233f", "#262a4a", "#20233f", "#2b2f52", "#20233f", "#262a4a"];
      const dayTones = ["#4a4f6e", "#565c7d", "#4a4f6e", "#5c6285", "#4a4f6e", "#565c7d"];
      const palette = ph.key === "day" ? dayTones : tones;
      for (let i = 0; i < 6; i += 1) {
        roof((i + 0.5) * (w / 6), roofY, (w / 6) * 1.15, h * 0.1, palette[i]);
      }
      const glow = ctx.createLinearGradient(0, roofY - 6, 0, roofY + h * 0.12);
      glow.addColorStop(0, "rgba(224,171,76,0)");
      glow.addColorStop(1, ph.glow);
      ctx.fillStyle = glow;
      ctx.fillRect(0, roofY - 6, w, h * 0.14);

      // 땅 — 하단 UI(카운트·XP)에 가리지 않게 위로 올린다
      const groundY = h * 0.74;
      ctx.fillStyle = ph.ground;
      ctx.fillRect(0, groundY, w, h - groundY);

      // 나무 — 쌓인 도장이 자란 것
      const treeSeed = seeded(11);
      const shown = Math.min(7, trees);
      for (let i = 0; i < shown; i += 1) {
        const tx = 24 + treeSeed() * (w - 48);
        const scale = 0.7 + treeSeed() * 0.6;
        const sway = still ? 0 : Math.sin(t * 0.8 + i) * 2;
        const base = groundY + 4;
        const th = 34 * scale;
        ctx.strokeStyle = "#4a3b28";
        ctx.lineWidth = 2.6 * scale;
        ctx.beginPath();
        ctx.moveTo(tx, base);
        ctx.lineTo(tx + sway * 0.4, base - th * 0.55);
        ctx.stroke();
        ctx.fillStyle = ph.key === "day" ? "#4a9b6c" : "#2f7d5c";
        for (let k = 0; k < 3; k += 1) {
          ctx.beginPath();
          ctx.ellipse(
            tx + sway + (k - 1) * 8 * scale,
            base - th * 0.62 - k * th * 0.16,
            14 * scale * 0.5,
            th * 0.4,
            0,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }

      // 등불 — 오늘 찍은 도장 수만큼 켜진다
      if (ph.lantern > 0) {
        const rl = seeded(7);
        const lanternCount = 10;
        const lit = tot > 0 ? Math.round((d / tot) * lanternCount) : 0;
        for (let i = 0; i < lanternCount; i += 1) {
          const lx = 18 + rl() * (w - 36);
          const ly = h * 0.5 + rl() * (h * 0.16);
          const size = 2 + rl() * 1.8;
          const on = i < lit;
          const flick = still ? 1 : 0.65 + 0.35 * Math.sin(t * 2.4 + i);
          ctx.save();
          if (on) {
            ctx.shadowColor = "rgba(246,205,118,.9)";
            ctx.shadowBlur = 14 * flick * ph.lantern;
            ctx.fillStyle = `rgba(246,205,118,${0.85 * flick * ph.lantern})`;
          } else {
            ctx.fillStyle = "rgba(180,170,150,.18)";
          }
          ctx.beginPath();
          ctx.arc(lx, ly, size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // 두 사람
      character(w * 0.44, groundY + 6, "#d1402c", t, 0);
      if (otherName) {
        ctx.save();
        ctx.globalAlpha = fr ? 1 : 0.45;
        character(w * 0.56, groundY + 6, "#2f9e8f", t, 1);
        ctx.restore();
      }

      // 반딧불이
      if (ph.firefly > 0 && !still) {
        const rf = seeded(23);
        for (let i = 0; i < 12; i += 1) {
          const baseX = rf() * w;
          const baseY = h * 0.4 + rf() * (h * 0.35);
          const fx = baseX + Math.sin(t * 0.6 + i) * 16;
          const fy = baseY + Math.cos(t * 0.5 + i * 2) * 10;
          const gl = 0.35 + 0.5 * Math.abs(Math.sin(t * 1.6 + i));
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = `rgba(246,220,130,${gl * ph.firefly})`;
          ctx.beginPath();
          ctx.arc(fx, fy, 1.7, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      if (!still) raf = requestAnimationFrame(draw);
    };

    resize();
    if (still) draw(0);
    else raf = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [otherName]);

  return (
    <section className={`village-hero phase-${phase.key}`} aria-label="오늘의 마을">
      <canvas ref={canvasRef} className="village-hero-canvas" aria-hidden="true" />
      <div className="village-hero-veil" aria-hidden="true" />

      <div className="village-hero-top">
        <p className="vh-hi">{greeting.hi}</p>
        <h2 className="vh-line">{greeting.line}</h2>
      </div>

      <div className="village-hero-bottom">
        <div className="vh-count" aria-label={`오늘 ${done}개 중 ${total}개 완료`}>
          <strong>{done}</strong>
          <span>/{total}</span>
          <em>{perfect ? "완" : "오늘"}</em>
        </div>

        <button type="button" className="vh-enter" onClick={onEnterVillage}>
          <span className="vh-lv">Lv.{level}</span>
          <span className="vh-xp">
            <span className="vh-xp-fill" style={{ width: `${xpPct}%` }} />
          </span>
          <span className="vh-enter-label">마을 들어가기 →</span>
        </button>
        <p className="vh-sub">
          다음 레벨까지 {xpLeft} XP
          {otherName ? ` · ${otherName} ${friendActiveToday ? "오늘 함께 있어요" : "아직 조용해요"}` : ""}
        </p>
      </div>
    </section>
  );
}
