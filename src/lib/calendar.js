import { fmtDate } from "./dates.js";

export function calendarMonthCells(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const cursor = new Date(year, monthIndex, 1 - first.getDay());
  return Array.from({ length: 42 }, () => {
    const date = fmtDate(cursor);
    const cell = { date, day: cursor.getDate(), inMonth: cursor.getMonth() === monthIndex };
    cursor.setDate(cursor.getDate() + 1);
    return cell;
  });
}

export function calendarItemsForDate(events = [], date) {
  return events
    .filter((event) => event.date === date)
    .sort((a, b) => {
      const aTime = a.allDay ? "" : a.startTime || "";
      const bTime = b.allDay ? "" : b.startTime || "";
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      if (aTime !== bTime) return aTime.localeCompare(bTime);
      return a.title.localeCompare(b.title, "ko");
    });
}
