export const DOW = ["일", "월", "화", "수", "목", "금", "토"];

// 로컬 시간대 기준 날짜 (toISOString은 UTC라 새벽에 전날로 찍히는 버그가 있었음)
export function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return fmtDate(d);
}

export function last14() {
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(todayStr(-i));
  return days;
}

export function lastNSet(n) {
  const s = new Set();
  for (let i = 0; i < n; i++) s.add(todayStr(-i));
  return s;
}

export function dowOf(dateStr) {
  return DOW[new Date(dateStr + "T00:00:00").getDay()];
}

// 월요일 시작 주
export function weekDates(offsetWeeks = 0) {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow + offsetWeeks * 7);
  const days = [];
  for (let i = 0; i < 7; i++) {
    days.push(fmtDate(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export function computeStreak(goalId, checkinSet) {
  let streak = 0;
  let cursor = 0;
  if (!checkinSet.has(`${goalId}_${todayStr(0)}`)) cursor = -1;
  while (checkinSet.has(`${goalId}_${todayStr(cursor)}`)) {
    streak++;
    cursor--;
  }
  return streak;
}

// 주 N회 목표: 목표 회수를 채운 연속 주 수 (이번 주는 채웠을 때만 포함)
export function computeWeeklyStreak(goal, checkinSet) {
  let streak = 0;
  const countWeek = (off) =>
    weekDates(off).filter((d) => checkinSet.has(`${goal.id}_${d}`)).length;
  if (countWeek(0) >= goal.targetPerWeek) streak++;
  let offset = -1;
  while (countWeek(offset) >= goal.targetPerWeek) {
    streak++;
    offset--;
  }
  return streak;
}

export function ddayLabel(deadline) {
  if (!deadline) return null;
  const today = new Date(todayStr(0) + "T00:00:00");
  const end = new Date(deadline + "T00:00:00");
  const diff = Math.round((end - today) / 86400000);
  if (diff > 0) return `D-${diff}`;
  if (diff === 0) return "D-DAY";
  return `마감 +${-diff}일`;
}

export function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}
