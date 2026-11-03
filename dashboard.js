const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// Developer avatar: bundled dev.jpg -> remote photo -> letter "N"
(function () {
  const sources = [
    'dev.jpg',
    'https://scontent.fdac41-2.fna.fbcdn.net/v/t39.30808-6/530404476_2573685322984381_706010445262383862_n.jpg?stp=dst-jpegr_tt6&cstp=mx2048x1536&ctp=s2048x1536&_nc_cat=108&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=833d8c&_nc_eui2=AeG80hkRX0zFwKBTjyzl4Aq3Uz0yPyC4FUdTPTI_ILgVRzas7wz1WvUQFedXY6Fed19WXcGihxhM6GWaZ_rXNu1N&_nc_ohc=fF47eBIYob4Q7kNvwHL0Wm5&_nc_oc=AdqmzUltfEF73xxskpzEycOSqlMSuusDLNGAgtn6gE-OwFTQ16xxIb7L4FCdgTDXRZ8&_nc_zt=23&se=-1&_nc_ht=scontent.fdac41-2.fna&_nc_gid=d9GyDuc05W1O1QtX5EtKsQ&_nc_ss=7b2a8&oh=00_AQR_CO1oA4QXYC6D5ON7ktpbiFMFGyY7n_h8-t8GYI1OEw&oe=6AEFA9F1'
  ];
  const img = $('devImg'), fb = $('devFallback');
  let i = 0;
  const next = () => { if (i >= sources.length) { img.hidden = true; fb.hidden = false; return; } img.src = sources[i++]; };
  img.addEventListener('error', next);
  next();
})();

let data = null, view = [], statsShown = false;
let map = { name: -1, phone: -1, percent: -1, status: -1 };
let sort = { col: null, dir: 1 };
let selected = new Set(), activeStatus = new Set();
let prefs = { theme: '', compact: true, fmt: 'asis', sep: ',', dedupe: true, op: '', val: 75 };

/* ---------- helpers ---------- */
function detect(headers) {
  const used = new Set();
  const find = res => {
    for (const re of res) {
      const i = headers.findIndex((h, k) => !used.has(k) && re.test(h));
      if (i >= 0) { used.add(i); return i; }
    }
    return -1;
  };
  const phone = find([/phone|mobile|contact|cell|whatsapp/i, /number|no\.?$/i]);
  const percent = find([/%|percent/i, /attendance/i]);
  const name = find([/name/i, /student/i]);
  const status = find([/status/i, /absent|present/i]);
  return { name, phone, percent, status };
}
function parsePct(t) {
  if (t == null) return NaN;
  const s = String(t), m = s.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (m) return parseFloat(m[1]);
  const n = s.match(/-?\d+(?:\.\d+)?/);
  return n ? parseFloat(n[0]) : NaN;
}
function extractPhones(text, fmt) {
  const found = String(text || '').match(/(?:\+?88)?0?1[3-9]\d{8}/g);
  let list = found;
  if (!list) { const d = String(text || '').replace(/[^\d+]/g, ''); list = d.length >= 7 ? [d] : []; }
  return list.map(p => {
    if (fmt === 'asis') return p;
    const core = p.replace(/^\+?88/, '').replace(/^(?=1[3-9]\d{8}$)/, '0');
    return fmt === 'intl' ? '+88' + core : core;
  });
}
const tone = k => /absent|^no$|✗/.test(k) ? 'bad' : /partial|late/.test(k) ? 'warn' : /present|^yes$|✓/.test(k) ? 'ok' : 'neutral';
const pctTone = p => (p < 50 ? 'bad' : p < 80 ? 'warn' : 'ok');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const stKey = r => (map.status >= 0 ? String(r[map.status]).trim().toLowerCase() : '');

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1800);
}
async function copy(text, msg) {
  if (!text) return toast('Nothing to copy');
  try { await navigator.clipboard.writeText(text); }
  catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  toast(msg || 'Copied ✓');
}
const savePrefs = () => chrome.storage.local.set({ prefs });
const saveCfg = () => chrome.storage.local.set({ cfg: { sig: data.headers.join('|'), map } });
function applyTheme() {
  const t = prefs.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = t;
  $('themeBtn').textContent = t === 'dark' ? '☀️' : '🌙';
}

/* ---------- data pipeline ---------- */
function compute() {
  const q = $('search').value.trim().toLowerCase();
  const val = parseFloat(prefs.val), op = prefs.op;
  let rows = data.rows.map((r, i) => ({ r, i, st: stKey(r), pct: map.percent >= 0 ? parsePct(r[map.percent]) : NaN }));
  if (activeStatus.size) rows = rows.filter(o => activeStatus.has(o.st));
  if (q) rows = rows.filter(o => (map.name >= 0 ? o.r[map.name] : o.r.join(' ')).toLowerCase().includes(q));
  if (op && !isNaN(val)) {
    const cmp = { lt: (a, b) => a < b, lte: (a, b) => a <= b, gt: (a, b) => a > b, gte: (a, b) => a >= b }[op];
    rows = rows.filter(o => !isNaN(o.pct) && cmp(o.pct, val));
  }
  if (sort.col !== null) {
    const c = sort.col;
    const key = o => (c === map.percent ? o.pct : o.r[c]);
    const num = x => (typeof x === 'number' ? x : /^-?\d+(\.\d+)?$/.test(x) ? parseFloat(x) : NaN);
    rows.sort((a, b) => {
      const x = key(a), y = key(b), nx = num(x), ny = num(y);
      if (!isNaN(nx) && !isNaN(ny)) return (nx - ny) * sort.dir;
      if (!isNaN(nx)) return -sort.dir;
      if (!isNaN(ny)) return sort.dir;
      return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' }) * sort.dir;
    });
  }
  return rows;
}
function viewCols() {
  if (prefs.compact) {
    const cols = [map.name, map.phone, map.percent, map.status].filter(i => i >= 0);
    if (cols.length) return cols;
  }
  return data.headers.map((_, i) => i);
}
function statusKeys() {
  const counts = new Map();
  data.rows.forEach(r => { const k = stKey(r); if (k) counts.set(k, (counts.get(k) || 0) + 1); });
  const order = { bad: 0, warn: 1, ok: 2, neutral: 3 };
  return [...counts].sort((a, b) => order[tone(a[0])] - order[tone(b[0])]);
}
function phoneResult() {
  const base = view.some(o => selected.has(o.i)) ? view.filter(o => selected.has(o.i)) : view;
  let list = base.flatMap(o => extractPhones(o.r[map.phone], prefs.fmt));
  if (prefs.dedupe) list = [...new Set(list)];
  const missing = base.filter(o => !extractPhones(o.r[map.phone], 'asis').length).length;
  return { list, missing, n: base.length, sel: base !== view };
}

/* ---------- rendering ---------- */
function countUp(node, to, dec, suffix) {
  const t0 = performance.now();
  const f = t => { const p = Math.min(1, (t - t0) / 600); node.textContent = (to * p).toFixed(dec) + suffix; if (p < 1) requestAnimationFrame(f); };
  requestAnimationFrame(f);
}
function renderStats() {
  const box = $('stats'); box.replaceChildren();
  const cards = [{ l: 'Students', v: data.rows.length, t: 'brand-t' }];
  statusKeys().forEach(([k, n]) => cards.push({ l: cap(k), v: n, t: tone(k), key: k }));
  if (map.percent >= 0) {
    const ps = data.rows.map(r => parsePct(r[map.percent])).filter(x => !isNaN(x));
    if (ps.length) cards.push({ l: 'Avg attendance', v: ps.reduce((a, b) => a + b, 0) / ps.length, dec: 1, suf: '%', t: 'brand-t' });
  }
  cards.forEach((c, idx) => {
    const b = el('button', `stat ${c.t}${c.key && activeStatus.has(c.key) ? ' on' : ''}`);
    b.style.animationDelay = idx * 60 + 'ms';
    const n = el('div', 'n'); b.append(n, el('div', 'l', c.l));
    const dec = c.dec || 0, suf = c.suf || '';
    if (statsShown) n.textContent = c.v.toFixed(dec) + suf; else countUp(n, c.v, dec, suf);
    if (c.key) b.onclick = () => { const only = activeStatus.size === 1 && activeStatus.has(c.key); activeStatus.clear(); if (!only) activeStatus.add(c.key); render(); };
    else b.onclick = () => { activeStatus.clear(); render(); };
    box.appendChild(b);
  });
  statsShown = true;
}
function renderChips() {
  const box = $('chips'); box.replaceChildren();
  const keys = statusKeys();
  if (!keys.length) { box.appendChild(el('span', 'note', 'No status column mapped')); return; }
  keys.forEach(([k, n]) => {
    const b = el('button', `chip ${tone(k)}${activeStatus.has(k) ? ' on' : ''}`, `${cap(k)} (${n})`);
    b.onclick = () => { activeStatus.has(k) ? activeStatus.delete(k) : activeStatus.add(k); render(); };
    box.appendChild(b);
  });
}
function renderPct() {
  document.querySelectorAll('#opSeg button').forEach(b => b.classList.toggle('on', b.dataset.op === prefs.op));
  $('pctRange').value = prefs.val; $('pctVal').value = prefs.val;
  const sym = { lt: 'below', lte: 'at or below', gt: 'above', gte: 'at or above' }[prefs.op];
  $('pctNote').textContent = sym ? `Showing attendance ${sym} ${prefs.val}%` : 'Pick an operator to filter by percentage';
}
function renderTable() {
  const cols = viewCols();
  const tr = el('tr');
  const thc = el('th'); const all = el('input'); all.type = 'checkbox';
  all.checked = view.length > 0 && view.every(o => selected.has(o.i));
  all.onclick = e => e.stopPropagation();
  all.onchange = () => { view.forEach(o => (all.checked ? selected.add(o.i) : selected.delete(o.i))); render(); };
  thc.appendChild(all); tr.append(thc, el('th', '', '#'));
  cols.forEach(c => {
    const th = el('th', sort.col === c ? 's' : '', data.headers[c] || `Col ${c + 1}`);
    th.appendChild(el('span', 'ar', sort.col === c ? (sort.dir === 1 ? '▲' : '▼') : '↕'));
    th.onclick = () => { if (sort.col === c) sort.dir *= -1; else { sort.col = c; sort.dir = 1; } render(); };
    tr.appendChild(th);
  });
  $('thead').replaceChildren(tr);

  const frag = document.createDocumentFragment();
  view.forEach((o, n) => {
    const row = el('tr', selected.has(o.i) ? 'sel' : '');
    row.style.animationDelay = Math.min(n, 20) * 15 + 'ms';
    row.onclick = () => { selected.has(o.i) ? selected.delete(o.i) : selected.add(o.i); render(); };
    const cb = el('td'); const box = el('input'); box.type = 'checkbox'; box.checked = selected.has(o.i);
    cb.appendChild(box); row.append(cb, el('td', 'muted', n + 1));
    cols.forEach(c => {
      const td = el('td'); const v = o.r[c];
      if (c === map.status && v) td.appendChild(el('span', `badge ${tone(o.st)}`, v));
      else if (c === map.percent && !isNaN(o.pct)) {
        td.appendChild(el('span', '', v));
        const bar = el('span', `pbar ${pctTone(o.pct)}`); const fill = el('i'); fill.style.width = Math.min(100, o.pct) + '%';
        bar.appendChild(fill); td.appendChild(bar);
      } else if (c === map.phone) {
        const ps = extractPhones(v, 'asis');
        if (!ps.length) td.appendChild(el('span', 'muted', '— no phone'));
        ps.forEach(p => {
          const chip = el('span', 'pchip', p); chip.title = 'Click to copy';
          chip.onclick = e => { e.stopPropagation(); copy(p, `Copied ${p}`); };
          const wa = el('a', 'wa', '💬'); wa.title = 'Open WhatsApp'; wa.target = '_blank'; wa.rel = 'noopener noreferrer';
          wa.href = 'https://wa.me/' + extractPhones(p, 'intl')[0].replace('+', '');
          wa.onclick = e => e.stopPropagation();
          td.append(chip, wa);
        });
      } else td.textContent = v;
      row.appendChild(td);
    });
    frag.appendChild(row);
  });
  $('tbody').replaceChildren(frag);
}
function renderPhones() {
  if (map.phone < 0) { $('phones').value = ''; $('phoneInfo').textContent = '— map the Phone column in settings'; $('copyBtn').textContent = '📋 Copy phone numbers'; return; }
  const r = phoneResult();
  $('phones').value = r.list.join(prefs.sep);
  $('phoneInfo').textContent = `· ${r.list.length} number(s) from ${r.sel ? 'selected' : 'shown'} ${r.n} row(s)` + (r.missing ? ` · ${r.missing} without phone` : '');
  $('copyBtn').textContent = `📋 Copy ${r.list.length} number${r.list.length === 1 ? '' : 's'}`;
}
function render() {
  view = compute();
  renderStats(); renderChips(); renderPct(); renderTable(); renderPhones();
  const s = view.filter(o => selected.has(o.i)).length;
  $('count').textContent = `Showing ${view.length} of ${data.rows.length} students` + (s ? ` · ${s} selected` : '');
}

/* ---------- init ---------- */
function fillSelect(sel, selected) {
  sel.replaceChildren(new Option('(none)', -1));
  data.headers.forEach((h, i) => sel.add(new Option(h || `Column ${i + 1}`, i)));
  sel.value = selected;
}
function setPct(op, val) {
  prefs.op = op;
  if (val != null && !isNaN(val)) prefs.val = Math.max(0, Math.min(100, val));
  savePrefs(); render();
}
function csvEscape(v) { return /[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v; }

async function init() {
  const s = await chrome.storage.local.get(['scrape', 'cfg', 'prefs']);
  prefs = { ...prefs, ...(s.prefs || {}) };
  applyTheme();
  $('themeBtn').onclick = () => {
    prefs.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(); savePrefs();
  };

  data = s.scrape;
  if (!data || !data.rows) { $('empty').hidden = false; return; }
  $('app').hidden = false;

  $('heroTitle').textContent = data.course || 'Zoom attendance report';
  $('heroSub').textContent = data.classTime || '';
  $('heroMeta').textContent = `id ${data.id ?? '?'} · occurrence ${data.occurrence ?? '?'}\nscraped ${new Date(data.scrapedAt).toLocaleString()}`;
  $('heroMeta').style.whiteSpace = 'pre-line';

  const sig = data.headers.join('|');
  map = s.cfg && s.cfg.sig === sig ? s.cfg.map : detect(data.headers);
  [['mapName', 'name'], ['mapPhone', 'phone'], ['mapPercent', 'percent'], ['mapStatus', 'status']].forEach(([id, k]) => {
    fillSelect($(id), map[k]);
    $(id).onchange = () => { map[k] = parseInt($(id).value, 10); saveCfg(); activeStatus.clear(); render(); };
  });

  // default: show absentees first
  statusKeys().forEach(([k]) => { if (tone(k) === 'bad') activeStatus.add(k); });

  $('compact').checked = prefs.compact;
  $('compact').onchange = () => { prefs.compact = $('compact').checked; savePrefs(); render(); };
  $('phoneFmt').value = prefs.fmt; $('phoneSep').value = prefs.sep; $('dedupe').checked = prefs.dedupe;
  $('phoneFmt').onchange = () => { prefs.fmt = $('phoneFmt').value; savePrefs(); renderPhones(); };
  $('phoneSep').onchange = () => { prefs.sep = $('phoneSep').value; savePrefs(); renderPhones(); };
  $('dedupe').onchange = () => { prefs.dedupe = $('dedupe').checked; savePrefs(); renderPhones(); };

  $('search').addEventListener('input', render);
  document.querySelectorAll('#opSeg button').forEach(b => (b.onclick = () => setPct(b.dataset.op)));
  document.querySelectorAll('#presets button').forEach(b => (b.onclick = () => setPct(b.dataset.op, parseFloat(b.dataset.val))));
  $('pctRange').oninput = () => setPct(prefs.op || 'lte', parseFloat($('pctRange').value));
  $('pctVal').oninput = () => setPct(prefs.op || 'lte', parseFloat($('pctVal').value));

  const doCopy = () => { const r = phoneResult(); copy(r.list.join(prefs.sep), `Copied ${r.list.length} number(s) ✓`); };
  $('copyBtn').onclick = doCopy; $('copyPhones').onclick = doCopy;

  $('resetBtn').onclick = () => {
    activeStatus.clear(); selected.clear(); $('search').value = ''; prefs.op = ''; sort = { col: null, dir: 1 };
    savePrefs(); render(); toast('Filters reset');
  };
  $('csvBtn').onclick = () => {
    const cols = viewCols();
    const lines = [cols.map(c => csvEscape(data.headers[c])).join(',')].concat(view.map(o => cols.map(c => csvEscape(o.r[c])).join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `attendance_${data.id ?? 'report'}_${data.occurrence ?? ''}.csv`;
    a.click(); URL.revokeObjectURL(a.href); toast('CSV downloaded');
  };

  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); $('search').focus(); }
    if (e.key === 'Escape') { $('search').value = ''; $('search').blur(); render(); }
  });

  render();
}
init();
