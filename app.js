'use strict';
/* PC Hub v2 — 学校パソコン部向け PC管理ダッシュボード（データは端末内 IndexedDB に保存） */

const MAKERS = ['Lenovo', 'Dell', 'HP'];
const OSES = ['Windows 11', 'Windows 10', 'Zorin OS', 'ChromeOS Flex', 'Ubuntu', 'macOS', 'その他'];
const STATUSES = ['稼働中', '貸出中', '修理中', '保管中', '故障', '廃棄予定'];
const KINDS = { 'ノートPC': 'laptop', 'デスクトップ': 'desktop_windows', '一体型': 'desktop_mac', 'ミニPC': 'developer_board', 'タブレット': 'tablet_mac', 'その他': 'devices' };
const ST = { '稼働中': ['check_circle', 't-ok'], '貸出中': ['handshake', 't-info'], '修理中': ['build', 't-warn'], '保管中': ['inventory_2', 't-mute'], '故障': ['error', 't-bad'], '廃棄予定': ['delete', 't-bad'] };
const HUES = [['ブルー', 225], ['パープル', 275], ['ピンク', 335], ['オレンジ', 25], ['グリーン', 145], ['ティール', 180]];
const SORTS = { no: '管理番号順', maker: 'メーカー順', os: 'OS順', ram: 'メモリが多い順', year: '導入が新しい順', attn: '要対応が先', updated: '更新が新しい順' };
const MAX_PHOTOS = 4;
const GROUPS = { none: 'グループなし', place: '場所別', maker: 'メーカー別', os: 'OS別', status: '状態別' };

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ms = (n, c = '') => `<span class="ms ${c}" aria-hidden="true">${n}</span>`;

/* ---------- 日付 ---------- */
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const diffDays = (a, b) => Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 864e5);
const fmtD = s => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${y}/${+m}/${+d}`; };
const fmtDT = t => { const d = new Date(t); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/* ---------- 設定（localStorage） ---------- */
const CFG_KEY = 'pchub.cfg';
let cfg = { mode: 'auto', hue: 225, layout: 'grid', org: '' };
try { Object.assign(cfg, JSON.parse(localStorage.getItem(CFG_KEY) || '{}')); } catch (e) { }
const saveCfg = () => { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { } };

/* ---------- テーマ（Material 3 風トーナルパレットを色相から生成） ---------- */
const mq = window.matchMedia('(prefers-color-scheme: dark)');
let chartColors = [];
function applyTheme() {
  const dark = cfg.mode === 'dark' || (cfg.mode === 'auto' && mq.matches);
  const h = cfg.hue, c = (o, s, l) => `hsl(${(h + o + 360) % 360} ${s}% ${l}%)`;
  const T = dark ? {
    'primary': c(0, 90, 80), 'primary-container': c(0, 55, 30), 'on-primary-container': c(0, 90, 90),
    'secondary': c(0, 35, 78), 'secondary-container': c(0, 22, 26), 'on-secondary-container': c(0, 40, 90),
    'tertiary': c(60, 60, 80), 'tertiary-container': c(60, 35, 28), 'on-tertiary-container': c(60, 70, 90),
    'surface': c(0, 18, 8), 'sc-low': c(0, 16, 11), 'sc': c(0, 15, 13.5), 'sc-high': c(0, 14, 17), 'sc-highest': c(0, 13, 21),
    'on-surface': c(0, 20, 90), 'on-surface-var': c(0, 12, 75), 'outline': c(0, 8, 58), 'outline-var': c(0, 10, 28)
  } : {
    'primary': c(0, 62, 42), 'on-primary': '#fff', 'primary-container': c(0, 90, 90), 'on-primary-container': c(0, 75, 14),
    'secondary': c(0, 28, 40), 'secondary-container': c(0, 40, 88), 'on-secondary-container': c(0, 35, 14),
    'tertiary': c(60, 40, 40), 'tertiary-container': c(60, 70, 89), 'on-tertiary-container': c(60, 50, 14),
    'surface': c(0, 30, 98), 'sc-low': c(0, 28, 95.5), 'sc': c(0, 26, 93.5), 'sc-high': c(0, 24, 91.5), 'sc-highest': c(0, 22, 89),
    'on-surface': c(0, 25, 10), 'on-surface-var': c(0, 12, 32), 'outline': c(0, 8, 48), 'outline-var': c(0, 14, 80)
  };
  const root = document.documentElement;
  root.dataset.scheme = dark ? 'dark' : 'light';
  for (const k in T) root.style.setProperty('--' + k, T[k]);
  chartColors = [0, 50, 105, 165, 215, 265, 315].map(o => dark ? c(o, 70, 70) : c(o, 62, 46));
  const m = $('meta[name=theme-color]'); if (m) m.content = T['surface'];
}
mq.addEventListener && mq.addEventListener('change', () => { if (cfg.mode === 'auto') { applyTheme(); render(); } });

/* ---------- IndexedDB ---------- */
let db;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('pchub', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('pcs', { keyPath: 'id' }); r.result.createObjectStore('meta'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const store = (n, mode = 'readonly') => db.transaction(n, mode).objectStore(n);
const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const dbAll = () => rq(store('pcs').getAll());
const dbPut = o => rq(store('pcs', 'readwrite').put(o));
const dbDel = id => rq(store('pcs', 'readwrite').delete(id));
const dbClear = () => rq(store('pcs', 'readwrite').clear());
const metaGet = k => rq(store('meta').get(k));
const metaSet = (k, v) => rq(store('meta', 'readwrite').put(v, k));

let pcs = [], logos = {}, lastBackup = 0;
const S = { view: 'devices', q: '', maker: '', os: '', status: '', flag: '', fav: false, sort: 'no', group: 'none', tag: '', sel: null };
let editingId = null, formPhotos = [], loanId = null;

/* ---------- 共通ヘルパー ---------- */
const makerOf = p => p.maker === 'その他' ? (p.makerOther || 'その他') : p.maker;
const osOf = p => p.os === 'その他' ? (p.osOther || 'その他') : p.os;
const osFull = p => osOf(p) + (p.osVer ? ' ' + p.osVer : '');
const fmtGB = n => { n = Number(n); if (!n) return '—'; return n >= 1000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0).replace(/\.0$/, '') + ' TB' : n + ' GB'; };
const isEol = p => p.os === 'Windows 10'; // 2025-10-14 サポート終了
const natCmp = (a, b) => String(a).localeCompare(String(b), 'ja', { numeric: true });
const uid = () => 'pc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const osIcon = p => { const o = osOf(p); return /windows/i.test(o) ? 'window' : /zorin|ubuntu|linux/i.test(o) ? 'terminal' : /chrome/i.test(o) ? 'language' : /mac/i.test(o) ? 'laptop_mac' : 'memory'; };
const kindIcon = p => KINDS[p.kind] || 'devices';
const logoOrMono = p => { const n = makerOf(p); return logos[n] ? `<img src="${logos[n]}" alt="${esc(n)}">` : `<span class="mono">${esc(n.slice(0, 1).toUpperCase())}</span>${esc(n)}`; };
const photosOf = p => p.photos && p.photos.length ? p.photos : [];
const log = (p, t) => { (p.log = p.log || []).unshift({ t: Date.now(), e: t }); if (p.log.length > 60) p.log.length = 60; };

function migrate(p) {
  if (!p.photos) p.photos = p.photo ? [p.photo] : [];
  delete p.photo;
  p.log = p.log || []; p.loan = p.loan || null; p.fav = !!p.fav;
  p.tags = p.tags || []; p.software = p.software || []; p.loanCount = p.loanCount || 0;
  return p;
}

/* Windows 11 対応の目安（CPU世代・メモリ・容量から判定） */
function win11(p) {
  if (!isEol(p)) return null;
  if (p.ram && p.ram < 4) return { ok: false, why: 'メモリ4GB未満' };
  if (p.storage && p.storage < 64) return { ok: false, why: '容量64GB未満' };
  const cpu = (p.cpu || '').toLowerCase();
  let m = cpu.match(/i[3579]-\s?(\d{4,5})/);
  if (m) { const g = m[1].length === 5 ? +m[1].slice(0, 2) : +m[1][0]; return g >= 8 ? { ok: true, why: `第${g}世代` } : { ok: false, why: `第${g}世代は非対応` }; }
  m = cpu.match(/ryzen\s*[3579]\s*(?:pro\s*)?(\d)\d{3}/);
  if (m) return +m[1] >= 2 ? { ok: true, why: 'Ryzen 2000番台以降' } : { ok: false, why: 'Ryzen 1000番台は非対応' };
  return { ok: null, why: 'CPU不明' };
}

function warrantyState(p) {
  if (!p.warrantyEnd) return null;
  const d = diffDays(p.warrantyEnd, today());
  return d < 0 ? 'expired' : d <= 90 ? 'soon' : 'ok';
}
function checkState(p) {
  if (['廃棄予定', '故障'].includes(p.status)) return null;
  if (!p.lastCheck) return 'never';
  return diffDays(today(), p.lastCheck) > 180 ? 'old' : 'ok';
}
function flagsOf(p) {
  const f = [];
  if (p.loan && p.loan.due && p.loan.due < today()) f.push({ k: 'overdue', icon: 'alarm', t: '返却期限超過', tone: 't-bad' });
  if (isEol(p)) f.push({ k: 'eol', icon: 'update_disabled', t: 'Win10 サポート終了', tone: 't-warn' });
  if (['故障', '修理中'].includes(p.status)) f.push({ k: 'repair', icon: 'build_circle', t: p.status, tone: 't-bad' });
  const w = warrantyState(p);
  if (w === 'expired') f.push({ k: 'warranty', icon: 'verified_user', t: '保証切れ', tone: 't-mute' });
  else if (w === 'soon') f.push({ k: 'warranty', icon: 'verified_user', t: '保証まもなく終了', tone: 't-warn' });
  const c = checkState(p);
  if (c === 'old' || c === 'never') f.push({ k: 'check', icon: 'fact_check', t: c === 'never' ? '未点検' : '点検が必要', tone: 't-mute' });
  return f;
}
function advice(p) {
  const a = [], yr = new Date().getFullYear();
  if (isEol(p)) {
    const w = win11(p);
    if (w.ok === true) a.push({ icon: 'upgrade', tone: 't-warn', t: 'Windows 11 へ更新できる可能性があります', s: `${w.why}。TPM 2.0 などの要件を確認してから更新しましょう。` });
    else if (w.ok === false) a.push({ icon: 'swap_horiz', tone: 't-warn', t: 'Zorin OS / ChromeOS Flex への入れ替えを検討', s: `Windows 11 の要件を満たさない可能性（${w.why}）。軽量OSで延命できます。` });
    else a.push({ icon: 'help', tone: 't-warn', t: 'Windows 11 に対応できるか確認', s: 'CPU情報が不足しています。型番を入力すると判定できます。' });
  }
  if (/hdd/i.test(p.storageType || '')) a.push({ icon: 'speed', tone: 't-info', t: 'SSD への換装で体感速度が大きく向上', s: 'HDD搭載です。起動やアプリの読み込みが速くなります。' });
  if (p.ram && p.ram < 8) a.push({ icon: 'memory_alt', tone: 't-info', t: 'メモリ増設（8GB以上）を検討', s: `現在 ${p.ram}GB です。` });
  if (p.year && yr - p.year >= 7) a.push({ icon: 'hourglass_bottom', tone: 't-mute', t: `導入から ${yr - p.year} 年が経過`, s: '更新・入れ替え計画の候補です。' });
  if (['故障', '修理中'].includes(p.status)) a.push({ icon: 'build', tone: 't-bad', t: '修理または交換の手配が必要', s: '状態が「' + p.status + '」です。' });
  if (p.loan && p.loan.due && p.loan.due < today()) a.push({ icon: 'alarm', tone: 't-bad', t: `返却が ${diffDays(today(), p.loan.due)} 日遅れています`, s: `${p.loan.who} さんに連絡しましょう。` });
  return a;
}

/* ---------- 画像 ---------- */
function resizeImage(file, max = 1000, q = 0.78, type = 'image/jpeg') {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = rej;
    fr.onload = () => {
      const img = new Image();
      img.onerror = rej;
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL(type, q));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
const fileToDataURL = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });

/* ---------- スナックバー ---------- */
let snackT;
function toast(msg, label, fn) {
  const el = $('#snack'); $('#snackMsg').textContent = msg;
  const b = $('#snackAct'); b.textContent = label || ''; b.hidden = !label; b.onclick = () => { el.hidden = true; fn && fn(); };
  el.hidden = false; clearTimeout(snackT); snackT = setTimeout(() => el.hidden = true, label ? 6000 : 2600);
}

/* ---------- 絞り込み ---------- */
const attnRank = p => flagsOf(p).filter(f => f.tone === 't-bad' || f.tone === 't-warn').length;
function filtered() {
  const q = S.q.trim().toLowerCase();
  const list = pcs.filter(p => {
    if (S.maker && makerOf(p) !== S.maker) return false;
    if (S.os && osOf(p) !== S.os) return false;
    if (S.status && p.status !== S.status) return false;
    if (S.fav && !p.fav) return false;
    if (S.tag && !(p.tags || []).includes(S.tag)) return false;
    if (S.flag && !flagsOf(p).some(f => f.k === S.flag)) return false;
    if (q) {
      const hay = [p.no, p.nick, p.kind, makerOf(p), p.model, osFull(p), p.cpu, p.place, p.serial, p.host, p.mac, p.memo, p.year, p.accessories, (p.tags || []).join(' '), (p.software || []).join(' '), p.loan && p.loan.who].join(' ').toLowerCase();
      if (!q.split(/\s+/).every(w => hay.includes(w))) return false;
    }
    return true;
  });
  const by = {
    no: (a, b) => natCmp(a.no, b.no),
    maker: (a, b) => natCmp(makerOf(a), makerOf(b)) || natCmp(a.no, b.no),
    os: (a, b) => natCmp(osFull(a), osFull(b)) || natCmp(a.no, b.no),
    ram: (a, b) => (b.ram || 0) - (a.ram || 0),
    year: (a, b) => (b.year || 0) - (a.year || 0),
    attn: (a, b) => attnRank(b) - attnRank(a) || natCmp(a.no, b.no),
    updated: (a, b) => (b.updated || 0) - (a.updated || 0),
  }[S.sort];
  return list.sort(by);
}
const countBy = fn => { const m = {}; pcs.forEach(p => { const k = fn(p); m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
const attnCounts = () => {
  const c = { overdue: 0, eol: 0, repair: 0, warranty: 0, check: 0 };
  pcs.forEach(p => new Set(flagsOf(p).map(f => f.k)).forEach(k => c[k]++));
  return c;
};

/* ---------- ナビゲーション ---------- */
const VIEWS = [['devices', 'devices', 'デバイス'], ['analytics', 'insights', '分析'], ['ops', 'event_available', '貸出・点検'], ['audit', 'checklist', '棚卸し'], ['settings', 'settings', '設定']];
function renderNav() {
  const c = attnCounts(); const opsN = c.overdue + c.check;
  $('#nav').innerHTML = `
    <img class="nav-logo-img" src="icons/icon.svg" alt="PC Hub">
    <button class="nav-fab" data-act="add" aria-label="PCを追加">${ms('add')}<b>追加</b></button>
    ${VIEWS.map(([k, ic, l]) => `<button class="nav-item ${S.view === k ? 'on' : ''}" data-act="nav" data-v="${k}"><span class="pill">${ms(ic)}${k === 'ops' && opsN ? `<span class="nav-badge">${opsN > 99 ? '99+' : opsN}</span>` : ''}</span>${l}</button>`).join('')}
    <div class="nav-spacer"></div>`;
}

function render() {
  renderNav();
  const v = $('#view');
  v.style.animation = 'none'; void v.offsetWidth; v.style.animation = '';
  ({ devices: viewDevices, analytics: viewAnalytics, ops: viewOps, audit: viewAudit, settings: viewSettings })[S.view]();
  updateSelbar();
}

/* ---------- デバイス画面 ---------- */
function stat(cls, icon, val, unit, label) {
  return `<div class="stat ${cls}"><i class="deco"></i>${ms(icon, 'fill')}<b>${val}<small>${unit}</small></b><span class="l">${label}</span></div>`;
}
function chipRow(label, key, items) {
  if (items.length < 1) return '';
  return `<div class="chip-row"><span class="chip-label">${label}</span>
    <button class="chip ${!S[key] ? 'on' : ''}" data-act="filter" data-k="${key}" data-v="">${!S[key] ? ms('check') : ''}すべて</button>
    ${items.map(([v, n]) => `<button class="chip ${S[key] === v ? 'on' : ''}" data-act="filter" data-k="${key}" data-v="${esc(v)}">${S[key] === v ? ms('check') : ''}${esc(v)} <small>${n}</small></button>`).join('')}</div>`;
}

function viewDevices() {
  const c = attnCounts();
  const n = pcs.length;
  const active = pcs.filter(p => p.status === '稼働中').length, lent = pcs.filter(p => p.status === '貸出中').length;
  const need = pcs.filter(p => ['修理中', '故障', '廃棄予定'].includes(p.status)).length;
  const attn = [
    ['overdue', 'alarm', '返却期限超過', c.overdue, 't-bad'], ['eol', 'update_disabled', 'Windows 10', c.eol, 't-warn'],
    ['repair', 'build_circle', '修理・故障', c.repair, 't-bad'], ['warranty', 'verified_user', '保証の確認', c.warranty, 't-warn'], ['check', 'fact_check', '点検が必要', c.check, 't-mute']
  ].filter(a => a[3] > 0);
  const stale = n && (!lastBackup || (Date.now() - lastBackup) > 30 * 864e5);
  $('#view').innerHTML = `
    <div class="page-head">
      <div><h1>PC <em>Hub</em></h1><p>${esc(cfg.org || 'パソコン部')} の機材ダッシュボード${n ? ` ・ 全${n}台` : ''}</p></div>
      <div class="head-actions"><button class="btn tonal" data-act="print">${ms('print')}台帳を印刷</button></div>
    </div>
    ${stale ? `<div class="banner">${ms('cloud_upload', 'fill')}<div class="grow"><b>バックアップしましょう</b><span class="s">${lastBackup ? '前回から30日以上たっています。' : 'まだバックアップがありません。'}データはこのiPadの中だけに保存されています。</span></div><button class="btn filled" data-act="backup">書き出す</button></div>` : ''}
    ${n ? `<div class="stats">
      ${stat('t-primary', 'devices', n, '台', '登録台数')}
      ${stat('t-ok', 'check_circle', active, '台', '稼働中')}
      ${stat('t-tertiary', 'handshake', lent, '台', '貸出中')}
      ${stat('t-warn', 'build_circle', need, '台', '修理・故障・廃棄予定')}
    </div>` : ''}
    ${attn.length ? `<div class="attn">${attn.map(([k, ic, l, cnt, tone]) => `<button class="attn-item ${tone}" data-act="flag" data-v="${k}"><span class="ic">${ms(ic, 'fill')}</span><span>${l}<small>${cnt}台 ${S.flag === k ? '・絞り込み中' : 'をタップで表示'}</small></span></button>`).join('')}</div>` : ''}
    ${n ? `<label class="search">${ms('search')}<input id="q" type="search" placeholder="管理番号・モデル・CPU・場所・借りている人で検索" value="${esc(S.q)}"></label>
    <div class="filters">
      ${chipRow('メーカー', 'maker', countBy(makerOf))}
      ${chipRow('OS', 'os', countBy(osOf))}
      ${chipRow('状態', 'status', STATUSES.map(s => [s, pcs.filter(p => p.status === s).length]).filter(x => x[1]))}
      ${chipRow('タグ', 'tag', tagEntries())}
      <div class="chip-row"><span class="chip-label">その他</span>
        <button class="chip ${S.fav ? 'on' : ''}" data-act="favfilter">${ms('star', S.fav ? 'fill' : '')}お気に入り <small>${pcs.filter(p => p.fav).length}</small></button>
        ${(S.maker || S.os || S.status || S.flag || S.fav || S.tag || S.q) ? `<button class="chip" data-act="clearf">${ms('filter_alt_off')}条件をクリア</button>` : ''}</div>
    </div>
    <div class="toolbar"><span class="count" id="count"></span>
      <div class="right">
        <button class="btn ${S.sel ? 'filled' : 'tonal'}" data-act="selmode">${ms('checklist')}${S.sel ? '選択中' : '選択'}</button>
        <label class="sort">${ms('workspaces')}<select id="group">${Object.entries(GROUPS).map(([k, l]) => `<option value="${k}" ${S.group === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="sort">${ms('sort')}<select id="sort">${Object.entries(SORTS).map(([k, l]) => `<option value="${k}" ${S.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <div class="seg"><button class="${cfg.layout === 'grid' ? 'on' : ''}" data-act="layout" data-v="grid" aria-label="カード">${ms('grid_view')}</button><button class="${cfg.layout === 'list' ? 'on' : ''}" data-act="layout" data-v="list" aria-label="リスト">${ms('view_list')}</button></div>
      </div></div>
    <div id="devList"></div>` : `
    <div class="empty"><div class="blob">${ms('computer', 'fill')}</div><h3>まだPCが登録されていません</h3><p>右下の「追加」から1台目を登録しましょう。</p>
      <button class="btn filled" data-act="add">${ms('add')}最初のPCを追加</button><button class="btn tonal" data-act="sample">${ms('auto_awesome')}サンプルで試す</button></div>`}`;
  const q = $('#q'); if (q) q.oninput = e => { S.q = e.target.value; renderList(); };
  const so = $('#sort'); if (so) so.onchange = e => { S.sort = e.target.value; renderList(); };
  const gr = $('#group'); if (gr) gr.onchange = e => { S.group = e.target.value; renderList(); };
  if (n) renderList();
  updateSelbar();
}

function cardHTML(p, i) {
  const [sic, stone] = ST[p.status] || ST['稼働中'];
  const ph = photosOf(p)[0];
  const flags = flagsOf(p).slice(0, 3);
  const thumb = ph ? `<img src="${ph}" alt="${esc(p.no)}" loading="lazy">` : `<div class="blob">${ms(kindIcon(p), 'fill')}</div>`;
  return `<article class="card ${S.sel && S.sel.has(p.id) ? 'picked' : ''}" style="--i:${i}" data-act="open" data-id="${p.id}">${S.sel ? `<span class="selbox">${ms('check')}</span>` : ''}
    <div class="c-photo">${thumb}
      <span class="pill dark no">${esc(p.no)}</span>
      <button class="icon-btn fav ${p.fav ? 'on' : ''}" data-act="fav" data-id="${p.id}" aria-label="お気に入り">${ms('star', p.fav ? 'fill' : '')}</button>
      <span class="pill st ${stone}">${ms(sic, 'fill')}${esc(p.status || '')}${p.loan ? ' ・ ' + esc(p.loan.who) : ''}</span>
    </div>
    <div class="c-body">
      <div class="maker-row"><div class="maker">${logoOrMono(p)}</div><span class="kind">${ms(kindIcon(p))}${esc(p.kind || '')}</span></div>
      <h3>${esc(p.model || '（モデル名未入力）')}</h3>
      ${p.nick || p.place ? `<p class="sub">${esc([p.nick, p.place].filter(Boolean).join(' ・ '))}</p>` : ''}
      <div class="chips">
        <span class="tag os">${ms(osIcon(p))}${esc(osFull(p))}</span>
        ${p.ram ? `<span class="tag">${ms('memory_alt')}${esc(p.ram)}GB</span>` : ''}
        ${p.storage ? `<span class="tag">${ms('storage')}${esc(p.storageType || '')} ${fmtGB(p.storage)}</span>` : ''}
      </div>
      <div class="c-cpu">${ms('memory')}${esc(p.cpu || 'CPU未入力')}</div>
      ${flags.length ? `<div class="flags">${flags.map(f => `<span class="flag ${f.tone}">${ms(f.icon, 'fill')}${esc(f.t)}</span>`).join('')}</div>` : ''}
    </div></article>`;
}

function renderList() {
  const list = filtered(); const host = $('#devList'); if (!host) return;
  $('#count').textContent = `${list.length} / ${pcs.length} 台を表示`;
  const lay = cfg.layout === 'list' ? 'list' : 'grid', gfn = groupFn();
  host.className = (S.sel ? 'selmode ' : '') + (gfn ? 'grouped' : lay);
  host.innerHTML = list.length ? (gfn ? groupedHTML(list, gfn, lay) : list.map(cardHTML).join('')) :
    `<div class="empty" style="grid-column:1/-1"><div class="blob">${ms('search_off')}</div><h3>該当するPCがありません</h3><p>条件を変えてみてください。</p><button class="btn tonal" data-act="clearf">${ms('filter_alt_off')}条件をクリア</button></div>`;
}

/* ---------- 分析画面 ---------- */
function hbars(entries, color) {
  const max = Math.max(1, ...entries.map(e => e[1]));
  return `<div class="hbars">${entries.map(([k, n], i) => `<div class="hbar"><span>${esc(k)}</span><div class="tr"><div class="fl" style="width:${n / max * 100}%;background:${color || chartColors[i % chartColors.length]};animation-delay:${i * 70}ms"></div></div><b>${n}</b></div>`).join('')}</div>`;
}
function donut(entries, centerLabel) {
  const total = entries.reduce((s, e) => s + e[1], 0) || 1; let acc = 0;
  const stops = entries.map(([, n], i) => { const a = acc / total * 100; acc += n; return `${chartColors[i % chartColors.length]} ${a}% ${acc / total * 100}%`; }).join(',');
  return `<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${stops})"><div class="donut-c"><div><b>${total}</b><small>${centerLabel}</small></div></div></div>
    <div class="legend">${entries.map(([k, n], i) => `<div><i style="background:${chartColors[i % chartColors.length]}"></i>${esc(k)}<b>${n}台</b></div>`).join('')}</div></div>`;
}
function healthScore() {
  if (!pcs.length) return 0;
  let pts = 0;
  pcs.forEach(p => {
    let s = 100; const yr = new Date().getFullYear();
    if (isEol(p)) s -= 35;
    if (['故障', '修理中'].includes(p.status)) s -= 40;
    if (p.ram && p.ram < 8) s -= 10;
    if (/hdd/i.test(p.storageType || '')) s -= 10;
    if (p.year && yr - p.year >= 7) s -= 10;
    if (checkState(p) === 'old' || checkState(p) === 'never') s -= 5;
    if (warrantyState(p) === 'expired') s -= 5;
    pts += Math.max(0, s);
  });
  return Math.round(pts / pcs.length);
}

function viewAnalytics() {
  if (!pcs.length) { $('#view').innerHTML = `<div class="page-head"><div><h1>分析</h1></div></div><div class="empty"><div class="blob">${ms('insights', 'fill')}</div><h3>データがありません</h3><p>PCを登録すると、構成や更新時期の分析が表示されます。</p></div>`; return; }
  const sc = healthScore(), yr = new Date().getFullYear();
  const scColor = sc >= 80 ? 'var(--ok)' : sc >= 60 ? 'var(--warn)' : 'var(--err)';
  const ramB = [['4GB以下', p => p.ram && p.ram <= 4], ['8GB', p => p.ram > 4 && p.ram <= 8], ['16GB', p => p.ram > 8 && p.ram <= 16], ['32GB以上', p => p.ram > 16], ['未入力', p => !p.ram]].map(([l, f]) => [l, pcs.filter(f).length]);
  const years = {}; pcs.forEach(p => { const k = p.year || '不明'; years[k] = (years[k] || 0) + 1; });
  const yEntries = Object.entries(years).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const yMax = Math.max(1, ...yEntries.map(e => e[1]));
  const ramSum = pcs.reduce((s, p) => s + (+p.ram || 0), 0), stSum = pcs.reduce((s, p) => s + (+p.storage || 0), 0);
  const yrs = pcs.filter(p => p.year).map(p => yr - p.year); const avgAge = yrs.length ? (yrs.reduce((a, b) => a + b, 0) / yrs.length).toFixed(1) : '—';
  const recs = pcs.map(p => ({ p, a: advice(p) })).filter(x => x.a.length).sort((a, b) => b.a.length - a.a.length);
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>分析</h1><p>機材構成のバランスと、更新が必要なPCを確認します</p></div></div>
    <div class="panels">
      <div class="panel"><h3>${ms('favorite', 'fill')}機材コンディション</h3>
        <div class="score"><div class="ring" style="--p:${sc};--c:${scColor}"><b>${sc}</b></div>
        <div class="kv" style="flex:1;min-width:160px"><span>合計メモリ</span><b>${ramSum} GB</b><span>合計ストレージ</span><b>${fmtGB(stSum)}</b><span>平均の経過年数</span><b>${avgAge}${avgAge === '—' ? '' : ' 年'}</b><span>Windows 10</span><b>${pcs.filter(isEol).length} 台</b></div></div>
        <p class="sub" style="margin-top:12px;font-size:12px;color:var(--on-surface-var)">OSサポート・状態・メモリ・ストレージ種類・経過年数・点検から算出した目安のスコアです。</p></div>
      <div class="panel"><h3>${ms('window', 'fill')}OS の内訳</h3>${donut(countBy(osOf), '台')}</div>
      <div class="panel"><h3>${ms('business', 'fill')}メーカー別</h3>${hbars(countBy(makerOf))}</div>
      <div class="panel"><h3>${ms('memory_alt', 'fill')}メモリ容量</h3>${hbars(ramB.filter(x => x[1]))}</div>
      <div class="panel"><h3>${ms('storage', 'fill')}ストレージ種類</h3>${donut(countBy(p => p.storageType || '不明'), '台')}</div>
      <div class="panel"><h3>${ms('calendar_month', 'fill')}導入年</h3><div class="cols">${yEntries.map(([k, n], i) => `<div class="col"><b>${n}</b><i style="height:${n / yMax * 100}%;background:${chartColors[i % chartColors.length]};animation-delay:${i * 80}ms"></i><span>${esc(k)}</span></div>`).join('')}</div></div>
      ${extraPanels()}
      <div class="panel span2"><h3>${ms('tips_and_updates', 'fill')}更新・対応のおすすめ <small style="font-weight:500;color:var(--on-surface-var)">${recs.length}台</small></h3>
        ${recs.length ? recs.slice(0, 30).map(({ p, a }) => `<div class="advice" style="flex-direction:column;gap:2px;cursor:pointer" data-act="open" data-id="${p.id}">
          <b style="font-size:15px">${esc(p.no)} ・ ${esc(makerOf(p))} ${esc(p.model || '')}</b>
          ${a.map(x => `<div class="advice" style="padding:6px 0;border:0"><span class="av ${x.tone}">${ms(x.icon, 'fill')}</span><div><b>${esc(x.t)}</b><span>${esc(x.s)}</span></div></div>`).join('')}</div>`).join('') : `<p style="color:var(--on-surface-var)">対応が必要なPCはありません。すばらしい状態です！</p>`}
      </div>
    </div>`;
}

/* ---------- 貸出・点検画面 ---------- */
function rowItem(p, tone, icon, title, sub, btn) {
  return `<div class="rowitem" data-act="open" data-id="${p.id}"><span class="av ${tone}">${ms(icon, 'fill')}</span><div class="tx"><b>${esc(title)}</b><span>${esc(sub)}</span></div>${btn || ms('chevron_right')}</div>`;
}
function viewOps() {
  const loans = pcs.filter(p => p.loan).sort((a, b) => (a.loan.due || '9999').localeCompare(b.loan.due || '9999'));
  const checks = pcs.filter(p => ['never', 'old'].includes(checkState(p)));
  const wars = pcs.filter(p => ['expired', 'soon'].includes(warrantyState(p))).sort((a, b) => a.warrantyEnd.localeCompare(b.warrantyEnd));
  const avail = pcs.filter(p => p.status === '稼働中' && !p.loan);
  const hist = pcs.flatMap(p => (p.log || []).map(l => ({ ...l, p }))).sort((a, b) => b.t - a.t).slice(0, 15);
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>貸出・点検</h1><p>貸し出し状況、点検、保証期限、最近の変更をまとめて確認します</p></div></div>
    <div class="sec">${ms('handshake', 'fill')}<h2>貸出中</h2><small>${loans.length}台</small></div>
    <div class="rows">${loans.length ? loans.map(p => {
      const od = p.loan.due && p.loan.due < today(); const dd = p.loan.due ? diffDays(p.loan.due, today()) : null;
      return rowItem(p, od ? 't-bad' : 't-info', od ? 'alarm' : 'handshake', `${p.no} ・ ${p.loan.who}`, `${makerOf(p)} ${p.model || ''} ／ 返却予定 ${fmtD(p.loan.due)}${dd === null ? '' : od ? `（${-dd}日超過）` : dd === 0 ? '（今日）' : `（あと${dd}日）`}`,
        `<button class="btn tonal" data-act="return" data-id="${p.id}">${ms('assignment_return')}返却</button>`);
    }).join('') : `<div class="panel" style="color:var(--on-surface-var)">いま貸し出し中のPCはありません。</div>`}</div>
    ${avail.length ? `<div class="sec">${ms('inventory_2', 'fill')}<h2>貸し出せるPC</h2><small>${avail.length}台</small></div>
    <div class="rows">${avail.slice(0, 8).map(p => rowItem(p, 't-ok', kindIcon(p), `${p.no} ・ ${makerOf(p)} ${p.model || ''}`, `${osFull(p)} ／ ${p.place || '場所未設定'}`, `<button class="btn tonal" data-act="lend" data-id="${p.id}">${ms('handshake')}貸出</button>`)).join('')}</div>` : ''}
    <div class="sec">${ms('fact_check', 'fill')}<h2>点検が必要</h2><small>${checks.length}台（最終点検から180日超 または 未点検）</small></div>
    <div class="rows">${checks.length ? checks.map(p => rowItem(p, 't-warn', 'fact_check', `${p.no} ・ ${makerOf(p)} ${p.model || ''}`, p.lastCheck ? `最終点検 ${fmtD(p.lastCheck)}` : '点検の記録がありません',
      `<button class="btn tonal" data-act="checked" data-id="${p.id}">${ms('done')}点検済み</button>`)).join('') : `<div class="panel" style="color:var(--on-surface-var)">すべて点検済みです。</div>`}</div>
    <div class="sec">${ms('verified_user', 'fill')}<h2>保証期限</h2><small>${wars.length}台（切れ・90日以内）</small></div>
    <div class="rows">${wars.length ? wars.map(p => { const d = diffDays(p.warrantyEnd, today()); return rowItem(p, d < 0 ? 't-mute' : 't-warn', 'verified_user', `${p.no} ・ ${makerOf(p)} ${p.model || ''}`, `${fmtD(p.warrantyEnd)} ${d < 0 ? '（切れています）' : `（あと${d}日）`}`); }).join('') : `<div class="panel" style="color:var(--on-surface-var)">期限が近いPCはありません。</div>`}</div>
    <div class="sec">${ms('history', 'fill')}<h2>最近の変更</h2></div>
    <div class="panel"><div class="timeline">${hist.length ? hist.map(h => `<div class="tl"><i></i><div><b>${esc(h.p.no)}</b> ${esc(h.e)}<span>${fmtDT(h.t)}</span></div></div>`).join('') : '<span style="color:var(--on-surface-var)">まだ履歴がありません。</span>'}</div></div>`;
}

/* ---------- 設定画面 ---------- */
function viewSettings() {
  const names = [...new Set([...MAKERS, ...pcs.filter(p => p.maker === 'その他' && p.makerOther).map(makerOf)])];
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>設定</h1><p>見た目・ロゴ・バックアップ</p></div></div>
    <div class="set-group"><h3>${ms('school', 'fill')}学校・部活の名前</h3><p>ホーム画面の見出しに表示されます。</p>
      <label class="tf" style="margin-top:10px"><span>名前</span><input id="orgInput" value="${esc(cfg.org)}" placeholder="例: ○○高校 パソコン部"></label></div>
    <div class="set-group"><h3>${ms('palette', 'fill')}テーマ</h3><p>好きな色を選ぶと、アプリ全体の配色が自動で変わります。</p>
      <div class="seg" style="margin-bottom:10px">
        ${[['auto', 'brightness_auto', '自動'], ['light', 'light_mode', 'ライト'], ['dark', 'dark_mode', 'ダーク']].map(([k, ic, l]) => `<button class="${cfg.mode === k ? 'on' : ''}" data-act="mode" data-v="${k}">${ms(ic)}${l}</button>`).join('')}
      </div>
      <div class="swatches">${HUES.map(([n, h]) => `<button class="swatch ${cfg.hue === h ? 'on' : ''}" style="background:hsl(${h} 62% 46%)" data-act="hue" data-v="${h}" aria-label="${n}">${ms('check')}</button>`).join('')}</div></div>
    <div class="set-group"><h3>${ms('image', 'fill')}メーカーロゴ</h3><p>公式サイトなどで入手したロゴ画像（PNG/JPG/SVG）を設定すると、カードに表示されます。未設定のときは頭文字のマークで表示します。</p>
      ${names.map(n => `<div class="logo-item"><span class="nm">${esc(n)}</span><span class="pv">${logos[n] ? `<img src="${logos[n]}" alt="">` : '未設定'}</span>
        <label class="btn tonal">${ms('upload')}画像<input type="file" accept="image/*" hidden data-logo="${esc(n)}"></label>
        ${logos[n] ? `<button class="icon-btn" data-act="logoclear" data-n="${esc(n)}" aria-label="解除">${ms('close')}</button>` : ''}</div>`).join('')}</div>
    <div class="set-group"><h3>${ms('cloud_sync', 'fill')}バックアップ・書き出し</h3><p>データはこのiPadの中に保存されます。${lastBackup ? `最後のバックアップ: ${fmtDT(lastBackup)}。` : 'まだバックアップしていません。'}</p>
      <div class="btn-row">${canFiles() ? `<button class="btn filled" data-act="share">${ms('ios_share')}共有して保存（ファイル・AirDrop）</button>` : ''}
      <button class="btn ${canFiles() ? 'tonal' : 'filled'}" data-act="export">${ms('download')}書き出し (JSON)</button>
      <button class="btn tonal" data-act="import">${ms('upload_file')}読み込み</button>
      <button class="btn tonal" data-act="csv">${ms('table_view')}CSV書き出し</button>
      <button class="btn tonal" data-act="importcsv">${ms('upload_file')}CSV読み込み</button>
      <button class="btn tonal" data-act="csvtpl">${ms('description')}CSVの雛形</button>
      <button class="btn tonal" data-act="print">${ms('print')}台帳を印刷</button></div></div>
    <div class="set-group"><h3>${ms('science', 'fill')}その他</h3>
      <div class="btn-row"><button class="btn outlined" data-act="sample">${ms('auto_awesome')}サンプルを追加</button>
      <button class="btn danger tonal" data-act="wipe">${ms('delete_forever')}全データを削除</button></div></div>
    <p style="text-align:center;color:var(--on-surface-var);font-size:12px">PC Hub v2.0 ・ Material 3 Expressive</p>`;
}

/* ---------- 詳細ダイアログ ---------- */
function showDetail(id) {
  const p = pcs.find(x => x.id === id); if (!p) return;
  const [sic, stone] = ST[p.status] || ST['稼働中'];
  const photos = photosOf(p);
  const cell = (ic, l, v) => v ? `<div class="spec-cell">${ms(ic, 'fill')}<div><small>${l}</small><b>${esc(v)}</b></div></div>` : '';
  const adv = advice(p); const w = warrantyState(p), cs = checkState(p);
  const od = p.loan && p.loan.due && p.loan.due < today();
  const dlg = $('#dlgDetail');
  dlg.innerHTML = `<div class="d-wrap">
    <div class="d-top"><button class="icon-btn" data-act="close" aria-label="閉じる">${ms('arrow_back')}</button>
      <div class="grp"><button class="icon-btn" style="background:color-mix(in srgb,#000 48%,transparent);color:${p.fav ? '#ffd54a' : '#fff'}" data-act="fav" data-id="${p.id}" data-keep="1" aria-label="お気に入り">${ms('star', p.fav ? 'fill' : '')}</button></div></div>
    <div class="d-hero">${photos.length ? photos.map(s => `<img src="${s}" alt="">`).join('') : `<div class="ph"><div class="blob" style="width:200px">${ms(kindIcon(p), 'fill')}</div></div>`}</div>
    ${photos.length > 1 ? `<span class="pill dark d-count">${ms('photo_library')}横にスワイプ ${photos.length}枚</span>` : ''}
    <div class="d-body">
      <div class="d-title"><div>
        <div class="maker-row" style="justify-content:flex-start;gap:12px"><div class="maker">${logoOrMono(p)}</div><span class="kind">${ms(kindIcon(p))}${esc(p.kind || '')}</span></div>
        <h2>${esc(p.model || '（モデル名未入力）')}</h2>
        <span class="sub" style="color:var(--on-surface-var);font-size:13px">${esc(p.no)}${p.nick ? ' ・ ' + esc(p.nick) : ''}</span></div>
        <span class="pill ${stone}" style="height:34px">${ms(sic, 'fill')}${esc(p.status || '')}</span></div>
      <div class="d-actions">
        <button class="btn filled" data-act="edit" data-id="${p.id}">${ms('edit')}編集</button>
        ${p.loan ? `<button class="btn tonal" data-act="return" data-id="${p.id}">${ms('assignment_return')}返却</button>` : `<button class="btn tonal" data-act="lend" data-id="${p.id}">${ms('handshake')}貸し出す</button>`}
        <button class="btn tonal" data-act="checked" data-id="${p.id}">${ms('fact_check')}点検済み</button>
        <button class="btn tonal" data-act="dup" data-id="${p.id}">${ms('content_copy')}複製</button>
        <button class="btn tonal" data-act="note" data-id="${p.id}">${ms('edit_note')}メモ</button>
      </div>
      ${p.loan ? `<div class="loan-card ${od ? 't-bad' : 't-info'}">${ms(od ? 'alarm' : 'handshake', 'fill')}<div class="grow"><b>${esc(p.loan.who)} さんが貸出中</b><span class="s">${fmtD(p.loan.from)} 〜 返却予定 ${fmtD(p.loan.due)}${od ? `（${diffDays(today(), p.loan.due)}日超過）` : ''}</span></div></div>` : ''}
      <div class="d-sec"><h3>${ms('memory', 'fill')}スペック</h3><div class="spec-grid">
        ${cell(osIcon(p), 'OS', osFull(p))}${cell('memory', 'CPU', p.cpu)}${cell('memory_alt', 'メモリ', p.ram ? p.ram + ' GB' : '')}
        ${cell('storage', 'ストレージ', p.storage ? `${p.storageType || ''} ${fmtGB(p.storage)}` : '')}${cell('aspect_ratio', '画面', p.screen ? p.screen + ' インチ' : '')}</div></div>
      <div class="d-sec"><h3>${ms('inventory_2', 'fill')}管理情報</h3><div class="spec-grid">
        ${cell('location_on', '設置場所', p.place)}${cell('calendar_month', '導入年', p.year ? p.year + '年' : '')}
        ${cell('verified_user', '保証期限', p.warrantyEnd ? fmtD(p.warrantyEnd) + (w === 'expired' ? '（切れ）' : w === 'soon' ? '（まもなく）' : '') : '')}
        ${cell('fact_check', '最終点検', p.lastCheck ? fmtD(p.lastCheck) + (cs === 'old' ? '（要点検）' : '') : '未点検')}
        ${cell('tag', 'シリアル', p.serial)}${cell('dns', 'ホスト名', p.host)}${cell('lan', 'MACアドレス', p.mac)}${cell('cable', '付属品', p.accessories)}${cell('payments', '購入金額', p.price ? '¥' + Number(p.price).toLocaleString() : '')}${cell('repeat', '貸出回数', p.loanCount ? p.loanCount + '回' : '')}${cell('checklist', '最終棚卸し', p.lastAudit ? fmtD(p.lastAudit) : '')}</div></div>
      ${(p.tags || []).length || (p.software || []).length ? `<div class="d-sec"><h3>${ms('sell', 'fill')}タグ・ソフト</h3><div class="chips">${(p.tags || []).map(t => `<span class="tag os">${ms('sell')}${esc(t)}</span>`).join('')}${(p.software || []).map(t => `<span class="tag">${ms('apps')}${esc(t)}</span>`).join('')}</div></div>` : ''}
      ${adv.length ? `<div class="d-sec"><h3>${ms('tips_and_updates', 'fill')}おすすめ・注意</h3>${adv.map(x => `<div class="advice"><span class="av ${x.tone}">${ms(x.icon, 'fill')}</span><div><b>${esc(x.t)}</b><span>${esc(x.s)}</span></div></div>`).join('')}</div>` : ''}
      ${p.memo ? `<div class="d-sec"><h3>${ms('sticky_note_2', 'fill')}備考</h3><div class="memo">${esc(p.memo)}</div></div>` : ''}
      ${(p.log || []).length ? `<div class="d-sec"><h3>${ms('history', 'fill')}履歴</h3><div class="timeline">${p.log.slice(0, 12).map(l => `<div class="tl"><i></i><div>${esc(l.e)}<span>${fmtDT(l.t)}</span></div></div>`).join('')}</div></div>` : ''}
    </div></div>`;
  if (!dlg.open) dlg.showModal();
}

/* ---------- フォーム ---------- */
function syncOther() {
  $('#makerOtherWrap').hidden = $('#fMakerSel').value !== 'その他';
  $('#osOtherWrap').hidden = $('#fOSSel').value !== 'その他';
}
function renderPhotoStrip() {
  $('#photoStrip').innerHTML = formPhotos.map((s, i) => `<div class="pthumb"><img src="${s}" alt=""><button type="button" data-act="rmphoto" data-i="${i}" aria-label="削除">${ms('close')}</button></div>`).join('') +
    (formPhotos.length < MAX_PHOTOS ? `<button type="button" class="padd" data-act="addphoto">${ms('add_a_photo')}撮影／選択</button>` : '');
}
function openForm(id, base) {
  const f = $('#form'); f.reset();
  editingId = id || null;
  const p = id ? pcs.find(x => x.id === id) : (base || null);
  $('#formTitle').textContent = id ? 'PC情報を編集' : (base ? 'PCを複製' : 'PCを追加');
  $('#btnDelete').hidden = !id;
  f.elements.kind.innerHTML = Object.keys(KINDS).map(m => `<option>${m}</option>`).join('');
  f.elements.status.innerHTML = STATUSES.map(m => `<option>${m}</option>`).join('');
  $('#fMakerSel').innerHTML = [...MAKERS, 'その他'].map(m => `<option>${m}</option>`).join('');
  $('#fOSSel').innerHTML = OSES.map(m => `<option>${m}</option>`).join('');
  if (p) { const pv = { ...p, tags: (p.tags || []).join(', '), software: (p.software || []).join(', ') }; for (const el of f.elements) if (el.name && pv[el.name] !== undefined && pv[el.name] !== null) el.value = pv[el.name]; formPhotos = [...photosOf(p)]; }
  else formPhotos = [];
  if (!id) {
    const nums = pcs.map(x => parseInt(String(x.no).replace(/\D/g, ''), 10)).filter(Number.isFinite);
    f.elements.no.value = 'PC-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
    if (!p) f.elements.year.value = new Date().getFullYear();
  }
  renderPhotoStrip(); syncOther();
  $('#dlgDetail').close();
  $('#dlgForm').showModal();
  $('.sheet-body', $('#dlgForm')).scrollTop = 0;
}

async function saveForm(e) {
  e.preventDefault();
  const f = $('#form'); const data = {};
  for (const el of f.elements) if (el.name) data[el.name] = el.value.trim();
  ['ram', 'storage', 'year', 'price'].forEach(k => data[k] = data[k] ? Number(data[k]) : '');
  data.tags = splitList(data.tags); data.software = splitList(data.software);
  if (data.maker !== 'その他') data.makerOther = '';
  if (data.os !== 'その他') data.osOther = '';
  const old = editingId ? pcs.find(x => x.id === editingId) : null;
  const rec = { ...(old || { id: uid(), created: Date.now(), log: [], loan: null, fav: false }), ...data, photos: formPhotos, updated: Date.now() };
  if (old) {
    const diff = Object.keys(data).filter(k => String(old[k] ?? '') !== String(data[k] ?? ''));
    if (old.status !== rec.status) log(rec, `状態を「${old.status}」→「${rec.status}」に変更`);
    if (diff.some(k => k !== 'status') || JSON.stringify(old.photos) !== JSON.stringify(formPhotos)) log(rec, '情報を更新');
    if (rec.status !== '貸出中' && rec.loan) rec.loan = null;
  } else log(rec, '登録');
  await dbPut(rec);
  const i = pcs.findIndex(x => x.id === rec.id); if (i >= 0) pcs[i] = rec; else pcs.push(rec);
  $('#dlgForm').close(); render(); toast('保存しました');
}

/* ---------- 貸出・返却・点検 ---------- */
function openLoan(id) {
  const p = pcs.find(x => x.id === id); if (!p) return;
  loanId = id; const f = $('#loanForm'); f.reset();
  $('#loanTarget').textContent = `${p.no} ・ ${makerOf(p)} ${p.model || ''}`;
  f.elements.due.value = addDays(today(), 7);
  const who = new Set(); pcs.forEach(x => (x.log || []).forEach(l => { const m = String(l.e).match(/^(.+) さんに貸出/); if (m) who.add(m[1]); }));
  $('#whoList').innerHTML = [...who].slice(0, 40).map(w => `<option value="${esc(w)}">`).join('');
  $('#dlgDetail').close(); $('#dlgLoan').showModal();
}
async function persist(p) { p.updated = Date.now(); await dbPut(p); }
async function doLoan(e) {
  e.preventDefault();
  const p = pcs.find(x => x.id === loanId); if (!p) return;
  const f = e.target.elements;
  p.loan = { who: f.who.value.trim(), from: today(), due: f.due.value || '' };
  p.status = '貸出中'; p.loanCount = (p.loanCount || 0) + 1; log(p, `${p.loan.who} さんに貸出${p.loan.due ? `（返却予定 ${fmtD(p.loan.due)}）` : ''}`);
  await persist(p); $('#dlgLoan').close(); render(); toast(`${p.no} を貸し出しました`);
}
async function doReturn(id) {
  const p = pcs.find(x => x.id === id); if (!p || !p.loan) return;
  const who = p.loan.who; p.loan = null; p.status = '稼働中'; log(p, `${who} さんから返却`);
  await persist(p); refreshOpen(id); toast(`${p.no} が返却されました`);
}
async function doChecked(id) {
  const p = pcs.find(x => x.id === id); if (!p) return;
  p.lastCheck = today(); log(p, '点検済みにしました');
  await persist(p); refreshOpen(id); toast(`${p.no} を点検済みにしました`);
}
function refreshOpen(id) { render(); if ($('#dlgDetail').open) showDetail(id); }

async function doDelete(id) {
  const p = pcs.find(x => x.id === id); if (!p) return;
  if (!confirm(`${p.no} を削除します。よろしいですか？`)) return;
  await dbDel(id); pcs = pcs.filter(x => x.id !== id);
  $('#dlgForm').close(); $('#dlgDetail').close(); render();
  toast(`${p.no} を削除しました`, '元に戻す', async () => { await dbPut(p); pcs.push(p); render(); });
}
async function doDup(id) {
  const p = pcs.find(x => x.id === id); if (!p) return;
  const c = JSON.parse(JSON.stringify(p)); delete c.id; c.loan = null; c.log = []; c.fav = false; c.serial = ''; c.mac = ''; c.host = ''; c.status = '稼働中';
  c.no = ''; // 管理番号は新規採番
  openForm(null, c);
}

/* ---------- 書き出し・読み込み・印刷 ---------- */
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const stamp = () => today();
async function exportJSON() {
  download(`pc-hub-backup-${stamp()}.json`, backupPayload(), 'application/json');
  lastBackup = Date.now(); await metaSet('lastBackup', lastBackup); render(); toast('バックアップを書き出しました');
}
function exportCSV() {
  const cols = [['管理番号', 'no'], ['呼び名', 'nick'], ['種類', 'kind'], ['メーカー', makerOf], ['モデル', 'model'], ['OS', osOf], ['OSバージョン', 'osVer'], ['CPU', 'cpu'], ['メモリGB', 'ram'], ['ストレージGB', 'storage'], ['ストレージ種類', 'storageType'],
    ['画面', 'screen'], ['導入年', 'year'], ['状態', 'status'], ['場所', 'place'], ['貸出先', p => p.loan ? p.loan.who : ''], ['返却予定', p => p.loan ? p.loan.due : ''], ['保証期限', 'warrantyEnd'], ['最終点検', 'lastCheck'], ['シリアル', 'serial'], ['ホスト名', 'host'], ['MAC', 'mac'], ['付属品', 'accessories'], ['備考', 'memo'], ['タグ', p => (p.tags || []).join('、')], ['ソフト', p => (p.software || []).join('、')], ['購入金額', 'price']];
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = [cols.map(c => q(c[0])).join(',')].concat(pcs.slice().sort((a, b) => natCmp(a.no, b.no)).map(p => cols.map(c => q(typeof c[1] === 'function' ? c[1](p) : p[c[1]])).join(',')));
  download(`pc-hub-${stamp()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv');
}
async function importJSON(file) {
  try {
    const j = JSON.parse(await file.text());
    if (!Array.isArray(j.pcs)) throw new Error('形式が違います');
    if (!confirm(`${j.pcs.length} 台のデータを読み込みます。同じIDのデータは上書きされます。よろしいですか？`)) return;
    for (const p of j.pcs) { if (!p.id) p.id = uid(); await dbPut(migrate(p)); }
    if (j.logos) { logos = { ...logos, ...j.logos }; await metaSet('logos', logos); }
    if (j.audit && j.audit.history) { audit = { active: audit.active, history: j.audit.history }; await saveAudit(); }
    pcs = (await dbAll()).map(migrate); render(); toast('読み込みました');
  } catch (err) { alert('読み込みに失敗しました: ' + err.message); }
}
function printLedger() {
  const rows = pcs.slice().sort((a, b) => natCmp(a.no, b.no));
  $('#printArea').innerHTML = `<h1>PC台帳（パソコン部）</h1><div>${fmtD(today())} 現在 ・ ${rows.length}台</div><table><thead><tr>${['管理番号', '種類', 'メーカー', 'モデル', 'OS', 'CPU', 'メモリ', 'ストレージ', '導入年', '状態', '場所', '貸出先'].map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
    ${rows.map(p => `<tr><td>${esc(p.no)}</td><td>${esc(p.kind)}</td><td>${esc(makerOf(p))}</td><td>${esc(p.model)}</td><td>${esc(osFull(p))}</td><td>${esc(p.cpu)}</td><td>${p.ram ? p.ram + 'GB' : ''}</td><td>${p.storage ? esc(p.storageType || '') + ' ' + fmtGB(p.storage) : ''}</td><td>${esc(p.year)}</td><td>${esc(p.status)}</td><td>${esc(p.place)}</td><td>${p.loan ? esc(p.loan.who) : ''}</td></tr>`).join('')}</tbody></table>`;
  setTimeout(() => window.print(), 50);
}

/* ---------- グループ・タグ ---------- */
const groupFn = () => ({ place: p => p.place || '場所未設定', maker: makerOf, os: osOf, status: p => p.status || '—' })[S.group] || null;
const GROUP_ICON = { place: 'location_on', maker: 'business', os: 'window', status: 'flag' };
function groupedHTML(list, gfn, lay) {
  const m = new Map(); list.forEach(p => { const k = gfn(p); if (!m.has(k)) m.set(k, []); m.get(k).push(p); });
  let i = 0;
  return [...m].map(([k, arr]) => `<div class="grp-head">${ms(GROUP_ICON[S.group], 'fill')}${esc(k)}<small>${arr.length}台</small></div><div class="${lay}">${arr.map(p => cardHTML(p, i++)).join('')}</div>`).join('');
}
const tagEntries = () => { const m = {}; pcs.forEach(p => (p.tags || []).forEach(t => m[t] = (m[t] || 0) + 1)); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
const splitList = s => String(s || '').split(/[,、，\n|]+/).map(x => x.trim()).filter(Boolean);

/* ---------- 分析の追加パネル ---------- */
function extraPanels() {
  const money = pcs.reduce((s, p) => s + (+p.price || 0), 0), priced = pcs.filter(p => p.price).length;
  const places = countBy(p => p.place || '場所未設定');
  const sw = {}; pcs.forEach(p => (p.software || []).forEach(s => sw[s] = (sw[s] || 0) + 1));
  const swE = Object.entries(sw).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const tg = tagEntries().slice(0, 8);
  const lent = pcs.filter(p => p.loanCount).sort((a, b) => b.loanCount - a.loanCount).slice(0, 5).map(p => [p.no, p.loanCount]);
  return `<div class="panel"><h3>${ms('location_on', 'fill')}場所別</h3>${hbars(places)}</div>
    ${money ? `<div class="panel"><h3>${ms('payments', 'fill')}購入金額</h3><div class="big-num">¥${money.toLocaleString()}</div><span style="color:var(--on-surface-var);font-size:13px">${priced}台分の合計</span>
      <div class="kv" style="margin-top:14px"><span>1台あたり平均</span><b>¥${Math.round(money / priced).toLocaleString()}</b></div></div>` : ''}
    ${tg.length ? `<div class="panel"><h3>${ms('sell', 'fill')}タグ別</h3>${hbars(tg)}</div>` : ''}
    ${swE.length ? `<div class="panel"><h3>${ms('apps', 'fill')}よく入っているソフト</h3>${hbars(swE)}</div>` : ''}
    ${lent.length ? `<div class="panel"><h3>${ms('trending_up', 'fill')}よく貸し出されるPC</h3>${hbars(lent)}</div>` : ''}`;
}

/* ---------- 選択モード・一括操作・比較 ---------- */
function updateSelbar() {
  const bar = $('#selbar'); if (!bar) return;
  if (S.view !== 'devices' || !S.sel) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = `<span class="selcount">${S.sel.size}台を選択</span>
    <button class="btn text" data-act="selall">すべて</button>
    <label class="sort">${ms('flag')}<select id="bulkStatus"><option value="">状態を変更</option>${STATUSES.map(s => `<option>${s}</option>`).join('')}</select></label>
    <button class="btn tonal" data-act="bulkplace">${ms('location_on')}場所</button>
    <button class="btn tonal" data-act="bulkcheck">${ms('fact_check')}点検済み</button>
    <button class="btn tonal" data-act="compare">${ms('compare_arrows')}比較</button>
    <button class="btn danger tonal" data-act="bulkdel" aria-label="削除">${ms('delete')}</button>
    <button class="icon-btn" data-act="selmode" aria-label="選択を終了">${ms('close')}</button>`;
  $('#bulkStatus').onchange = e => {
    const v = e.target.value; if (!v || !S.sel.size) return;
    bulk(p => { if (p.status !== v) log(p, `状態を「${p.status}」→「${v}」に変更`); p.status = v; if (v !== '貸出中') p.loan = null; }, `${S.sel.size}台の状態を「${v}」にしました`);
  };
}
function toggleSel(id, el) {
  if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id);
  if (el) el.classList.toggle('picked', S.sel.has(id));
  updateSelbar();
}
async function bulk(fn, msg) {
  if (!S.sel || !S.sel.size) return;
  for (const id of S.sel) { const p = pcs.find(x => x.id === id); if (p) { fn(p); await persist(p); } }
  render(); toast(msg);
}
function showCompare() {
  const ps = [...(S.sel || [])].map(id => pcs.find(x => x.id === id)).filter(Boolean).slice(0, 4);
  if (ps.length < 2) { toast('比較するPCを2台以上選んでください'); return; }
  const rows = [['メーカー', makerOf], ['モデル', p => p.model || '—'], ['種類', p => p.kind || '—'], ['OS', osFull], ['CPU', p => p.cpu || '—'],
    ['メモリ', p => p.ram ? p.ram + ' GB' : '—', p => +p.ram || 0], ['ストレージ', p => p.storage ? `${p.storageType || ''} ${fmtGB(p.storage)}` : '—', p => +p.storage || 0],
    ['画面', p => p.screen ? p.screen + ' 型' : '—'], ['導入年', p => p.year || '—', p => +p.year || 0], ['状態', p => p.status || '—'], ['場所', p => p.place || '—']];
  const dlg = $('#dlgCompare');
  dlg.innerHTML = `<header class="sheet-bar"><button type="button" class="icon-btn" data-act="close" aria-label="閉じる">${ms('close')}</button><h2>スペック比較</h2></header>
    <div class="sheet-body"><p style="color:var(--on-surface-var);font-size:13px;margin-bottom:10px">緑色は、メモリ・ストレージが最も大きい／導入年が最も新しい項目です。</p>
    <div class="cmp-wrap"><table class="cmp"><thead><tr><th></th>${ps.map(p => `<th>${esc(p.no)}<small>${esc(makerOf(p))}</small></th>`).join('')}</tr></thead><tbody>
    ${rows.map(([l, f, num]) => {
      const vals = num ? ps.map(num) : [], max = vals.length ? Math.max(...vals) : 0, allSame = vals.every(v => v === vals[0]);
      return `<tr><th>${l}</th>${ps.map((p, i) => `<td class="${num && max > 0 && !allSame && vals[i] === max ? 'best' : ''}">${esc(f(p))}</td>`).join('')}</tr>`;
    }).join('')}</tbody></table></div></div>`;
  dlg.showModal();
}
async function addNote(id) {
  const p = pcs.find(x => x.id === id); if (!p) return;
  const t = prompt('履歴に残すメモ（例: バッテリー交換、OS再インストール）'); if (!t || !t.trim()) return;
  log(p, 'メモ: ' + t.trim()); await persist(p); refreshOpen(id); toast('履歴に追加しました');
}

/* ---------- 棚卸し ---------- */
let audit = { active: null, history: [] }, auditTodo = false;
const saveAudit = () => metaSet('audit', audit);
const auditPlaces = () => { const m = {}; pcs.forEach(p => { const k = p.place || '場所未設定'; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => natCmp(a[0], b[0])); };
async function auditStart(place) {
  const ids = pcs.filter(p => !place || (p.place || '場所未設定') === place).map(p => p.id);
  if (!ids.length) { toast('対象のPCがありません'); return; }
  audit.active = { at: Date.now(), place: place || '', ids, done: [] }; auditTodo = false; await saveAudit(); viewAudit();
}
function auditProgress() {
  const a = audit.active; if (!a) return; const pct = a.ids.length ? Math.round(a.done.length / a.ids.length * 100) : 0;
  const r = $('#aring'); if (r) { r.style.setProperty('--p', pct); r.querySelector('b').textContent = pct + '%'; }
  const c = $('#acount'); if (c) c.textContent = `${a.done.length} / ${a.ids.length} 台 確認済み`;
}
function auditToggle(id, el) {
  const a = audit.active; if (!a) return; const i = a.done.indexOf(id);
  if (i >= 0) a.done.splice(i, 1); else a.done.push(id);
  el.classList.toggle('done', a.done.includes(id));
  if (auditTodo && a.done.includes(id)) el.hidden = true;
  auditProgress(); saveAudit();
}
async function auditFinish() {
  const a = audit.active; if (!a) return;
  const miss = a.ids.filter(id => !a.done.includes(id));
  if (miss.length && !confirm(`未確認のPCが ${miss.length} 台あります。このまま完了しますか？（「見つからなかった」として記録されます）`)) return;
  const d = today();
  for (const id of a.ids) {
    const p = pcs.find(x => x.id === id); if (!p) continue;
    if (a.done.includes(id)) { p.lastAudit = d; log(p, '棚卸しで確認'); } else log(p, '棚卸しで未確認');
    await persist(p);
  }
  audit.history.unshift({ at: Date.now(), place: a.place, total: a.ids.length, ok: a.done.length, missing: miss.map(id => { const p = pcs.find(x => x.id === id); return { id, no: p ? p.no : '?', name: p ? `${makerOf(p)} ${p.model || ''}` : '' }; }) });
  audit.history = audit.history.slice(0, 20); audit.active = null; await saveAudit(); render(); toast('棚卸しを記録しました');
}
function viewAudit() {
  const a = audit.active, v = $('#view');
  if (!pcs.length) { v.innerHTML = `<div class="page-head"><div><h1>棚卸し</h1></div></div><div class="empty"><div class="blob">${ms('checklist', 'fill')}</div><h3>PCが登録されていません</h3><p>PCを登録すると棚卸しができます。</p></div>`; return; }
  if (!a) {
    const hist = audit.history || [];
    v.innerHTML = `<div class="page-head"><div><h1>棚卸し</h1><p>現物を1台ずつ確認して、台帳とのズレを見つけます</p></div></div>
      <div class="panel"><h3>${ms('play_circle', 'fill')}棚卸しを始める</h3><p style="color:var(--on-surface-var);margin-bottom:14px">確認する場所を選んでください。途中でアプリを閉じても、続きから再開できます。</p>
        <div class="chips" style="gap:8px"><button class="chip on" data-act="astart" data-place="">${ms('select_all')}すべて <small>${pcs.length}</small></button>
        ${auditPlaces().map(([pl, n]) => `<button class="chip" data-act="astart" data-place="${esc(pl)}">${ms('location_on')}${esc(pl)} <small>${n}</small></button>`).join('')}</div></div>
      <div class="sec">${ms('history', 'fill')}<h2>過去の棚卸し</h2></div>
      <div class="rows">${hist.length ? hist.map(h => `<div class="rowitem" style="cursor:default"><span class="av ${h.missing.length ? 't-warn' : 't-ok'}">${ms(h.missing.length ? 'report' : 'verified', 'fill')}</span><div class="tx"><b>${fmtDT(h.at)} ・ ${esc(h.place || 'すべての場所')}</b><span>${h.ok} / ${h.total} 台を確認${h.missing.length ? ' ／ 未確認: ' + h.missing.map(m => esc(m.no)).join('、') : ' ／ すべて確認できました'}</span></div></div>`).join('') : `<div class="panel" style="color:var(--on-surface-var)">まだ棚卸しの記録がありません。</div>`}</div>`;
    return;
  }
  const ps = a.ids.map(id => pcs.find(x => x.id === id)).filter(Boolean).sort((x, y) => natCmp(x.place || '', y.place || '') || natCmp(x.no, y.no));
  const groups = new Map(); ps.forEach(p => { const k = p.place || '場所未設定'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
  v.innerHTML = `<div class="page-head"><div><h1>棚卸し中</h1><p>${esc(a.place || 'すべての場所')} ・ ${fmtDT(a.at)} 開始</p></div>
      <div class="head-actions"><button class="btn text" data-act="acancel">中止</button><button class="btn filled" data-act="afinish">${ms('check')}完了する</button></div></div>
    <div class="panel audit-top"><div class="ring" id="aring" style="--p:0;--c:var(--ok)"><b>0%</b></div>
      <div><b id="acount" style="font-size:20px"></b><p style="color:var(--on-surface-var);font-size:14px">見つかったPCをタップして、チェックを入れてください。</p>
      <button class="chip ${auditTodo ? 'on' : ''}" data-act="atodo" style="margin-top:8px">${auditTodo ? ms('check') : ''}未確認だけ表示</button></div></div>
    ${[...groups].map(([k, arr]) => `<div class="grp-head">${ms('location_on', 'fill')}${esc(k)}<small>${arr.length}台</small></div><div class="rows">${arr.map(p => `<button class="arow ${a.done.includes(p.id) ? 'done' : ''}" data-act="acheck" data-id="${p.id}"${auditTodo && a.done.includes(p.id) ? ' hidden' : ''}><span class="abox">${ms('check')}</span><div class="tx"><b>${esc(p.no)} ・ ${esc(makerOf(p))} ${esc(p.model || '')}</b><span>${esc(osFull(p))}${p.lastAudit ? ' ／ 前回 ' + fmtD(p.lastAudit) : ''}</span></div></button>`).join('')}</div>`).join('')}`;
  auditProgress();
}

/* ---------- 共有・CSV取り込み ---------- */
const backupPayload = () => JSON.stringify({ app: 'pc-hub', version: 3, pcs, logos, audit }, null, 1);
function canFiles() { try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'a.json', { type: 'application/json' })] })); } catch (e) { return false; } }
async function shareBackup() {
  const file = new File([backupPayload()], `pc-hub-backup-${stamp()}.json`, { type: 'application/json' });
  try {
    await navigator.share({ files: [file], title: 'PC Hub バックアップ' });
    lastBackup = Date.now(); await metaSet('lastBackup', lastBackup); render(); toast('バックアップを保存しました');
  } catch (e) { /* キャンセル */ }
}
function parseCSV(text) {
  text = text.replace(/^﻿/, ''); const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some(x => x !== '')) rows.push(row);
  return rows;
}
const CSV_MAP = { '管理番号': 'no', '呼び名': 'nick', '種類': 'kind', 'メーカー': 'maker', 'モデル': 'model', 'OS': 'os', 'OSバージョン': 'osVer', 'CPU': 'cpu', 'メモリGB': 'ram', 'ストレージGB': 'storage', 'ストレージ種類': 'storageType', '画面': 'screen', '導入年': 'year', '状態': 'status', '場所': 'place', '貸出先': 'loanWho', '返却予定': 'loanDue', '保証期限': 'warrantyEnd', '最終点検': 'lastCheck', 'シリアル': 'serial', 'ホスト名': 'host', 'MAC': 'mac', '付属品': 'accessories', '備考': 'memo', 'タグ': 'tags', 'ソフト': 'software', '購入金額': 'price' };
const normDate = s => { const m = String(s || '').match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/); return m ? `${m[1]}-${pad(+m[2])}-${pad(+m[3])}` : ''; };
async function importCSV(file) {
  try {
    const rows = parseCSV(await file.text()); if (rows.length < 2) throw new Error('データの行がありません');
    const keys = rows[0].map(h => CSV_MAP[h.trim()] || null);
    if (!keys.includes('no')) throw new Error('「管理番号」の列が見つかりません。「CSVの雛形」を使うと確実です');
    const recs = rows.slice(1).map(r => { const o = {}; keys.forEach((k, i) => { if (k) o[k] = (r[i] || '').trim(); }); return o; }).filter(o => o.no);
    if (!recs.length) throw new Error('管理番号が入っている行がありません');
    if (!confirm(`${recs.length} 台分を読み込みます（同じ管理番号は上書き）。よろしいですか？`)) return;
    let add = 0, upd = 0;
    for (const o of recs) {
      const old = pcs.find(p => p.no === o.no);
      const p = old || migrate({ id: uid(), created: Date.now(), makerOther: '', osOther: '', photos: [] });
      if (o.maker !== undefined && o.maker) { if (MAKERS.includes(o.maker)) { p.maker = o.maker; p.makerOther = ''; } else { p.maker = 'その他'; p.makerOther = o.maker; } }
      if (!p.maker) p.maker = MAKERS[0];
      if (o.os !== undefined && o.os) { if (OSES.includes(o.os) && o.os !== 'その他') { p.os = o.os; p.osOther = ''; } else { p.os = 'その他'; p.osOther = o.os; } }
      if (!p.os) p.os = OSES[0];
      if (o.kind) p.kind = KINDS[o.kind] ? o.kind : 'その他'; if (!p.kind) p.kind = 'ノートPC';
      if (o.status) p.status = STATUSES.includes(o.status) ? o.status : '稼働中'; if (!p.status) p.status = '稼働中';
      ['no', 'nick', 'model', 'osVer', 'cpu', 'storageType', 'screen', 'place', 'serial', 'host', 'mac', 'accessories', 'memo'].forEach(k => { if (o[k] !== undefined) p[k] = o[k]; });
      ['ram', 'storage', 'year', 'price'].forEach(k => { if (o[k] !== undefined) p[k] = o[k] ? (Number(String(o[k]).replace(/[,¥円\s]/g, '')) || '') : ''; });
      ['warrantyEnd', 'lastCheck'].forEach(k => { if (o[k] !== undefined) p[k] = normDate(o[k]); });
      if (o.tags !== undefined) p.tags = splitList(o.tags);
      if (o.software !== undefined) p.software = splitList(o.software);
      if (o.loanWho) { p.loan = { who: o.loanWho, from: p.loan ? p.loan.from : today(), due: normDate(o.loanDue) }; p.status = '貸出中'; }
      else if ('loanWho' in o && p.loan) { p.loan = null; if (p.status === '貸出中') p.status = '稼働中'; }
      log(p, old ? 'CSVで更新' : 'CSVで登録'); p.updated = Date.now();
      await dbPut(p); if (old) upd++; else { pcs.push(p); add++; }
    }
    render(); toast(`読み込み完了: 追加 ${add}台 ・ 更新 ${upd}台`);
  } catch (err) { alert('CSVの読み込みに失敗しました: ' + err.message); }
}
function csvTemplate() {
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  const head = Object.keys(CSV_MAP);
  const ex = [
    { '管理番号': 'PC-101', '種類': 'ノートPC', 'メーカー': 'Lenovo', 'モデル': 'ThinkPad L13', 'OS': 'Windows 11', 'OSバージョン': '24H2', 'CPU': 'Core i5-1135G7', 'メモリGB': 16, 'ストレージGB': 256, 'ストレージ種類': 'SSD', '導入年': 2022, '状態': '稼働中', '場所': 'PC室 棚A', 'タグ': 'プログラミング用、大会用', 'ソフト': 'VS Code、Python', '購入金額': 98000 },
    { '管理番号': 'PC-102', '種類': 'デスクトップ', 'メーカー': 'Dell', 'モデル': 'OptiPlex 3080', 'OS': 'Windows 10', 'OSバージョン': '22H2', 'CPU': 'Core i3-10100', 'メモリGB': 8, 'ストレージGB': 256, 'ストレージ種類': 'SSD', '導入年': 2020, '状態': '稼働中', '場所': '準備室', '保証期限': '2025/3/31' }
  ];
  download('pc-hub-template.csv', '﻿' + [head.map(q).join(',')].concat(ex.map(r => head.map(h => q(r[h] ?? '')).join(','))).join('\r\n'), 'text/csv');
}

/* ---------- このPCの情報を読み取る ---------- */
async function detectDevice() {
  const f = $('#form').elements; const ua = navigator.userAgent; let os = '', note = [];
  if (/CrOS/.test(ua)) os = 'ChromeOS Flex';
  else if (/Windows/.test(ua)) {
    os = 'Windows 10';
    try { const h = await navigator.userAgentData.getHighEntropyValues(['platformVersion']); if (parseInt(h.platformVersion, 10) >= 13) os = 'Windows 11'; } catch (e) { note.push('Windows 10/11 の区別はできませんでした'); }
  }
  else if (/iPhone|iPad/.test(ua)) { toast('iPadの情報は読み取れません。PCのブラウザで開いてください'); return; }
  else if (/Macintosh|Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua) && !/Android/.test(ua)) { os = 'Ubuntu'; note.push('Linuxの種類（Zorin OS など）は確認してください'); }
  if (os) { f.os.value = os; syncOther(); }
  if (navigator.deviceMemory) f.ram.value = navigator.deviceMemory;
  if (navigator.hardwareConcurrency && !f.memo.value) f.memo.value = `論理CPU数: ${navigator.hardwareConcurrency}`;
  toast('読み取りました。メモリは目安です。実際の値を確認してください' + (note.length ? '（' + note[0] + '）' : ''));
}

/* ---------- キーボードショートカット（外付けキーボード用） ---------- */
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || document.querySelector('dialog[open]')) return;
  if (e.key === '/') { const q = $('#q'); if (q) { e.preventDefault(); q.focus(); } }
  else if (e.key === 'n') openForm();
});

/* ---------- サンプル ---------- */
async function addSamples() {
  const t = today(), y = new Date().getFullYear();
  const D = [
    { no: 'PC-001', kind: 'ノートPC', maker: 'Lenovo', model: 'ThinkPad L13 Gen 2', os: 'Windows 11', osVer: '24H2', cpu: 'Core i5-1135G7', ram: 16, storage: 256, storageType: 'NVMe SSD', screen: '13.3', year: y - 4, status: '稼働中', place: 'PC室 棚A', warrantyEnd: addDays(t, 45), lastCheck: addDays(t, -30), accessories: 'ACアダプタ', fav: true, tags: ['プログラミング用'], software: ['VS Code', 'Python'], price: 98000 },
    { no: 'PC-002', kind: 'ノートPC', maker: 'Dell', model: 'Latitude 3410', os: 'Windows 10', osVer: '22H2', cpu: 'Core i3-10110U', ram: 8, storage: 256, storageType: 'SSD', screen: '14', year: y - 5, status: '稼働中', place: 'PC室 棚A', warrantyEnd: addDays(t, -200), lastCheck: addDays(t, -250) },
    { no: 'PC-003', kind: 'ノートPC', maker: 'HP', model: 'ProBook 450 G8', os: 'Zorin OS', osVer: '17', cpu: 'Core i5-1135G7', ram: 8, storage: 512, storageType: 'SSD', screen: '15.6', year: y - 4, status: '貸出中', place: 'PC室 棚B', lastCheck: addDays(t, -60), loan: { who: '2年 山田さん', from: addDays(t, -10), due: addDays(t, -3) } },
    { no: 'PC-004', kind: 'デスクトップ', maker: 'Dell', model: 'OptiPlex 3080 Micro', os: 'ChromeOS Flex', osVer: '130', cpu: 'Core i3-10100T', ram: 4, storage: 128, storageType: 'HDD', year: y - 6, status: '保管中', place: '準備室' },
    { no: 'PC-005', kind: 'ノートPC', maker: 'Lenovo', model: 'ThinkPad E14 Gen 4', os: 'Windows 11', osVer: '23H2', cpu: 'Ryzen 5 5625U', ram: 16, storage: 512, storageType: 'NVMe SSD', screen: '14', year: y - 2, status: '稼働中', place: 'PC室 棚B', warrantyEnd: addDays(t, 300), lastCheck: addDays(t, -20), tags: ['動画編集用'], software: ['DaVinci Resolve', 'Python'], price: 128000 },
    { no: 'PC-006', kind: 'ノートPC', maker: 'HP', model: 'EliteBook 840 G5', os: 'Windows 10', osVer: '22H2', cpu: 'Core i5-7300U', ram: 8, storage: 256, storageType: 'SSD', screen: '14', year: y - 8, status: '修理中', place: '顧問席', memo: 'バッテリー膨張の疑い。部品待ち。' },
  ];
  const nums = pcs.map(x => parseInt(String(x.no).replace(/\D/g, ''), 10)).filter(Number.isFinite);
  let off = nums.length ? Math.max(...nums) : 0;
  for (const s of D) {
    off++; const p = migrate({ id: uid(), makerOther: '', osOther: '', serial: '', host: '', mac: '', memo: 'サンプルデータ', warrantyEnd: '', lastCheck: '', accessories: '', photos: [], created: Date.now(), updated: Date.now() - off * 1000, ...s });
    p.no = 'PC-' + String(off).padStart(3, '0'); log(p, '登録（サンプル）');
    await dbPut(p); pcs.push(p);
  }
  render(); toast('サンプルを追加しました');
}

/* ---------- イベント ---------- */
document.addEventListener('click', async e => {
  const dlg = e.target; if (dlg.tagName === 'DIALOG') { if (dlg.id !== 'dlgForm') dlg.close(); return; } // 入力中のフォームは背景タップで閉じない
  const t = e.target.closest('[data-act]'); if (!t) return;
  const d = t.dataset, id = d.id;
  switch (d.act) {
    case 'nav': S.view = d.v; S.sel = null; render(); window.scrollTo(0, 0); break;
    case 'close': t.closest('dialog').close(); break;
    case 'add': openForm(); break;
    case 'open': if (S.sel && S.view === 'devices' && t.classList.contains('card')) toggleSel(id, t); else showDetail(id); break;
    case 'edit': openForm(id); break;
    case 'dup': doDup(id); break;
    case 'fav': { e.stopPropagation(); const p = pcs.find(x => x.id === id); p.fav = !p.fav; await persist(p); if (d.keep) showDetail(id); render(); break; }
    case 'lend': openLoan(id); break;
    case 'return': doReturn(id); break;
    case 'checked': doChecked(id); break;
    case 'due': $('#loanForm').elements.due.value = addDays(today(), +d.days); break;
    case 'filter': S[d.k] = d.v; viewDevices(); break;
    case 'flag': S.flag = S.flag === d.v ? '' : d.v; viewDevices(); break;
    case 'favfilter': S.fav = !S.fav; viewDevices(); break;
    case 'clearf': Object.assign(S, { q: '', maker: '', os: '', status: '', flag: '', fav: false, tag: '' }); viewDevices(); break;
    case 'layout': cfg.layout = d.v; saveCfg(); viewDevices(); break;
    case 'mode': cfg.mode = d.v; saveCfg(); applyTheme(); render(); break;
    case 'hue': cfg.hue = +d.v; saveCfg(); applyTheme(); render(); break;
    case 'logoclear': delete logos[d.n]; await metaSet('logos', logos); render(); break;
    case 'export': exportJSON(); break;
    case 'import': $('#importInput').click(); break;
    case 'csv': exportCSV(); break;
    case 'print': printLedger(); break;
    case 'sample': addSamples(); break;
    case 'wipe':
      if (confirm('登録した全データを削除します。元に戻せません。先にバックアップを書き出しましたか？') && confirm('本当に全て削除しますか？')) { await dbClear(); pcs = []; render(); toast('全データを削除しました'); }
      break;
    case 'addphoto': $('#photoInput').click(); break;
    case 'selmode': S.sel = S.sel ? null : new Set(); viewDevices(); break;
    case 'selall': filtered().forEach(p => S.sel.add(p.id)); renderList(); updateSelbar(); break;
    case 'bulkplace': {
      const v = prompt('移動先の場所（例: PC室 棚A）'); if (v === null) break; const nv = v.trim();
      bulk(p => { if ((p.place || '') !== nv) { log(p, `場所を「${p.place || '未設定'}」→「${nv || '未設定'}」に変更`); p.place = nv; } }, `${S.sel.size}台の場所を変更しました`); break;
    }
    case 'bulkcheck': bulk(p => { p.lastCheck = today(); log(p, '点検済みにしました'); }, `${S.sel.size}台を点検済みにしました`); break;
    case 'bulkdel': {
      const gone = [...S.sel].map(i => pcs.find(x => x.id === i)).filter(Boolean); if (!gone.length) break;
      if (!confirm(`${gone.length}台を削除します。よろしいですか？`)) break;
      for (const p of gone) await dbDel(p.id);
      pcs = pcs.filter(p => !gone.includes(p)); S.sel = new Set(); render();
      toast(`${gone.length}台を削除しました`, '元に戻す', async () => { for (const p of gone) { await dbPut(p); pcs.push(p); } render(); });
      break;
    }
    case 'compare': showCompare(); break;
    case 'note': addNote(id); break;
    case 'detect': detectDevice(); break;
    case 'astart': auditStart(d.place); break;
    case 'acheck': auditToggle(id, t); break;
    case 'afinish': auditFinish(); break;
    case 'acancel': if (confirm('進行中の棚卸しを中止しますか？（チェックは破棄されます）')) { audit.active = null; saveAudit(); viewAudit(); } break;
    case 'atodo': auditTodo = !auditTodo; viewAudit(); break;
    case 'backup': canFiles() ? shareBackup() : exportJSON(); break;
    case 'share': shareBackup(); break;
    case 'importcsv': $('#csvInput').click(); break;
    case 'csvtpl': csvTemplate(); break;
    case 'rmphoto': formPhotos.splice(+d.i, 1); renderPhotoStrip(); break;
  }
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset && t.dataset.logo && t.files[0]) {
    const f = t.files[0];
    logos[t.dataset.logo] = f.type === 'image/svg+xml' ? await fileToDataURL(f) : await resizeImage(f, 320, 0.92, f.type === 'image/png' ? 'image/png' : 'image/jpeg');
    await metaSet('logos', logos); render(); toast('ロゴを設定しました');
  }
  if (t.id === 'fMakerSel' || t.id === 'fOSSel') syncOther();
  if (t.id === 'photoInput') {
    for (const f of [...t.files].slice(0, MAX_PHOTOS - formPhotos.length)) formPhotos.push(await resizeImage(f));
    t.value = ''; renderPhotoStrip();
  }
  if (t.id === 'importInput' && t.files[0]) { importJSON(t.files[0]); t.value = ''; }
  if (t.id === 'csvInput' && t.files[0]) { importCSV(t.files[0]); t.value = ''; }
  if (t.id === 'orgInput') { cfg.org = t.value.trim(); saveCfg(); toast('保存しました'); }
});
document.addEventListener('submit', e => {
  if (e.target.id === 'form') saveForm(e);
  if (e.target.id === 'loanForm') doLoan(e);
});
document.addEventListener('click', e => { if (e.target.id === 'btnDelete' || e.target.closest('#btnDelete')) doDelete(editingId); });

/* ---------- 起動 ---------- */
(async function init() {
  applyTheme();
  if (document.fonts && document.fonts.load) document.fonts.load('24px "Material Symbols Rounded"', 'check').then(f => { if (f.length) document.documentElement.classList.add('icons'); }).catch(() => { });
  db = await openDB();
  pcs = (await dbAll()).map(migrate);
  logos = (await metaGet('logos')) || {};
  lastBackup = (await metaGet('lastBackup')) || 0;
  audit = (await metaGet('audit')) || { active: null, history: [] }; audit.history = audit.history || [];
  render();
  if (new URLSearchParams(location.search).get('new')) openForm();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
})();
