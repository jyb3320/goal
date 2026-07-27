import { useEffect, useState } from "react";

const TITLES = {
  meHouse: ["내 집", "오늘의 생활"],
  friendHouse: ["친구 집", "문 앞에서 살펴보기"],
  board: ["마을 게시판", "지금 진행 중인 기간 목표"],
  mailbox: ["우체통", "둘 사이에 오간 소식"],
  garden: ["목표 씨앗 밭", "아직 현황판에 올리지 않은 생각"],
  square: ["연못 광장", "이번 주 함께 만든 흐름"],
  archive: ["기록관", "쌓인 기록과 돌아보기"],
};

function Fact({ label, value, accent = false }) {
  return (
    <li className={accent ? "accent" : ""}>
      <span>{label}</span>
      <strong>{value}</strong>
    </li>
  );
}

function Actions({ children }) {
  return <div className="village-panel-actions">{children}</div>;
}

export default function VillagePanel({
  location,
  status,
  me,
  otherName,
  unread,
  onClose,
  onNavigate,
  onPoke,
  onCheer,
  onAddProgress,
  onSendMessage,
  onStartMemo,
  onEditMemo,
  onDeleteMemo,
}) {
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!location) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [location, onClose]);

  if (!location) return null;
  const [title, subtitle] = TITLES[location];
  const isMyHouse = location === "meHouse";
  const house = isMyHouse ? status.mine : status.friend;

  const sendNote = async () => {
    const text = note.trim();
    if (!text || sending) return;
    setSending(true);
    const ok = await onSendMessage(text);
    if (ok) setNote("");
    setSending(false);
  };

  return (
    <div className="village-panel-layer" onClick={onClose}>
      <section
        className={`village-panel village-panel-${location}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="village-panel-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="village-panel-close" onClick={onClose} aria-label="장소 정보 닫기">×</button>
        <header>
          <span className="village-panel-mark" aria-hidden="true">
            {location === "mailbox" ? "信" : location === "garden" ? "芽" : location === "archive" ? "記" : "村"}
          </span>
          <div>
            <h2 id="village-panel-title">{title}</h2>
            <p>{subtitle}</p>
          </div>
        </header>

        {(location === "meHouse" || location === "friendHouse") && (
          house ? (
            <>
              <ul className="village-facts">
                <Fact label="오늘 완료" value={`${house.doneToday} / ${house.totalToday}`} accent={house.allDoneToday} />
                <Fact label="오늘 남은 목표" value={`${house.remainingToday}개`} />
                <Fact label="최근 완료" value={house.recentGoal?.title || "아직 없음"} />
                <Fact
                  label="가까운 기간 목표"
                  value={house.nearestMilestone
                    ? `${house.nearestMilestone.goal.title} · ${house.nearestMilestone.dday || "기한 없음"}`
                    : "진행 중인 목표 없음"}
                />
                <Fact
                  label="대표 연속 기록"
                  value={house.representativeStreak
                    ? `${house.representativeStreak.goal.title} ${house.representativeStreak.days}일`
                    : "새 기록을 기다리는 중"}
                />
              </ul>
              <Actions>
                <button type="button" className="village-cta primary" onClick={() => onNavigate("board", isMyHouse ? "mine" : "friend")}>
                  {isMyHouse ? "내 목표 보기" : "친구 목표 보기"}
                </button>
                {isMyHouse ? (
                  <button type="button" className="village-cta" onClick={() => onNavigate("board", "mine")}>오늘 기록하기</button>
                ) : (
                  <>
                    <button type="button" className="village-cta" onClick={() => onNavigate("board", "friend")}>응원 보내기</button>
                    {house.remainingToday > 0 && <button type="button" className="village-cta knock" onClick={onPoke}>문 두드리기</button>}
                  </>
                )}
              </Actions>
            </>
          ) : <p className="village-panel-empty">친구가 들어오면 이 집의 불이 켜져요.</p>
        )}

        {location === "board" && (
          <>
            <div className="village-notices">
              {status.activeMilestones.slice(0, 4).map((item, index) => {
                const mine = item.goal.owner === me;
                const pct = Math.min(100, Math.round((item.current / Math.max(1, item.goal.target)) * 100));
                return (
                  <article key={item.goal.id} className={index === 0 ? "nearest" : ""}>
                    <div className="village-notice-top">
                      <strong>{item.goal.icon} {item.goal.title}</strong>
                      <span>{item.dday || "기한 없음"}</span>
                    </div>
                    <p>{item.goal.owner} · {item.current} / {item.goal.target} {item.goal.unit}</p>
                    <div className="village-mini-progress"><i style={{ width: `${pct}%` }} /></div>
                    <Actions>
                      {mine ? (
                        <>
                          <button type="button" className="village-cta primary" onClick={() => onAddProgress(item.goal.id, 1)}>+1 기록</button>
                          <button type="button" className="village-cta" onClick={() => onNavigate("board", "mine")}>목표 자세히 보기</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="village-cta" onClick={() => onCheer(item.goal.id)}>응원하기</button>
                          <button type="button" className="village-cta knock" onClick={onPoke}>문 두드리기</button>
                        </>
                      )}
                    </Actions>
                  </article>
                );
              })}
              {status.activeMilestones.length === 0 && <p className="village-panel-empty">게시된 기간 목표가 아직 없어요.</p>}
            </div>
          </>
        )}

        {location === "mailbox" && (
          <>
            <div className="village-mail-summary">
              {unread > 0 ? `새 쪽지와 응원이 ${unread}개 와 있어요.` : "새 소식은 없지만 지난 마음은 남아 있어요."}
            </div>
            <ul className="village-news">
              {status.mailbox.events.slice(0, 5).map((event) => (
                <li key={event.key}><span>{event.type}</span><p>{event.text}</p></li>
              ))}
              {status.mailbox.events.length === 0 && <li className="empty">아직 도착한 소식이 없어요.</li>}
            </ul>
            <div className="village-note-input">
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={otherName ? `${otherName}에게 쪽지 남기기` : "친구가 오면 쪽지를 보낼 수 있어요"}
                maxLength={120}
                disabled={!otherName}
              />
              <button type="button" onClick={sendNote} disabled={!otherName || sending || !note.trim()}>
                {sending ? "보내는 중…" : "보내기"}
              </button>
            </div>
            <Actions>
              <button type="button" className="village-cta primary" onClick={() => onNavigate("board", "messages")}>우체통 열기</button>
            </Actions>
          </>
        )}

        {location === "garden" && (
          <>
            <p className="village-lead">목표 씨앗 {status.memos.length}개가 보관되어 있어요.</p>
            <ul className="village-seeds">
              {status.memos.slice(0, 4).map((memo) => (
                <li key={memo.id}>
                  <p>{memo.text}</p>
                  <Actions>
                    <button type="button" className="village-cta primary" onClick={() => onStartMemo(memo)}>목표로 시작하기</button>
                    <button type="button" className="village-cta" onClick={() => onEditMemo(memo)}>메모 수정</button>
                    <button type="button" className="village-cta danger" onClick={() => onDeleteMemo(memo.id)}>삭제</button>
                  </Actions>
                </li>
              ))}
              {status.memos.length === 0 && <li className="empty">빈 밭이에요. 떠오른 목표를 메모해보세요.</li>}
            </ul>
            <Actions>
              <button type="button" className="village-cta" onClick={() => onNavigate("board", "memos")}>메모장 열기</button>
            </Actions>
          </>
        )}

        {location === "square" && (
          <>
            <p className="village-lead">이번 주 둘이 도장 {status.sharedThisWeek}개를 찍었어요.</p>
            <ul className="village-facts">
              <Fact label={me} value={`${status.mine.week.completed}회 · ${status.mine.week.rate}%`} />
              {status.friend && <Fact label={otherName} value={`${status.friend.week.completed}회 · ${status.friend.week.rate}%`} />}
              <Fact label="함께 움직인 날" value={`${status.bothActiveDays}일`} accent={status.bothActiveDays >= 3} />
              <Fact
                label="지난주와 비교"
                value={status.sharedDelta === 0 ? "같은 흐름" : status.sharedDelta > 0 ? `+${status.sharedDelta}개` : `${status.sharedDelta}개`}
              />
            </ul>
            <Actions>
              <button type="button" className="village-cta primary" onClick={() => onNavigate("board", "top")}>오늘 도장판 보기</button>
            </Actions>
          </>
        )}

        {location === "archive" && (
          <>
            <ul className="village-facts">
              <Fact label="이번 달 기록한 날" value={`${status.archive.recordedDays}일`} />
              <Fact label="이번 달 완료 기록" value={`${status.archive.completedThisMonth}개`} />
              <Fact
                label="최근 돌아보기"
                value={status.archive.recentReflection
                  ? `${status.archive.recentReflection.kind} · ${status.archive.recentReflection.text || status.archive.recentReflection.facts || status.archive.recentReflection.wentWell || "기록 있음"}`
                  : "아직 없음"}
              />
              <Fact label="자주 적은 어려움" value={status.archive.commonDifficulty || "아직 반복된 기록 없음"} />
            </ul>
            <Actions>
              <button type="button" className="village-cta primary" onClick={() => onNavigate("history")}>기록 달력 보기</button>
              <button type="button" className="village-cta" onClick={() => onNavigate("reflection")}>돌아보기 열기</button>
            </Actions>
          </>
        )}
      </section>
    </div>
  );
}
