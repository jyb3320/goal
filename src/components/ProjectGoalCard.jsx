import { domainOf } from "../lib/life.js";
import GoalMenu from "./GoalMenu.jsx";

export default function ProjectGoalCard({ goal, season, isMine, onToggleTask, onScheduleTask, onEdit, onAction, onDelete }) {
  const tasks = goal.subtasks || [];
  const done = tasks.filter((task) => task.done).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : goal.status === "completed" ? 100 : 0;
  return (
    <article className="goal-card project-goal-card">
      <header className="project-card-head">
        <div><span className="project-eyebrow">프로젝트 · {pct}%</span><h3>{goal.icon} {goal.title}</h3></div>
        {isMine && <GoalMenu goal={goal} onEdit={onEdit} onAction={onAction} onDelete={onDelete} />}
      </header>
      <div className="milestone-bar"><div className="milestone-fill" style={{ width: `${pct}%` }} /></div>
      <div className="project-meta">
        <span>{done}/{tasks.length || 0}개 작업 완료</span>
        {goal.deadline && <span>{goal.deadline}</span>}
        {goal.domainKey && <span>{domainOf(goal.domainKey)?.label}</span>}
      </div>
      {season && <div className="goal-thread">旬 {season.title}에 기여</div>}
      {tasks.length === 0 ? <p className="mini-empty">수정 메뉴에서 하위 작업을 추가하세요.</p> : <ol className="project-task-list">
        {tasks.map((task) => <li key={task.id} className={task.done ? "done" : ""}>
          <label><input type="checkbox" checked={task.done} disabled={!isMine} onChange={(e) => onToggleTask(goal.id, task.id, e.target.checked)} /><span>{task.title}</span></label>
          {task.deadline && <time>{task.deadline.slice(5).replace("-", "/")}</time>}
          {isMine && !task.done && <div className="task-quick-actions"><button type="button" onClick={() => onScheduleTask(goal.id, task.id, "today")}>오늘</button><button type="button" onClick={() => onScheduleTask(goal.id, task.id, "week")}>이번 주</button></div>}
        </li>)}
      </ol>}
      {goal.completionSuggested && goal.status !== "completed" && <button className="project-complete-suggest" type="button" onClick={() => onAction(goal, "complete")}>모든 작업 완료 — 프로젝트도 완료할까요?</button>}
    </article>
  );
}

