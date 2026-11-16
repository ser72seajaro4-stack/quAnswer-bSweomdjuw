// HTMLファイルをパスワードで暗号化し、パスワード入力画面つきの1ファイルにする。
// 暗号化：PBKDF2(SHA-256, 600,000回) で鍵を作り、AES-GCM(256bit) で暗号化。
// 復号はブラウザの Web Crypto で行う。パスワードを知らない人には中身は読めない。
//
// 使い方（Node.js 18 以上）：
//   PAGE_PASSWORD='パスワード' node tools/encrypt.mjs 元.html 出力.html
//
// 塩（salt）は tools/salt.txt を全ページで共有する。同じパスワードなら同じ鍵になるので、
// 1つのページでパスワードを入れれば、同じタブの別ページでは入力を省略できる。
// 元のHTML（平文）はリポジトリに置かないこと。リポジトリは公開されている。
//
// 入力ミスの制限：MAX_TRIES 回まちがえると、LOCK_MINUTES の時間だけ入力できなくなる。
// ロックのたびに次の段階の時間に延びる（正しいパスワードを入れるとリセット）。
// 記録はブラウザ（localStorage）に残すため、同じブラウザで開き直しても続きから数える。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [input, output] = process.argv.slice(2);
const password = process.env.PAGE_PASSWORD;
if (!input || !output || !password) {
  console.error("使い方: PAGE_PASSWORD='…' node tools/encrypt.mjs 元.html 出力.html");
  process.exit(1);
}

const ITER = 600000;
const MAX_TRIES = 5;
const LOCK_MINUTES = [5, 30, 120, 1440];
const b64 = (u8) => Buffer.from(u8).toString("base64");
const saltFile = join(dirname(fileURLToPath(import.meta.url)), "salt.txt");
if (!existsSync(saltFile)) writeFileSync(saltFile, b64(crypto.getRandomValues(new Uint8Array(16))) + "\n");
const salt = Buffer.from(readFileSync(saltFile, "utf8").trim(), "base64");

const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
const key = await crypto.subtle.deriveKey(
  { name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" },
  base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]
);
const iv = crypto.getRandomValues(new Uint8Array(12));
const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, readFileSync(input)));

const gate = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>パスワードが必要です</title>
<style>
:root{--bg:#f6f4f8;--card:#fff;--fg:#1e1a23;--muted:#625a6b;--line:#ddd5e2;--accent:#c8102e;--err:#b00020}
@media (prefers-color-scheme:dark){:root{--bg:#141118;--card:#1c1821;--fg:#ece7f0;--muted:#a79fb0;--line:#3a3242;--accent:#ff4d6a;--err:#ff8a9a;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);
  font-family:"Hiragino Sans","Yu Gothic UI","Noto Sans JP",Meiryo,sans-serif;padding:24px max(16px,env(safe-area-inset-left))}
.box{width:100%;max-width:380px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:28px 24px}
h1{font-size:20px;margin:0 0 6px}
p{margin:0 0 18px;color:var(--muted);font-size:14px;line-height:1.7}
label{display:block;font-size:13px;font-weight:700;margin-bottom:6px}
input{width:100%;font:inherit;font-size:16px;padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:transparent;color:var(--fg)}
input:focus{outline:2px solid var(--accent);outline-offset:1px}
button{margin-top:14px;width:100%;font:inherit;font-size:15px;font-weight:700;padding:11px;border:0;border-radius:10px;background:var(--accent);color:#fff;cursor:pointer}
button:disabled{opacity:.6;cursor:wait}
#msg{min-height:1.6em;margin:12px 0 0;font-size:13px}
#msg.err{color:var(--err)}
#left{margin:6px 0 0;font-size:12.5px;color:var(--muted);min-height:1.4em}
input:disabled{opacity:.6}
</style>
</head>
<body>
<main class="box">
  <h1>パスワードを入力</h1>
  <p>このページは閲覧が制限されています。パスワードを入れると表示されます。</p>
  <form id="gate">
    <label for="pw">パスワード</label>
    <input id="pw" type="password" autocomplete="current-password" required autofocus>
    <button id="go" type="submit">表示する</button>
    <p id="msg" role="status"></p>
    <p id="left"></p>
  </form>
  <noscript><p>表示するには JavaScript を有効にしてください。</p></noscript>
</main>
<script>
(function () {
  var SALT = "${b64(salt)}", IV = "${b64(iv)}", ITER = ${ITER};
  var DATA = "${b64(data)}";
  var KEY_NAME = "page-key";
  function bytes(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  function b64(u8) { var s = ""; u8.forEach(function (b) { s += String.fromCharCode(b); }); return btoa(s); }
  function show(html) { document.open(); document.write(html); document.close(); }
  function decrypt(key) {
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(IV) }, key, bytes(DATA))
      .then(function (buf) { return new TextDecoder().decode(buf); });
  }
  var form = document.getElementById("gate"), pw = document.getElementById("pw"),
      go = document.getElementById("go"), msg = document.getElementById("msg"), left = document.getElementById("left");
  if (!window.crypto || !crypto.subtle) {
    msg.textContent = "このブラウザでは表示できません。最新のブラウザで開いてください。";
    msg.className = "err"; go.disabled = true; return;
  }

  /* ===== 入力ミスの制限 ===== */
  var MAX_TRIES = ${MAX_TRIES}, LOCK_MINUTES = ${JSON.stringify(LOCK_MINUTES)}, GUARD = "pw-guard";
  var mem = { fails: 0, level: 0, until: 0 };
  function load() {
    try { var v = JSON.parse(localStorage.getItem(GUARD) || "null"); if (v) return v; } catch (e) {}
    try { var w = JSON.parse(sessionStorage.getItem(GUARD) || "null"); if (w) return w; } catch (e) {}
    return mem;
  }
  function save(g) {
    mem = g;
    try { localStorage.setItem(GUARD, JSON.stringify(g)); } catch (e) {}
    try { sessionStorage.setItem(GUARD, JSON.stringify(g)); } catch (e) {}
  }
  function clearGuard() {
    mem = { fails: 0, level: 0, until: 0 };
    try { localStorage.removeItem(GUARD); } catch (e) {}
    try { sessionStorage.removeItem(GUARD); } catch (e) {}
  }
  function fmt(ms) {
    var s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return (h ? h + "時間" : "") + (h || m ? m + "分" : "") + (h ? "" : r + "秒");
  }
  function lockMinutes(level) { return LOCK_MINUTES[Math.min(level, LOCK_MINUTES.length) - 1]; }
  var timer = null;
  function refresh() {
    var g = load(), now = Date.now();
    if (g.until > now) {
      pw.disabled = true; go.disabled = true;
      msg.className = "err";
      msg.textContent = "入力ミスが続いたため、しばらく入力できません。";
      left.textContent = "あと " + fmt(g.until - now) + " で再入力できます。";
      if (!timer) timer = setInterval(refresh, 1000);
      return true;
    }
    if (timer) { clearInterval(timer); timer = null; }
    if (pw.disabled) { pw.disabled = false; go.disabled = false; msg.textContent = ""; msg.className = ""; pw.focus(); }
    var rest = MAX_TRIES - g.fails;
    left.textContent = g.fails ? "あと " + rest + " 回まちがえると、" + lockMinutes(g.level + 1) + "分間入力できなくなります。" : "";
    return false;
  }
  function fail() {
    var g = load();
    g.fails = (g.fails || 0) + 1;
    if (g.fails >= MAX_TRIES) {
      g.level = (g.level || 0) + 1; g.fails = 0;
      g.until = Date.now() + lockMinutes(g.level) * 60000;
    }
    save(g);
    if (!refresh()) {
      msg.textContent = "パスワードが違います。もう一度入力してください。";
      msg.className = "err"; go.disabled = false; pw.select();
    }
  }
  window.addEventListener("storage", function (e) { if (e.key === GUARD) refresh(); });
  refresh();

  /* 同じタブで一度パスワードを入れていれば、入力を省略する（タブを閉じると忘れる） */
  var saved = null;
  try { saved = sessionStorage.getItem(KEY_NAME); } catch (e) {}
  if (saved) {
    crypto.subtle.importKey("raw", bytes(saved), "AES-GCM", false, ["decrypt"])
      .then(decrypt).then(show)
      .catch(function () { try { sessionStorage.removeItem(KEY_NAME); } catch (e) {} });
  }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (refresh()) return;
    go.disabled = true; msg.className = ""; msg.textContent = "確認しています…";
    var key, started = Date.now();
    crypto.subtle.importKey("raw", new TextEncoder().encode(pw.value), "PBKDF2", false, ["deriveKey"])
      .then(function (base) {
        return crypto.subtle.deriveKey({ name: "PBKDF2", salt: bytes(SALT), iterations: ITER, hash: "SHA-256" },
          base, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
      })
      .then(function (k) { key = k; return decrypt(k); })
      .then(function (html) {
        clearGuard();
        return crypto.subtle.exportKey("raw", key).then(function (raw) {
          try { sessionStorage.setItem(KEY_NAME, b64(new Uint8Array(raw))); } catch (e) {}
          show(html);
        });
      })
      .catch(function () {
        /* 連打を防ぐため、1回の確認に最低1.5秒かける */
        setTimeout(fail, Math.max(0, 1500 - (Date.now() - started)));
      });
  });
})();
</script>
</body>
</html>
`;
writeFileSync(output, gate);
console.log("暗号化しました: " + output);
