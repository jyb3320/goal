import { fiveDayReviewPeriod, reviewPeriodOf } from "./reviewPeriods.js";

export function pastWeeklyReviews(reviews, owner, currentWeekStart) {
  return (reviews || [])
    .filter((review) => review.owner === owner && review.weekStart < currentWeekStart)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

export function pastReviewPeriods(reviews, owner, currentPeriodStart) {
  return pastWeeklyReviews(reviews, owner, currentPeriodStart);
}

export { fiveDayReviewPeriod, reviewPeriodOf };
