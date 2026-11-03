// Hộp nhạc – máy chủ nhỏ trên Vercel. Dữ liệu người dùng lưu trong repo GitHub riêng tư (mỗi người một file JSON).
const crypto = require("crypto");
const { GH_TOKEN, DATA_REPO, SESSION_SECRET, ADMIN_EMAIL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
const mailOn = !!(SMTP_USER && SMTP_PASS);
const GENRES = ["tre", "remix", "trutinh", "x89", "quocte"];
const httpErr = (c, m) => Object.assign(new Error(m), { code: c });
const gh = (p, o = {}) => fetch("https://api.github.com/repos/" + DATA_REPO + p, { ...o, headers: { Authorization: "Bearer " + GH_TOKEN, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "hop-nhac" } });
const pathOf = e => "users/" + crypto.createHash("sha256").update(e).digest("hex").slice(0, 32) + ".json";

async function readU(email) {
  const r = await gh("/contents/" + pathOf(email));
  if (r.status === 404) return null;
  if (!r.ok) throw httpErr(502, "Không đọc được kho dữ liệu GitHub (" + r.status + ").");
  const j = await r.json();
  return { sha: j.sha, data: JSON.parse(Buffer.from(j.content, "base64").toString("utf8")) };
}
async function writeU(email, data, sha) {
  const r = await gh("/contents/" + pathOf(email), { method: "PUT", body: JSON.stringify({ message: "cap nhat", content: Buffer.from(JSON.stringify(data)).toString("base64"), ...(sha ? { sha } : {}) }) });
  if (r.status === 409 || r.status === 422) throw Object.assign(new Error("conflict"), { conflict: true });
  if (!r.ok) throw httpErr(502, "Không ghi được kho dữ liệu GitHub (" + r.status + ").");
}
async function mutate(email, fn) {
  for (let i = 0; i < 3; i++) {
    const cur = await readU(email);
    if (!cur) throw httpErr(404, "Không tìm thấy tài khoản.");
    const out = await fn(cur.data);
    try { await writeU(email, cur.data, cur.sha); return out; } catch (e) { if (!e.conflict) throw e; }
  }
  throw httpErr(409, "Dữ liệu đang được cập nhật ở nơi khác, hãy thử lại.");
}
const hash = s => { const salt = crypto.randomBytes(16); return salt.toString("hex") + ":" + crypto.scryptSync(s, salt, 64).toString("hex"); };
const check = (s, st) => { if (!st) return false; const [a, b] = st.split(":"); const x = crypto.scryptSync(s, Buffer.from(a, "hex"), 64), y = Buffer.from(b, "hex"); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const sign = v => crypto.createHmac("sha256", SESSION_SECRET).update(v).digest("base64url");
const cookie = (res, c) => res.setHeader("Set-Cookie", [].concat(res.getHeader("Set-Cookie") || [], c));
const setSession = (res, email) => { const p = Buffer.from(JSON.stringify({ e: email, x: Date.now() + 365 * 864e5 })).toString("base64url"); cookie(res, `hn=${p}.${sign(p)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`); };
function getSession(req) {
  const m = (req.headers.cookie || "").match(/(?:^|;\s*)hn=([^;]+)/); if (!m) return null;
  const [p, s] = m[1].split("."); if (!p || !s) return null;
  const e = sign(p); if (e.length !== s.length || !crypto.timingSafeEqual(Buffer.from(e), Buffer.from(s))) return null;
  try { const o = JSON.parse(Buffer.from(p, "base64url").toString()); return o.x > Date.now() ? o.e : null; } catch { return null; }
}
const newCode = () => { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", b = crypto.randomBytes(12); let s = ""; for (const x of b) s += A[x % A.length]; return s.match(/.{4}/g).join("-"); };
const normCode = c => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const cleanEmail = e => String(e || "").trim().toLowerCase();
const okEmail = e => /^\S+@\S+\.\S+$/.test(e) && e.length < 200;
const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const resetSig = (p, pass) => sign(p + "|" + (pass || ""));
async function verifyReset(tok) {
  const [p, s] = String(tok).split("."); if (!p || !s) return null;
  let o; try { o = JSON.parse(Buffer.from(p, "base64url").toString()); } catch { return null; }
  if (!o.e || o.x < Date.now()) return null;
  const u = await readU(o.e); if (!u) return null;
  const e = resetSig(p, u.data.pass); if (e.length !== s.length || !crypto.timingSafeEqual(Buffer.from(e), Buffer.from(s))) return null;
  return o.e;
}
const pub = (u, email) => ({ name: u.name, email });

module.exports = async (req, res) => {
  const a = req.query.a, b = req.body || {}, send = (c, o) => res.status(c).json(o);
  const redirect = u => { res.statusCode = 302; res.setHeader("Location", u); res.end(); };
  try {
    if (!GH_TOKEN || !DATA_REPO || !SESSION_SECRET) throw httpErr(500, "Máy chủ chưa có biến môi trường GH_TOKEN, DATA_REPO, SESSION_SECRET trên Vercel.");
    const googleOn = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
    const session = getSession(req);

    if (a === "me") {
      const u = session && await readU(session);
      return send(200, { user: u ? pub(u.data, session) : null, google: googleOn, mail: mailOn });
    }
    if (a === "register") {
      const email = cleanEmail(b.email), name = String(b.name || "").trim().slice(0, 60);
      if (!name) throw httpErr(400, "Hãy nhập họ và tên.");
      if (!okEmail(email)) throw httpErr(400, "Hãy nhập email hợp lệ.");
      if (String(b.password || "").length < 6) throw httpErr(400, "Mật khẩu tối thiểu 6 ký tự.");
      const code = newCode();
      const data = { name, email, pass: hash(b.password), rec: hash(normCode(code)), songs: [], created: new Date().toISOString() };
      try { await writeU(email, data, null); } catch (e) { if (e.conflict) throw httpErr(409, "Email này đã có tài khoản."); throw e; }
      setSession(res, email);
      return send(200, { user: pub(data, email), recovery: code });
    }
    if (a === "login") {
      const email = cleanEmail(b.email), cur = await readU(email);
      if (!cur || !check(String(b.password || ""), cur.data.pass)) throw httpErr(401, "Email hoặc mật khẩu chưa đúng.");
      setSession(res, email);
      return send(200, { user: pub(cur.data, email) });
    }
    if (a === "logout") { cookie(res, "hn=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"); return send(200, { ok: 1 }); }
    if (a === "reset") {
      if (String(b.password || "").length < 6) throw httpErr(400, "Mật khẩu mới tối thiểu 6 ký tự.");
      if (b.token) {
        const email = await verifyReset(b.token);
        if (!email) throw httpErr(401, "Link đặt lại đã hết hạn hoặc đã được dùng. Hãy yêu cầu link mới.");
        const u = await mutate(email, d => { d.pass = hash(b.password); return pub(d, email); });
        setSession(res, email);
        return send(200, { user: u });
      }
      const email = cleanEmail(b.email), cur = await readU(email);
      if (!cur || !check(normCode(b.code), cur.data.rec)) throw httpErr(401, "Email hoặc mã khôi phục chưa đúng.");
      const code = newCode();
      await mutate(email, d => { d.pass = hash(b.password); d.rec = hash(normCode(code)); });
      setSession(res, email);
      return send(200, { user: pub(cur.data, email), recovery: code });
    }
    if (a === "forgot") {
      if (!mailOn) throw httpErr(400, "Máy chủ chưa bật gửi email.");
      const email = cleanEmail(b.email), cur = okEmail(email) && await readU(email);
      if (cur && cur.data.pass) {
        const p = Buffer.from(JSON.stringify({ e: email, x: Date.now() + 30 * 60000 })).toString("base64url");
        const link = "https://" + req.headers.host + "/?reset=" + p + "." + resetSig(p, cur.data.pass);
        const mail = require("nodemailer").createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: SMTP_USER, pass: SMTP_PASS } });
        await mail.sendMail({
          from: SMTP_FROM || ('"Hộp nhạc" <' + SMTP_USER + ">"), to: email, subject: "Đặt lại mật khẩu Hộp nhạc",
          text: "Xin chào " + cur.data.name + ",\n\nBấm vào link sau để đặt mật khẩu mới (hiệu lực 30 phút, chỉ dùng một lần):\n" + link + "\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.",
          html: '<div style="font-family:sans-serif;max-width:480px"><h2>Đặt lại mật khẩu</h2><p>Xin chào ' + esc(cur.data.name) + ',</p><p>Bấm nút dưới đây để đặt mật khẩu mới. Link có hiệu lực 30 phút và chỉ dùng một lần.</p><p><a href="' + link + '" style="background:#ff2d55;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;display:inline-block">Đặt mật khẩu mới</a></p><p style="color:#888;font-size:13px">Nếu bạn không yêu cầu, hãy bỏ qua email này.</p></div>'
        });
      }
      return send(200, { ok: 1 });
    }
    if (a === "usage") {
      const r = await gh(""); if (!r.ok) throw httpErr(502, "Không đọc được thông tin kho GitHub (" + r.status + ").");
      const j = await r.json(), l = await gh("/contents/users"), arr = l.ok ? await l.json() : [];
      res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
      return send(200, { mb: j.size / 1024, limitMb: 1024, users: arr.length });
    }
    if (a === "google") {
      if (!googleOn) throw httpErr(404, "Chưa bật đăng nhập Google.");
      const st = crypto.randomBytes(16).toString("hex");
      cookie(res, `hn_st=${st}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
      return redirect("https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, redirect_uri: "https://" + req.headers.host + "/api/gcb", response_type: "code", scope: "openid email profile", state: st, prompt: "select_account" }));
    }
    if (a === "gcb") {
      try {
        const st = (req.headers.cookie || "").match(/hn_st=([^;]+)/);
        if (!st || st[1] !== req.query.state) throw 0;
        const t = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: req.query.code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: "https://" + req.headers.host + "/api/gcb", grant_type: "authorization_code" }) })).json();
        const p = JSON.parse(Buffer.from(t.id_token.split(".")[1], "base64url").toString());
        if (!p.email_verified) throw 0;
        const email = cleanEmail(p.email);
        if (!(await readU(email))) { try { await writeU(email, { name: p.name || email, email, pass: null, rec: null, songs: [], created: new Date().toISOString() }, null); } catch (e) { if (!e.conflict) throw e; } }
        setSession(res, email);
        return redirect("/");
      } catch (e) { return redirect("/?e=google"); }
    }

    if (!session) throw httpErr(401, "Hãy đăng nhập.");
    if (a === "songs") {
      if (req.method === "GET") { res.setHeader("Cache-Control", "no-store"); const u = await readU(session); if (!u) throw httpErr(401, "Hãy đăng nhập lại."); return send(200, { songs: u.data.songs }); }
      if (req.method === "DELETE") { const id = String(req.query.id || ""); await mutate(session, d => { d.songs = d.songs.filter(s => s.id !== id); }); return send(200, { ok: 1 }); }
      const clean = x => (x && ["yt", "audio"].includes(x.type) && x.ref && x.title && GENRES.includes(x.genre)) ? { id: crypto.randomBytes(6).toString("hex"), type: x.type, ref: String(x.ref).slice(0, 300), title: String(x.title).slice(0, 200), author: String(x.author || "").slice(0, 100), genre: x.genre } : null;
      if (b.items) { // nhập danh sách
        let n = 0;
        await mutate(session, d => { for (const x of b.items.slice(0, 500)) { const s = clean({ ...x, genre: GENRES.includes(x.genre) ? x.genre : "tre" }); if (s && !d.songs.some(o => o.ref === s.ref) && d.songs.length < 2000) { d.songs.push(s); n++; } } });
        return send(200, { added: n });
      }
      const s = clean(b); if (!s) throw httpErr(400, "Thông tin bài hát chưa hợp lệ.");
      await mutate(session, d => { if (d.songs.some(o => o.ref === s.ref)) throw httpErr(409, "Bài này đã có trong playlist của bạn."); if (d.songs.length >= 2000) throw httpErr(400, "Playlist đã đầy (2000 bài)."); d.songs.push(s); });
      return send(200, { song: s });
    }
    throw httpErr(404, "Không có chức năng này.");
  } catch (e) { send(e.code && e.code < 600 ? e.code : 500, { error: e.message }); }
};
