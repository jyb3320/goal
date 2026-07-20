import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { normalize, sanitize, handlePost } from "./api/_logic.js";
import {
  AI_TASKS,
  buildAiMessages,
  buildEvidenceBundle,
  mockAiResult,
  requestAI,
  validateGoalDraft,
  validateReport,
} from "./api/_ai.js";

// `npm run dev`에서도 /api/state가 동작하게 하는 인메모리 API.
// 실제 배포(Vercel)에서는 api/state.js가 Redis로 처리한다.
// 개발 서버를 재시작하면 데이터가 사라진다.
function devApi() {
  let raw = null;
  return {
    name: "dev-api",
    configureServer(server) {
      server.middlewares.use("/api/state", (req, res) => {
        const send = (status, obj) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(obj));
        };
        if (req.method === "GET") {
          return send(200, { ...sanitize(normalize(raw)), pushKey: null });
        }
        if (req.method === "POST") {
          let buf = "";
          req.on("data", (c) => (buf += c));
          req.on("end", () => {
            let body;
            try {
              body = JSON.parse(buf || "{}");
            } catch {
              return send(400, { error: "invalid json" });
            }
            const out = handlePost(raw, body);
            if (out.write) raw = out.state;
            send(out.status, out.respond);
          });
          return;
        }
        send(405, { error: "method not allowed" });
      });
      server.middlewares.use("/api/ai", (req, res) => {
        const send = (status, obj) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(obj));
        };
        if (req.method !== "POST") return send(405, { error: "method not allowed" });
        let buf = "";
        req.on("data", (chunk) => {
          if (buf.length < 12000) buf += chunk;
        });
        req.on("end", async () => {
          let body;
          try {
            body = JSON.parse(buf || "{}");
          } catch {
            return send(400, { error: "invalid json" });
          }
          if (!AI_TASKS.includes(body.task)) return send(400, { error: "지원하지 않는 AI 작업이에요." });
          const state = normalize(raw);
          if (!state.users.includes(body.name)) return send(401, { error: "auth" });
          const friendName = state.users.find((user) => user !== body.name) || "";
          const bundle = buildEvidenceBundle(state, body.name, {
            task: body.task,
            scopes: body.scopes,
            decisionId: body.decisionId,
            friendName,
          });
          const objective = String(body.objective || state.bigGoals.find((item) => item.owner === body.name)?.text || "").slice(0, 500);
          if (body.task === "goal_architect" && !objective.trim()) {
            return send(400, { error: "큰 목표를 먼저 적어주세요." });
          }
          try {
            let result;
            let model = "개발용 근거 검증 모드";
            let provider = "local";
            if (process.env.AI_API_KEY) {
              const ai = await requestAI(buildAiMessages(body.task, bundle, objective));
              result = body.task === "goal_architect"
                ? validateGoalDraft(ai.content)
                : validateReport(ai.content, bundle);
              model = ai.model;
              provider = ai.provider;
              result.model = model;
            } else {
              result = mockAiResult(body.task, bundle, objective);
              result.model = model;
            }
            return send(200, {
              task: body.task,
              result,
              meta: { provider, model, evidenceCount: bundle.evidence.length, remaining: 5 },
            });
          } catch (error) {
            console.error("dev ai failed", error);
            return send(502, { error: "ai_failed", message: error.message || "AI 요청에 실패했어요." });
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
  server: {
    port: Number(process.env.PORT) || 5173,
  },
});
