#!/usr/bin/env python3
"""
kiku990 の index.html をひな形にして、ほかの単語帳（kiku6000 / kiku12000 / kiku800）を作るスクリプト。

使い方:
    python3 tools/make-series.py <単語帳の名前> <出力先のリポジトリのフォルダ> [単語データ(TSV)のファイル]

  例: python3 tools/make-series.py kiku6000 ../kiku6000

  - index.html / sw.js / ipad.html / tools/build-legacy.js を出力先に書き出す
  - 単語データのファイルを指定したときだけ、単語リストをページに埋め込む（ふだんはクラウドから読む）
  - legacy.html（iPad 2/3 用）は、出力先で node tools/build-legacy.js を実行して作る
"""
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SERIES = {
    'kiku6000': {
        'title': 'キクタンAdvanced6000', 'short': 'Advanced6000', 'color': '#772F7D',
        'prefix': 'kikutan_advanced6000__', 'node': 'kiku6000', 'cache': 'kikutan-advanced6000',
    },
    'kiku12000': {
        'title': 'キクタンSuper12000', 'short': 'Super12000', 'color': '#356EA6',
        'prefix': 'kikutan_super12000__', 'node': 'kiku12000', 'cache': 'kikutan-super12000',
    },
    'kiku-my': {
        'title': 'My単語帳', 'short': 'My単語帳', 'color': '#B05A16',
        'prefix': 'kikutan_my__', 'node': 'myvocab', 'cache': 'kikutan-my',
        # 英文リーダー（手書きメモ）で保存した単語・熟語の単語帳。アプリ情報（manifest）もここで作る
        'manifest': True, 'repo': 'kiku-my',
        # 英文リーダー（独立アプリ）と同じ、ほかとは別の合言葉を使う
        'keyname': 'eibun_key', 'pair_app': '英文リーダー',
    },
    'kiku-memo': {
        'title': 'メモ単語帳', 'short': 'メモ単語帳', 'color': '#2E7D6B',
        'prefix': 'kikutan_memo__', 'node': 'memovocab', 'cache': 'kikutan-memo',
        # 手書きメモの中の英文リーダーで保存した単語・熟語の単語帳（合言葉は手書きメモと同じ）
        'manifest': True, 'repo': 'kiku-memo',
    },
    'kiku800': {
        'title': 'キクタンTOEIC800', 'short': 'TOEIC800', 'color': '#407C42',
        'prefix': 'kikutan_toeic800_', 'node': 'kiku800', 'cache': 'kikutan-toeic800',
        # kiku800 は以前、別の名前で「移行済み」の印を付けていた
        'marker': 'migrated_from_legacy',
    },
}

SW_VERSION = 'v11'


def must_replace(s, old, new, label, count=None):
    n = s.count(old)
    if n == 0 or (count is not None and n != count):
        raise SystemExit(f'置換対象が見つかりません（{label}）: {n} 件')
    return s.replace(old, new)


def make_index(cfg, data):
    s = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    s = must_replace(s, 'キクタンTOEIC990', cfg['title'], 'title')
    s = must_replace(s, '（TOEIC990）', '（' + cfg['short'] + '）', 'short title', 1)
    s = re.sub('#802028', cfg['color'], s, flags=re.I)
    s = must_replace(s, 'const APP_PREFIX = "kikutan_toeic990__";', f'const APP_PREFIX = "{cfg["prefix"]}";', 'prefix', 1)
    s = must_replace(s, "const CLOUD_NODE = 'kiku';", f"const CLOUD_NODE = '{cfg['node']}';", 'node', 1)
    if cfg.get('marker'):
        s = must_replace(s, 'const marker = k("__migrated_v1");', f'const marker = k("{cfg["marker"]}");', 'marker', 1)
    if cfg.get('keyname'):
        # 合言葉の置き場所（localStorage のキー）を変える
        s = must_replace(s, "localStorage.getItem('memo_key')", "localStorage.getItem('" + cfg['keyname'] + "')", 'keyname get', 1)
        s = must_replace(s, "localStorage.setItem('memo_key', key)", "localStorage.setItem('" + cfg['keyname'] + "', key)", 'keyname set', 1)
        app = cfg.get('pair_app', '手書きメモ')
        for old, new in [('手書きメモの「設定」→「ほかの端末を追加」に出るQRコードかペアリングコード', app + 'の「⚙ 設定」に出るペアリングコード'),
                         ('手書きメモの「設定」に表示されたQRコード', app + 'の合言葉のQRコード'),
                         ('（手書きメモと同じ合言葉にしてください）', '（' + app + 'と同じ合言葉にしてください）'),
                         ('手書きメモでもう一度表示してください', app + 'でもう一度表示してください'),
                         ('このQRコードは手書きメモの合言葉ではありません', 'このQRコードは' + app + 'の合言葉ではありません')]:
            s = must_replace(s, old, new, 'pair text: ' + old[:12])
    if data is not None:
        if '`' in data or '${' in data:
            raise SystemExit('単語データに ` または ${ が含まれています')
        s = must_replace(s, "let masterTsv = '';", 'let masterTsv = `' + data + '`;', 'masterTsv', 1)
    return s


def manifest_name(repo):
    return 'app-v2.webmanifest' if os.path.exists(os.path.join(repo, 'app-v2.webmanifest')) else 'manifest.webmanifest'


def make_manifest(cfg):
    icons = [{'src': './icons/icon-192.png', 'sizes': '192x192', 'type': 'image/png'},
             {'src': './icons/icon-512.png', 'sizes': '512x512', 'type': 'image/png'},
             {'src': './icons/maskable-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'maskable'},
             {'src': './icons/maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'}]
    return json.dumps({'id': '/' + cfg['repo'] + '/?app=' + cfg['cache'], 'name': cfg['title'], 'short_name': cfg['short'],
                       'start_url': './?source=pwa', 'scope': './', 'display': 'standalone',
                       'background_color': cfg['color'], 'theme_color': cfg['color'], 'icons': icons},
                      ensure_ascii=False, indent=2) + '\n'


def make_sw(cfg, repo):
    assets = ['./', './index.html', './' + manifest_name(repo)]
    for f in ['apple-touch-icon-180.png', 'favicon-32.png', 'favicon-16.png']:
        if os.path.exists(os.path.join(repo, 'icons', f)):
            assets.append('./icons/' + f)
    return f'''const CACHE_NAME = "{cfg['cache']}-{SW_VERSION}";
const ASSETS = {json.dumps(assets, indent=2)};

self.addEventListener("install", (event) => {{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
}});

self.addEventListener("activate", (event) => {{
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("{cfg['cache']}-") && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
}});

self.addEventListener("fetch", (event) => {{
  const req = event.request;
  if (req.method !== "GET") return;
  // 別サイト（Firebase など）への通信には関与しない
  if (new URL(req.url).origin !== self.location.origin) return;

  // ページ本体はネット優先（更新がすぐ届くように）。オフライン時はキャッシュ。
  if (req.mode === "navigate") {{
    event.respondWith(
      fetch(req)
        .then((res) => {{
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        }})
        .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
    );
    return;
  }}

  // アプリ情報（manifest）はネット優先：古い情報でインストールされないように
  if (new URL(req.url).pathname.endsWith(".webmanifest")) {{
    event.respondWith(fetch(req, {{ cache: "no-cache" }}).catch(() => caches.match(req)));
    return;
  }}

  // アイコン等はキャッシュ優先
  event.respondWith(caches.match(req).then((cached) => cached || fetch(req)));
}});
'''


def main():
    if len(sys.argv) < 3 or sys.argv[1] not in SERIES:
        raise SystemExit(__doc__)
    name, repo = sys.argv[1], os.path.abspath(sys.argv[2])
    data = open(sys.argv[3], encoding='utf-8').read().strip('\n') if len(sys.argv) > 3 else None
    cfg = SERIES[name]
    if cfg.get('manifest'):
        open(os.path.join(repo, 'app-v2.webmanifest'), 'w', encoding='utf-8').write(make_manifest(cfg))
    idx = make_index(cfg, data)
    # ひな形（kiku990）は app-v2.webmanifest を読む。出力先にそれが無ければ元の名前に戻す
    if manifest_name(repo) != 'app-v2.webmanifest':
        idx = idx.replace('./app-v2.webmanifest', './manifest.webmanifest')
    open(os.path.join(repo, 'index.html'), 'w', encoding='utf-8').write(idx)
    open(os.path.join(repo, 'sw.js'), 'w', encoding='utf-8').write(make_sw(cfg, repo))
    ipad = open(os.path.join(ROOT, 'ipad.html'), encoding='utf-8').read().replace('キクタンTOEIC990', cfg['title'])
    ipad = re.sub('#802028', cfg['color'], ipad, flags=re.I)
    open(os.path.join(repo, 'ipad.html'), 'w', encoding='utf-8').write(ipad)
    os.makedirs(os.path.join(repo, 'tools'), exist_ok=True)
    shutil.copy(os.path.join(HERE, 'build-legacy.js'), os.path.join(repo, 'tools', 'build-legacy.js'))
    print(f'{name}: index.html / sw.js / ipad.html / tools/build-legacy.js を書き出しました'
          + ('（単語データ埋め込み）' if data is not None else ''))


if __name__ == '__main__':
    main()
