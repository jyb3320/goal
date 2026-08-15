// 인생 회의의 기간 계산은 브라우저와 서버가 같은 기준을 써야 한다.
// 2026-08-17을 첫 회의 시작일로 삼고, 이후 5일씩 다음 기간을 만든다.
export const FIVE_DAY_REVIEW_ANCHOR = "2026-08-17";
export const FIVE_DAY_REVIEW_LENGTH = 5;

const DAY_MS = 86400000;

function dateValue(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey || "");
  if (!match) return NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function dateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

export function shiftReviewDate(dateKeyValue, days) {
  const value = dateValue(dateKeyValue);
  if (!Number.isFinite(value)) return "";
  return dateKey(value + days * DAY_MS);
}

export function fiveDayReviewPeriod(dateKeyValue = FIVE_DAY_REVIEW_ANCHOR) {
  const value = dateValue(dateKeyValue);
  const anchor = dateValue(FIVE_DAY_REVIEW_ANCHOR);
  const diffDays = Number.isFinite(value) ? Math.floor((value - anchor) / DAY_MS) : 0;
  const index = diffDays < 0 ? 0 : Math.floor(diffDays / FIVE_DAY_REVIEW_LENGTH);
  const start = shiftReviewDate(FIVE_DAY_REVIEW_ANCHOR, index * FIVE_DAY_REVIEW_LENGTH);
  const days = Array.from({ length: FIVE_DAY_REVIEW_LENGTH }, (_, offset) => shiftReviewDate(start, offset));
  return {
    start,
    end: days.at(-1),
    days,
    index,
    beforeAnchor: diffDays < 0,
  };
}

export function reviewPeriodOf(review) {
  if (review?.periodDays === FIVE_DAY_REVIEW_LENGTH || review?.cadence === "five-day") {
    const period = fiveDayReviewPeriod(review.weekStart);
    // 저장된 기준일이 앵커와 정확히 맞지 않는 과거 데이터도 보존한다.
    if (review.weekStart && review.weekStart !== period.start) {
      const days = Array.from({ length: FIVE_DAY_REVIEW_LENGTH }, (_, offset) => shiftReviewDate(review.weekStart, offset));
      return { start: review.weekStart, end: days.at(-1), days, index: period.index, beforeAnchor: false };
    }
    return period;
  }
  const start = review?.weekStart || "";
  const days = Array.from({ length: 7 }, (_, offset) => shiftReviewDate(start, offset));
  return { start, end: days.at(-1), days, index: 0, beforeAnchor: false };
}
