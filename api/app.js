// api/app.js – Nhạc Của Tui – "cầu nối" trên Vercel: tài khoản (tên đăng nhập = số điện thoại) + danh sách phát, lưu trong Upstash Redis.
// Biến môi trường (Vercel → Settings → Environment Variables):
//   UPSTASH_REDIS_REST_URL / _TOKEN   (hoặc KV_REST_API_URL / KV_REST_API_TOKEN) – Vercel tự thêm khi nối Upstash
//   ADMIN_PHONE                       NÊN ĐẶT: số điện thoại của admin (ví dụ 0901234567)
//   ADMIN_EMAIL                       tuỳ chọn: email admin của bản cũ (vẫn được tính là admin)
//                                     (không đặt cả hai thì người tạo tài khoản đầu tiên sau khi cập nhật sẽ là admin)
//   SESSION_SECRET                    tuỳ chọn: chuỗi bí mật (không đặt thì tự suy ra từ token Upstash). Đừng đổi sau khi đã dùng.
//   DB_LIMIT_MB / CMD_LIMIT           tuỳ chọn: hạn mức dung lượng (256 MB) và số lệnh/tháng (500000) của gói Free
const crypto = require("crypto");
const E = process.env;
const URL_ = E.UPSTASH_REDIS_REST_URL || E.KV_REST_API_URL, TOK = E.UPSTASH_REDIS_REST_TOKEN || E.KV_REST_API_TOKEN;
const LIMIT = Number(E.DB_LIMIT_MB) || 256, CMD_LIMIT = Number(E.CMD_LIMIT) || 500000;
const GENRES = ["tre", "remix", "trutinh", "x89", "quocte"];
const GL = "hn:gl", gkey = id => `hn:gs:${id}`, ckey = id => `hn:cm:${id}`; // danh sách chung do admin tạo + bình luận
const USERS = "hn:users", PUB = "hn:pub", BYTES = "hn:bytes", PHONES = "hn:phones", ADMIN = "hn:admin", skey = (u, p) => `hn:s:${u}:${p}`;
const httpErr = (c, m) => Object.assign(new Error(m), { code: c });
const sha = (s, t = "sha256") => crypto.createHash(t).update(String(s)).digest();
const BASE = E.SESSION_SECRET || E.ADMIN_PASSWORD || TOK || "";
const SECRET = sha("hn|" + BASE), PWKEY = sha("hn-pw|" + BASE);
const uidOf = e => sha(e).toString("hex").slice(0, 16);
const cleanEmail = e => String(e || "").trim().toLowerCase();
const normPhone = p => { let s = String(p || "").replace(/[^\d+]/g, ""); if (s.startsWith("+84")) s = "0" + s.slice(3); else if (s.startsWith("+")) s = s.slice(1); else if (/^84\d{9,10}$/.test(s)) s = "0" + s.slice(2); return s; };
const okPhone = s => /^0\d{9,10}$/.test(s);
const ENV_PHONE = E.ADMIN_PHONE ? normPhone(E.ADMIN_PHONE) : "", ENV_EMAIL = E.ADMIN_EMAIL ? cleanEmail(E.ADMIN_EMAIL) : "";
const isAdmin = (id, U, aid) => (ENV_PHONE && U.phone === ENV_PHONE) || (ENV_EMAIL && U.email === ENV_EMAIL) || (!ENV_PHONE && !ENV_EMAIL && !!aid && aid === id);

let used = 0; // số lệnh Redis đã dùng trong tháng (ước tính)
async function redis(cmds) {
  const key = "hn:cmd:" + new Date().toISOString().slice(0, 7);
  const r = await fetch(URL_.replace(/\/$/, "") + "/pipeline", { method: "POST", headers: { Authorization: "Bearer " + TOK, "Content-Type": "application/json" }, body: JSON.stringify([...cmds, ["INCRBY", key, cmds.length + 1]]) });
  if (!r.ok) throw httpErr(502, "Không kết nối được cơ sở dữ liệu (" + r.status + ").");
  const j = await r.json(), e = j.find(x => x.error);
  if (e) throw httpErr(502, "Lỗi cơ sở dữ liệu: " + e.error);
  used = Number(j[j.length - 1].result) || used;
  return j.slice(0, -1).map(x => x.result);
}
// --- mật khẩu (băm để đăng nhập + mã hoá để admin xem lại), phiên đăng nhập ---
const hash = s => { const salt = crypto.randomBytes(16); return salt.toString("hex") + ":" + crypto.scryptSync(s, salt, 64).toString("hex"); };
const check = (s, st) => { if (!st) return false; const [a, b] = st.split(":"), x = crypto.scryptSync(s, Buffer.from(a, "hex"), 64), y = Buffer.from(b, "hex"); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const enc = s => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", PWKEY, iv), d = Buffer.concat([c.update(String(s), "utf8"), c.final()]); return [iv, c.getAuthTag(), d].map(b => b.toString("base64url")).join("."); };
const dec = s => { try { const [a, b, c] = String(s).split(".").map(x => Buffer.from(x, "base64url")), d = crypto.createDecipheriv("aes-256-gcm", PWKEY, a); d.setAuthTag(b); return Buffer.concat([d.update(c), d.final()]).toString("utf8"); } catch { return null; } };
const okPass = p => { p = String(p || ""); if (p.length < 4) throw httpErr(400, "Mật khẩu tối thiểu 4 ký tự."); if (p.length > 64) throw httpErr(400, "Mật khẩu dài quá (tối đa 64 ký tự)."); return p; };
const setPass = (U, p) => { U.pass = hash(p); U.pw = enc(p); U.sv = (U.sv || 0) + 1; delete U.rec; };
const sign = v => crypto.createHmac("sha256", SECRET).update(v).digest("base64url");
const cookie = (res, c) => res.setHeader("Set-Cookie", [].concat(res.getHeader("Set-Cookie") || [], c));
const setSession = (res, uid, v) => { const p = Buffer.from(JSON.stringify({ u: uid, v: v || 0, x: Date.now() + 365 * 864e5 })).toString("base64url"), t = `${p}.${sign(p)}`; cookie(res, `hn=${t}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`); return t; };
function getSession(req) { const m = (req.headers.cookie || "").match(/(?:^|;\s*)hn=([^;]+)/); return m ? parseTok(m[1]) : null; }
function parseTok(t) {
  const [p, s] = String(t || "").split("."); if (!p || !s) return null;
  const e = sign(p); if (e.length !== s.length || !crypto.timingSafeEqual(Buffer.from(e), Buffer.from(s))) return null;
  try { const o = JSON.parse(Buffer.from(p, "base64url").toString()); return o.x > Date.now() ? { u: o.u, v: o.v || 0 } : null; } catch { return null; }
}
async function throttle(req) { // sai quá 10 lần/15 phút (theo IP) thì tạm khoá
  const ip = String(req.headers["x-forwarded-for"] || "x").split(",")[0].trim(), fk = "hn:fail:" + ip;
  const [n] = await redis([["GET", fk]]);
  if (Number(n) >= 10) throw httpErr(429, "Thử sai quá nhiều lần. Hãy thử lại sau 15 phút.");
  return fk;
}
const failed = fk => redis([["INCR", fk], ["EXPIRE", fk, 900]]);
// --- dữ liệu ---
const FAV = () => ({ id: "fav", name: "Nhạc Yêu Thích", c: 0 });
const getPub = async uid => { const [v] = await redis([["HGET", PUB, uid]]); return v ? JSON.parse(v) : null; };
const setPub = (uid, p) => redis([["HSET", PUB, uid, JSON.stringify(p)]]);
async function recount(uid, pid) {
  const [n] = await redis([["HLEN", skey(uid, pid)]]); const p = await getPub(uid), l = p && p.l.find(x => x.id === pid);
  if (l) { l.c = n; await setPub(uid, p); } return p ? p.l : [];
}
const clean = x => (x && ["yt", "audio"].includes(x.type) && x.ref && x.title && GENRES.includes(x.genre))
  ? { id: sha(x.ref, "sha1").toString("hex").slice(0, 12), type: x.type, ref: String(x.ref).slice(0, 300), title: String(x.title).slice(0, 200), author: String(x.author || "").slice(0, 100), genre: x.genre, t: Date.now() } : null;
const listName = n => String(n || "").trim().slice(0, 40);
const pubUser = (id, U) => ({ id, name: U.name, phone: U.phone || "", email: U.email || "" });

async function createUser(name, phone, password) {
  name = String(name || "").trim().slice(0, 40); phone = normPhone(phone);
  if (!name) throw httpErr(400, "Hãy nhập họ và tên.");
  if (!okPhone(phone)) throw httpErr(400, "Số điện thoại chưa đúng (10 số, bắt đầu bằng số 0).");
  password = okPass(password);
  const [n] = await redis([["HLEN", USERS]]); if (n >= 2000) throw httpErr(400, "Đã đủ số thành viên tối đa.");
  const id = crypto.randomBytes(8).toString("hex");
  const [ok] = await redis([["HSETNX", PHONES, phone, id]]); if (!ok) throw httpErr(409, "Số điện thoại này đã có tài khoản.");
  const U = { name, phone, created: new Date().toISOString() }; setPass(U, password);
  const cmds = [["HSET", USERS, id, JSON.stringify(U)], ["HSET", PUB, id, JSON.stringify({ n: name, l: [FAV()] })], ["INCRBY", BYTES, JSON.stringify(U).length + 120]];
  if (!ENV_PHONE && !ENV_EMAIL) cmds.push(["SETNX", ADMIN, id]); // chưa đặt ADMIN_PHONE: người đầu tiên là admin
  await redis(cmds); return { id, U };
}

module.exports = async (req, res) => {
  const a = req.query.a, b = req.body || {}, q = req.query, send = (c, o) => res.status(c).json(o);
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!URL_ || !TOK) { if (a === "me" || a === "usage") return send(200, { configured: false }); throw httpErr(503, "Chưa nối cơ sở dữ liệu Upstash Redis."); }
    used = 0;
    const ses = getSession(req); let meC;
    const loadMe = async () => {
      if (meC !== undefined) return meC; meC = null; if (!ses) return null;
      const [u, ad] = await redis([["HGET", USERS, ses.u], ["GET", ADMIN]]); if (!u) return null;
      const U = JSON.parse(u); if ((U.sv || 0) !== ses.v) return null; // mật khẩu đã đổi → phiên cũ hết hạn
      return (meC = { id: ses.u, U, admin: isAdmin(ses.u, U, ad) });
    };
    const need = async () => { const m = await loadMe(); if (!m) throw httpErr(401, "Hãy đăng nhập để thực hiện việc này."); return m; };

    // ===== công khai =====
    if (a === "usage") { const [by] = await redis([["GET", BYTES]]); return send(200, { configured: true, mb: Math.max(0, Number(by) || 0) / 1048576, limitMb: LIMIT, cmds: used, limitCmd: CMD_LIMIT }); }
    if (a === "members") {
      const [h] = await redis([["HGETALL", PUB]]), out = [];
      for (let i = 0; i < (h || []).length; i += 2) { try { const p = JSON.parse(h[i + 1]); out.push({ id: h[i], n: p.n, l: p.l }); } catch { } }
      out.sort((x, y) => x.n.localeCompare(y.n, "vi")); return send(200, { members: out.slice(0, 300) });
    }
    if (a === "songs") {
      const u = String(q.u || ""), p = String(q.p || ""), [h, pub] = await redis([["HGETALL", skey(u, p)], ["HGET", PUB, u]]);
      const P = pub && JSON.parse(pub), l = P && P.l.find(x => x.id === p); if (!l) throw httpErr(404, "Không tìm thấy danh sách này.");
      const songs = []; for (let i = 0; i < (h || []).length; i += 2) { try { songs.push(JSON.parse(h[i + 1])); } catch { } }
      songs.sort((x, y) => x.t - y.t); return send(200, { owner: { id: u, name: P.n }, list: { id: l.id, name: l.name }, songs });
    }
    if (a === "me") {
      const m = await loadMe(); if (!m) return send(200, { configured: true, user: null });
      const [p, f] = await redis([["HGET", PUB, m.id], ["HKEYS", skey(m.id, "fav")]]);
      return send(200, { configured: true, user: pubUser(m.id, m.U), lists: p ? JSON.parse(p).l : [FAV()], favIds: f || [], admin: m.admin });
    }
    if (a === "ausers") { // admin: toàn bộ thành viên + mật khẩu
      const m = await need(); if (!m.admin) throw httpErr(403, "Chỉ admin mới xem được.");
      const [hu, hp, ad] = await redis([["HGETALL", USERS], ["HGETALL", PUB], ["GET", ADMIN]]), pub = {}, out = [];
      for (let i = 0; i < (hp || []).length; i += 2) { try { pub[hp[i]] = JSON.parse(hp[i + 1]); } catch { } }
      for (let i = 0; i < (hu || []).length; i += 2) {
        try {
          const id = hu[i], U = JSON.parse(hu[i + 1]), P = pub[id] || { l: [] };
          out.push({ id, name: U.name, phone: U.phone || "", email: U.email || "", pw: U.pw ? dec(U.pw) : null, created: U.created || "", lists: P.l.length, songs: P.l.reduce((s, l) => s + (l.c || 0), 0), admin: !!isAdmin(id, U, ad) });
        } catch { }
      }
      out.sort((x, y) => String(x.created).localeCompare(String(y.created))); return send(200, { users: out });
    }

    if (a === "lists") { // danh sách phát chung
      const [h] = await redis([["HGETALL", GL]]), out = [];
      for (let i = 0; i < (h || []).length; i += 2) { try { out.push(JSON.parse(h[i + 1])); } catch { } }
      out.sort((x, y) => x.t - y.t); return send(200, { lists: out });
    }
    if (a === "gsongs") {
      const p = String(q.p || ""), [h, l] = await redis([["HGETALL", gkey(p)], ["HGET", GL, p]]); if (!l) throw httpErr(404, "Không tìm thấy danh sách này.");
      const songs = []; for (let i = 0; i < (h || []).length; i += 2) { try { songs.push(JSON.parse(h[i + 1])); } catch { } }
      songs.sort((x, y) => x.t - y.t); return send(200, { list: JSON.parse(l), songs });
    }
    if (a === "cmts") {
      const [r] = await redis([["LRANGE", ckey(String(q.id || "").slice(0, 20)), 0, 199]]);
      return send(200, { items: (r || []).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean) });
    }
    if (a === "mine") { // toàn bộ bài hát trong mọi danh sách của chính mình (để chia theo thể loại ở Trang chủ)
      const m = await need(), [pv] = await redis([["HGET", PUB, m.id]]), P = pv ? JSON.parse(pv) : { l: [FAV()] };
      const r = await redis(P.l.map(l => ["HGETALL", skey(m.id, l.id)])), seen = {}, songs = [];
      r.forEach((h, k) => { for (let i = 0; i < (h || []).length; i += 2) { try { const s = JSON.parse(h[i + 1]); if (!seen[s.id]) { seen[s.id] = 1; s.from = P.l[k].id; songs.push(s); } } catch { } } });
      songs.sort((x, y) => x.t - y.t); return send(200, { songs });
    }

    // ===== tài khoản =====
    if (req.method !== "POST") throw httpErr(405, "Sai phương thức.");
    if (a === "register") { const { id, U } = await createUser(b.name, b.phone, b.password); const tok = setSession(res, id, U.sv); return send(200, { user: pubUser(id, U), tok }); }
    if (a === "login") {
      const fk = await throttle(req), raw = String(b.phone || b.email || "").trim(); let id = null;
      if (raw.includes("@")) id = uidOf(cleanEmail(raw)); else if (raw) { const [x] = await redis([["HGET", PHONES, normPhone(raw)]]); id = x; }
      const [u] = id ? await redis([["HGET", USERS, id]]) : [null], U = u && JSON.parse(u);
      if (!U || !check(String(b.password || ""), U.pass)) { await failed(fk); throw httpErr(401, "Số điện thoại hoặc mật khẩu chưa đúng."); }
      if (!U.pw) { U.pw = enc(String(b.password)); await redis([["HSET", USERS, id, JSON.stringify(U)]]); } // tài khoản cũ: lưu lại để admin xem được
      const tok = setSession(res, id, U.sv); return send(200, { user: pubUser(id, U), tok });
    }
    if (a === "pairuse") { // đăng nhập bằng mã ghép nối 6 số (tạo ở máy đang đăng nhập)
      const fk = await throttle(req), code = String(b.code || "").replace(/\D/g, "");
      const [id] = /^\d{6}$/.test(code) ? await redis([["GET", "hn:pair:" + code], ["DEL", "hn:pair:" + code]]) : [null];
      const [u] = id ? await redis([["HGET", USERS, id]]) : [null];
      if (!u) { await failed(fk); throw httpErr(401, "Mã chưa đúng hoặc đã hết hạn. Hãy tạo mã mới trên máy kia."); }
      const U = JSON.parse(u), tok = setSession(res, id, U.sv); return send(200, { user: pubUser(id, U), tok });
    }
    if (a === "switch") { // chuyển nhanh giữa các tài khoản đã đăng nhập trên máy này
      const t = parseTok(b.tok), [u] = t ? await redis([["HGET", USERS, t.u]]) : [null], U = u && JSON.parse(u);
      if (!U || (U.sv || 0) !== t.v) throw httpErr(401, "Tài khoản này cần đăng nhập lại (có thể đã đổi mật khẩu).");
      const tok = setSession(res, t.u, U.sv); return send(200, { user: pubUser(t.u, U), tok });
    }
    if (a === "logout") { cookie(res, "hn=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"); return send(200, { ok: 1 }); }

    // ===== việc của thành viên (phải đăng nhập, chỉ sửa dữ liệu của chính mình) =====
    const M = await need(), me = M.id, U = M.U;
    const saveU = (id, X) => redis([["HSET", USERS, id, JSON.stringify(X)]]);
    const needAdmin = () => { if (!M.admin) throw httpErr(403, "Chỉ admin mới làm được việc này."); };
    const grecount = async p => { const [n, l] = await redis([["HLEN", gkey(p)], ["HGET", GL, p]]); if (!l) return null; const L = JSON.parse(l); L.c = n; await redis([["HSET", GL, p, JSON.stringify(L)]]); return L; };
    const gsong = async (p, id) => { const [cur] = await redis([["HGET", gkey(p), String(id)]]); if (!cur) throw httpErr(404, "Không tìm thấy bài này."); const s = JSON.parse(cur); if (s.by !== me && !M.admin) throw httpErr(403, "Chỉ người đã thêm bài này hoặc admin mới sửa/xoá được."); return { s, cur }; };
    if (a === "glnew") {
      needAdmin(); const name = listName(b.name); if (!name) throw httpErr(400, "Hãy nhập tên danh sách.");
      const [n] = await redis([["HLEN", GL]]); if (n >= 100) throw httpErr(400, "Tối đa 100 danh sách chung.");
      const L = { id: crypto.randomBytes(4).toString("hex"), name, c: 0, t: Date.now() }; await redis([["HSET", GL, L.id, JSON.stringify(L)]]); return send(200, { list: L });
    }
    if (a === "glren") {
      needAdmin(); const name = listName(b.name), [l] = await redis([["HGET", GL, String(b.id)]]); if (!name || !l) throw httpErr(400, "Không đổi được tên danh sách này.");
      const L = JSON.parse(l); L.name = name; await redis([["HSET", GL, L.id, JSON.stringify(L)]]); return send(200, { list: L });
    }
    if (a === "gldel") {
      needAdmin(); const id = String(b.id || ""), [h] = await redis([["HGETALL", gkey(id)]]); let by = 0; for (let i = 1; i < (h || []).length; i += 2) by += h[i].length;
      await redis([["DEL", gkey(id)], ["HDEL", GL, id], ["INCRBY", BYTES, -by]]); return send(200, { ok: 1 });
    }
    if (a === "gadd") {
      const s = clean(b.song), p = String(b.p || ""); if (!s) throw httpErr(400, "Thông tin bài hát chưa hợp lệ.");
      const [l, n] = await redis([["HGET", GL, p], ["HLEN", gkey(p)]]); if (!l) throw httpErr(404, "Không tìm thấy danh sách này."); if (n >= 3000) throw httpErr(400, "Danh sách đã đầy (3000 bài).");
      s.by = me; s.byn = U.name; const v = JSON.stringify(s), [ok] = await redis([["HSETNX", gkey(p), s.id, v]]); if (!ok) throw httpErr(409, "Bài này đã có trong danh sách.");
      await redis([["INCRBY", BYTES, v.length]]); return send(200, { song: s, list: await grecount(p) });
    }
    if (a === "gedit") {
      const p = String(b.p || ""), { s, cur } = await gsong(p, b.id), title = String(b.title || "").trim().slice(0, 200); if (!title || !GENRES.includes(b.genre)) throw httpErr(400, "Thông tin chưa hợp lệ.");
      s.title = title; s.genre = b.genre; const v = JSON.stringify(s); await redis([["HSET", gkey(p), s.id, v], ["INCRBY", BYTES, v.length - cur.length]]); return send(200, { song: s });
    }
    if (a === "gdel") {
      const p = String(b.p || ""), { s, cur } = await gsong(p, b.id); await redis([["HDEL", gkey(p), s.id], ["INCRBY", BYTES, -cur.length]]); return send(200, { list: await grecount(p) });
    }
    if (a === "cmt") {
      const id = String(b.id || "").slice(0, 20), x = String(b.text || "").trim().slice(0, 500); if (!id || !x) throw httpErr(400, "Hãy nhập nội dung bình luận.");
      const c = { id: crypto.randomBytes(5).toString("hex"), u: me, n: U.name, x, t: Date.now() }, v = JSON.stringify(c);
      await redis([["LPUSH", ckey(id), v], ["LTRIM", ckey(id), 0, 199], ["INCRBY", BYTES, v.length]]); return send(200, { item: c });
    }
    if (a === "cmdel") {
      const id = String(b.id || "").slice(0, 20), [r] = await redis([["LRANGE", ckey(id), 0, 199]]), raw = (r || []).find(x => { try { return JSON.parse(x).id === b.cid; } catch { return false; } });
      if (!raw) throw httpErr(404, "Không tìm thấy bình luận."); if (JSON.parse(raw).u !== me && !M.admin) throw httpErr(403, "Bạn chỉ xoá được bình luận của mình.");
      await redis([["LREM", ckey(id), 1, raw], ["INCRBY", BYTES, -raw.length]]); return send(200, { ok: 1 });
    }
    if (a === "pairnew") { // tạo mã 6 số, hết hạn sau 5 phút
      for (let i = 0; i < 6; i++) { const code = String(crypto.randomInt(0, 1e6)).padStart(6, "0"), [ok] = await redis([["SET", "hn:pair:" + code, me, "EX", 300, "NX"]]); if (ok) return send(200, { code, ttl: 300 }); }
      throw httpErr(503, "Chưa tạo được mã, hãy thử lại.");
    }
    const myPub = async () => (await getPub(me)) || { n: U.name, l: [FAV()] }; // tài khoản cũ có thể chưa có thư viện
    if (a === "passwd") {
      const fk = await throttle(req);
      if (!check(String(b.old || ""), U.pass)) { await failed(fk); throw httpErr(401, "Mật khẩu hiện tại chưa đúng."); }
      setPass(U, okPass(b.password)); await saveU(me, U); const tok = setSession(res, me, U.sv); return send(200, { ok: 1, tok });
    }
    if (a === "rename") {
      const name = String(b.name || "").trim().slice(0, 40); if (!name) throw httpErr(400, "Hãy nhập tên hiển thị.");
      U.name = name; const p = await myPub(); p.n = name;
      await redis([["HSET", USERS, me, JSON.stringify(U)], ["HSET", PUB, me, JSON.stringify(p)]]); return send(200, { user: pubUser(me, U) });
    }
    if (a === "phone") {
      const fk = await throttle(req);
      if (!check(String(b.password || ""), U.pass)) { await failed(fk); throw httpErr(401, "Mật khẩu chưa đúng."); }
      const ph = normPhone(b.phone); if (!okPhone(ph)) throw httpErr(400, "Số điện thoại chưa đúng (10 số, bắt đầu bằng số 0).");
      if (ph === U.phone) return send(200, { user: pubUser(me, U) });
      const [ok] = await redis([["HSETNX", PHONES, ph, me]]); if (!ok) throw httpErr(409, "Số điện thoại này đã có tài khoản khác.");
      const cmds = []; if (U.phone) cmds.push(["HDEL", PHONES, U.phone]); U.phone = ph; cmds.push(["HSET", USERS, me, JSON.stringify(U)]);
      await redis(cmds); return send(200, { user: pubUser(me, U) });
    }
    // ----- admin -----
    if (a === "aadd") { needAdmin(); const r = await createUser(b.name, b.phone, b.password); return send(200, { id: r.id }); }
    if (a === "apass") {
      needAdmin(); const id = String(b.id || ""), pw = okPass(b.password), [u] = await redis([["HGET", USERS, id]]);
      if (!u) throw httpErr(404, "Không tìm thấy thành viên."); const X = JSON.parse(u); setPass(X, pw); await saveU(id, X);
      const tok = id === me ? setSession(res, me, X.sv) : undefined; return send(200, { ok: 1, tok });
    }
    if (a === "adel") {
      needAdmin(); const id = String(b.id || ""); if (id === me) throw httpErr(400, "Không thể tự xoá tài khoản của mình.");
      const [u, p, ad] = await redis([["HGET", USERS, id], ["HGET", PUB, id], ["GET", ADMIN]]); if (!u) throw httpErr(404, "Không tìm thấy thành viên.");
      const X = JSON.parse(u), P = p ? JSON.parse(p) : { l: [] }; if (isAdmin(id, X, ad)) throw httpErr(400, "Không thể xoá tài khoản admin.");
      const by = u.length + 120 + P.l.reduce((s, l) => s + (l.c || 0), 0) * 250;
      const cmds = [["HDEL", USERS, id], ["HDEL", PUB, id], ...P.l.map(l => ["DEL", skey(id, l.id)]), ["INCRBY", BYTES, -by]];
      if (X.phone) cmds.push(["HDEL", PHONES, X.phone]);
      await redis(cmds); return send(200, { ok: 1 });
    }
    // ----- danh sách phát -----
    if (a === "plnew") {
      needAdmin(); const name = listName(b.name); if (!name) throw httpErr(400, "Hãy nhập tên danh sách.");
      const p = await myPub(); if (p.l.length >= 31) throw httpErr(400, "Tối đa 30 danh sách.");
      const id = crypto.randomBytes(3).toString("hex"); p.l.push({ id, name, c: 0 }); await setPub(me, p); return send(200, { lists: p.l, id });
    }
    if (a === "plren") {
      const name = listName(b.name), p = await myPub(), l = p.l.find(x => x.id === b.id);
      if (!name || !l || l.id === "fav") throw httpErr(400, "Không đổi được tên danh sách này."); l.name = name; await setPub(me, p); return send(200, { lists: p.l });
    }
    if (a === "pldel") {
      let target = me;
      if (b.u && b.u !== me) { if (!M.admin) throw httpErr(403, "Bạn không có quyền xoá danh sách của người khác."); target = String(b.u); }
      const p = await getPub(target); if (!p || b.id === "fav" || !p.l.some(x => x.id === b.id)) throw httpErr(400, "Không xoá được danh sách này.");
      const [h] = await redis([["HGETALL", skey(target, b.id)]]); let by = 0; for (let i = 1; i < (h || []).length; i += 2) by += h[i].length;
      p.l = p.l.filter(x => x.id !== b.id); await redis([["DEL", skey(target, b.id)], ["HSET", PUB, target, JSON.stringify(p)], ["INCRBY", BYTES, -by]]);
      return send(200, { lists: target === me ? p.l : undefined });
    }
    const own = async pid => {
      const p = await getPub(me);
      if (!p && pid === "fav") { await setPub(me, { n: U.name, l: [FAV()] }); return; } // tạo thư viện cho tài khoản cũ
      if (!p || !p.l.some(x => x.id === pid)) throw httpErr(404, "Không tìm thấy danh sách của bạn.");
    };
    if (a === "add") {
      const s = clean(b.song); if (!s) throw httpErr(400, "Thông tin bài hát chưa hợp lệ."); await own(String(b.p));
      const [n] = await redis([["HLEN", skey(me, b.p)]]); if (n >= 2000) throw httpErr(400, "Danh sách đã đầy (2000 bài).");
      const v = JSON.stringify(s), [ok] = await redis([["HSETNX", skey(me, b.p), s.id, v]]); if (!ok) throw httpErr(409, "Bài này đã có trong danh sách.");
      await redis([["INCRBY", BYTES, v.length]]); return send(200, { song: s, lists: await recount(me, b.p) });
    }
    if (a === "edit") {
      await own(String(b.p)); const [cur] = await redis([["HGET", skey(me, b.p), String(b.id)]]); if (!cur) throw httpErr(404, "Không tìm thấy bài này.");
      const s = JSON.parse(cur), title = String(b.title || "").trim().slice(0, 200); if (!title || !GENRES.includes(b.genre)) throw httpErr(400, "Thông tin chưa hợp lệ.");
      s.title = title; s.genre = b.genre; const v = JSON.stringify(s);
      await redis([["HSET", skey(me, b.p), s.id, v], ["INCRBY", BYTES, v.length - cur.length]]); return send(200, { song: s });
    }
    if (a === "del") {
      await own(String(b.p)); const [cur] = await redis([["HGET", skey(me, b.p), String(b.id)]]);
      if (cur) await redis([["HDEL", skey(me, b.p), String(b.id)], ["INCRBY", BYTES, -cur.length]]);
      return send(200, { lists: await recount(me, b.p) });
    }
    if (a === "fav") { // bấm tim: thêm/bỏ khỏi "Nhạc Yêu Thích"
      const s = clean(b.song); if (!s) throw httpErr(400, "Thông tin bài hát chưa hợp lệ."); await own("fav"); const k = skey(me, "fav");
      const [ex] = await redis([["HEXISTS", k, s.id]]);
      if (ex) { const [cur] = await redis([["HGET", k, s.id]]); await redis([["HDEL", k, s.id], ["INCRBY", BYTES, -(cur || "").length]]); }
      else { const v = JSON.stringify(s); await redis([["HSETNX", k, s.id, v], ["INCRBY", BYTES, v.length]]); }
      return send(200, { fav: !ex, id: s.id, lists: await recount(me, "fav") });
    }
    throw httpErr(404, "Không có chức năng này.");
  } catch (e) { send(e.code && e.code < 600 ? e.code : 500, { error: e.message }); }
};
