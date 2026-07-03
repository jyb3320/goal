import webpush from "web-push";

const VAPID_KEY = "goaltracker:vapid";

// Redis에 VAPID 키가 없으면 서버가 스스로 만들어 저장한다.
// 수동으로 키를 발급해 Vercel 환경변수에 넣는 절차 없이, 배포만 하면
// 푸시가 바로 동작하게 하기 위함 (Redis는 앱 동작에 이미 필수라 추가 설정 없음).
// 두 요청이 동시에 처음 만들어도 SET NX로 하나만 이기고, 진 쪽은 이긴 값을 읽는다.
export async function getVapidKeys(kv) {
  const cached = await kv.get(VAPID_KEY);
  if (cached && cached.publicKey && cached.privateKey) return cached;
  const generated = webpush.generateVAPIDKeys();
  const won = await kv.set(VAPID_KEY, generated, { nx: true });
  return won ? generated : await kv.get(VAPID_KEY);
}
