const $ = id => document.getElementById(id);
// Developer avatar: tries a bundled dev.jpg first, then the remote photo, then falls back to a letter "N".
(function () {
  const sources = [
    'dev.jpg',
    'https://scontent.fdac41-2.fna.fbcdn.net/v/t39.30808-6/530404476_2573685322984381_706010445262383862_n.jpg?stp=dst-jpegr_tt6&cstp=mx2048x1536&ctp=s2048x1536&_nc_cat=108&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=833d8c&_nc_eui2=AeG80hkRX0zFwKBTjyzl4Aq3Uz0yPyC4FUdTPTI_ILgVRzas7wz1WvUQFedXY6Fed19WXcGihxhM6GWaZ_rXNu1N&_nc_ohc=fF47eBIYob4Q7kNvwHL0Wm5&_nc_oc=AdqmzUltfEF73xxskpzEycOSqlMSuusDLNGAgtn6gE-OwFTQ16xxIb7L4FCdgTDXRZ8&_nc_zt=23&se=-1&_nc_ht=scontent.fdac41-2.fna&_nc_gid=d9GyDuc05W1O1QtX5EtKsQ&_nc_ss=7b2a8&oh=00_AQR_CO1oA4QXYC6D5ON7ktpbiFMFGyY7n_h8-t8GYI1OEw&oe=6AEFA9F1'
  ];
  const img = document.getElementById('devImg');
  const fb = document.getElementById('devFallback');
  let i = 0;
  const next = () => {
    if (i >= sources.length) { img.hidden = true; fb.hidden = false; return; }
    img.src = sources[i++];
  };
  img.addEventListener('error', next);
  next();
})();

let data = null;
let map = { name: -1, phone: -1, percent: -1, status: -1 };
let sort = { col: null, dir: 1 };
let view = []; // currently displayed rows (objects)

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
  const s = String(t);
  const m = s.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (m) return parseFloat(m[1]);
  const n = s.match(/-?\d+(?:\.\d+)?/);
  return n ? parseFloat(n[0]) : NaN;
}

function extractPhones(text, fmt) {
  const found = String(text || '').match(/(?:\+?88)?0?1[3-9]\d{8}/g);
  let list = found;
  if (!list) {
    const digits = String(text || '').replace(/[^\d+]/g, '');
    list = digits.length >= 7 ? [digits] : [];
  }
  return list.map(p => {
    if (fmt === 'asis') return p;
    const core = p.replace(/^\+?88/, '').replace(/^(?=1[3-9]\d{8}$)/, '0');
    return fmt === 'intl' ? '+88' + core : core;
  });
}

function saveCfg() {
  chrome.storage.local.set({
    cfg: {
      sig: data.headers.join('|'),
      map,
      kw: $('absentKw').value,
      compact: $('compact').checked,
      absentOnly: $('absentOnly').checked
    }
  });
}

function fillSelect(sel, selected) {
  sel.innerHTML = '';
  const none = new Option('(none)', -1);
  sel.add(none);
  data.headers.forEach((h, i) => sel.add(new Option(h || `Column ${i + 1}`, i)));
  sel.value = selected;
}

function kwRegex() {
  const parts = $('absentKw').value.split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  return new RegExp(parts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
}

function compute() {
  const q = $('search').value.trim().toLowerCase();
  const re = kwRegex();
  const op = $('pctOp').value;
  const val = parseFloat($('pctVal').value);
  const usePct = op && !isNaN(val);

  let rows = data.rows.map((r, i) => ({ r, i, pct: map.percent >= 0 ? parsePct(r[map.percent]) : NaN }));

  if ($('absentOnly').checked && re) {
    rows = rows.filter(o => map.status >= 0 ? re.test(o.r[map.status]) : o.r.some(c => re.test(c)));
  }
  if (q) {
    rows = rows.filter(o => (map.name >= 0 ? o.r[map.name] : o.r.join(' ')).toLowerCase().includes(q));
  }
  if (usePct) {
    const cmp = { lt: (a, b) => a < b, lte: (a, b) => a <= b, gt: (a, b) => a > b, gte: (a, b) => a >= b, eq: (a, b) => a === b }[op];
    rows = rows.filter(o => !isNaN(o.pct) && cmp(o.pct, val));
  }

  if (sort.col !== null) {
    const c = sort.col;
    const key = o => (c === map.percent ? o.pct : o.r[c]);
    rows.sort((a, b) => {
      let x = key(a), y = key(b);
      const nx = typeof x === 'number' ? x : /^-?\d+(\.\d+)?$/.test(x) ? parseFloat(x) : NaN;
      const ny = typeof y === 'number' ? y : /^-?\d+(\.\d+)?$/.test(y) ? parseFloat(y) : NaN;
      if (!isNaN(nx) && !isNaN(ny)) return (nx - ny) * sort.dir;
      if (!isNaN(nx)) return -1 * sort.dir;
      if (!isNaN(ny)) return 1 * sort.dir;
      return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' }) * sort.dir;
    });
  }
  return rows;
}

function viewCols() {
  if ($('compact').checked) {
    const cols = [map.name, map.phone, map.percent].filter(i => i >= 0);
    if (map.status >= 0 && !$('absentOnly').checked) cols.push(map.status);
    if (cols.length) return cols;
  }
  return data.headers.map((_, i) => i);
}

function render() {
  view = compute();
  const cols = viewCols();

  const tr = document.createElement('tr');
  const th0 = document.createElement('th'); th0.textContent = '#'; th0.style.cursor = 'default'; tr.appendChild(th0);
  cols.forEach(c => {
    const th = document.createElement('th');
    const arrow = sort.col === c ? (sort.dir === 1 ? ' ▲' : ' ▼') : '';
    th.textContent = (data.headers[c] || `Column ${c + 1}`) + arrow;
    th.onclick = () => {
      if (sort.col === c) sort.dir *= -1; else { sort.col = c; sort.dir = 1; }
      render();
    };
    tr.appendChild(th);
  });
  $('thead').replaceChildren(tr);

  const frag = document.createDocumentFragment();
  view.forEach((o, n) => {
    const row = document.createElement('tr');
    const t0 = document.createElement('td'); t0.textContent = n + 1; row.appendChild(t0);
    cols.forEach(c => { const td = document.createElement('td'); td.textContent = o.r[c]; row.appendChild(td); });
    frag.appendChild(row);
  });
  $('tbody').replaceChildren(frag);
  $('count').textContent = `Showing ${view.length} of ${data.rows.length} students`;
  renderPhones();
}

function renderPhones() {
  if (map.phone < 0) { $('phones').value = ''; $('phoneCount').textContent = 'Select the Phone column above.'; return; }
  let list = view.flatMap(o => extractPhones(o.r[map.phone], $('phoneFmt').value));
  if ($('dedupe').checked) list = [...new Set(list)];
  $('phones').value = list.join($('phoneSep').value);
  const missing = view.filter(o => !extractPhones(o.r[map.phone], 'asis').length).length;
  $('phoneCount').textContent = `${list.length} number(s)` + (missing ? ` · ${missing} shown row(s) have no phone` : '');
}

function csvEscape(v) { return /[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v; }

async function init() {
  const s = await chrome.storage.local.get(['scrape', 'cfg']);
  data = s.scrape;
  if (!data || !data.rows) { $('empty').hidden = false; return; }
  $('app').hidden = false;

  $('meta').textContent = [
    data.course, data.classTime,
    `id=${data.id ?? '?'} occurrence=${data.occurrence ?? '?'}`,
    `${data.rows.length} students`,
    `scraped ${new Date(data.scrapedAt).toLocaleString()}`
  ].filter(Boolean).join(' · ');

  const sig = data.headers.join('|');
  const cfg = s.cfg && s.cfg.sig === sig ? s.cfg : null;
  map = cfg ? cfg.map : detect(data.headers);
  $('absentKw').value = cfg ? cfg.kw : 'absent';

  [['mapName', 'name'], ['mapPhone', 'phone'], ['mapPercent', 'percent'], ['mapStatus', 'status']].forEach(([id, k]) => {
    fillSelect($(id), map[k]);
    $(id).onchange = () => { map[k] = parseInt($(id).value, 10); saveCfg(); render(); };
  });

  const re = kwRegex();
  const hasAbsent = re && (map.status >= 0 || data.rows.some(r => r.some(c => re.test(c))));
  $('absentOnly').checked = cfg ? cfg.absentOnly : !!hasAbsent;
  $('compact').checked = cfg ? cfg.compact : (map.name >= 0 && map.phone >= 0 && map.percent >= 0);

  ['search', 'pctVal'].forEach(id => $(id).addEventListener('input', render));
  ['pctOp', 'absentOnly', 'compact'].forEach(id => $(id).addEventListener('change', () => { saveCfg(); render(); }));
  $('absentKw').addEventListener('input', () => { saveCfg(); render(); });
  ['phoneFmt', 'phoneSep', 'dedupe'].forEach(id => $(id).addEventListener('change', renderPhones));

  $('reset').onclick = () => {
    $('search').value = ''; $('pctOp').value = ''; $('pctVal').value = '';
    $('absentOnly').checked = false; sort = { col: null, dir: 1 };
    saveCfg(); render();
  };

  $('copy').onclick = async () => {
    const t = $('phones').value;
    if (!t) return;
    try { await navigator.clipboard.writeText(t); }
    catch { $('phones').select(); document.execCommand('copy'); }
    $('copy').textContent = 'Copied ✓';
    setTimeout(() => ($('copy').textContent = 'Copy all'), 1500);
  };

  $('csv').onclick = () => {
    const cols = viewCols();
    const lines = [cols.map(c => csvEscape(data.headers[c])).join(',')]
      .concat(view.map(o => cols.map(c => csvEscape(o.r[c])).join(',')));
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `attendance_${data.id ?? 'report'}_${data.occurrence ?? ''}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  render();
}
init();
