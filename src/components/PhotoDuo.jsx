import { useEffect, useRef, useState } from "react";

const PEOPLE = [
  { src: "/people/portrait-1.jpeg", fallback: "1P" },
  { src: "/people/portrait-2.png", fallback: "2P" },
];

const CHAOS_LINES = [
  "목표 안 하면 내가 찾아감",
  "도장 찍고 인간 되자",
  "계획은 거창, 시작은 1분",
  "지금 딴짓하는 거 다 안다",
];

export default function PhotoDuo({ users = [], compact = false }) {
  const [chaos, setChaos] = useState(false);
  const timerRef = useRef(null);

  const triggerChaos = () => {
    clearTimeout(timerRef.current);
    setChaos(true);
    timerRef.current = setTimeout(() => setChaos(false), 8500);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <section className={`photo-duo ${compact ? "compact" : ""} ${chaos ? "is-chaos" : ""}`} aria-label="우리 둘 캐릭터">
      <div className="photo-duo-faces" aria-hidden="true">
        {PEOPLE.map((person, index) => (
          <figure className={`photo-bubble photo-bubble-${index + 1}`} key={person.src}>
            <img src={person.src} alt="" />
            <figcaption>{users[index] || person.fallback}</figcaption>
          </figure>
        ))}
      </div>
      {!compact && (
        <div className="photo-duo-copy">
          <strong>오늘도 정상 영업 중 <span>(아마도)</span></strong>
          <small>얼굴을 눌러도 아무 일 없고, 버튼을 누르면 큰일 남</small>
        </div>
      )}
      <button type="button" className="chaos-trigger" onClick={triggerChaos} aria-pressed={chaos}>
        {chaos ? "🤯 정신 차리는 중…" : "🤪 엽기 모드"}
      </button>

      {chaos && (
        <div className="chaos-stage" aria-hidden="true">
          {PEOPLE.map((person, index) => (
            <figure className={`chaos-face chaos-face-${index + 1}`} key={`chaos-${person.src}`}>
              <img src={person.src} alt="" />
              <figcaption>{CHAOS_LINES[index]}</figcaption>
            </figure>
          ))}
          <span className="chaos-sticker chaos-sticker-1">도장!</span>
          <span className="chaos-sticker chaos-sticker-2">목표 도망감</span>
          <span className="chaos-sticker chaos-sticker-3">일단 1분만</span>
        </div>
      )}
    </section>
  );
}
