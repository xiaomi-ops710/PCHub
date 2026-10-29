'use strict';
/* PC Hub — 学校パソコン部向け PC管理ダッシュボード（ブラウザ内IndexedDBに保存） */

const MAKERS = ['Lenovo', 'Dell', 'HP'];
const OSES = ['Windows 11', 'Windows 10', 'Zorin OS', 'ChromeOS Flex', 'Ubuntu', 'macOS', 'その他'];
const STATUSES = ['稼働中', '貸出中', '修理中', '保管中', '故障', '廃棄予定'];
const ICON_PC = '<svg viewBox="0 0 64 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="6" width="44" height="28" rx="3"/><path d="M4 42h56l-5-8H9z"/></svg>';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const dbAll = () => req(store('pcs').getAll());
const dbPut = o => req(store('pcs', 'readwrite').put(o));
const dbDel = id => req(store('pcs', 'readwrite').delete(id));
const dbClear = () => req(store('pcs', 'readwrite').clear());
const metaGet = k => req(store('meta').get(k));
const metaSet = (k, v) => req(store('meta', 'readwrite').put(v, k));

let pcs = [];
let logos = {}; // maker -> dataURL
let editingId = null;
let photoData = '';

/* ---------- helpers ---------- */
const makerOf = p => p.maker === 'その他' ? (p.makerOther || 'その他') : p.maker;
const osOf = p => p.os === 'その他' ? (p.osOther || 'その他') : p.os;
const osFull = p => osOf(p) + (p.osVer ? ' ' + p.osVer : '');
const fmtGB = n => { n = Number(n); if (!n) return '—'; return n >= 1000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0).replace(/\.0$/, '') + ' TB' : n + ' GB'; };
const isEol = p => p.os === 'Windows 10'; // Windows 10 は 2025-10-14 にサポート終了
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2200); }
function uid() { return 'pc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function resizeImage(file, max = 960, q = 0.8) {
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
        res(c.toDataURL('image/jpeg', q));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
const fileToDataURL = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });

/* ---------- filters & sorting ---------- */
const state = { q: '', maker: '', os: '', status: '', sort: 'no' };

function fillSelect(sel, label, items, value) {
  sel.innerHTML = `<option value="">${label}</option>` + items.map(i => `<option value="${esc(i)}">${esc(i)}</option>`).join('');
  sel.value = value || '';
}
function refreshFilters() {
  const makers = [...new Set([...MAKERS, ...pcs.map(makerOf)])];
  const oses = [...new Set([...OSES.filter(o => o !== 'その他'), ...pcs.map(osOf)])];
  fillSelect($('#fMaker'), 'メーカー：すべて', makers, state.maker);
  fillSelect($('#fOS'), 'OS：すべて', oses, state.os);
  fillSelect($('#fStatus'), '状態：すべて', STATUSES, state.status);
}

function filtered() {
  const q = state.q.trim().toLowerCase();
  let list = pcs.filter(p => {
    if (state.maker && makerOf(p) !== state.maker) return false;
    if (state.os && osOf(p) !== state.os) return false;
    if (state.status && p.status !== state.status) return false;
    if (q) {
      const hay = [p.no, p.nick, p.kind, makerOf(p), p.model, osFull(p), p.cpu, p.place, p.serial, p.memo, p.year].join(' ').toLowerCase();
      if (!q.split(/\s+/).every(w => hay.includes(w))) return false;
    }
    return true;
  });
  const by = {
    no: (a, b) => String(a.no).localeCompare(String(b.no), 'ja', { numeric: true }),
    maker: (a, b) => makerOf(a).localeCompare(makerOf(b)) || String(a.no).localeCompare(String(b.no), 'ja', { numeric: true }),
    os: (a, b) => osFull(a).localeCompare(osFull(b)) || String(a.no).localeCompare(String(b.no), 'ja', { numeric: true }),
    ram: (a, b) => (b.ram || 0) - (a.ram || 0),
    year: (a, b) => (b.year || 0) - (a.year || 0),
    updated: (a, b) => (b.updated || 0) - (a.updated || 0),
  }[state.sort];
  return list.sort(by);
}

/* ---------- render ---------- */
function makerHTML(p) {
  const name = makerOf(p);
  return logos[name] ? `<img src="${logos[name]}" alt="${esc(name)}">` : esc(name);
}

function renderStats() {
  const total = pcs.length;
  const ramSum = pcs.reduce((s, p) => s + (Number(p.ram) || 0), 0);
  const stSum = pcs.reduce((s, p) => s + (Number(p.storage) || 0), 0);
  const eol = pcs.filter(isEol).length;
  const count = (fn) => { const m = {}; pcs.forEach(p => { const k = fn(p); m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const bars = (entries, key) => {
    const max = Math.max(1, ...entries.map(e => e[1]));
    return '<div class="bars">' + entries.map(([k, n]) => `<div class="bar" data-f="${key}" data-v="${esc(k)}"><span class="l">${esc(k)}</span><i style="width:${n / max * 100}%"></i><b>${n}</b></div>`).join('') + '</div>';
  };
  $('#stats').innerHTML = `
    <div class="stat"><h4>登録台数</h4><div class="big">${total}<small>台</small></div>
      <div class="note" style="margin-top:6px">稼働中 ${pcs.filter(p => p.status === '稼働中').length} ／ 貸出中 ${pcs.filter(p => p.status === '貸出中').length} ／ 要対応 ${pcs.filter(p => ['修理中', '故障', '廃棄予定'].includes(p.status)).length}</div></div>
    <div class="stat"><h4>メーカー別</h4>${bars(count(makerOf), 'maker') || '—'}</div>
    <div class="stat"><h4>OS別</h4>${bars(count(osOf), 'os') || '—'}</div>
    <div class="stat"><h4>合計メモリ / ストレージ</h4><div class="big">${ramSum}<small>GB RAM</small></div><div class="big" style="font-size:22px;margin-top:4px">${fmtGB(stSum)}<small>保存容量</small></div></div>
    ${eol ? `<div class="alert" data-f="os" data-v="Windows 10">⚠️ Windows 10 のPCが ${eol} 台あります（2025年10月14日にサポート終了）。Windows 11への移行、Zorin OSやChromeOS Flexへの入れ替えを検討しましょう。タップで一覧表示。</div>` : ''}`;
}

function renderGrid() {
  const list = filtered();
  $('#empty').hidden = pcs.length > 0;
  $('#count').textContent = pcs.length ? `${list.length} / ${pcs.length} 台を表示` : '';
  $('#grid').innerHTML = list.map(p => `
    <article class="card" data-id="${p.id}">
      <div class="ph">${p.photo ? `<img src="${p.photo}" alt="${esc(p.no)}" loading="lazy">` : ICON_PC}
        <span class="badge-no">${esc(p.no)}</span>
        <span class="badge-st st-${esc(p.status)}">${esc(p.status || '')}</span></div>
      <div class="body">
        <div class="maker-row"><div class="maker">${makerHTML(p)}</div><span class="kind">${esc(p.kind || '')}</span></div>
        <div class="model">${esc(p.model || '（モデル名未入力）')}</div>
        ${p.nick ? `<div class="nick">${esc(p.nick)}</div>` : ''}
        <div class="chips">
          <span class="chip os">${esc(osFull(p))}</span>
          ${isEol(p) ? '<span class="chip eol">サポート終了</span>' : ''}
          ${p.ram ? `<span class="chip">RAM ${esc(p.ram)}GB</span>` : ''}
          ${p.storage ? `<span class="chip">${esc(p.storageType || '')} ${fmtGB(p.storage)}</span>` : ''}
        </div>
        <dl class="spec">
          <dt>CPU</dt><dd>${esc(p.cpu || '—')}</dd>
          ${p.place ? `<dt>場所</dt><dd>${esc(p.place)}</dd>` : ''}
          ${p.year ? `<dt>導入</dt><dd>${esc(p.year)}年</dd>` : ''}
        </dl>
      </div>
    </article>`).join('');
}

function render() { refreshFilters(); renderStats(); renderGrid(); }

/* ---------- detail ---------- */
function showDetail(id) {
  const p = pcs.find(x => x.id === id); if (!p) return;
  const row = (k, v) => v ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : '';
  const dlg = $('#dlgDetail');
  dlg.innerHTML = `
    <div style="margin:0"><div class="d-photo">${p.photo ? `<img src="${p.photo}" alt="">` : ICON_PC}</div></div>
    <div class="d-body" style="margin:0">
      <div class="maker-row"><div class="maker">${makerHTML(p)}</div><span class="kind">${esc(p.kind || '')}</span></div>
      <h2>${esc(p.model || '（モデル名未入力）')}</h2>
      <div class="note">${esc(p.no)}${p.nick ? ' ／ ' + esc(p.nick) : ''} ／ ${esc(p.status || '')}</div>
      <dl class="spec" style="margin-top:12px">
        ${row('OS', osFull(p))}${row('CPU', p.cpu)}${row('メモリ', p.ram ? p.ram + ' GB' : '')}
        ${row('ストレージ', p.storage ? (p.storageType || '') + ' ' + fmtGB(p.storage) : '')}
        ${row('画面', p.screen ? p.screen + ' インチ' : '')}${row('導入年', p.year ? p.year + '年' : '')}
        ${row('設置場所', p.place)}${row('シリアル', p.serial)}
      </dl>
      ${isEol(p) ? '<div class="alert" style="margin-top:12px;cursor:default">⚠️ Windows 10 はサポートが終了しています</div>' : ''}
      ${p.memo ? `<div class="memo">${esc(p.memo)}</div>` : ''}
    </div>
    <div class="dlg-foot" style="margin:0 20px"><span class="spacer"></span>
      <button class="btn" data-close>閉じる</button><button class="btn primary" data-edit="${p.id}">編集</button></div>`;
  dlg.showModal();
}

/* ---------- form ---------- */
function setPhoto(data) {
  photoData = data || '';
  $('#photoPreview').innerHTML = photoData ? `<img src="${photoData}" alt="">` : `<span style="width:40%;color:var(--sub)">${ICON_PC}</span>`;
}
function syncOther() {
  $('#makerOtherWrap').hidden = $('#fMakerSel').value !== 'その他';
  $('#osOtherWrap').hidden = $('#fOSSel').value !== 'その他';
}
function openForm(id) {
  const f = $('#form');
  f.reset();
  editingId = id || null;
  const p = id ? pcs.find(x => x.id === id) : null;
  $('#formTitle').textContent = p ? 'PC情報を編集' : 'PCを追加';
  $('#btnDelete').hidden = !p;
  $('#fMakerSel').innerHTML = [...MAKERS, 'その他'].map(m => `<option>${m}</option>`).join('');
  $('#fOSSel').innerHTML = OSES.map(m => `<option>${m}</option>`).join('');
  if (p) {
    for (const el of f.elements) if (el.name && p[el.name] !== undefined) el.value = p[el.name];
    setPhoto(p.photo);
  } else {
    setPhoto('');
    const nums = pcs.map(x => parseInt(String(x.no).replace(/\D/g, ''), 10)).filter(Number.isFinite);
    f.elements.no.value = 'PC-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
  }
  syncOther();
  $('#dlgDetail').close();
  $('#dlgForm').showModal();
}

async function saveForm(e) {
  e.preventDefault();
  const f = $('#form');
  const data = {};
  for (const el of f.elements) if (el.name) data[el.name] = el.value.trim();
  data.ram = data.ram ? Number(data.ram) : '';
  data.storage = data.storage ? Number(data.storage) : '';
  data.year = data.year ? Number(data.year) : '';
  data.photo = photoData;
  data.id = editingId || uid();
  data.updated = Date.now();
  if (data.maker !== 'その他') data.makerOther = '';
  if (data.os !== 'その他') data.osOther = '';
  await dbPut(data);
  const i = pcs.findIndex(x => x.id === data.id);
  if (i >= 0) pcs[i] = data; else pcs.push(data);
  $('#dlgForm').close();
  render();
  toast('保存しました');
}

/* ---------- settings ---------- */
function renderLogoList() {
  const names = [...new Set([...MAKERS, ...pcs.filter(p => p.maker === 'その他' && p.makerOther).map(makerOf)])];
  $('#logoList').innerHTML = names.map(n => `
    <div class="logo-item"><span class="nm">${esc(n)}</span>
      <span class="pv">${logos[n] ? `<img src="${logos[n]}" alt="">` : '<span class="note">未設定（文字で表示）</span>'}</span>
      <label class="btn">画像を選ぶ<input type="file" accept="image/*" hidden data-logo="${esc(n)}"></label>
      ${logos[n] ? `<button class="btn" data-logo-clear="${esc(n)}">解除</button>` : ''}
    </div>`).join('');
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const stamp = () => new Date().toISOString().slice(0, 10);

function exportJSON() {
  download(`pc-hub-backup-${stamp()}.json`, JSON.stringify({ app: 'pc-hub', version: 1, pcs, logos }, null, 1), 'application/json');
}
function exportCSV() {
  const cols = [['管理番号', 'no'], ['呼び名', 'nick'], ['種類', 'kind'], ['メーカー', p => makerOf(p)], ['モデル', 'model'], ['OS', p => osOf(p)], ['OSバージョン', 'osVer'],
    ['CPU', 'cpu'], ['メモリGB', 'ram'], ['ストレージGB', 'storage'], ['ストレージ種類', 'storageType'], ['画面', 'screen'], ['導入年', 'year'], ['状態', 'status'], ['場所', 'place'], ['シリアル', 'serial'], ['備考', 'memo']];
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = [cols.map(c => q(c[0])).join(',')].concat(pcs.map(p => cols.map(c => q(typeof c[1] === 'function' ? c[1](p) : p[c[1]])).join(',')));
  download(`pc-hub-${stamp()}.csv`, '\ufeff' + lines.join('\r\n'), 'text/csv');
}
async function importJSON(file) {
  try {
    const j = JSON.parse(await file.text());
    if (!Array.isArray(j.pcs)) throw new Error('形式が違います');
    if (!confirm(`${j.pcs.length} 台のデータを読み込みます。同じIDのデータは上書きされます。よろしいですか？`)) return;
    for (const p of j.pcs) { if (!p.id) p.id = uid(); await dbPut(p); }
    if (j.logos) { logos = { ...logos, ...j.logos }; await metaSet('logos', logos); }
    pcs = await dbAll(); render(); renderLogoList(); toast('読み込みました');
  } catch (err) { alert('読み込みに失敗しました: ' + err.message); }
}

/* ---------- sample data ---------- */
async function addSamples() {
  const S = [
    { no: 'PC-001', kind: 'ノートPC', maker: 'Lenovo', model: 'ThinkPad L13 Gen 2', os: 'Windows 11', osVer: '24H2', cpu: 'Core i5-1135G7', ram: 16, storage: 256, storageType: 'NVMe SSD', screen: '13.3', year: 2021, status: '稼働中', place: 'PC室 棚A' },
    { no: 'PC-002', kind: 'ノートPC', maker: 'Dell', model: 'Latitude 3410', os: 'Windows 10', osVer: '22H2', cpu: 'Core i3-10110U', ram: 8, storage: 256, storageType: 'SSD', screen: '14', year: 2020, status: '稼働中', place: 'PC室 棚A' },
    { no: 'PC-003', kind: 'ノートPC', maker: 'HP', model: 'ProBook 450 G8', os: 'Zorin OS', osVer: '17', cpu: 'Core i5-1135G7', ram: 8, storage: 512, storageType: 'SSD', screen: '15.6', year: 2021, status: '貸出中', place: '顧問貸出' },
    { no: 'PC-004', kind: 'デスクトップ', maker: 'Dell', model: 'OptiPlex 3080 Micro', os: 'ChromeOS Flex', osVer: '130', cpu: 'Core i3-10100T', ram: 8, storage: 128, storageType: 'SSD', year: 2020, status: '保管中', place: '準備室' },
  ];
  for (const s of S) { const p = { id: uid(), makerOther: '', osOther: '', serial: '', memo: 'サンプルデータ', photo: '', updated: Date.now(), ...s }; await dbPut(p); pcs.push(p); }
  render(); toast('サンプルを追加しました');
}

/* ---------- events ---------- */
function bind() {
  $('#btnAdd').onclick = $('#btnAdd2').onclick = () => openForm();
  $('#btnSample').onclick = addSamples;
  $('#btnSettings').onclick = () => { renderLogoList(); $('#dlgSettings').showModal(); };

  $('#q').oninput = e => { state.q = e.target.value; renderGrid(); };
  $('#fMaker').onchange = e => { state.maker = e.target.value; renderGrid(); };
  $('#fOS').onchange = e => { state.os = e.target.value; renderGrid(); };
  $('#fStatus').onchange = e => { state.status = e.target.value; renderGrid(); };
  $('#sort').onchange = e => { state.sort = e.target.value; renderGrid(); };

  $('#grid').onclick = e => { const c = e.target.closest('.card'); if (c) showDetail(c.dataset.id); };
  $('#stats').onclick = e => {
    const t = e.target.closest('[data-f]'); if (!t) return;
    const k = t.dataset.f, v = t.dataset.v;
    state[k] = state[k] === v ? '' : v;
    refreshFilters(); renderGrid();
    window.scrollTo({ top: $('.toolbar').offsetTop - 70, behavior: 'smooth' });
  };

  document.addEventListener('click', e => {
    const cl = e.target.closest('[data-close]'); if (cl) cl.closest('dialog').close();
    const ed = e.target.closest('[data-edit]'); if (ed) openForm(ed.dataset.edit);
    const lc = e.target.closest('[data-logo-clear]'); if (lc) { delete logos[lc.dataset.logoClear]; metaSet('logos', logos).then(() => { renderLogoList(); render(); }); }
    if (e.target.tagName === 'DIALOG') e.target.close(); // 背景タップで閉じる
  });
  document.addEventListener('change', async e => {
    const lg = e.target.closest('[data-logo]');
    if (lg && lg.files[0]) {
      const f = lg.files[0];
      logos[lg.dataset.logo] = f.type === 'image/svg+xml' ? await fileToDataURL(f) : await resizeImage(f, 300, 0.9).then(async d => f.type === 'image/png' ? await pngResize(f) : d);
      await metaSet('logos', logos); renderLogoList(); render(); toast('ロゴを設定しました');
    }
  });

  $('#form').addEventListener('submit', saveForm);
  $('#fMakerSel').onchange = $('#fOSSel').onchange = syncOther;
  $('#photoInput').onchange = async e => { const f = e.target.files[0]; if (f) { setPhoto(await resizeImage(f)); } e.target.value = ''; };
  $('#photoClear').onclick = () => setPhoto('');
  $('#btnDelete').onclick = async () => {
    const p = pcs.find(x => x.id === editingId);
    if (p && confirm(`${p.no} を削除します。よろしいですか？`)) { await dbDel(p.id); pcs = pcs.filter(x => x.id !== p.id); $('#dlgForm').close(); render(); toast('削除しました'); }
  };

  $('#btnExport').onclick = exportJSON;
  $('#btnCsv').onclick = exportCSV;
  $('#importInput').onchange = e => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ''; };
  $('#btnWipe').onclick = async () => {
    if (confirm('登録した全データを削除します。元に戻せません。先にバックアップを書き出しましたか？') && confirm('本当に全て削除しますか？')) { await dbClear(); pcs = []; render(); $('#dlgSettings').close(); toast('全データを削除しました'); }
  };
}

// PNGロゴは透過を保つためPNGのまま縮小
function pngResize(file, max = 300) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/png'));
      };
      img.onerror = rej; img.src = fr.result;
    };
    fr.onerror = rej; fr.readAsDataURL(file);
  });
}

/* ---------- boot ---------- */
(async function init() {
  db = await openDB();
  pcs = await dbAll();
  logos = (await metaGet('logos')) || {};
  bind();
  render();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
})();
