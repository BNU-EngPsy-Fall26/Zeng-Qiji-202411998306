(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const screens = ['home','setup','briefing','task','break','session-results','results'];
  let toastTimer = null;

  function showScreen(name) {
    document.body.classList.toggle('focus-task-screen', name === 'task');
    document.body.classList.toggle('focus-break-screen', name === 'break');
    screens.forEach((key) => {
      const el = $('screen-' + key);
      if (el) el.classList.toggle('active', key === name);
    });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function toast(message) {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2300);
  }

  function hashString(text) {
    let h = 2166136261;
    for (let i = 0; i < String(text).length; i++) {
      h ^= String(text).charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(array, rng = Math.random) {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function conditionOrders(participantId, key = 'order') {
    const orders = [
      ['A','B','C'], ['A','C','B'], ['B','A','C'],
      ['B','C','A'], ['C','A','B'], ['C','B','A']
    ];
    // Sequential IDs P01–P06 (or S01–S06) are assigned across the six
    // possible orders; non-numeric IDs receive a deterministic hash order.
    const suffix = String(participantId).match(/(\d+)$/);
    const keyOffset = hashString(key) % orders.length;
    const idx = suffix
      ? ((Number(suffix[1]) - 1 + keyOffset) % orders.length)
      : (hashString(participantId + ':' + key) % orders.length);
    return orders[idx].slice();
  }

  function formatTime(ms) {
    if (!Number.isFinite(ms)) return '—';
    return (ms / 1000).toFixed(2) + ' s';
  }

  function downloadBlob(content, filename, mime = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function csvEscape(value) {
    if (value === null || value === undefined) return '';
    const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(rows) {
    if (!rows || !rows.length) return '';
    const keys = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
    return '\uFEFF' + [keys.join(','), ...rows.map(row => keys.map(k => csvEscape(row[k])).join(','))].join('\r\n');
  }

  function parseCSV(text) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    const source = String(text).replace(/^\uFEFF/, '');
    for (let i = 0; i < source.length; i++) {
      const ch = source[i], next = source[i + 1];
      if (quoted) {
        if (ch === '"' && next === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell.length || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
    if (!rows.length) return [];
    const headers = rows.shift().map(h => h.trim());
    return rows.filter(r => r.some(v => v !== '')).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
  }

  function median(values) {
    const v = values.filter(Number.isFinite).slice().sort((a,b) => a-b);
    if (!v.length) return NaN;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }

  function mean(values) {
    const v = values.filter(Number.isFinite);
    return v.length ? v.reduce((a,b) => a+b, 0) / v.length : NaN;
  }

  window.Core = { $, showScreen, toast, hashString, mulberry32, shuffle, conditionOrders, formatTime, downloadBlob, toCSV, parseCSV, median, mean };
})();
