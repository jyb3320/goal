export function pastWeeklyReviews(reviews, owner, currentWeekStart) {
  return (reviews || [])
    .filter((review) => review.owner === owner && review.weekStart < currentWeekStart)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}
