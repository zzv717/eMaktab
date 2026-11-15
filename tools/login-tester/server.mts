// eMaktab kirish sinovi — faqat sizning kompyuteringizda (localhost) ishlatiladi.
// Parol saqlanmaydi va loglanmaydi. Natija: holat, ism, rol (parol qaytmaydi).
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loginEmaktab } from "./emaktab-client.mts";

const here = dirname(fileURLToPath(import.meta.url));
const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3001);
const html = readFileSync(join(here, "index.html"), "utf-8");

function send(res: http.ServerResponse, code: number, body: unknown, type = "application/json") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") return send(res, 200, html, "text/html; charset=utf-8");
  if (req.method === "POST" && req.url === "/api/login") {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 4096) req.destroy();
    });
    req.on("end", async () => {
      let login = "";
      let password = "";
      try {
        const j = JSON.parse(raw) as { login?: unknown; password?: unknown };
        login = String(j.login ?? "").trim();
        password = String(j.password ?? "");
      } catch {
        return send(res, 400, { ok: false, error: "JSON xato" });
      }
      if (!login || !password) return send(res, 400, { ok: false, error: "login va parol kerak" });
      try {
        const r = await loginEmaktab(login, password);
        if (r.status === "ok") {
          return send(res, 200, { ok: true, status: "ok", name: r.session.fullName, role: r.session.role });
        }
        const msg = "message" in r ? String(r.message) : "";
        return send(res, 200, { ok: false, status: r.status, message: msg.slice(0, 400) });
      } catch (e) {
        return send(res, 500, { ok: false, error: String(e instanceof Error ? e.message : e).slice(0, 200) });
      }
    });
    return;
  }
  send(res, 404, { ok: false, error: "not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`eMaktab kirish sinovi: http://${HOST}:${PORT}  (Ctrl+C bilan to'xtating)`);
});
