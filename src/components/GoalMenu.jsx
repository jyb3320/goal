import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MENU_WIDTH = 184;
const VIEWPORT_GAP = 8;

export default function GoalMenu({ goal, onEdit, onAction, onDelete }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 320, ready: false });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const choose = (action) => {
    setOpen(false);
    if (action === "edit") onEdit(goal);
    else if (action === "delete") onDelete(goal);
    else onAction(goal, action);
  };

  useLayoutEffect(() => {
    if (!open) return undefined;

    const placeMenu = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const measuredHeight = menuRef.current?.scrollHeight || 302;
      const below = window.innerHeight - rect.bottom - VIEWPORT_GAP;
      const above = rect.top - VIEWPORT_GAP;
      const openAbove = below < Math.min(measuredHeight, 240) && above > below;
      const maxHeight = Math.max(150, Math.min(measuredHeight, openAbove ? above : below));
      const top = openAbove
        ? Math.max(VIEWPORT_GAP, rect.top - Math.min(measuredHeight, maxHeight) - 6)
        : rect.bottom + 6;
      const left = Math.max(
        VIEWPORT_GAP,
        Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - VIEWPORT_GAP)
      );
      setPosition({ top, left, maxHeight, ready: true });
    };

    const closeOutside = (event) => {
      if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    placeMenu();
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const popover = open && createPortal(
    <div
      ref={menuRef}
      className="goal-menu-popover goal-menu-portal"
      role="menu"
      style={{
        top: position.top,
        left: position.left,
        maxHeight: position.maxHeight,
        visibility: position.ready ? "visible" : "hidden",
      }}
    >
      <button type="button" role="menuitem" onClick={() => choose("edit")}>수정</button>
      <button type="button" role="menuitem" onClick={() => choose(goal.status === "paused" ? "resume" : "pause")}>{goal.status === "paused" ? "다시 시작" : "일시정지"}</button>
      <button type="button" role="menuitem" className="danger" onClick={() => choose("delete")}>삭제</button>
    </div>,
    document.body
  );

  return (
    <div className="goal-menu">
      <button
        ref={triggerRef}
        type="button"
        className="goal-menu-trigger"
        onClick={() => {
          setPosition((current) => ({ ...current, ready: false }));
          setOpen((value) => !value);
        }}
        aria-label={`${goal.title} 메뉴`}
        aria-expanded={open}
        aria-haspopup="menu"
      >•••</button>
      {popover}
    </div>
  );
}
