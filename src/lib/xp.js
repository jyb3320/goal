// 경험치 / 레벨
// 서버에 따로 저장하지 않고 도장 기록에서 그대로 계산한다:
// 도장 1개 = 10 XP, 기간 목표 진행 = 수량당 2 XP, 완주 보너스 30 XP
// 컴팩션으로 지워진 옛 도장은 archive[user].stamps 집계로 XP가 유지된다.
export function computeXP(user, state) {
  const goals = state.goals.filter((g) => g.owner === user);
  const ids = new Set(goals.map((g) => g.id));
  const archived = state.archive?.[user]?.stamps || 0;
  let xp = (archived + state.checkins.filter((c) => ids.has(c.goalId)).length) * 10;
  for (const g of goals) {
    if (g.type !== "milestone") continue;
    const net = Math.max(
      0,
      state.progress.filter((p) => p.goalId === g.id).reduce((s, p) => s + p.amount, 0)
    );
    xp += Math.min(net, g.target) * 2;
    if (net >= g.target) xp += 30;
  }
  return xp;
}

export function xpForLevel(level) {
  return 25 * (level - 1) * level;
}

export function levelOf(xp) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  return level;
}

const UNLOCKS = [
  [2, "새싹 머리띠"],
  [3, "밀짚모자"],
  [5, "목도리"],
  [7, "망토"],
  [10, "왕관"],
];

export function nextUnlock(level) {
  return UNLOCKS.find(([lv]) => lv > level) || null;
}
