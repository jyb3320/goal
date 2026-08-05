import { useEffect, useMemo, useState } from "react";
import { calendarItemsForDate, calendarMonthCells } from "../lib/calendar.js";
import { DOW, todayStr } from "../lib/dates.js";
import { repeatLabel } from "../lib/goals.js";

const OWNER_TONES = ["rust", "sage"];

function formatSelectedDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });
}

function EventDetail({ item, mine, onClose, onEdit, onCheer }) {
  useEffect(() => {
    const close = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  return (
    <div className="calendar-detail-layer" onClick={onClose}>
      <section className="calendar-detail" role="dialog" aria-modal="true" aria-labelledby="calendar-detail-title" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="calendar-detail-close" onClick={onClose} aria-label="일정 상세 닫기">×</button>
        <span className={`calendar-owner-mark tone-${item.tone}`}>{item.owner}</span>
        <h3 id="calendar-detail-title">{item.title}</h3>
        {item.parentTitle && <p className="calendar-parent">{item.parentTitle}의 하위 작업</p>}
        <dl>
          <div><dt>날짜</dt><dd>{formatSelectedDate(item.date)}</dd></div>
          {item.time && <div><dt>시간</dt><dd>{item.time}</dd></div>}
          <div><dt>상태</dt><dd>{item.done ? "완료" : item.deadline ? "마감 예정" : "예정"}</dd></div>
          <div><dt>반복</dt><dd>{repeatLabel(item.goal)}</dd></div>
        </dl>
        <div className="calendar-detail-actions">
          {mine
            ? <button type="button" className="primary" onClick={() => { onEdit(item.goal); onClose(); }}>목표 수정</button>
            : <button type="button" className="primary" onClick={() => { onCheer(item.goalId); onClose(); }}>응원 보내기</button>}
          <button type="button" onClick={onClose}>닫기</button>
        </div>
      </section>
    </div>
  );
}

export default function CalendarView({ state, me, onAdd, onEdit, onCheer }) {
  const today = todayStr(0);
  const [anchor, setAnchor] = useState(() => new Date(`${today.slice(0, 7)}-01T00:00:00`));
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedItem, setSelectedItem] = useState(null);
  const [visibleOwners, setVisibleOwners] = useState(() => new Set(state.users));

  useEffect(() => {
    setVisibleOwners((current) => new Set([...current, ...state.users]));
  }, [state.users]);

  const ownerTone = useMemo(() => Object.fromEntries(state.users.map((owner, index) => [owner, OWNER_TONES[index] || "rust"])), [state.users]);
  const cells = useMemo(() => calendarMonthCells(anchor.getFullYear(), anchor.getMonth()), [anchor]);
  const itemsByDate = useMemo(() => Object.fromEntries(cells.map((cell) => [
    cell.date,
    calendarItemsForDate(state.goals, cell.date, state.checkins)
      .filter((item) => visibleOwners.has(item.owner))
      .map((item) => ({ ...item, date: cell.date, tone: ownerTone[item.owner] })),
  ])), [cells, state.goals, state.checkins, visibleOwners, ownerTone]);
  const selectedItems = itemsByDate[selectedDate] || [];

  const moveMonth = (offset) => {
    setAnchor((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };
  const goToday = () => {
    setAnchor(new Date(`${today.slice(0, 7)}-01T00:00:00`));
    setSelectedDate(today);
  };
  const toggleOwner = (owner) => setVisibleOwners((current) => {
    const next = new Set(current);
    if (next.has(owner)) next.delete(owner);
    else next.add(owner);
    return next;
  });

  return (
    <div className="shared-calendar">
      <header className="calendar-hero">
        <div><p>둘의 시간을 한눈에</p><h2>공유 캘린더</h2><span>목표와 약속, 마감일을 겹쳐 보고 서로의 한 주를 미리 알아봅니다.</span></div>
        <button type="button" className="calendar-add" onClick={onAdd}>+ 일정이 있는 목표</button>
      </header>

      <section className="calendar-paper">
        <div className="calendar-toolbar">
          <div className="calendar-navigation">
            <button type="button" className="calendar-today" onClick={goToday}>오늘</button>
            <button type="button" onClick={() => moveMonth(-1)} aria-label="이전 달">‹</button>
            <button type="button" onClick={() => moveMonth(1)} aria-label="다음 달">›</button>
            <h3>{anchor.getFullYear()}년 {anchor.getMonth() + 1}월</h3>
          </div>
          <div className="calendar-owner-filters" aria-label="표시할 사용자">
            {state.users.map((owner, index) => (
              <label key={owner} className={`tone-${OWNER_TONES[index] || "rust"}`}>
                <input type="checkbox" checked={visibleOwners.has(owner)} onChange={() => toggleOwner(owner)} />
                <i aria-hidden="true" /> <span>{owner} 일정</span>
              </label>
            ))}
          </div>
        </div>

        <div className="calendar-layout">
          <div className="calendar-month" role="grid" aria-label={`${anchor.getFullYear()}년 ${anchor.getMonth() + 1}월 일정`}>
            {DOW.map((day, index) => <div key={day} className={`calendar-dow ${index === 0 ? "sunday" : index === 6 ? "saturday" : ""}`} role="columnheader">{day}</div>)}
            {cells.map((cell) => {
              const items = itemsByDate[cell.date] || [];
              return (
                <div key={cell.date} className={["calendar-day", cell.inMonth ? "" : "outside", cell.date === today ? "today" : "", cell.date === selectedDate ? "selected" : ""].filter(Boolean).join(" ")} role="gridcell">
                  <button type="button" className="calendar-date-button" onClick={() => setSelectedDate(cell.date)} aria-label={`${formatSelectedDate(cell.date)}, 일정 ${items.length}개`}>
                    <span>{cell.day}</span>{cell.date === today && <small>오늘</small>}
                  </button>
                  <div className="calendar-cell-events">
                    {items.slice(0, 3).map((item) => (
                      <button type="button" key={item.id} className={`calendar-event tone-${item.tone} ${item.done ? "done" : ""}`} onClick={() => { setSelectedDate(cell.date); setSelectedItem(item); }} title={`${item.owner} · ${item.title}`}>
                        {item.time && <time>{item.time}</time>}<span>{item.deadline ? "旗 " : ""}{item.title}</span>
                      </button>
                    ))}
                    {items.length > 3 && <button type="button" className="calendar-more" onClick={() => setSelectedDate(cell.date)}>+{items.length - 3}개</button>}
                  </div>
                </div>
              );
            })}
          </div>

          <aside className="calendar-agenda">
            <header><span>{selectedDate.slice(8)}일</span><div><h3>{formatSelectedDate(selectedDate)}</h3><p>두 사람 일정 {selectedItems.length}개</p></div></header>
            <div className="calendar-agenda-list">
              {selectedItems.length === 0 ? <p className="calendar-empty">정해진 일정이 없는 날이에요.<br />비워 둔 시간도 좋은 계획입니다.</p> : selectedItems.map((item) => (
                <button type="button" key={item.id} className={`calendar-agenda-item tone-${item.tone}`} onClick={() => setSelectedItem(item)}>
                  <i aria-hidden="true" />
                  <span><small>{item.owner}{item.parentTitle ? ` · ${item.parentTitle}` : ""}</small><strong>{item.title}</strong><em>{item.time || (item.deadline ? "마감일" : item.done ? "완료" : "종일")}</em></span>
                </button>
              ))}
            </div>
          </aside>
        </div>
      </section>

      {selectedItem && <EventDetail item={selectedItem} mine={selectedItem.owner === me} onClose={() => setSelectedItem(null)} onEdit={onEdit} onCheer={onCheer} />}
    </div>
  );
}
