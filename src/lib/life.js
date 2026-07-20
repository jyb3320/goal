import { todayStr } from "./dates.js";

export const LIFE_DOMAINS = [
  { key: "health", icon: "體", label: "건강", hint: "체력·수면·식사" },
  { key: "work", icon: "業", label: "일과 커리어", hint: "일·직업·성과" },
  { key: "money", icon: "財", label: "돈", hint: "수입·지출·안전망" },
  { key: "relationships", icon: "緣", label: "가족과 관계", hint: "가족·친구·주변 사람" },
  { key: "love", icon: "愛", label: "사랑과 우정", hint: "가까운 관계의 깊이" },
  { key: "growth", icon: "學", label: "학습과 성장", hint: "배움·기술·사고" },
  { key: "mind", icon: "心", label: "정신 상태", hint: "감정·평온·자기 이해" },
  { key: "experience", icon: "遊", label: "여가와 경험", hint: "휴식·취미·새로운 경험" },
  { key: "contribution", icon: "共", label: "사회적 기여", hint: "타인과 세상에 남기는 것" },
];

export const LIFE_ITEM_KINDS = {
  project: { label: "프로젝트", hint: "끝이 있는 결과" },
  routine: { label: "루틴", hint: "계속 유지할 행동" },
  problem: { label: "해결할 문제", hint: "외면하지 않을 장애물" },
};

export function domainOf(key) {
  return LIFE_DOMAINS.find((domain) => domain.key === key) || null;
}

export function currentMonth() {
  return todayStr(0).slice(0, 7);
}

export function defaultSeasonDates() {
  const startDate = todayStr(0);
  const end = new Date(`${startDate}T00:00:00`);
  end.setDate(end.getDate() + 83);
  const endDate = [
    end.getFullYear(),
    String(end.getMonth() + 1).padStart(2, "0"),
    String(end.getDate()).padStart(2, "0"),
  ].join("-");
  return { startDate, endDate };
}
