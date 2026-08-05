import { useEffect, useRef } from "react";
import { skyPhase } from "../lib/sky.js";
import { reducedMotion } from "../lib/fx.js";

// 앱 전체의 배경이 되는 마을.
// 카드 안에 갇혀 있던 풍경을 화면 뒤로 꺼내, 모든 탭이 같은 세계 위에 뜨게 한다.
// - 하늘은 지금 시각을 따른다 (sky.js)
// - 스크롤하면 풍경이 느리게 따라오고(시차), 본문에 들어갈수록 장막이 짙어져 글이 읽힌다
// - 도장이 쌓이면 나무가 "자라나며" 등장한다 (스크롤 기믹이 아니라 상태 변화에 붙은 모션)
// - 두 사람은 PhotoDuo와 같은 실제 사진(원형으로 자름)으로 그려진다. 이미지가
//   아직 준비되지 않았거나 없으면 기존 색점 캐릭터로 조용히 대체된다.
const PORTRAITS = ["/people/portrait-1.jpeg", "/people/portrait-2.png"];
const VEIL_TRAVEL = 620; // 이 거리만큼 스크롤하면 장막이 최대치가 된다
const VEIL_MAX = 0.84;
// 화면 맨 위에서의 장막 농도는 하늘 밝기를 따라간다.
// 낮 하늘은 아래로 갈수록 밝아서(#cfe4ee) 크림색 글자가 그냥은 안 읽힌다.
const VEIL_MIN_BY_PHASE = { night: 0.16, dusk: 0.2, dawn: 0.36, day: 0.48 };
const TREE_GROW_MS = 900;

export default function VillageBackdrop({ done, total, treeCount, friendActiveToday, otherName, me, users = [] }) {
  const canvasRef = useRef(null);
  const dataRef = useRef({});
  const growRef = useRef({ from: treeCount, at: 0 });

  // 캔버스 루프가 항상 최신 값을 읽도록 ref로 넘긴다 (루프 재시작 없이 반영)
  if (dataRef.current.treeCount !== undefined && dataRef.current.treeCount !== treeCount) {
    growRef.current = { from: dataRef.current.treeCount, at: performance.now() };
  }
  dataRef.current = { done, total, treeCount, friendActiveToday, otherName, me, users };

  // 장막 농도 = 시간대별 최소값 → 스크롤할수록 짙어짐.
  //
  // 스크롤 구간은 CSS 스크롤 타임라인(animation-timeline: scroll())이 맡는다.
  // 컴포지터에서 돌아가므로 스크롤 중 메인 스레드를 전혀 건드리지 않는다.
  // 지원하지 않는 브라우저에서는 아래 JS 폴백이 같은 일을 한다.
  useEffect(() => {
    const nativeScrollTimeline =
      typeof CSS !== "undefined" && CSS.supports?.("animation-timeline: scroll()");

    const applyMin = () => {
      const min = VEIL_MIN_BY_PHASE[skyPhase().key] ?? 0.16;
      document.documentElement.style.setProperty("--backdrop-veil-min", min.toFixed(3));
      if (nativeScrollTimeline) return;
      const ratio = Math.min(1, window.scrollY / VEIL_TRAVEL);
      document.documentElement.style.setProperty(
        "--backdrop-veil",
        (min + (VEIL_MAX - min) * ratio).toFixed(3)
      );
    };

    applyMin();
    // 해가 바뀌는 시각(새벽·아침·저녁·밤)을 넘어가도 농도가 따라오게
    const tick = setInterval(applyMin, 60000);
    if (nativeScrollTimeline) return () => clearInterval(tick);

    window.addEventListener("scroll", applyMin, { passive: true });
    return () => {
      window.removeEventListener("scroll", applyMin);
      clearInterval(tick);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    const still = reducedMotion();
    let raf = 0;
    let w = 0;
    let h = 0;

    // 한 번만 로드하고 draw() 클로저에서 계속 재사용 — PhotoDuo와 같은 파일
    const portraitImgs = PORTRAITS.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });

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

    const easeOutBack = (t) => {
      const c = 1.70158;
      return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
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

    // img가 로드돼 있으면 실제 얼굴 사진을 원형으로 잘라 그린다.
    // 아직 안 실렸거나 없으면(로딩 중, 파일 없음) 기존 색점 캐릭터로 조용히 대체 —
    // 화면이 깨지는 대신 항상 뭔가는 서 있다.
    const character = (x, y, color, t, i, img) => {
      const bob = still ? 0 : Math.sin(t * 2 + i * 1.6) * 1.4;
      const hasPhoto = !!(img && img.complete && img.naturalWidth > 0);
      const r = hasPhoto ? 13 : 10;
      ctx.save();
      ctx.translate(x, y + bob);
      ctx.fillStyle = "rgba(0,0,0,.28)";
      ctx.beginPath();
      ctx.ellipse(0, 4, hasPhoto ? 11 : 9, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      if (hasPhoto) {
        // 정사각형으로 크롭 — 증명사진류는 얼굴이 위쪽에 있어서 이미지 중앙이
        // 아니라 위에서 8% 지점부터 자른다 (정수리가 안 잘리고 얼굴이 원 안에 옴).
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        const side = Math.min(iw, ih);
        const sx = (iw - side) / 2;
        const sy = Math.min(ih - side, ih * 0.08);
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, -8, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, sx, sy, side, side, -r, -8 - r, r * 2, r * 2);
        ctx.restore();
        // 누가 누군지 색으로 계속 구분되게 — 기존 빨강/청록 코드를 테두리로 유지
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, -8, r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, -8, r, 0, Math.PI * 2);
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
      }
      ctx.restore();
    };

    const draw = (nowMs) => {
      const t = nowMs / 1000;
      const {
        done: d,
        total: tot,
        treeCount: trees,
        friendActiveToday: fr,
        otherName: other,
        me: myName,
        users: userList = [],
      } = dataRef.current;
      // PhotoDuo와 같은 규칙: 먼저 들어온 사람이 portrait-1, 나중 사람이 portrait-2.
      // 그래서 누가 먼저 접속했든 "나"는 항상 내 사진으로, 상대는 항상 상대 사진으로 뜬다.
      const myIndex = userList.indexOf(myName);
      const otherIndex = myIndex === 0 ? 1 : myIndex === 1 ? 0 : -1;
      const myImg = myIndex >= 0 ? portraitImgs[myIndex] : undefined;
      const otherImg = otherIndex >= 0 ? portraitImgs[otherIndex] : undefined;
      const ph = skyPhase(); // 매 프레임 — 자정을 넘겨도 하늘이 따라간다
      ctx.clearRect(0, 0, w, h);

      // 시차: 스크롤을 내리면 풍경이 조금만 따라 올라온다
      const parallax = Math.min(90, window.scrollY * 0.12);
      // 마을 띠는 화면 아래쪽에 고정 — 위는 하늘이 넓게 남는다
      const groundY = h - Math.min(h * 0.34, 320) + parallax * 0.4;
      const roofY = groundY - Math.min(h * 0.06, 54);

      // 하늘
      const sky = ctx.createLinearGradient(0, -parallax, 0, h);
      sky.addColorStop(0, ph.sky[0]);
      sky.addColorStop(0.42, ph.sky[1]);
      sky.addColorStop(0.72, ph.sky[2]);
      sky.addColorStop(1, ph.sky[3]);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // 달 — 가장 느리게 움직인다 (제일 멀리 있으니까)
      if (ph.moon) {
        ctx.save();
        ctx.globalAlpha = ph.moon.alpha;
        ctx.shadowColor = "rgba(240,233,214,.7)";
        ctx.shadowBlur = 30;
        ctx.fillStyle = "#f2ecd6";
        ctx.beginPath();
        ctx.arc(w * ph.moon.x, h * 0.22 - parallax * 0.15, ph.moon.r * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 별
      if (ph.star > 0) {
        const rs = seeded(3);
        ctx.fillStyle = "#f0e9d6";
        for (let i = 0; i < 60; i += 1) {
          const sx = rs() * w;
          const sy = rs() * (h * 0.6) - parallax * 0.2;
          const tw = still ? 0.7 : 0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + i));
          ctx.globalAlpha = tw * ph.star * 0.8;
          ctx.fillRect(sx, sy, 1.7, 1.7);
        }
        ctx.globalAlpha = 1;
      }

      // 먼 능선 — 시차 중간 속도
      const hillY = groundY - Math.min(h * 0.16, 150);
      ctx.fillStyle = ph.hill[0];
      ctx.beginPath();
      ctx.moveTo(0, hillY);
      ctx.quadraticCurveTo(w * 0.25, hillY - h * 0.07, w * 0.5, hillY + h * 0.01);
      ctx.quadraticCurveTo(w * 0.78, hillY + h * 0.06, w, hillY - h * 0.02);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.fill();
      ctx.fillStyle = ph.hill[1];
      ctx.beginPath();
      ctx.moveTo(0, hillY + h * 0.06);
      ctx.quadraticCurveTo(w * 0.35, hillY, w * 0.62, hillY + h * 0.07);
      ctx.quadraticCurveTo(w * 0.85, hillY + h * 0.11, w, hillY + h * 0.05);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.fill();

      // 기와지붕 마을
      const bays = Math.max(6, Math.round(w / 190));
      const tones = ["#20233f", "#262a4a", "#20233f", "#2b2f52", "#20233f", "#262a4a"];
      const dayTones = ["#4a4f6e", "#565c7d", "#4a4f6e", "#5c6285", "#4a4f6e", "#565c7d"];
      const palette = ph.key === "day" ? dayTones : tones;
      for (let i = 0; i < bays; i += 1) {
        roof((i + 0.5) * (w / bays), roofY, (w / bays) * 1.15, Math.min(h * 0.1, 82), palette[i % palette.length]);
      }
      const glow = ctx.createLinearGradient(0, roofY - 6, 0, roofY + h * 0.12);
      glow.addColorStop(0, "rgba(224,171,76,0)");
      glow.addColorStop(1, ph.glow);
      ctx.fillStyle = glow;
      ctx.fillRect(0, roofY - 6, w, h * 0.14);

      // 땅
      ctx.fillStyle = ph.ground;
      ctx.fillRect(0, groundY, w, h - groundY);

      // 나무 — 쌓인 도장이 자란 것. 새로 생긴 나무는 솟아오르며 등장한다.
      const grow = growRef.current;
      const growT = grow.at ? Math.min(1, (nowMs - grow.at) / TREE_GROW_MS) : 1;
      const treeSeed = seeded(11);
      const maxTrees = Math.max(7, Math.round(w / 120));
      const shown = Math.min(maxTrees, trees);
      const shownBefore = Math.min(maxTrees, grow.from);
      for (let i = 0; i < shown; i += 1) {
        const tx = 24 + treeSeed() * (w - 48);
        const scaleBase = 0.9 + treeSeed() * 0.8;
        // 이번에 새로 생긴 나무만 자라는 연출
        const isNew = i >= shownBefore;
        const pop = isNew ? Math.max(0, easeOutBack(growT)) : 1;
        const scale = scaleBase * pop;
        if (scale <= 0.01) continue;
        const sway = still ? 0 : Math.sin(t * 0.8 + i) * 2;
        const base = groundY + 6;
        const th = 44 * scale;
        ctx.strokeStyle = "#4a3b28";
        ctx.lineWidth = 2.8 * scale;
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
        const lanternCount = Math.max(10, Math.round(w / 90));
        const lit = tot > 0 ? Math.round((d / tot) * lanternCount) : 0;
        for (let i = 0; i < lanternCount; i += 1) {
          const lx = 18 + rl() * (w - 36);
          const ly = roofY - 30 + rl() * 70;
          const size = 2.4 + rl() * 2;
          const on = i < lit;
          const flick = still ? 1 : 0.65 + 0.35 * Math.sin(t * 2.4 + i);
          ctx.save();
          if (on) {
            ctx.shadowColor = "rgba(246,205,118,.9)";
            ctx.shadowBlur = 18 * flick * ph.lantern;
            ctx.fillStyle = `rgba(246,205,118,${0.85 * flick * ph.lantern})`;
          } else {
            ctx.fillStyle = "rgba(180,170,150,.16)";
          }
          ctx.beginPath();
          ctx.arc(lx, ly, size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // 두 사람 — 친구가 오늘 움직였으면 또렷하게, 조용하면 흐리게
      character(w * 0.44, groundY + 14, "#d1402c", t, 0, myImg);
      if (other) {
        ctx.save();
        ctx.globalAlpha = fr ? 1 : 0.4;
        character(w * 0.56, groundY + 14, "#2f9e8f", t, 1, otherImg);
        ctx.restore();
      }

      // 반딧불이
      if (ph.firefly > 0 && !still) {
        const rf = seeded(23);
        for (let i = 0; i < 18; i += 1) {
          const baseX = rf() * w;
          const baseY = roofY - 80 + rf() * 150;
          const fx = baseX + Math.sin(t * 0.6 + i) * 18;
          const fy = baseY + Math.cos(t * 0.5 + i * 2) * 12;
          const gl = 0.35 + 0.5 * Math.abs(Math.sin(t * 1.6 + i));
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = `rgba(246,220,130,${gl * ph.firefly})`;
          ctx.beginPath();
          ctx.arc(fx, fy, 1.9, 0, Math.PI * 2);
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
  }, []);

  return (
    <div className="village-backdrop" aria-hidden="true">
      <canvas ref={canvasRef} className="village-backdrop-canvas" />
      <div className="village-backdrop-veil" />
    </div>
  );
}
