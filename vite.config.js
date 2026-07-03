import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { normalize, sanitize, handlePost } from "./api/_logic.js";

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
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
  server: {
    port: Number(process.env.PORT) || 5173,
  },
});
