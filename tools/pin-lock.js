/* 暗証番号ロック（英文リーダー・My単語帳 共通）
   ・開いたとき、ほかのアプリなどから10分以上たって戻ったときに暗証番号を聞く
   ・暗証番号は端末ごと（localStorage の eibun_pin にハッシュだけを保存）
   ・iOS 9（iPad 2/3）でも動くよう ES5 だけで書いています */
(function () {
  'use strict';
  var KEY = 'eibun_pin', AWAY_MS = 10 * 60 * 1000;
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function now() { return new Date().getTime(); }

  /* ---- SHA-256（小さな実装） ---- */
  function sha256(ascii) {
    function rr(v, n) { return (v >>> n) | (v << (32 - n)); }
    var K = [], H = [], i, j, isP = {}, c = 2, n = 0;
    while (n < 64) { if (!isP[c]) { for (i = 0; i < 313; i += c) isP[i] = c; H[n] = (Math.pow(c, 0.5) * 4294967296) | 0; K[n++] = (Math.pow(c, 1 / 3) * 4294967296) | 0; } c++; }
    H = H.slice(0, 8);
    var s = unescape(encodeURIComponent(ascii)), words = [], bl = s.length * 8;
    s += '\x80'; while (s.length % 64 - 56) s += '\x00';
    for (i = 0; i < s.length; i++) { j = s.charCodeAt(i); words[i >> 2] |= j << ((3 - i) % 4) * 8; }
    words[words.length] = (bl / 4294967296) | 0; words[words.length] = bl;
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), old = H.slice(0);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2], a = H[0], e = H[4];
        var t1 = H[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & H[5]) ^ (~e & H[6])) + K[i] +
          (w[i] = i < 16 ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & H[1]) ^ (a & H[2]) ^ (H[1] & H[2]));
        H = [(t1 + t2) | 0].concat(H); H[4] = (H[4] + t1) | 0; H.pop();
      }
      for (i = 0; i < 8; i++) H[i] = (H[i] + old[i]) | 0;
    }
    var out = '';
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) { var b = (H[i] >> (j * 8)) & 255; out += (b < 16 ? '0' : '') + b.toString(16); }
    return out;
  }
  function saved() { try { return JSON.parse(lsGet(KEY) || 'null'); } catch (e) { return null; } }
  function check(pin) { var p = saved(); return !!p && sha256(p.s + ':' + pin) === p.h; }
  function store(pin) { var salt = String(Math.random()).slice(2) + now(); lsSet(KEY, JSON.stringify({ s: salt, h: sha256(salt + ':' + pin) })); }

  /* ---- 画面 ---- */
  var css = '#pl-ov{position:fixed;top:0;left:0;right:0;bottom:0;background:#24363f;z-index:2147483000;color:#fff;font-family:-apple-system,"Hiragino Sans",sans-serif;text-align:center;-webkit-user-select:none;user-select:none;overflow:auto}' +
    '#pl-ov .t{margin:12vh 0 10px;font-size:20px;font-weight:700}#pl-ov .m{min-height:22px;font-size:14px;opacity:.85;margin-bottom:14px;padding:0 16px}' +
    '#pl-ov .d{font-size:30px;letter-spacing:12px;margin-bottom:18px;min-height:36px}' +
    '#pl-ov .k{display:inline-block;width:270px}#pl-ov .k button{width:76px;height:64px;margin:6px;border:0;border-radius:14px;background:rgba(255,255,255,.14);color:#fff;font-size:24px;-webkit-appearance:none}' +
    '#pl-ov .k button:active{background:rgba(255,255,255,.3)}#pl-ov .l{display:block;margin:18px auto 0;background:none;border:0;color:#cfe3ea;font-size:14px;text-decoration:underline}' +
    '#pl-btn{position:fixed;left:8px;bottom:8px;z-index:2147482000;border:0;border-radius:50%;width:36px;height:36px;background:rgba(36,54,63,.35);color:#fff;font-size:16px;padding:0}' +
    '#pl-menu{position:fixed;left:8px;bottom:52px;z-index:2147482001;background:#fff;color:#1f2a30;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.25);padding:6px;font-family:-apple-system,"Hiragino Sans",sans-serif}' +
    '#pl-menu button{display:block;width:100%;text-align:left;border:0;background:none;padding:10px 14px;font-size:15px;color:#1f2a30}';
  var st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st);

  var ov = null, mode = null, buf = '', first = '', fails = 0, waitUntil = 0, onDone = null;
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; }
  function build() {
    ov = el('div'); ov.id = 'pl-ov';
    ov.appendChild(el('div', 't', ''));
    ov.appendChild(el('div', 'm', ''));
    ov.appendChild(el('div', 'd', ''));
    var k = el('div', 'k');
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
    for (var i = 0; i < keys.length; i++) (function (v) {
      var b = el('button', '', v); b.type = 'button';
      if (!v) b.style.visibility = 'hidden';
      b.addEventListener('click', function (e) { e.preventDefault(); press(v); });
      k.appendChild(b);
    })(keys[i]);
    ov.appendChild(k);
    var forgot = el('button', 'l', '暗証番号を忘れた'); forgot.type = 'button'; forgot.id = 'pl-forgot';
    forgot.addEventListener('click', forgotPin);
    ov.appendChild(forgot);
    var cancel = el('button', 'l', 'やめる'); cancel.type = 'button'; cancel.id = 'pl-cancel';
    cancel.addEventListener('click', function () { hide(); });
    ov.appendChild(cancel);
    document.body.appendChild(ov);
    document.addEventListener('keydown', function (e) {
      if (!ov || ov.style.display === 'none') return;
      if (/^[0-9]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('⌫');
    });
  }
  function q(cls) { return ov.querySelector('.' + cls); }
  function show(m, title, msg) {
    if (!document.body) { document.addEventListener('DOMContentLoaded', function () { show(m, title, msg); }); return; }
    if (!ov) build();
    mode = m; buf = '';
    q('t').textContent = title; q('m').textContent = msg || '';
    document.getElementById('pl-forgot').style.display = m === 'unlock' ? '' : 'none';
    document.getElementById('pl-cancel').style.display = m === 'unlock' ? 'none' : '';
    ov.style.display = 'block'; dots();
  }
  function hide() { if (ov) ov.style.display = 'none'; mode = null; }
  function dots() { var s = ''; for (var i = 0; i < buf.length; i++) s += '●'; q('d').textContent = s || ' '; }
  function press(v) {
    if (!mode) return;
    if (v === '⌫') { buf = buf.slice(0, -1); dots(); return; }
    if (mode === 'unlock' && now() < waitUntil) { q('m').textContent = 'しばらく待ってからもう一度入力してください。'; return; }
    if (buf.length >= 6) return;
    buf += v; dots();
    var p = saved(), len = p && p.n ? p.n : 0;
    if (mode === 'unlock') {
      if (buf.length >= 4 && check(buf)) { fails = 0; hide(); lastTick = now(); return; }
      if (buf.length === 6 || (len && buf.length === len)) {
        fails++; buf = ''; dots();
        if (fails >= 5) { waitUntil = now() + 30000; fails = 0; q('m').textContent = '5回まちがえました。30秒待ってください。'; }
        else q('m').textContent = '暗証番号がちがいます。';
      }
    }
  }
  // 「決定」は入力した長さで判断（4〜6桁）：設定のときは確認用の決定ボタンを出す
  function okButton() {
    var b = document.getElementById('pl-ok');
    if (!b) {
      b = el('button', 'l', '決定'); b.id = 'pl-ok'; b.type = 'button';
      b.style.cssText = 'display:block;margin:10px auto 0;background:#fff;color:#24363f;border:0;border-radius:12px;padding:10px 28px;font-size:16px;font-weight:700;text-decoration:none';
      b.addEventListener('click', confirmSet);
      ov.insertBefore(b, ov.querySelector('.k').nextSibling);
    }
    return b;
  }
  function confirmSet() {
    if (buf.length < 4) { q('m').textContent = '4〜6桁の数字を入れてください。'; return; }
    if (mode === 'set1') { first = buf; show('set2', '確認のため、もう一度入力'); okButton().style.display = 'block'; return; }
    if (mode === 'set2') {
      if (buf !== first) { show('set1', '暗証番号を決めてください', '確認が一致しませんでした。最初からどうぞ。'); okButton().style.display = 'block'; return; }
      store(buf);
      var p = saved(); p.n = buf.length; lsSet(KEY, JSON.stringify(p));
      okButton().style.display = 'none'; hide();
      alert('暗証番号を設定しました。次に開いたとき、または10分以上離れて戻ったときに聞きます。');
    }
  }
  function startSet() { show('set1', '暗証番号を決めてください', '4〜6桁の数字（英文リーダーと My単語帳 で共通）'); okButton().style.display = 'block'; }
  function lock() { if (!saved()) return; show('unlock', '暗証番号を入力'); var b = document.getElementById('pl-ok'); if (b) b.style.display = 'none'; }
  function forgotPin() {
    if (!window.confirm('暗証番号を消して、この端末の英文リーダー・My単語帳の設定をやり直しますか？\n（クラウドの英文や単語は消えません。ほかの端末で表示したペアリングコードで設定し直してください）')) return;
    var del = [];
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^(eibun_|kikutan_my__)/.test(k)) del.push(k); } } catch (e) {}
    for (var j = 0; j < del.length; j++) lsDel(del[j]);
    lsDel(KEY);
    location.reload();
  }

  /* ---- 鍵ボタン（左下）：設定・変更・解除・今すぐロック ---- */
  function menu() {
    var m = document.getElementById('pl-menu');
    if (m) { m.parentNode.removeChild(m); return; }
    m = el('div'); m.id = 'pl-menu';
    var add = function (label, fn) { var b = el('button', '', label); b.type = 'button'; b.addEventListener('click', function () { m.parentNode.removeChild(m); fn(); }); m.appendChild(b); };
    if (saved()) {
      add('🔒 今すぐロック', lock);
      add('暗証番号を変える', function () { verifyThen(startSet); });
      add('暗証番号をやめる', function () { verifyThen(function () { lsDel(KEY); alert('暗証番号をやめました。'); }); });
    } else add('🔒 暗証番号を設定する', startSet);
    document.body.appendChild(m);
  }
  // 変更・解除の前に今の番号を確かめる
  function verifyThen(fn) {
    var p = window.prompt('今の暗証番号を入力してください');
    if (p === null) return;
    if (check(p)) fn(); else alert('暗証番号がちがいます。');
  }
  function addButton() {
    var slot = document.getElementById('pl-slot');
    if (slot) { // 設定画面の中にボタンを置く
      var sb = el('button', slot.getAttribute('data-cls') || '', '🔒 暗証番号の設定'); sb.type = 'button';
      sb.addEventListener('click', function (e) { e.stopPropagation(); menu(); });
      slot.appendChild(sb); return;
    }
    var b = el('button', '', '🔒'); b.id = 'pl-btn'; b.type = 'button'; b.title = '暗証番号';
    b.addEventListener('click', function (e) { e.stopPropagation(); menu(); });
    document.body.appendChild(b);
  }

  /* ---- いつ聞くか ---- */
  var lastTick = now(), hiddenAt = 0;
  function maybeLock() { if (saved() && mode !== 'unlock') lock(); }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) hiddenAt = now();
    else if (hiddenAt && now() - hiddenAt >= AWAY_MS) maybeLock();
  });
  window.addEventListener('pageshow', function (e) { if (e.persisted && hiddenAt && now() - hiddenAt >= AWAY_MS) maybeLock(); });
  // iPad 2/3 のホーム画面アプリなど、切り替えの合図が来ないとき：時計の進み方で離れていた時間を見る
  setInterval(function () { var t = now(); if (t - lastTick >= AWAY_MS) maybeLock(); lastTick = t; }, 20000);

  function init() { addButton(); if (saved()) lock(); }
  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);
  window.PinLock = { lock: lock, setup: startSet, menu: menu };
})();
