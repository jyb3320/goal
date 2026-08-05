import { useEffect, useMemo, useState } from "react";
import { calendarItemsForDate, calendarMonthCells } from "../lib/calendar.js";
import { DOW, todayStr } from "../lib/dates.js";

const OWNER_TONES = ["rust", "sage"];

function formatSelectedDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });
}

function timeLabel(event) {
  if (event.allDay) return "종일";
  return event.endTime ? `${event.startTime}–${event.endTime}` : event.startTime;
}

function CalendarEventForm({ initial, selectedDate, onClose, onSave }) {
  const [draft, setDraft] = useState(() => ({
    title: initial?.title || "",
    date: initial?.date || selectedDate,
    allDay: initial?.allDay !== false,
    startTime: initial?.startTime || "09:00",
    endTime: initial?.endTime || "",
    note: initial?.note || "",
  }));
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const close = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    const ok = await onSave(draft);
    if (ok) onClose();
    else setSaving(false);
  };
  return (
    <div className="calendar-detail-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="calendar-event-form" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="calendar-form-title">
        <header><div><span>{initial ? "일정 다듬기" : "새 일정"}</span><h3 id="calendar-form-title">{initial ? "일정 수정" : "개인 일정 추가"}</h3></div><button type="button" onClick={onClose} aria-label="일정 입력 닫기">×</button></header>
        <label><span>일정 이름</span><input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="예: 병원 예약, 친구와 저녁" maxLength={120} /></label>
        <label><span>날짜</span><input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
        <label className="calendar-all-day"><input type="checkbox" checked={draft.allDay} onChange={(event) => setDraft({ ...draft, allDay: event.target.checked })} /><span>종일 일정</span></label>
        {!draft.allDay && <div className="calendar-time-pair"><label><span>시작</span><input type="time" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} /></label><label><span>종료</span><input type="time" value={draft.endTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value })} /></label></div>}
        <label><span>메모 <small>선택</small></span><textarea value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="장소나 준비할 것을 간단히 적어두세요." rows={3} maxLength={500} /></label>
        <footer><button type="button" onClick={onClose}>취소</button><button type="submit" className="primary" disabled={saving || !draft.title.trim() || !draft.date}>{saving ? "저장 중…" : initial ? "수정 저장" : "일정 추가"}</button></footer>
      </form>
    </div>
  );
}

function EventDetail({ event, mine, onClose, onEdit, onDelete }) {
  useEffect(() => {
    const close = (keyEvent) => keyEvent.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <div className="calendar-detail-layer" onClick={onClose}>
      <section className="calendar-detail" role="dialog" aria-modal="true" aria-labelledby="calendar-detail-title" onClick={(clickEvent) => clickEvent.stopPropagation()}>
        <button type="button" className="calendar-detail-close" onClick={onClose} aria-label="일정 상세 닫기">×</button>
        <span className={`calendar-owner-mark tone-${event.tone}`}>{event.owner}</span>
        <h3 id="calendar-detail-title">{event.title}</h3>
        <dl><div><dt>날짜</dt><dd>{formatSelectedDate(event.date)}</dd></div><div><dt>시간</dt><dd>{timeLabel(event)}</dd></div>{event.note && <div><dt>메모</dt><dd>{event.note}</dd></div>}</dl>
        <div className="calendar-detail-actions">
          {mine && <><button type="button" className="danger" onClick={() => onDelete(event)}>삭제</button><button type="button" className="primary" onClick={() => onEdit(event)}>수정</button></>}
          <button type="button" onClick={onClose}>닫기</button>
        </div>
      </section>
    </div>
  );
}

export default function CalendarView({ state, me, onAdd, onUpdate, onDelete }) {
  const today = todayStr(0);
  const [anchor, setAnchor] = useState(() => new Date(`${today.slice(0, 7)}-01T00:00:00`));
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [formEvent, setFormEvent] = useState(undefined);
  const [formOpen, setFormOpen] = useState(false);
  const [visibleOwners, setVisibleOwners] = useState(() => new Set(state.users));
  useEffect(() => setVisibleOwners((current) => new Set([...current, ...state.users])), [state.users]);

  const ownerTone = useMemo(() => Object.fromEntries(state.users.map((owner, index) => [owner, OWNER_TONES[index] || "rust"])), [state.users]);
  const cells = useMemo(() => calendarMonthCells(anchor.getFullYear(), anchor.getMonth()), [anchor]);
  const itemsByDate = useMemo(() => Object.fromEntries(cells.map((cell) => [cell.date, calendarItemsForDate(state.calendarEvents, cell.date).filter((event) => visibleOwners.has(event.owner)).map((event) => ({ ...event, tone: ownerTone[event.owner] }))])), [cells, state.calendarEvents, visibleOwners, ownerTone]);
  const selectedItems = itemsByDate[selectedDate] || [];
  const moveMonth = (offset) => setAnchor((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  const goToday = () => { setAnchor(new Date(`${today.slice(0, 7)}-01T00:00:00`)); setSelectedDate(today); };
  const toggleOwner = (owner) => setVisibleOwners((current) => { const next = new Set(current); if (next.has(owner)) next.delete(owner); else next.add(owner); return next; });
  const openNew = () => { setFormEvent(undefined); setFormOpen(true); };
  const editEvent = (event) => { setSelectedEvent(null); setFormEvent(event); setFormOpen(true); };
  const saveEvent = (draft) => formEvent ? onUpdate(formEvent.id, draft) : onAdd(draft);
  const deleteEvent = async (event) => { const ok = await onDelete(event.id); if (ok) setSelectedEvent(null); };

  return (
    <div className="shared-calendar">
      <header className="calendar-hero"><div><p>둘의 시간을 한눈에</p><h2>공유 캘린더</h2><span>약속과 외출, 중요한 개인 일정을 직접 적고 서로의 시간을 미리 알아봅니다.</span></div><button type="button" className="calendar-add" onClick={openNew}>+ 일정 추가</button></header>
      <section className="calendar-paper">
        <div className="calendar-toolbar"><div className="calendar-navigation"><button type="button" className="calendar-today" onClick={goToday}>오늘</button><button type="button" onClick={() => moveMonth(-1)} aria-label="이전 달">‹</button><button type="button" onClick={() => moveMonth(1)} aria-label="다음 달">›</button><h3>{anchor.getFullYear()}년 {anchor.getMonth() + 1}월</h3></div><div className="calendar-owner-filters" aria-label="표시할 사용자">{state.users.map((owner, index) => <label key={owner} className={`tone-${OWNER_TONES[index] || "rust"}`}><input type="checkbox" checked={visibleOwners.has(owner)} onChange={() => toggleOwner(owner)} /><i aria-hidden="true" /><span>{owner} 일정</span></label>)}</div></div>
        <div className="calendar-layout">
          <div className="calendar-month" role="grid" aria-label={`${anchor.getFullYear()}년 ${anchor.getMonth() + 1}월 일정`}>
            {DOW.map((day, index) => <div key={day} className={`calendar-dow ${index === 0 ? "sunday" : index === 6 ? "saturday" : ""}`} role="columnheader">{day}</div>)}
            {cells.map((cell) => { const items = itemsByDate[cell.date] || []; return <div key={cell.date} className={["calendar-day", cell.inMonth ? "" : "outside", cell.date === today ? "today" : "", cell.date === selectedDate ? "selected" : ""].filter(Boolean).join(" ")} role="gridcell" onClick={() => setSelectedDate(cell.date)}><button type="button" className="calendar-date-button" onClick={() => setSelectedDate(cell.date)} aria-label={`${formatSelectedDate(cell.date)}, 일정 ${items.length}개`}><span>{cell.day}</span>{cell.date === today && <small>오늘</small>}</button><div className="calendar-cell-events">{items.slice(0, 3).map((event) => <button type="button" key={event.id} className={`calendar-event tone-${event.tone}`} onClick={() => { setSelectedDate(cell.date); setSelectedEvent(event); }} title={`${event.owner} · ${event.title}`}>{!event.allDay && <time>{event.startTime}</time>}<span>{event.title}</span></button>)}{items.length > 3 && <button type="button" className="calendar-more" onClick={() => setSelectedDate(cell.date)}>+{items.length - 3}개</button>}</div></div>; })}
          </div>
          <aside className="calendar-agenda"><header><span>{selectedDate.slice(8)}일</span><div><h3>{formatSelectedDate(selectedDate)}</h3><p>두 사람 일정 {selectedItems.length}개</p></div></header><button type="button" className="calendar-day-add" onClick={openNew}>+ 이 날짜에 일정 추가</button><div className="calendar-agenda-list">{selectedItems.length === 0 ? <p className="calendar-empty">아직 등록한 일정이 없어요.<br />필요한 일정이 생기면 직접 추가해 보세요.</p> : selectedItems.map((event) => <button type="button" key={event.id} className={`calendar-agenda-item tone-${event.tone}`} onClick={() => setSelectedEvent(event)}><i aria-hidden="true" /><span><small>{event.owner}</small><strong>{event.title}</strong><em>{timeLabel(event)}</em></span></button>)}</div></aside>
        </div>
      </section>
      {selectedEvent && <EventDetail event={selectedEvent} mine={selectedEvent.owner === me} onClose={() => setSelectedEvent(null)} onEdit={editEvent} onDelete={deleteEvent} />}
      {formOpen && <CalendarEventForm initial={formEvent} selectedDate={selectedDate} onClose={() => setFormOpen(false)} onSave={saveEvent} />}
    </div>
  );
}
