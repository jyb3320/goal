// 시간대별 하늘 — 열 때마다 그 시각의 마을로 맞이한다.
// 단청 야경 아트 디렉션: 먹빛 남색 하늘 + 광물 안료(주홍·청록·황금) + 등불.

const PHASES = [
  {
    key: "dawn",
    label: "동트는 중",
    from: 5,
    sky: ["#232a4d", "#4b3f6b", "#a2647a", "#e0a07a"],
    hill: ["rgba(34,32,64,.72)", "rgba(26,24,52,.9)"],
    ground: "#1d1f38",
    glow: "rgba(240,180,120,.18)",
    star: 0.35,
    lantern: 0.55,
    firefly: 0,
    // y는 캔버스 높이 비율 — 헤드라인 아래에 뜨도록
    moon: { x: 0.84, y: 0.42, r: 15, alpha: 0.5 },
  },
  {
    key: "day",
    label: "한낮",
    from: 9,
    sky: ["#3f76b8", "#5f9ad0", "#8fc0e0", "#cfe4ee"],
    hill: ["rgba(58,96,120,.55)", "rgba(40,72,96,.72)"],
    ground: "#3f5a4a",
    glow: "rgba(255,240,200,.14)",
    star: 0,
    lantern: 0,
    firefly: 0,
    moon: null,
  },
  {
    key: "dusk",
    label: "해가 지는 중",
    from: 17,
    sky: ["#1a1f3d", "#2b2c50", "#6a3f61", "#d98a5a"],
    hill: ["rgba(30,28,58,.75)", "rgba(22,20,44,.9)"],
    ground: "#171a30",
    glow: "rgba(224,171,76,.16)",
    star: 0.55,
    lantern: 0.9,
    firefly: 0.7,
    moon: { x: 0.84, y: 0.4, r: 17, alpha: 0.85 },
  },
  {
    key: "night",
    label: "깊은 밤",
    from: 21,
    sky: ["#0b1024", "#131a38", "#1d2547", "#2a3358"],
    hill: ["rgba(18,22,46,.8)", "rgba(12,15,34,.94)"],
    ground: "#101427",
    glow: "rgba(224,171,76,.2)",
    star: 1,
    lantern: 1,
    firefly: 1,
    moon: { x: 0.84, y: 0.38, r: 18, alpha: 1 },
  },
];

export function skyPhase(date = new Date()) {
  const h = date.getHours();
  if (h >= 21 || h < 5) return PHASES[3];
  if (h >= 17) return PHASES[2];
  if (h >= 9) return PHASES[1];
  return PHASES[0];
}

// 진행 상황에 맞춘 인사말 — 잔소리 대신 장소로 부른다
export function villageGreeting(phase, { done, total, perfect }) {
  if (total === 0) return { hi: `${phase.label} · 두 사람의 마을`, line: "첫 씨앗을 심어볼까요." };
  if (perfect) {
    return { hi: `${phase.label} · 마을에 불이 다 켜졌어요`, line: "오늘 몫은 다 했어요. 마을이 환해요." };
  }
  const left = Math.max(0, total - done);
  const line =
    phase.key === "night"
      ? `${left}개만 더 켜면 오늘이 완성돼요.`
      : phase.key === "dawn"
        ? `오늘의 첫 등불을 켜볼까요.`
        : `등불 ${left}개가 아직 꺼져 있어요.`;
  return { hi: `${phase.label} · 두 사람의 마을`, line };
}
