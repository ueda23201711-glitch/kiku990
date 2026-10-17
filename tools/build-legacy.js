/*
 * index.html から、古い iPad（iOS 9 の Safari）向けの legacy.html を作るスクリプト。
 *
 * 使い方（Node.js が必要）:
 *   npm i @babel/core@7 @babel/preset-env@7 postcss@8 acorn@8
 *   node tools/build-legacy.js
 *
 * index.html を直したら、このスクリプトを実行し直して legacy.html を作り直してください。
 */
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const postcss = require('postcss');
const acorn = require('acorn');

const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function mustReplace(src, from, to, label) {
    if (!src.includes(from)) throw new Error('置換対象が見つかりません: ' + label);
    return src.replace(from, to);
}

/* ---------- 1. JS の手直し（変換前） ---------- */

// 古い Safari には Pointer Events が無いので、メモ欄の手書きを touch / mouse でも動かす
const TOUCH_FALLBACK = `
    if (!window.PointerEvent) {
        const asPointer = (ev) => {
            const t = (ev.touches && ev.touches[0]) || (ev.changedTouches && ev.changedTouches[0]) || ev;
            return { clientX: t.clientX, clientY: t.clientY, pointerType: ev.touches ? 'touch' : 'mouse',
                     buttons: 1, pointerId: 1, preventDefault: () => ev.preventDefault() };
        };
        canvas.addEventListener('touchstart', (ev) => onPointerDown(asPointer(ev)), false);
        canvas.addEventListener('touchmove', (ev) => onPointerMove(asPointer(ev)), false);
        canvas.addEventListener('touchend', () => endDrawing(true), false);
        canvas.addEventListener('touchcancel', () => endDrawing(true), false);
        canvas.addEventListener('mousedown', (ev) => onPointerDown(asPointer(ev)), false);
        canvas.addEventListener('mousemove', (ev) => { if (isDrawing) onPointerMove(asPointer(ev)); }, false);
        window.addEventListener('mouseup', () => endDrawing(true), false);
    }
`;
html = mustReplace(html,
    "window.addEventListener('blur', () => endDrawing(true));",
    "window.addEventListener('blur', () => endDrawing(true));" + TOUCH_FALLBACK,
    'pointer fallback');

// 古い Safari では speechSynthesis に addEventListener が無いことがある
html = mustReplace(html,
    "window.speechSynthesis.addEventListener('voiceschanged', loadVoices);",
    "if (window.speechSynthesis.addEventListener) { window.speechSynthesis.addEventListener('voiceschanged', loadVoices); } else { window.speechSynthesis.onvoiceschanged = loadVoices; }",
    'voiceschanged');

// Service Worker は iOS 9 に無いので登録しない（念のため）
html = html.replace(/if \("serviceWorker" in navigator\)/, 'if (false && "serviceWorker" in navigator)');

/* ---------- 2. JS を ES5 に変換 ---------- */

const POLYFILLS = `
(function(){
  if (window.NodeList && !NodeList.prototype.forEach) NodeList.prototype.forEach = Array.prototype.forEach;
  if (window.HTMLCollection && !HTMLCollection.prototype.forEach) HTMLCollection.prototype.forEach = Array.prototype.forEach;
  if (!Element.prototype.matches) Element.prototype.matches = Element.prototype.webkitMatchesSelector;
  if (!Element.prototype.closest) Element.prototype.closest = function(s){ var el=this; while(el && el.nodeType===1){ if(el.matches(s)) return el; el=el.parentElement||el.parentNode; } return null; };
  if (!String.prototype.padStart) String.prototype.padStart = function(n,c){ var s=String(this); c=c===undefined?' ':String(c); while(s.length<n) s=c+s; return s.slice(-Math.max(n,String(this).length)); };
  if (!Array.prototype.includes) Array.prototype.includes = function(v){ return this.indexOf(v) !== -1; };
  if (!String.prototype.includes) String.prototype.includes = function(v){ return this.indexOf(v) !== -1; };
})();
`;

let scriptCount = 0;
html = html.replace(/<script>([\s\S]*?)<\/script>/g, (all, code) => {
    scriptCount++;
    const out = babel.transformSync(code, {
        babelrc: false, configFile: false, compact: false, comments: true,
        sourceType: 'script',
        presets: [['@babel/preset-env', {
            targets: { ios: '9' }, modules: false, loose: true, bugfixes: true,
            // iOS 9 が一部対応している構文も、確実に動くよう ES5 に揃える
            include: ['transform-template-literals', 'transform-arrow-functions', 'transform-block-scoping',
                      'transform-parameters', 'transform-destructuring', 'transform-spread', 'transform-for-of',
                      'transform-shorthand-properties', 'transform-computed-properties', 'transform-classes'],
        }]],
    }).code;
    // ES5 として読めるか確認（読めなければここで止まる）
    acorn.parse(out, { ecmaVersion: 5, sourceType: 'script' });
    return '<script>\n' + (scriptCount === 1 ? POLYFILLS : '') + out + '\n</script>';
});
if (scriptCount === 0) throw new Error('script が見つかりません');

/* ---------- 3. CSS の手直し ---------- */

function hex8ToRgba(v) {
    return v.replace(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})\b/gi, (m, r, g, b, a) =>
        `rgba(${parseInt(r, 16)},${parseInt(g, 16)},${parseInt(b, 16)},${(parseInt(a, 16) / 255).toFixed(2)})`);
}

const gapPlugin = () => ({
    postcssPlugin: 'legacy-fixes',
    Once(rootNode) {
        // セレクタごとの flex-direction を集める（@media 内の gap 指定にも使う）
        const dir = {};
        rootNode.walkDecls('flex-direction', d => {
            d.parent.selector && d.parent.selector.split(',').forEach(s => { dir[s.trim()] = d.value.replace('!important', '').trim(); });
        });
        rootNode.walkDecls(d => {
            if (/#[0-9a-f]{8}\b/i.test(d.value)) d.value = hex8ToRgba(d.value);
            if (d.prop === 'height' && /dvh|svh|lvh/.test(d.value)) d.value = '100%';
            if (d.prop === 'position' && /sticky/.test(d.value)) d.cloneBefore({ value: d.value.replace('sticky', '-webkit-sticky') });
            if (d.prop === 'user-select') {
                const has = d.parent.some(x => x.type === 'decl' && x.prop === '-webkit-user-select');
                if (!has) d.cloneBefore({ prop: '-webkit-user-select' });
            }
        });
        // gap → 子要素の margin（Safari 9 は flex の gap に未対応）
        const added = [];
        rootNode.walkRules(rule => {
            if (rule.selector === '.controls') return; // grid は下で個別対応
            let gap = null;
            rule.each(d => { if (d.type === 'decl' && d.prop === 'gap') gap = d.value.replace('!important', '').trim(); });
            if (!gap) return;
            const sels = rule.selector.split(',').map(s => s.trim());
            const own = rule.nodes.find(n => n.type === 'decl' && n.prop === 'flex-direction');
            const column = own ? /column/.test(own.value) : sels.some(s => /column/.test(dir[s] || ''));
            const side = column ? 'margin-top' : 'margin-left';
            const sel = sels.map(s => `${s} > * + *`).join(', ');
            const n = postcss.rule({ selector: sel });
            n.append({ prop: side, value: gap }); // 子要素が自分で margin を指定していればそちらを優先
            added.push([rule, n]);
        });
        added.forEach(([rule, n]) => rule.after(n));
    },
});

html = html.replace(/<style>([\s\S]*?)<\/style>/, (all, css) => {
    // 元の CSS は「#screen-study{」の閉じ括弧が1つ足りない。ブラウザは末尾で自動的に閉じるので同じ扱いにする
    const opens = css.replace(/\/\*[\s\S]*?\*\//g, '').split('{').length;
    const closes = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').length;
    if (opens > closes) css += '\n' + '}'.repeat(opens - closes) + '\n';
    const out = postcss([gapPlugin()]).process(css, { from: undefined }).css;
    const extra = `
    /* ---- legacy (iOS 9) ---- */
    html { height: 100%; }
    /* Safari 9 の古い flexbox は、縦に並んだ要素を中身より小さく縮めてしまう（パネルが重なる）。
       設定画面・一覧画面では縮めずにスクロールさせる */
    #screen-setup > *, #screen-list > *, .panel > * { -webkit-flex-shrink: 0; flex-shrink: 0; }
    #screen-setup, #screen-list { -webkit-overflow-scrolling: touch; }
    .controls { display: -webkit-flex; display: flex; -webkit-justify-content: space-between; justify-content: space-between; }
    .controls > * { width: calc(50% - 5px); }
    .flex-gap-5 > * + * { margin-left: 5px; }
    `;
    return '<style>' + out + extra + '</style>';
});

// インライン style の gap
html = mustReplace(html,
    '<div style="display: flex; align-items: center; gap: 5px;">',
    '<div class="flex-gap-5" style="display: flex; align-items: center;">', 'inline gap 1');
html = mustReplace(html,
    '<div class="filter-bar" style="margin-bottom:10px; display:flex; gap:5px;">',
    '<div class="filter-bar flex-gap-5" style="margin-bottom:10px; display:flex;">', 'inline gap 2');

// iOS 9 では声の設定場所が違う
html = html.replace('iPhoneの「設定」→「アクセシビリティ」→「読み上げコンテンツ」→「声」→「英語」で、「拡張」や「プレミアム」の声をダウンロードしてください。',
    '「設定」→「一般」→「アクセシビリティ」→「スピーチ」→「声」→「英語」で、「拡張」の声をダウンロードしてください。');

// ホーム画面に追加したとき全画面で開くように
html = mustReplace(html, '<meta charset="UTF-8">',
    '<meta charset="UTF-8">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<!-- このファイルは tools/build-legacy.js で index.html から自動生成しています。直接編集しないでください。 -->\n' +
    '<script>/* ホーム画面から開いたときは、毎回違うアドレスで読み直して古い保存内容を使わせない */\n' +
    'if (window.navigator.standalone === true && !/[?&]v=/.test(location.search)) { location.replace(location.pathname + "?v=" + new Date().getTime() + location.hash); }</script>',
    'meta');

fs.writeFileSync(path.join(root, 'legacy.html'), html);
console.log('legacy.html を作成しました（' + scriptCount + ' 個の script を変換）');
