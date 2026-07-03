import { useState } from "react";
import { timeAgo } from "../lib/dates.js";
import { onEnter } from "../lib/ime.js";

export default function MessageBoard({ messages, me, otherName, onSend, onDelete }) {
  const [input, setInput] = useState("");
  const recent = [...messages].slice(-5).reverse();

  const send = () => {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput("");
  };

  return (
    <div className="message-board">
      <div className="column-head">
        <h3>응원 한마디</h3>
      </div>
      <div className="message-input">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={otherName ? `${otherName}에게 한마디…` : "친구가 오면 보일 한마디…"}
          maxLength={120}
          onKeyDown={(e) => onEnter(e, send)}
        />
        <button className="btn-primary" type="button" onClick={send}>
          보내기
        </button>
      </div>
      {recent.length > 0 && (
        <ul className="message-list">
          {recent.map((m) => (
            <li key={m.id} className={m.from === me ? "mine" : ""}>
              <span className="msg-from">{m.from}</span>
              <span className="msg-text">{m.text}</span>
              <span className="msg-time">{timeAgo(m.createdAt)}</span>
              {m.from === me && (
                <button
                  type="button"
                  className="msg-delete"
                  onClick={() => onDelete(m.id)}
                  aria-label="메시지 삭제"
                  title="삭제"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
