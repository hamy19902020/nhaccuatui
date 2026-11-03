// Hộp nhạc – "cầu nối" trên Vercel: nhận yêu cầu từ trang web, kiểm tra mật khẩu, đọc/ghi Upstash Redis.
// Biến môi trường (Vercel → Settings → Environment Variables):
//   ADMIN_PASSWORD                       mật khẩu quản trị (bắt buộc để thêm/sửa/xoá)
//   UPSTASH_REDIS_REST_URL / _TOKEN      (hoặc KV_REST_API_URL / KV_REST_API_TOKEN) – Vercel tự thêm khi nối Upstash
//   DB_LIMIT_MB                          tuỳ chọn, mặc định 256 (dùng để tính % dung lượng)
const crypto = require("crypto");
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOK = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const PASS = process.env.ADMIN_PASSWORD;
const LIMIT = Number(process.env.DB_LIMIT_MB) || 256;
const GENRES = ["tre", "remix", "trutinh", "x89", "quocte"];
const SONGS = "hn:songs", VER = "hn:ver";
const httpErr = (c, m) => Object.assign(new Error(m), { code: c });
const sha = (s, t = "sha256") => crypto.createHash(t).update(String(s)).digest();

async function redis(cmds) {
  const r = await fetch(URL_.replace(/\/$/, "") + "/pipeline", { method: "POST", headers: { Authorization: "Bearer " + TOK, "Content-Type": "application/json" }, body: JSON.stringify(cmds) });
  if (!r.ok) throw httpErr(502, "Không kết nối được cơ sở dữ liệu (" + r.status + ").");
  const j = await r.json(), e = j.find(x => x.error);
  if (e) throw httpErr(502, "Lỗi cơ sở dữ liệu: " + e.error);
  return j.map(x => x.result);
}
// Kiểm tra mật khẩu ở máy chủ; sai quá 10 lần/15 phút (theo IP) thì tạm khoá.
async function authed(req, password) {
  if (!PASS) throw httpErr(500, "Chưa đặt biến ADMIN_PASSWORD trên Vercel.");
  const ip = String(req.headers["x-forwarded-for"] || "x").split(",")[0].trim(), fk = "hn:fail:" + ip;
  const [n] = await redis([["GET", fk]]);
  if (Number(n) >= 10) throw httpErr(429, "Nhập sai quá nhiều lần. Hãy thử lại sau 15 phút.");
  if (!crypto.timingSafeEqual(sha(password || ""), sha(PASS))) { await redis([["INCR", fk], ["EXPIRE", fk, 900]]); throw httpErr(401, "Mật khẩu quản trị chưa đúng."); }
  if (n) await redis([["DEL", fk]]);
}
const clean = x => (x && ["yt", "audio"].includes(x.type) && x.ref && x.title && GENRES.includes(x.genre))
  ? { id: sha(x.ref, "sha1").toString("hex").slice(0, 12), type: x.type, ref: String(x.ref).slice(0, 300), title: String(x.title).slice(0, 200), author: String(x.author || "").slice(0, 100), genre: x.genre, t: Date.now() } : null;

module.exports = async (req, res) => {
  const a = req.query.a, b = req.body || {}, send = (c, o) => res.status(c).json(o);
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!URL_ || !TOK) { if (a === "data") return send(200, { configured: false }); throw httpErr(503, "Chưa cấu hình cơ sở dữ liệu."); }
    if (a === "data") {
      const [h, v] = await redis([["HGETALL", SONGS], ["GET", VER]]);
      const songs = []; let bytes = 0;
      for (let i = 0; i < (h || []).length; i += 2) { bytes += h[i + 1].length; try { songs.push(JSON.parse(h[i + 1])); } catch { } }
      songs.sort((x, y) => x.t - y.t);
      return send(200, { configured: true, ver: Number(v) || 0, songs, mb: bytes / 1048576, limitMb: LIMIT });
    }
    if (req.method !== "POST") throw httpErr(405, "Sai phương thức.");
    await authed(req, b.password);
    if (a === "check") return send(200, { ok: 1 });
    if (a === "add") {
      const s = clean(b.song); if (!s) throw httpErr(400, "Thông tin bài hát chưa hợp lệ.");
      const [n] = await redis([["HLEN", SONGS]]); if (n >= 5000) throw httpErr(400, "Danh sách đã đầy (5000 bài).");
      const [ok] = await redis([["HSETNX", SONGS, s.id, JSON.stringify(s)], ["INCR", VER]]);
      if (!ok) throw httpErr(409, "Bài này đã có trong danh sách.");
      return send(200, { song: s });
    }
    if (a === "edit") {
      const [cur] = await redis([["HGET", SONGS, String(b.id)]]); if (!cur) throw httpErr(404, "Không tìm thấy bài này (có thể đã bị xoá).");
      const s = JSON.parse(cur), title = String(b.title || "").trim().slice(0, 200);
      if (!title || !GENRES.includes(b.genre)) throw httpErr(400, "Thông tin chưa hợp lệ.");
      s.title = title; s.genre = b.genre;
      await redis([["HSET", SONGS, s.id, JSON.stringify(s)], ["INCR", VER]]);
      return send(200, { song: s });
    }
    if (a === "del") { await redis([["HDEL", SONGS, String(b.id)], ["INCR", VER]]); return send(200, { ok: 1 }); }
    if (a === "import") {
      const cmds = (Array.isArray(b.items) ? b.items : []).slice(0, 500).map(x => clean({ ...x, genre: GENRES.includes(x && x.genre) ? x.genre : "tre" })).filter(Boolean).map(s => ["HSETNX", SONGS, s.id, JSON.stringify(s)]);
      if (!cmds.length) return send(200, { added: 0 });
      const out = await redis([...cmds, ["INCR", VER]]);
      return send(200, { added: out.slice(0, -1).filter(Boolean).length });
    }
    throw httpErr(404, "Không có chức năng này.");
  } catch (e) { send(e.code && e.code < 600 ? e.code : 500, { error: e.message }); }
};
