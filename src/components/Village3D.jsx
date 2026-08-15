import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { skyPhase } from "../lib/sky.js";
import { reducedMotion } from "../lib/fx.js";

// 오늘의 마을 — 입체 디오라마.
//
// 장식이 아니라 상태판이다. 화면의 모든 불빛이 실제 기록에 묶여 있다.
//   등불 한 개  = 오늘의 매일 목표 한 개 (찍으면 그 등에 불이 들어온다)
//   내 집 창문  = 내가 오늘 뭔가 찍었는가
//   친구 집 창문 = 친구가 오늘 뭔가 찍었는가
//   나무        = 지금까지 쌓은 도장
//   하늘        = 지금 시각 (sky.js와 같은 하늘)
//
// 매일 여는 앱이므로 배터리를 먼저 생각한다:
// 화면에서 벗어나거나 탭이 숨겨지면 루프를 멈추고, 모션 최소화 설정이면 한 장만 그린다.

const C = {
  red: "#c03a2b",
  redDeep: "#94271b",
  teal: "#2f8577",
  tealDeep: "#1f5f55",
  gold: "#e0ab4c",
  paper: "#fbf5e7",
  ink: "#1d2138",
  green: "#4a9b6c",
  greenDeep: "#2f7d5c",
  wood: "#8a6a3d",
};

const MAX_LANTERNS = 10;
const MAX_TREES = 16;

// 시간대별 빛 — sky.js의 하늘과 같은 계조를 3D 조명으로 옮긴 값
const PHASE_LIGHT = {
  dawn: { hemi: 0.55, dir: 1.5, dirCol: 0xffc79a, ground: "#8d8570", amb: 0x3a3560, fog: 0.007 },
  day: { hemi: 1.15, dir: 2.6, dirCol: 0xfff3d6, ground: "#c9bf95", amb: 0x9fb6cc, fog: 0.005 },
  dusk: { hemi: 0.42, dir: 1.1, dirCol: 0xe08a4a, ground: "#6e5c47", amb: 0x3b2b4a, fog: 0.008 },
  night: { hemi: 0.30, dir: 0.8, dirCol: 0x9fb6ff, ground: "#2b3350", amb: 0x161c33, fog: 0.010 },
};

const lerp = (a, b, t) => a + (b - a) * t;

export default function Village3D({ me, otherName, status, treeCount = 0 }) {
  const hostRef = useRef(null);
  const dataRef = useRef({});

  // 하늘은 마운트 때 한 번 굳으면 안 된다 — 앱을 켜둔 채 저녁이 밤으로 넘어가는 일이 흔하다.
  // VillageBackdrop과 같은 주기로 시간대를 살피고, 바뀔 때만 씬을 다시 짓는다 (하루 4번).
  const [phaseKey, setPhaseKey] = useState(() => skyPhase().key);
  useEffect(() => {
    const id = setInterval(() => {
      const now = skyPhase().key;
      setPhaseKey((prev) => (prev === now ? prev : now));
    }, 60000);
    return () => clearInterval(id);
  }, []);

  // 루프가 항상 최신 상태를 읽도록 ref로 넘긴다 (씬을 다시 짓지 않는다)
  dataRef.current = { me, otherName, status, treeCount };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
    } catch {
      return undefined; // WebGL이 없으면 조용히 접는다 — 2D 마을은 그대로 돈다
    }
    if (!renderer.getContext()) return undefined;

    const still = reducedMotion();
    const phase = skyPhase();
    const L = PHASE_LIGHT[phase.key] || PHASE_LIGHT.night;

    let w = host.clientWidth || 640;
    let h = host.clientHeight || 360;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, w < 520 ? 1.5 : 2));
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block";

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(new THREE.Color(phase.sky[2]).getHex(), L.fog);

    const camera = new THREE.PerspectiveCamera(30, w / h, 0.5, 400);

    // ---------- 하늘 (sky.js의 4단 그라디언트를 그대로) ----------
    {
      const cv = document.createElement("canvas");
      cv.width = 8;
      cv.height = 256;
      const g = cv.getContext("2d").createLinearGradient(0, 0, 0, 256);
      phase.sky.forEach((c, i) => g.addColorStop(i / (phase.sky.length - 1), c));
      const cx = cv.getContext("2d");
      cx.fillStyle = g;
      cx.fillRect(0, 0, 8, 256);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(160, 24, 16),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false })
      );
      scene.add(dome);
    }

    // ---------- 조명 ----------
    scene.add(new THREE.HemisphereLight(new THREE.Color(phase.sky[1]).getHex(), L.amb, L.hemi));
    const key = new THREE.DirectionalLight(L.dirCol, L.dir);
    key.position.set(-14, 18, 10);
    scene.add(key);
    // 마당 전체를 덥히는 등불빛 — 개별 등마다 광원을 두지 않고 하나로 묶는다
    const yardGlow = new THREE.PointLight(0xffa451, 0, 26, 2);
    yardGlow.position.set(0, 4.2, 4.5);
    scene.add(yardGlow);

    const mat = (color, opts = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });
    const M = {
      soil: mat(L.ground),
      rim: mat(0x4a4230),
      stone: mat(0xb9ad8c),
      wood: mat(C.wood),
      wall: mat(C.paper),
      roofMe: mat(C.red, { roughness: 0.7 }),
      roofFr: mat(C.teal, { roughness: 0.7 }),
      trunk: mat(0x6b4f2e),
      leaf: mat(C.green),
      leafDeep: mat(C.greenDeep),
      pond: new THREE.MeshStandardMaterial({ color: C.teal, roughness: 0.18, metalness: 0.35 }),
    };

    // ---------- 땅 ----------
    const island = new THREE.Mesh(new THREE.CylinderGeometry(12, 11, 1.6, 56), M.soil);
    island.position.y = -0.8;
    scene.add(island);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(11.2, 8.4, 2.4, 56), M.rim);
    rim.position.y = -2.6;
    scene.add(rim);

    // ---------- 징검다리 (두 집을 잇는 길) ----------
    const pathCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-6.2, 0, 2.2),
      new THREE.Vector3(-2.5, 0, 4.0),
      new THREE.Vector3(2.5, 0, 4.0),
      new THREE.Vector3(6.2, 0, 2.2),
    ]);
    for (let i = 0; i <= 11; i++) {
      const p = pathCurve.getPointAt(i / 11);
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.16, 8), M.stone);
      s.position.set(p.x, 0.06, p.z);
      s.rotation.y = i * 0.7;
      scene.add(s);
    }

    // ---------- 집 ----------
    function house(x, z, roofMat, mine) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.1, 2.9), M.wall);
      body.position.y = 1.05;
      g.add(body);
      const base = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.36, 3.3), M.stone);
      base.position.y = 0.18;
      g.add(base);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.05, 1.5, 4), roofMat);
      roof.position.y = 2.85;
      roof.rotation.y = Math.PI / 4;
      g.add(roof);
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.2, 0.24), M.wood);
      ridge.position.y = 2.2;
      g.add(ridge);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.1), M.wood);
      door.position.set(0, 0.7, 1.47);
      g.add(door);
      // 창문 — 오늘 기척이 있으면 불이 들어온다
      const winMat = new THREE.MeshStandardMaterial({
        color: 0x2a2f45,
        emissive: new THREE.Color(0xffb35c),
        emissiveIntensity: 0,
        roughness: 0.5,
      });
      [-1.02, 1.02].forEach((wx) => {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.78), winMat);
        win.position.set(wx, 1.32, 1.46);
        g.add(win);
      });
      g.position.set(x, 0, z);
      g.userData.winMat = winMat;
      g.userData.mine = mine;
      scene.add(g);
      return g;
    }
    const houseMe = house(-6.2, 0.6, M.roofMe, true);
    const houseFr = house(6.2, 0.6, M.roofFr, false);

    // ---------- 연못 ----------
    {
      const pond = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.18, 40), M.pond);
      pond.position.set(0, 0.04, -6.2);
      scene.add(pond);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.16, 8, 40), M.stone);
      lip.position.set(0, 0.08, -6.2);
      lip.rotation.x = Math.PI / 2;
      scene.add(lip);
    }

    // ---------- 등불 = 오늘의 목표 ----------
    // 마당 앞쪽에 호를 그리며 늘어선다. i번째 등 = i번째 목표.
    const lanterns = [];
    for (let i = 0; i < MAX_LANTERNS; i++) {
      const g = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.5, 8), M.wood);
      post.position.y = 0.75;
      g.add(post);
      const capBot = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.62), M.wood);
      capBot.position.y = 1.5;
      g.add(capBot);
      const glowMat = new THREE.MeshStandardMaterial({
        color: 0x3b3524,
        emissive: new THREE.Color(0xffb15e),
        emissiveIntensity: 0,
        roughness: 0.6,
      });
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.54, 0.46), glowMat);
      glow.position.y = 1.83;
      g.add(glow);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.56, 0.34, 4), M.roofMe);
      cap.position.y = 2.26;
      cap.rotation.y = Math.PI / 4;
      g.add(cap);
      g.visible = false;
      g.userData = { glowMat, lit: 0 };
      scene.add(g);
      lanterns.push(g);
    }

    function layoutLanterns(n) {
      for (let i = 0; i < MAX_LANTERNS; i++) {
        const g = lanterns[i];
        g.visible = i < n;
        if (i >= n) continue;
        // 앞마당에 부채꼴로
        const t = n === 1 ? 0.5 : i / (n - 1);
        const a = lerp(-0.95, 0.95, t);
        g.position.set(Math.sin(a) * 7.2, 0, 6.4 + Math.cos(a) * 1.6);
        g.rotation.y = -a;
        g.scale.setScalar(1.45);
      }
    }

    // ---------- 나무 = 쌓인 도장 ----------
    const trees = [];
    for (let i = 0; i < MAX_TREES; i++) {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 0.9, 6), M.trunk);
      trunk.position.y = 0.45;
      g.add(trunk);
      const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.72, 1.3, 7), M.leafDeep);
      c1.position.y = 1.35;
      g.add(c1);
      const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.56, 1.0, 7), M.leaf);
      c2.position.y = 2.0;
      g.add(c2);
      // 섬 가장자리에 고리 모양으로, 집·마당은 피해서
      const a = (i / MAX_TREES) * Math.PI * 2 + 0.6;
      const r = 8.6 + ((i * 37) % 11) * 0.12;
      g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r * 0.72 - 1.2);
      g.scale.setScalar(0);
      g.userData = { grow: 0, seed: (i * 53) % 17 };
      g.visible = false;
      scene.add(g);
      trees.push(g);
    }

    // ---------- 달 · 별 (안개 밖) ----------
    let moon = null;
    let moonGlow = null;
    if (phase.moon) {
      moon = new THREE.Mesh(
        new THREE.SphereGeometry(2.6, 24, 24),
        new THREE.MeshBasicMaterial({ color: 0xe8eeff, fog: false })
      );
      moon.position.set(-26, 22, -58);
      scene.add(moon);
      const cv = document.createElement("canvas");
      cv.width = cv.height = 128;
      const cg = cv.getContext("2d").createRadialGradient(64, 64, 0, 64, 64, 64);
      cg.addColorStop(0, "rgba(200,220,255,.8)");
      cg.addColorStop(0.4, "rgba(150,180,255,.18)");
      cg.addColorStop(1, "rgba(0,0,0,0)");
      const cc = cv.getContext("2d");
      cc.fillStyle = cg;
      cc.fillRect(0, 0, 128, 128);
      moonGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: new THREE.CanvasTexture(cv),
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          fog: false,
        })
      );
      moonGlow.position.copy(moon.position);
      moonGlow.scale.setScalar(34);
      scene.add(moonGlow);
    }
    if (phase.star > 0) {
      const n = 260;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(Math.random() * 0.8 + 0.1);
        pos[i * 3] = 120 * Math.sin(ph) * Math.cos(th);
        pos[i * 3 + 1] = 120 * Math.cos(ph) + 10;
        pos[i * 3 + 2] = 120 * Math.sin(ph) * Math.sin(th);
      }
      const bg = new THREE.BufferGeometry();
      bg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      scene.add(
        new THREE.Points(
          bg,
          new THREE.PointsMaterial({
            color: 0xcfdcff,
            size: 1.0,
            sizeAttenuation: false,
            transparent: true,
            opacity: 0.5 * phase.star,
            depthWrite: false,
            fog: false,
          })
        )
      );
    }

    // ---------- 포스트 ----------
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.62, 0.7, 0.62);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    composer.setSize(w, h);

    // ---------- 입력 (포인터 시차) ----------
    const point = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e) => {
      const r = host.getBoundingClientRect();
      point.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      point.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const onLeave = () => {
      point.tx = 0;
      point.ty = 0;
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);

    // ---------- 루프 ----------
    let raf = 0;
    let running = false;
    let last = performance.now();
    let orbit = 0.45;
    let warm = 0; // 마당 등불빛 세기
    let perfectPulse = 0;

    function applyState(dt) {
      const d = dataRef.current;
      const st = d.status || {};
      const mine = st.mine || {};
      const friend = st.friend || null;

      const total = Math.min(MAX_LANTERNS, mine.totalToday || 0);
      const done = Math.min(total, mine.doneToday || 0);
      if (lanterns.__n !== total) {
        layoutLanterns(total);
        lanterns.__n = total;
      }

      let litSum = 0;
      for (let i = 0; i < total; i++) {
        const g = lanterns[i];
        const target = i < done ? 1 : 0;
        g.userData.lit = still ? target : lerp(g.userData.lit, target, 1 - Math.pow(0.004, dt));
        const v = g.userData.lit;
        litSum += v;
        // 불이 들어온 등만 미세하게 흔들린다
        const flick = v > 0.02 ? 1 + Math.sin(performance.now() * 0.005 + i * 2.1) * 0.06 : 1;
        g.userData.glowMat.emissiveIntensity = v * 2.6 * flick;
        g.position.y = v * 0.02;
      }

      // 창문 — 오늘 기척
      const meOn = mine.activeToday ? 1 : 0;
      const frOn = friend && friend.activeToday ? 1 : 0;
      houseMe.userData.winMat.emissiveIntensity = lerp(
        houseMe.userData.winMat.emissiveIntensity, meOn * 1.9, still ? 1 : 1 - Math.pow(0.01, dt)
      );
      houseFr.userData.winMat.emissiveIntensity = lerp(
        houseFr.userData.winMat.emissiveIntensity, frOn * 1.9, still ? 1 : 1 - Math.pow(0.01, dt)
      );

      // 나무 — 쌓인 도장 (6개마다 한 그루, 자라나며 등장)
      const wantTrees = Math.max(0, Math.min(MAX_TREES, Math.floor((d.treeCount || 0) / 6)));
      for (let i = 0; i < MAX_TREES; i++) {
        const g = trees[i];
        const target = i < wantTrees ? 1 : 0;
        if (target === 0 && g.userData.grow === 0) {
          g.visible = false;
          continue;
        }
        g.visible = true;
        g.userData.grow = still ? target : lerp(g.userData.grow, target, 1 - Math.pow(0.02, dt));
        const s = g.userData.grow;
        g.scale.set(s, s * (0.9 + Math.sin(g.userData.seed) * 0.12), s);
      }

      // 마당 등불빛 + 오늘 완주 표시
      const ratio = total > 0 ? litSum / total : 0;
      warm = still ? ratio : lerp(warm, ratio, 1 - Math.pow(0.05, dt));
      const perfect = total > 0 && done === total;
      perfectPulse = still
        ? (perfect ? 1 : 0)
        : lerp(perfectPulse, perfect ? 1 : 0, 1 - Math.pow(0.05, dt));
      yardGlow.intensity = warm * 34 + perfectPulse * 14;
      bloom.strength = 0.5 + warm * 0.34 + perfectPulse * 0.2;
      if (moonGlow) moonGlow.scale.setScalar(34 + perfectPulse * 10);
    }

    function frame(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      applyState(dt);

      // 아주 느린 시네마틱 선회 + 포인터 시차
      orbit += dt * 0.055;
      point.x = lerp(point.x, point.tx, 1 - Math.pow(0.01, dt));
      point.y = lerp(point.y, point.ty, 1 - Math.pow(0.01, dt));
      // 세로가 좁은 밴드라 넉넉히 뒤에서, 위에서 내려다본다
      const rad = 33;
      const a = orbit + point.x * 0.16;
      camera.position.set(
        Math.sin(a) * rad,
        16 + Math.sin(orbit * 0.7) * 0.9 - point.y * 1.8,
        Math.cos(a) * rad
      );
      camera.lookAt(0, 0.9 + perfectPulse * 0.2, 1.4);

      composer.render();
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (running || still) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    // 첫 장은 항상 그린다 (모션 최소화 설정이면 이것만)
    layoutLanterns(Math.min(MAX_LANTERNS, dataRef.current.status?.mine?.totalToday || 0));
    lanterns.__n = Math.min(MAX_LANTERNS, dataRef.current.status?.mine?.totalToday || 0);
    applyState(1);
    camera.position.set(Math.sin(orbit) * 33, 16, Math.cos(orbit) * 33);
    camera.lookAt(0, 0.9, 1.4);
    composer.render();

    // 화면 밖이거나 탭이 숨겨지면 멈춘다 — 매일 켜는 앱이라 배터리가 우선
    const io = new IntersectionObserver(
      ([e]) => (e.isIntersecting && document.visibilityState === "visible" ? start() : stop()),
      { threshold: 0.05 }
    );
    io.observe(host);
    const onVis = () => (document.visibilityState === "visible" ? start() : stop());
    document.addEventListener("visibilitychange", onVis);

    const ro = new ResizeObserver(() => {
      w = host.clientWidth || w;
      h = host.clientHeight || h;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
      bloom.setSize(w, h);
      if (!running) composer.render();
    });
    ro.observe(host);

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      composer.dispose?.();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const list = Array.isArray(o.material) ? o.material : [o.material];
          list.forEach((m) => {
            m.map?.dispose?.();
            m.dispose?.();
          });
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [phaseKey]);

  const mine = status?.mine || {};
  const total = mine.totalToday || 0;
  const done = mine.doneToday || 0;
  const caption =
    total === 0
      ? "오늘 켤 등이 아직 없어요"
      : done === total
        ? "등이 다 켜졌어요"
        : `등 ${total - done}개가 아직 꺼져 있어요`;

  return (
    <div className="village3d">
      <div className="village3d-canvas" ref={hostRef} />
      <div className="village3d-cap">
        <span className="village3d-phase">{skyPhase().label}</span>
        <span className="village3d-line">{caption}</span>
        <span className="village3d-count">
          {done} / {total}
        </span>
      </div>
    </div>
  );
}
