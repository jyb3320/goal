import { goalKind, isGoalDueOn } from "../lib/goals.js";

export function selectTodayCommitments({ goals = [], checkins = [], me, today }) {
  const checkinByGoal = new Map(
    checkins
      .filter((checkin) => checkin.date === today)
      .map((checkin) => [checkin.goalId, checkin])
  );

  return goals
    .filter((goal) => {
      if (goal.owner !== me) return false;
      if (goal.status && goal.status !== "active") return false;
      if (goal.showOnBoard === false || goalKind(goal) === "milestone") return false;
      if (typeof goal.executionTime !== "string" || !goal.executionTime.trim()) return false;
      return goal.scheduledDate === today || isGoalDueOn(goal, today);
    })
    .map((goal) => {
      const checkin = checkinByGoal.get(goal.id);
      return {
        goal,
        executionTime: goal.executionTime.trim(),
        completed: Boolean(checkin),
        minimum: checkin?.min === true,
      };
    })
    .sort((a, b) => a.executionTime.localeCompare(b.executionTime) || a.goal.title.localeCompare(b.goal.title, "ko"));
}

export default function TodayCommitments({ goals, checkins, me, today }) {
  const commitments = selectTodayCommitments({ goals, checkins, me, today });
  if (commitments.length === 0) return null;

  const completedCount = commitments.filter((item) => item.completed).length;

  return (
    <section className="today-commitments" aria-labelledby="today-commitments-title">
      <header className="today-commitments-head">
        <div className="today-commitments-title">
          <span aria-hidden="true">約</span>
          <div>
            <h2 id="today-commitments-title">오늘의 실행 약속</h2>
            <p>시간을 정해둔 오늘의 목표를 순서대로 확인합니다.</p>
          </div>
        </div>
        <strong>{completedCount}/{commitments.length} 완료</strong>
      </header>

      <ol className="today-commitment-list">
        {commitments.map(({ goal, executionTime, completed, minimum }) => (
          <li className={`today-commitment ${completed ? "completed" : "pending"}`} key={goal.id}>
            <time dateTime={executionTime}>{executionTime}</time>
            <div className="today-commitment-body">
              <strong>{goal.title}</strong>
              {goal.cue && <span className="today-commitment-cue"><b>실행 신호</b>{goal.cue}</span>}
            </div>
            <span className={`today-commitment-status ${minimum ? "minimum" : completed ? "done" : "waiting"}`}>
              {minimum ? "최소 달성" : completed ? "완료" : "예정"}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
