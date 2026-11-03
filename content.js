// Runs on the Zoom attendance report page (Moodle local_zoomattendance).
// Scrapes the "Participants of this class" table: Name, Phone (from inside the name cell), Email,
// join/leave times, attended time, attendance %, status.
if (!window.__pedagoAttendanceScraper) {
  window.__pedagoAttendanceScraper = true;

  const clean = s => (s || '').replace(/\s+/g, ' ').trim();

  function headerRowOf(t) {
    return t.tHead && t.tHead.rows.length ? t.tHead.rows[t.tHead.rows.length - 1] : t.rows[0];
  }

  // Prefer the table that has a "Status" column (the expected-participants table);
  // the page also has "Matched but not expected" and "Unmatched Zoom participants" tables.
  function pickTable(doc) {
    const tables = [...doc.querySelectorAll('table')];
    if (!tables.length) return null;
    const byRows = (a, b) => b.rows.length - a.rows.length;
    const withStatus = tables.filter(t => {
      const hr = headerRowOf(t);
      return hr && [...hr.cells].some(c => /^status$/i.test(clean(c.textContent)));
    });
    return (withStatus.sort(byRows)[0]) || tables.sort(byRows)[0];
  }

  function cellText(td) {
    let t = clean(td.textContent);
    if (!t) {
      const el = td.querySelector('[title],[alt],[aria-label]');
      if (el) t = clean(el.getAttribute('title') || el.getAttribute('alt') || el.getAttribute('aria-label'));
    }
    return t;
  }

  function parseDoc(doc) {
    const t = pickTable(doc);
    if (!t) return null;
    const hr = headerRowOf(t);
    let headers = [...hr.cells].map(c => clean(c.textContent));
    const body = [...t.rows].filter(r => r !== hr && !(t.tHead && t.tHead.contains(r)));

    const nameIdx = headers.findIndex(h => /full name|^name$/i.test(h));
    const splitPhones = nameIdx >= 0 && body.some(r => r.querySelector('.local-zoomattendance-phone-number'));
    if (splitPhones) headers.splice(nameIdx + 1, 0, 'Phone');

    const rows = body
      .map(r => {
        const cells = [...r.cells].map(cellText);
        if (splitPhones && r.cells[nameIdx]) {
          const nameCell = r.cells[nameIdx];
          const phones = [...nameCell.querySelectorAll('.local-zoomattendance-phone-number')]
            .map(e => clean(e.textContent)).filter(Boolean);
          const link = nameCell.querySelector('a');
          cells[nameIdx] = clean(link ? link.textContent : cells[nameIdx]);
          cells.splice(nameIdx + 1, 0, phones.join(' / '));
        }
        while (cells.length < headers.length) cells.push('');
        return cells;
      })
      .filter(c => c.length >= 2 && c.some(Boolean));
    return { headers, rows };
  }

  function pageLinks(doc) {
    const found = new Map();
    doc.querySelectorAll('a[href*="page="]').forEach(a => {
      try {
        const u = new URL(a.getAttribute('href'), location.href);
        if (u.pathname !== location.pathname || !u.searchParams.has('page')) return;
        found.set(u.searchParams.get('page'), u.href);
      } catch (e) { /* ignore */ }
    });
    return found;
  }

  async function scrapeAll() {
    const first = parseDoc(document);
    if (!first) throw new Error('No table found on this page.');

    // Follow pagination links if the report ever has them (this class page currently doesn't).
    const current = new URL(location.href).searchParams.get('page') || '0';
    const visited = new Set([current]);
    const queue = [];
    const enqueue = doc => {
      for (const [p, href] of pageLinks(doc)) {
        if (!visited.has(p) && !queue.some(q => q.p === p)) queue.push({ p, href });
      }
    };
    enqueue(document);

    let rows = [...first.rows];
    let pages = 1;
    while (queue.length && pages < 200) {
      const { p, href } = queue.shift();
      visited.add(p);
      const res = await fetch(href, { credentials: 'same-origin' });
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const parsed = parseDoc(doc);
      if (parsed) rows.push(...parsed.rows);
      pages++;
      enqueue(doc);
    }

    const seen = new Set();
    rows = rows.filter(r => {
      const k = r.join('\u0001');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const params = new URL(location.href).searchParams;
    const courseEl = document.querySelector('.fsmod-ctitle a');
    const timeEl = document.querySelector('#region-main h3, [role="main"] h3');
    return {
      headers: first.headers,
      rows,
      pages,
      url: location.href,
      id: params.get('id'),
      occurrence: params.get('occurrence'),
      course: courseEl ? clean(courseEl.textContent) : '',
      classTime: timeEl ? clean(timeEl.textContent) : '',
      scrapedAt: new Date().toISOString()
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'SCRAPE') {
      scrapeAll()
        .then(data => sendResponse({ ok: true, data }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true;
    }
  });
}
