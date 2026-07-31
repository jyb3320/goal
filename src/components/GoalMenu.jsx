import { useState } from "react";

export default function GoalMenu({ goal, onEdit, onAction, onDelete }) {
  const [open, setOpen] = useState(false);
  const choose = (action) => {
    setOpen(false);
    if (action === "edit") onEdit(goal);
    else if (action === "delete") onDelete(goal);
    else onAction(goal, action);
  };
  return (
    <div className="goal-menu">
      <button type="button" className="goal-menu-trigger" onClick={() => setOpen((value) => !value)} aria-label={`${goal.title} 메뉴`} aria-expanded={open}>•••</button>
      {open && <div className="goal-menu-popover">
        <button type="button" onClick={() => choose("edit")}>수정</button>
        <button type="button" onClick={() => choose("today")}>오늘로 보내기</button>
        <button type="button" onClick={() => choose("week")}>이번 주로 보내기</button>
        <button type="button" onClick={() => choose("duplicate")}>복제</button>
        <button type="button" onClick={() => choose(goal.status === "paused" ? "resume" : "pause")}>{goal.status === "paused" ? "다시 시작" : "일시정지"}</button>
        <button type="button" onClick={() => choose("complete")}>완료</button>
        <button type="button" className="danger" onClick={() => choose("delete")}>삭제</button>
      </div>}
    </div>
  );
}

