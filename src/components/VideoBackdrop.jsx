import { useEffect, useRef, useState } from "react";
import { reducedMotion } from "../lib/fx.js";

// 페이지 배경 영상.
// VillageBackdrop과 같은 껍데기(.village-backdrop)를 쓰므로 장막·뷰트랜지션이 그대로 동작한다.
// 본문 가독성은 기존 --backdrop-veil이 맡는다 (스크롤할수록 짙어지고, 시간대별 최소 농도가 있다).
//
// 매일 켜는 앱이라 영상은 조건부로만 튼다:
//   · 모션 최소화 설정 → 포스터 한 장으로 끝
//   · 데이터 절약 모드 / 2G·3G → 포스터 한 장으로 끝
//   · 탭이 백그라운드로 가면 정지
const SRC = "/bg/duo-power.mp4";
const POSTER = "/bg/duo-power.jpg";

// 시간대별 최소 농도 — VillageBackdrop과 같은 값. 밝은 영상 위에서도 글이 읽혀야 한다.
const VEIL_MIN = 0.6;

function shouldSkipVideo() {
  if (reducedMotion()) return true;
  const c = navigator.connection;
  if (!c) return false;
  if (c.saveData) return true;
  // effectiveType은 실제보다 보수적으로 나오는 일이 잦다(임베디드 브라우저는 거의 "3g").
  // 1.25MB짜리를 3g에서까지 막으면 대부분이 영영 못 보므로 2g 이하만 거른다.
  return ["slow-2g", "2g"].includes(c.effectiveType);
}

export default function VideoBackdrop() {
  const videoRef = useRef(null);
  const [still, setStill] = useState(true);

  // 장막 최소 농도 — 영상은 밝고 대비가 세서 캔버스 마을보다 짙게 깐다
  useEffect(() => {
    document.documentElement.style.setProperty("--backdrop-veil-min", String(VEIL_MIN));
    if (!CSS.supports?.("animation-timeline: scroll()")) {
      const onScroll = () => {
        const ratio = Math.min(1, window.scrollY / 620);
        document.documentElement.style.setProperty(
          "--backdrop-veil",
          (VEIL_MIN + (0.9 - VEIL_MIN) * ratio).toFixed(3)
        );
      };
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (shouldSkipVideo()) return undefined;
    setStill(false);

    const v = videoRef.current;
    if (!v) return undefined;

    const play = () => {
      // 자동재생이 막히면 포스터로 남는다 — 실패해도 앱은 그대로 돈다
      v.play?.().catch(() => {});
    };
    const onVis = () => (document.visibilityState === "visible" ? play() : v.pause?.());

    play();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <div className="village-backdrop" aria-hidden="true">
      {still ? (
        <div className="village-backdrop-still" style={{ backgroundImage: `url(${POSTER})` }} />
      ) : (
        <video
          ref={videoRef}
          className="village-backdrop-video"
          src={SRC}
          poster={POSTER}
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          tabIndex={-1}
        />
      )}
      <div className="village-backdrop-veil" />
    </div>
  );
}
