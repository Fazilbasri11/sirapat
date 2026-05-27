// ════ STATE & CONSTANTS ════════════════════════════════════════
const DEFAULT_PESERTA = [
  {nama:'ISKANDAR, S.Sos.',        jabatan:'Ketua'},
  {nama:'DARKASYI ABDUL HAMID, S.Pd.', jabatan:'Anggota'},
  {nama:'ABDULLAH, S.Sos.',        jabatan:'Anggota'},
  {nama:'MASRUR, MA.',             jabatan:'Anggota'},
  {nama:'HASMUNIR, SH.',           jabatan:'Anggota'},
  {nama:'ISWANDI, S.Sos.',         jabatan:'Sekretaris'},
  {nama:'DAHLAN, A.Md.',           jabatan:'Kasubbag Keuangan, Umum, dan Logistik'},
  {nama:'MASYKUR, S.Pd.I.',        jabatan:'Kasubbag Perencanaan, Data dan Informasi'},
  {nama:'MAHMUNIR, S.Kom.',        jabatan:'Kasubbag Teknis Penyelenggaraan Pemilu, dan Hukum'},
  {nama:'MAIMUN MAHMILUL, S.IP.',  jabatan:'Kasubbag Keuangan, Umum dan Logistik'},
  {nama:'ISNAINI, SE.',            jabatan:'Analis Pengelola Keuangan APBN Ahli Muda'},
  {nama:'NURHAYATI, A.Md.',        jabatan:'Bendahara Pengeluaran'},
  {nama:'FAZIL BASRI, S.Kom.',     jabatan:'Notulen'},
];

let pesertaList  = JSON.parse(localStorage.getItem('sirapat_peserta') || 'null') || DEFAULT_PESERTA.map(p => ({...p}));
let arsipList    = JSON.parse(localStorage.getItem('sirapat_arsip')   || '[]');
let settings     = JSON.parse(localStorage.getItem('sirapat_settings')|| 'null') || {
  instansi:'KIP Kabupaten Pidie Jaya', kota:'Meureudu',
  ketua:'Iskandar', sekretaris:'Iswandi',
  nomorFmt:'[NO]/PK.01-Und/1118/1/[TAHUN]', nomorLast:0,
  gasUrl:'', urlUnd:'', urlAbs:'', urlRis:'', tplMode:'auto'
};

// Paksa ganti [BULAN] → 1 jika masih ada
if (settings.nomorFmt?.includes('[BULAN]')) {
  settings.nomorFmt = settings.nomorFmt.replace('[BULAN]', '1');
  localStorage.setItem('sirapat_settings', JSON.stringify(settings));
}

const AUTO_PATHS = {
  und: './templates/UND_template.docx',
  abs: './templates/ABSEN_template.docx',
  ris: './templates/RISALAH_template.docx'
};
const BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const HARI_ID  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const SH_ID    = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

let tplMode        = settings.tplMode || 'auto';
let calYearInline, calMonthInline;
const today        = new Date();
let lastGenId      = null;
let lastGenBlobs   = null;
let lastGenPrefix  = null;
let currentModalId = null;
let uploadFiles    = {};

// ════ HELPERS ═════════════════════════════════════════════════
const GAS_URL = 'https://script.google.com/macros/s/AKfycbz2CWZbBPaBBfXL1jtSQDhd65FnUAWZogzA-yl51cjxIQMFznhmgneI2G71xN593w/exec';
function getGasUrl() { return GAS_URL; }

// ★ FIX TIMEZONE: parse tanggal string "YYYY-MM-DD" sebagai local time
function parseTanggal(str) {
  if (!str) return new Date(NaN);
  if (str.includes('T')) return new Date(str);
  // Ubah format "YYYY-MM-DD" menjadi "YYYY/MM/DD 00:00:00" 
  // agar cross-browser selalu membacanya sebagai Waktu Lokal (WIB), bukan UTC.
  return new Date(str.replace(/-/g, '/') + ' 00:00:00');
}

// Mengubah string jam "09:00" menjadi total menit (540 menit)
function getMenitDariJam(jamStr) {
  if (!jamStr || !jamStr.includes(':')) return 0;
  const parts = jamStr.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}
function buildNomor(no, tgl) {
  return settings.nomorFmt
    .replace('[NO]',    String(no))
    .replace('[BULAN]', tgl instanceof Date ? tgl.getMonth() + 1 : no)
    .replace('[TAHUN]', tgl instanceof Date ? tgl.getFullYear() : today.getFullYear());
}
function tglGeneret() { return `${today.getDate()} ${BULAN_ID[today.getMonth()]} ${today.getFullYear()}`; }
function tglFull(d)   { return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`; }
function saveLocal()  { localStorage.setItem('sirapat_arsip', JSON.stringify(arsipList)); }

// Download blob sebagai file
function dlBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// File-type helpers
function isImage(n) { return /\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(n || ''); }
function isPdf(n)   { return /\.pdf$/i.test(n || ''); }
function fmtSize(b) {
  if (!b) return '';
  if (b < 1024)    return b + 'B';
  if (b < 1048576) return (b / 1024).toFixed(1) + 'KB';
  return (b / 1048576).toFixed(1) + 'MB';
}
function statusLbl(s) {
  return {pending:'Menunggu', uploading:'Uploading...', done:'Tersimpan', draft:'Draft', err:'Gagal'}[s] || s;
}
function getFileIcon(n) {
  return {pdf:'📕',doc:'📝',docx:'📝',zip:'📦',jpg:'🖼️',jpeg:'🖼️',png:'🖼️',webp:'🖼️',gif:'🖼️',bmp:'🖼️'}
    [(n||'').split('.').pop().toLowerCase()] || '📄';
}
function extractDriveId(url) {
  const m = (url||'').match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}
function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result.split(',')[1]);
    r.onerror = () => rej(new Error('Baca gagal'));
    r.readAsDataURL(file);
  });
}

// ════ GAS API — satu fungsi untuk GET & POST ══════════════════
async function gasCall(action, payload = null) {
  const url = getGasUrl();
  if (!url) throw new Error('GAS URL belum diisi');
  let res;
  if (payload) {
    res = await fetch(url, { method: 'POST', body: JSON.stringify({action, ...payload}) });
  } else {
    res = await fetch(`${url}?action=${action}`);
  }
  const d = await res.json();
  if (d.error) throw new Error(d.error);
  return d;
}
const gasGet  = (action)  => gasCall(action);
const gasPost = (payload) => gasCall(payload.action, payload);

// ════ SANITASI ARSIP ══════════════════════════════════════════
// ════ SANITASI ARSIP ══════════════════════════════════════════
function sanitasiField(val, type) {
  const s = String(val || '');
  if (!s) return s;

  if (type === 'tanggal') {
    // Jika dari cloud formatnya ISO (ada huruf T), konversi ke Date lalu ambil tanggal LOKAL-nya
    if (s.includes('T')) {
      const d = new Date(s);
      if (!isNaN(d)) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
    }
    return s;
  }
  
  if (type === 'jam') {
    let v = s;
    // Jika dari cloud, ambil jam LOKAL (getHours/getMinutes), bukan getUTCHours
    if (v.includes('T')) {
      try {
        const d = new Date(v);
        if (!isNaN(d)) {
          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        }
      } catch {}
    }
    if (v.length > 5 && v.includes(':')) v = v.substring(0, 5);
    if (v.includes(' ')) v = v.split(' ')[0];
    if (/^\d:\d{2}$/.test(v)) v = '0' + v;
    return v;
  }
  
  if (type === 'tglGeneret') {
    // Sama seperti tanggal, ambil nilai menggunakan metode LOKAL
    if (s.includes('T')) {
      try {
        const d = new Date(s);
        if (!isNaN(d)) {
          return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
        }
      } catch {}
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      try { const p = s.split('-'); return `${parseInt(p[2])} ${BULAN_ID[parseInt(p[1])-1]} ${p[0]}`; } catch {}
    }
    return s;
  }
  
  return s;
}
function sanitasiArsip(list) {
  return list.map(r => ({
    ...r,
    tanggal:    sanitasiField(r.tanggal,    'tanggal'),
    jam:        sanitasiField(r.jam,        'jam'),
    tglGeneret: sanitasiField(r.tglGeneret, 'tglGeneret'),
  }));
}

// ════ STATS ═══════════════════════════════════════════════════
function animCount(el, target) {
  let cur = 0;
  const step = Math.max(1, Math.floor(target / 20));
  const t = setInterval(() => { cur = Math.min(cur + step, target); el.textContent = cur; if (cur >= target) clearInterval(t); }, 40);
}

function refreshStats() {
  const yr      = today.getFullYear();
  const total   = arsipList.length;
  // ★ FIX TIMEZONE: pakai parseTanggal() bukan new Date()
  const tiArsip = arsipList.filter(r => parseTanggal(r.tanggal).getFullYear() === yr);
  const ti      = tiArsip.length;
  const avg     = total ? Math.round(arsipList.reduce((a, r) => a + (r.peserta||[]).length, 0) / total) : 0;

  const ht = document.getElementById('hs-total');  if (ht) animCount(ht, total);
  const hy = document.getElementById('hs-tahun');  if (hy) animCount(hy, ti);
  const hn = document.getElementById('hs-nomor');  if (hn) hn.textContent = '#' + (settings.nomorLast + 1);

  const dt = document.getElementById('dash-total'); if (dt) animCount(dt, total);
  const dy = document.getElementById('dash-tahun'); if (dy) animCount(dy, ti);
  const da = document.getElementById('dash-avg');   if (da) animCount(da, avg);
  const dd = document.getElementById('dash-dok');   if (dd) animCount(dd, total * 3);
  const dl = document.getElementById('dash-tahun-lbl'); if (dl) dl.textContent = 'Rapat ' + yr;
  const cl = document.getElementById('chart-tahun-lbl'); if (cl) cl.textContent = yr;

  // Bar chart — ★ FIX TIMEZONE
  const months = Array(12).fill(0);
  tiArsip.forEach(r => months[parseTanggal(r.tanggal).getMonth()]++);
  const max = Math.max(...months, 1);
  const bc = document.getElementById('bar-chart-home');
  if (bc) bc.innerHTML = months.map((n, i) =>
    `<div class="bar-group">${n > 0 ? `<div class="bar-val">${n}</div>` : ''}` +
    `<div class="bar" style="height:${Math.round(n/max*80)}px"><div class="bar-inner" style="height:100%"></div></div>` +
    `<div class="bar-label">${SH_ID[i]}</div></div>`
  ).join('');
  renderUpNext();
  renderRisalahQuick();
  renderHealthMeter();
}
const updateHeroStats = refreshStats;
const renderDashHome  = refreshStats;

// ════ NAV HAMBURGER ═══════════════════════════════════════════
function toggleDrawer() {
  const d = document.getElementById('nav-drawer');
  const t = document.getElementById('nav-toggle');
  const open = d.classList.toggle('open');
  t.textContent = open ? '✕' : '☰';
}
function closeDrawer() {
  document.getElementById('nav-drawer').classList.remove('open');
  document.getElementById('nav-toggle').textContent = '☰';
}
document.addEventListener('click', e => {
  const d = document.getElementById('nav-drawer');
  const t = document.getElementById('nav-toggle');
  if (d?.classList.contains('open') && !d.contains(e.target) && !t.contains(e.target)) closeDrawer();
});

// ════ HERO CANVAS ═════════════════════════════════════════════
(function () {
  const canvas = document.getElementById('hero-canvas'); if (!canvas) return;
  const ctx = canvas.getContext('2d'); let W, H, particles = [];
  function resize() { const h = canvas.parentElement; W = canvas.width = h.offsetWidth; H = canvas.height = h.offsetHeight; }
  function mk() { return { x:Math.random()*W, y:H+10, r:Math.random()*2.5+.5, speed:Math.random()*.6+.3, opacity:Math.random()*.6+.2, drift:(Math.random()-.5)*.4, life:0, maxLife:Math.random()*160+80 }; }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (particles.length < 55 && Math.random() < .35) particles.push(mk());
    particles = particles.filter(p => {
      p.y -= p.speed; p.x += p.drift; p.life++;
      const t = p.life / p.maxLife, a = t < .2 ? t/.2 : t > .8 ? (1-t)/.2 : 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(201,147,42,${p.opacity*a})`; ctx.fill();
      return p.life < p.maxLife && p.y > -10;
    });
    requestAnimationFrame(draw);
  }
  resize(); window.addEventListener('resize', resize); draw();
})();

// ════ SYNC INDICATORS ═════════════════════════════════════════
let syncTimer;
function showSync(msg, state = 'syncing') {
  const el = document.getElementById('sync-indicator');
  document.getElementById('sync-dot').className = 'sync-dot ' + state;
  document.getElementById('sync-text').textContent = msg;
  el.classList.add('show');
  clearTimeout(syncTimer);
  if (state !== 'syncing') syncTimer = setTimeout(() => el.classList.remove('show'), 3500);
}
function setHeroSync(state, msg) {
  const dot = document.getElementById('hero-sync-dot'); if (dot) dot.className = 'hero-sync-dot ' + state;
  const tx  = document.getElementById('hero-sync-text'); if (tx) tx.textContent = msg;
}
function setCloudBanner(state, msg) {
  const b  = document.getElementById('cloud-status-banner'); if (!b) return;
  const sp = document.getElementById('cloud-spin');
  const tx = document.getElementById('cloud-status-text');
  b.style.display = 'flex'; b.className = 'cloud-banner ' + state;
  if (sp) sp.style.display = (state === 'loading') ? 'block' : 'none';
  if (tx) tx.textContent = msg;
  if (state === 'ok' || state === 'err') setTimeout(() => { b.style.display = 'none'; }, 5000);
}

// ════ CLOUD — ARSIP ═══════════════════════════════════════════
async function loadArsipFromCloud() {
  if (!getGasUrl()) { setHeroSync('err','GAS URL belum diisi'); setCloudBanner('warn','URL GAS belum diisi — data hanya dari browser lokal.'); return; }
  setHeroSync('syncing','Menyinkron data cloud...'); showSync('Memuat dari cloud...','syncing');
  try {
    const data       = await gasCall('getArsip');
    const cloudArsip = sanitasiArsip(data.arsip || []);
    const cloudIds   = new Set(cloudArsip.map(r => String(r.id)));
    const localOnly  = arsipList.filter(r => !cloudIds.has(String(r.id)));
    arsipList = [...cloudArsip, ...localOnly];
    arsipList.sort((a, b) => String(b.id).localeCompare(String(a.id)));
    saveLocal();
    arsipList.forEach(r => {
      if (r.uploadedFiles?.length && !uploadFiles[r.id]?.length)
        uploadFiles[r.id] = r.uploadedFiles.map(f => ({...f, file:null, type:f.type||'', _showPreview:false}));
    });
    for (const item of localOnly) gasCall('simpanArsip', item).catch(() => {});
    setHeroSync('ok', `✓ ${arsipList.length} arsip tersinkron`);
    showSync(`${arsipList.length} arsip tersinkron`, 'ok');
    setCloudBanner('ok', `✓ ${arsipList.length} arsip dimuat dari cloud`);
    renderArsip(); renderCalInline(); refreshStats();
  } catch (e) {
    setHeroSync('err','Gagal sync — menggunakan data lokal');
    setCloudBanner('err','❌ Gagal memuat dari cloud: ' + e.message);
    showSync('Gagal sync cloud','err');
  }
}
async function refreshArsipCloud() { await loadArsipFromCloud(); }

async function syncArsipToCloud(item) {
  if (!getGasUrl()) return;
  showSync('Menyimpan ke cloud...','syncing');
  try {
    await gasCall('simpanArsip', {
      ...item,
      uploadedFiles: (uploadFiles[item.id]||[]).map(f => ({name:f.name, size:f.size, status:f.status, url:f.url||null}))
    });
    showSync('Tersimpan ke cloud','ok');
  } catch { showSync('Gagal sync cloud','err'); }
}
async function hapusArsipCloud(id) {
  if (!getGasUrl()) return;
  try { await gasCall('hapusArsip', {id}); } catch {}
}

// ════ NOMOR SURAT ═════════════════════════════════════════════
async function fetchNomor() {
  const dot  = document.getElementById('nomor-dot');
  const prev = document.getElementById('nomor-preview');
  if (!getGasUrl()) { dot.className = 'nomor-dot err'; prev.textContent = '— isi URL Apps Script di Pengaturan'; return; }
  dot.className = 'nomor-dot loading'; prev.textContent = 'Membaca dari Sheets...';
  try {
    const data = await gasCall('getLastNomor');
    settings.nomorLast = data.lastNomor;
    localStorage.setItem('sirapat_settings', JSON.stringify(settings));
    dot.className = 'nomor-dot ok';
    updateNomorPreview(); refreshStats();
  } catch { dot.className = 'nomor-dot err'; prev.textContent = '❌ Gagal — pakai nomor lokal: ' + (settings.nomorLast + 1); }
}
function updateNomorPreview() {
  const tgl  = document.getElementById('inp-tanggal').value;
  // ★ FIX TIMEZONE
  const d    = tgl ? parseTanggal(tgl) : new Date();
  const hint = tgl ? ` (urut ke-${settings.nomorLast+1})` : ' (Silakan tentukan tanggal rapat)';
  document.getElementById('nomor-preview').textContent = buildNomor(settings.nomorLast + 1, d) + hint;
}

// ════ TEMPLATE ════════════════════════════════════════════════
function setTplMode(mode, btn) {
  tplMode = mode; settings.tplMode = mode;
  document.querySelectorAll('.tpl-mode-tab').forEach(b => b.classList.remove('active')); btn.classList.add('active');
  document.querySelectorAll('.tpl-mode-panel').forEach(p => p.classList.remove('active')); document.getElementById('tpl-panel-'+mode).classList.add('active');
}
function getTemplateUrl(key) {
  return tplMode === 'auto' ? AUTO_PATHS[key] : (document.getElementById('url-'+key)||{value:''}).value.trim();
}

// ════ TEST URLS ═══════════════════════════════════════════════
async function testUrl(url) {
  const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status);
  const buf = await r.arrayBuffer(); if (buf.byteLength < 200) throw new Error('Bukan docx');
  return buf.byteLength;
}
async function testAutoUrl(key) {
  const b = document.getElementById('st-auto-'+key);
  b.className = 'tpl-badge loading'; b.textContent = 'Mengecek...';
  try { const s = await testUrl(AUTO_PATHS[key]); b.className = 'tpl-badge ok'; b.textContent = `✓ OK (${(s/1024).toFixed(1)}KB)`; }
  catch (e) { b.className = 'tpl-badge err'; b.textContent = '✗ ' + e.message; }
}
async function testSemuaAuto() { await Promise.all(['und','abs','ris'].map(k => testAutoUrl(k))); }
async function testManualUrl(key) {
  const b   = document.getElementById('badge-'+key);
  const url = (document.getElementById('url-'+key)||{value:''}).value.trim();
  if (!url) { showToast('Masukkan URL','error'); return; }
  b.className = 'tpl-badge loading'; b.textContent = 'Mengecek...';
  try { const s = await testUrl(url); b.className = 'tpl-badge ok'; b.textContent = `✓ OK (${(s/1024).toFixed(1)}KB)`; showToast('✓ OK','success'); }
  catch (e) { b.className = 'tpl-badge err'; b.textContent = '✗ ' + e.message; showToast('Gagal: ' + e.message,'error'); }
}
async function testGasUrl() {
  const url = (document.getElementById('set-gas-url')||{value:''}).value.trim();
  if (!url) { showToast('Masukkan URL GAS','error'); return; }
  const st = document.getElementById('gas-status');
  st.textContent = '⏳ Menguji...'; st.style.color = '#8a6010';
  settings.gasUrl = url; localStorage.setItem('sirapat_settings', JSON.stringify(settings));
  try {
    const d = await gasCall('getLastNomor');
    st.textContent = `✅ Terhubung! Nomor terakhir: ${d.lastNomor}`; st.style.color = '#2e7d32';
    showToast('GAS terhubung!','success'); fetchNomor();
  } catch (e) { st.textContent = '❌ Gagal: ' + e.message; st.style.color = '#c62828'; showToast('GAS gagal: ' + e.message,'error'); }
}

// ════ PESERTA — GENERATE PAGE ═════════════════════════════════
function renderPesertaGen() {
  document.getElementById('peserta-gen-grid').innerHTML = pesertaList.map((p, i) =>
    `<div class="peserta-item checked" id="pgen-${i}" onclick="togglePeserta(${i})">
      <div class="peserta-check"></div>
      <div class="peserta-info"><div class="peserta-nama">${p.nama}</div><div class="peserta-jabatan">${p.jabatan}</div></div>
    </div>`
  ).join('');
}
function togglePeserta(i)   { document.getElementById('pgen-'+i).classList.toggle('checked'); }
function getCheckedPeserta(){ return pesertaList.filter((_, i) => document.getElementById('pgen-'+i)?.classList.contains('checked')); }
function pilihAgenda(el, text) {
  document.querySelectorAll('.agenda-chip').forEach(c => c.classList.remove('active')); el.classList.add('active');
  const ta = document.getElementById('inp-agenda');
  ta.value = text; ta.disabled = !!text; if (!text) { ta.disabled = false; ta.focus(); }
}

// ════ KALENDER ════════════════════════════════════════════════
function initCalInline()   { calYearInline = today.getFullYear(); calMonthInline = today.getMonth(); }
function changeMonthInline(d) {
  calMonthInline += d;
  if (calMonthInline < 0)  { calMonthInline = 11; calYearInline--; }
  if (calMonthInline > 11) { calMonthInline = 0;  calYearInline++; }
  renderCalInline();
}
function renderCalInline() {
  if (calYearInline === undefined) initCalInline();
  document.getElementById('cal-title-inline').textContent = `${BULAN_ID[calMonthInline]} ${calYearInline}`;

  const rapatMap = {};
  arsipList.forEach(r => { (rapatMap[r.tanggal] ??= []).push({jam:r.jam, tempat:r.tempat, agenda:r.agenda}); });

  const selTgl    = document.getElementById('inp-tanggal').value;
  const selJam    = document.getElementById('inp-jam').value;
  const selTempat = document.getElementById('inp-tempat').value.trim();
  const firstDay  = new Date(calYearInline, calMonthInline, 1).getDay();
  const days      = new Date(calYearInline, calMonthInline + 1, 0).getDate();
  const todayStr  = today.toISOString().split('T')[0];

  let html = HARI_ID.map((_, i) => `<div class="cal-day-name">${['Min','Sen','Sel','Rab','Kam','Jum','Sab'][i]}</div>`).join('');
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day other-month"></div>`;

  for (let d = 1; d <= days; d++) {
    const ds     = `${calYearInline}-${String(calMonthInline+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const events = rapatMap[ds] || [];
    const hasEv  = events.length > 0;
    const isBooked = hasEv && ds === selTgl && events.some(e =>
      e.tempat === selTempat && Math.abs(getMenitDariJam(selJam) - getMenitDariJam(e.jam)) < 60
    );

    let cls = 'cal-day';
    if (ds === todayStr) cls += ' today'; else if (ds === selTgl) cls += ' selected';
    cls += isBooked ? ' booked' : hasEv ? ' has-event' : '';

    const tip = hasEv ? events.map(e => `${e.jam} – ${(e.agenda||'').substring(0,25)}`).join(' | ') : '';

    let badgeHtml = '';
    if (hasEv) {
      const isKonflik = ds === selTgl && events.some(e =>
        e.tempat === selTempat && Math.abs(getMenitDariJam(selJam) - getMenitDariJam(e.jam)) < 60
      );
      badgeHtml = `<div class="cal-badge ${isKonflik ? 'konflik' : ''}">${events.length} Rapat</div>`;
    }

    html += `<div class="${cls}" ${tip ? `data-tip="${tip.replace(/"/g,'&quot;')}"` : ''} onclick="calClickInline('${ds}')">
      <span style="margin-bottom:2px">${d}</span>
      ${badgeHtml}
    </div>`;
  }
  document.getElementById('cal-grid-inline').innerHTML = html;
}

// Klik kalender: ada rapat → buka detail; kosong → isi form
function calClickInline(ds) {
  const events = arsipList.filter(r => r.tanggal === ds);
  if (events.length > 0) { showModalMultiple(ds, events); return; }
  
  document.getElementById('inp-tanggal').value = ds;
  updateNomorPreview(); checkBooking();
  
  // Index 1 adalah tombol "Buat Rapat"
  showPage('generate', document.querySelectorAll('.nav-btn')[1]);
}

// Render list rapat jika dalam 1 hari ada banyak agenda
function showModalMultiple(ds, events) {
  // ★ FIX TIMEZONE
  const d = parseTanggal(ds);
  document.getElementById('modal-title').textContent = `Jadwal: ${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
  const shareBtn = document.getElementById('modal-share-btn');
  if (shareBtn) shareBtn.style.display = 'none';

  let html = '<div class="meeting-list-container">';
  events.forEach(r => {
    html += `
      <div class="meeting-card">
        <div class="mc-header">
          <div class="mc-time">🕒 ${r.jam} WIB</div>
          <div class="mc-participants">👥 ${(r.peserta||[]).length} Peserta</div>
        </div>
        <div class="mc-agenda">${r.agenda}</div>
        <div class="mc-location">📍 ${r.tempat}</div>
        <button class="mc-action" onclick="showArsipDetail(${r.id})">
          Kelola Dokumen Rapat <span>➔</span>
        </button>
      </div>`;
  });
  html += '</div>';
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('open');
}

function checkBooking() {
  const tgl    = document.getElementById('inp-tanggal').value;
  const jam    = document.getElementById('inp-jam').value;
  const tempat = document.getElementById('inp-tempat').value.trim();
  const warn   = document.getElementById('booking-warn');
  const btnGen = document.getElementById('btn-gen');

  // Guard: jam belum diisi atau belum lengkap format HH:MM
  if (!jam || jam.length < 5) {
    warn.style.display = 'none'; warn.innerHTML = '';
    if (btnGen) { btnGen.disabled = false; btnGen.style.opacity = ''; btnGen.title = ''; }
    return;
  }

  const menitBaru = getMenitDariJam(jam);

  const konflik = arsipList.find(r => {
    if (r.tanggal !== tgl) return false;
    if (tempat && r.tempat !== tempat) return false;
    const menitLama = getMenitDariJam(r.jam);
    return Math.abs(menitBaru - menitLama) < 60; // 0–59 menit = konflik; 60+ = boleh
  });

  if (konflik) {
    warn.style.display = 'block';
    warn.innerHTML =
      `⚠ <strong>Konflik jadwal!</strong> Jarak antar rapat minimal 1 Jam.<br>` +
      `<span style="font-size:11px;opacity:.85">Sudah ada rapat pukul <strong>${konflik.jam} WIB</strong> (<em>${konflik.agenda.substring(0,60)}${konflik.agenda.length>60?'...':''}</em>)</span><br>` +
      `<span style="font-size:11px;opacity:.7">Silakan ubah jam (berikan jeda minimal 1 jam) atau ganti ruangan.</span>`;
    if (btnGen) { btnGen.disabled = true; btnGen.style.opacity = '0.45'; btnGen.title = 'Ada konflik jadwal'; }
  } else {
    warn.style.display = 'none'; warn.innerHTML = '';
    if (btnGen) { btnGen.disabled = false; btnGen.style.opacity = ''; btnGen.title = ''; }
  }
}

// ════ GENERATE DOKUMEN ════════════════════════════════════════
function setPS(id, state) { const el = document.getElementById(id); if (el) el.className = 'prog-step' + (state ? ' '+state : ''); }

async function fetchAndInject(url, data) {
  const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status} untuk "${url}"`);
  const zip = new PizZip(await r.arrayBuffer());
  const doc = new window.docxtemplater(zip, {paragraphLoop:true, linebreaks:true, delimiters:{start:'[[',end:']]'}, nullGetter:()=>''});
  doc.render(data);
  return doc.getZip().generate({type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression:'DEFLATE'});
}

async function generateDokumen() {
  const tanggalVal = document.getElementById('inp-tanggal').value;
  const jamVal     = document.getElementById('inp-jam').value;
  const tempat     = document.getElementById('inp-tempat').value.trim();
  const agenda     = document.getElementById('inp-agenda').value.trim();

  if (!tanggalVal) { showToast('Pilih tanggal rapat!','error'); return; }
  if (!agenda)     { showToast('Isi agenda rapat!','error'); return; }

  const menitBaru = getMenitDariJam(jamVal);
  const konflik = arsipList.find(r => {
    if (r.tanggal !== tanggalVal || r.tempat !== tempat) return false;
    return Math.abs(menitBaru - getMenitDariJam(r.jam)) < 60;
  });
  if (konflik) {
    showToast(`❌ Konflik jadwal! "${konflik.agenda.substring(0,45)}..." sudah terjadwal di waktu & tempat yang sama.`,'error');
    const w = document.getElementById('booking-warn');
    if (w) { w.style.display = 'block'; w.scrollIntoView({behavior:'smooth', block:'center'}); }
    return;
  }

  const urlUnd = getTemplateUrl('und'), urlAbs = getTemplateUrl('abs'), urlRis = getTemplateUrl('ris');
  if (!urlUnd||!urlAbs||!urlRis) { showToast('URL template belum lengkap!','error'); return; }
  const pesertaHadir = getCheckedPeserta();
  if (!pesertaHadir.length) { showToast('Pilih minimal 1 peserta!','error'); return; }

  document.getElementById('btn-awan').classList.remove('visible');
  lastGenId = lastGenBlobs = lastGenPrefix = null;

  // ★ FIX TIMEZONE: pakai parseTanggal()
  const tgl     = parseTanggal(tanggalVal);
  const hariStr = HARI_ID[tgl.getDay()];
  const tglStr  = tglFull(tgl);
  const tglGen  = tglGeneret();
  const jamFmt  = jamVal + ' WIB s/d Selesai';

  let nextNo = settings.nomorLast + 1;
  if (getGasUrl()) { try { const d = await gasCall('getLastNomor'); nextNo = d.nextNomor; } catch {} }

  const data = {
    nomorSurat: buildNomor(nextNo, tgl), hari: hariStr, tanggal: tglStr,
    tanggalHari: `${hariStr}, ${tglStr}`, jam: jamFmt, jamPolos: jamVal, tempat, agenda,
    ketua: settings.ketua, sekretaris: settings.sekretaris, kota: settings.kota,
    kotaTanggal: `${settings.kota}, ${tglStr}`, tahun: String(tgl.getFullYear()),
    bulan: BULAN_ID[tgl.getMonth()], instansi: settings.instansi,
    jumlahPeserta: String(pesertaHadir.length), tgl_generet: tglGen,
    peserta: pesertaHadir.map((p, i) => ({no:String(i+1), nama:p.nama, jabatan:p.jabatan, ttd:''}))
  };

  const btn = document.getElementById('btn-gen');
  const sp  = document.getElementById('spinner');
  const tx  = document.getElementById('btn-gen-text');
  btn.disabled = true; sp.style.display = 'block';
  document.getElementById('progress-bar').style.display = 'flex';
  ['ps-fetch','ps-inject','ps-zip','ps-done'].forEach(id => setPS(id,''));

  try {
    setPS('ps-fetch','active'); tx.textContent = 'Mengambil template...';
    let blobs;
    try { blobs = await Promise.all([fetchAndInject(urlUnd,data), fetchAndInject(urlAbs,data), fetchAndInject(urlRis,data)]); }
    catch (e) { setPS('ps-fetch','err'); throw e; }
    setPS('ps-fetch','done'); setPS('ps-inject','done');

    setPS('ps-zip','active'); tx.textContent = 'Mengunduh 3 dokumen...';
    const prefix = `Rapat_${tanggalVal.replace(/-/g,'')}`;
    dlBlob(blobs[0], `${prefix}_Undangan.docx`);
    await new Promise(r => setTimeout(r, 300));
    dlBlob(blobs[1], `${prefix}_AbsenHadir.docx`);
    await new Promise(r => setTimeout(r, 300));
    dlBlob(blobs[2], `${prefix}_Risalah.docx`);
    setPS('ps-zip','done'); setPS('ps-done','done');

    lastGenBlobs = blobs; lastGenPrefix = prefix;

    const arsipId = Date.now();
    const mkDraft = (blob, suffix) => ({
      file:blob, name:`Draft_${prefix}_${suffix}`, size:blob.size, status:'pending',
      url:null, type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      _blobUrl:null, _showPreview:false, _blob:blob, _isDraft:false
    });
    uploadFiles[arsipId] = [
      mkDraft(blobs[0],'Undangan.docx'),
      mkDraft(blobs[1],'AbsenHadir.docx'),
      mkDraft(blobs[2],'Risalah.docx'),
    ];

    const newItem = {id:arsipId, tanggal:tanggalVal, hari:hariStr, jam:jamVal, tempat, agenda,
      nomorSurat: data.nomorSurat, tglGeneret:tglGen,
      peserta: pesertaHadir.map(p => p.nama), uploadedFiles:[]};
    arsipList.unshift(newItem); saveLocal();

    settings.nomorLast = nextNo;
    localStorage.setItem('sirapat_settings', JSON.stringify(settings));

    if (getGasUrl()) {
      gasCall('simpanNomor', {nomorUrut:nextNo, nomorSurat:data.nomorSurat, tanggal:tglStr, agenda, tujuan:'', tglGeneret:tglGen, pesertaCount:pesertaHadir.length}).catch(()=>{});
      syncArsipToCloud(newItem);
      const folderName = `${String(tgl.getDate()).padStart(2,'0')} ${BULAN_ID[tgl.getMonth()]} ${tgl.getFullYear()}`;
      setTimeout(() => uploadSemuaFile(arsipId, folderName), 500);
    }

    lastGenId = arsipId;
    document.getElementById('btn-awan').classList.add('visible');
    updateNomorPreview(); renderCalInline(); refreshStats();
    showToast('✓ 3 dokumen berhasil diunduh (Undangan, Absen, Risalah)!','success');
  } catch (err) { console.error(err); showToast('❌ ' + err.message,'error'); }
  finally { btn.disabled = false; sp.style.display = 'none'; tx.textContent = 'Generate 3 Dokumen'; }
}

function simpanKeAwan() {
  if (!lastGenId) {
    showToast('Tidak ada rapat yang baru di-generate', 'error');
    return;
  }
  
  // 1. Ambil tombol menu Beranda dan pindah ke halaman Beranda
  const btnBeranda = document.querySelector('.nav-menu .nav-btn') || document.querySelectorAll('.nav-btn')[0];
  showPage('beranda', btnBeranda);
  
  // 2. Beri jeda 300ms agar halaman selesai berganti, lalu eksekusi pembukaan modal
  setTimeout(() => {
    try {
      // Cari elemen rapat di list dan scroll perlahan ke arahnya
      const el = document.getElementById('arsip-item-' + lastGenId);
      if (el) { 
        el.classList.add('highlight'); 
        el.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
      }
      
      // Panggil fungsi pengisian data ke modal
      showArsipDetail(lastGenId);
      
      // Paksa modal agar tampil di atas layar
      const modalOverlay = document.getElementById('modal-overlay');
      if (modalOverlay) modalOverlay.classList.add('open');
      
    } catch (err) {
      console.error("Gagal membuka popup detail:", err);
      showToast('Terjadi kesalahan saat membuka detail rapat', 'error');
    }
  }, 300); // Waktu tunggu dinaikkan ke 300 milidetik agar lebih aman
}

// ════ ARSIP LIST ══════════════════════════════════════════════
function renderArsip() {
  const q   = (document.getElementById('search-inp')?.value || '').toLowerCase();
  const bln = document.getElementById('filter-bulan')?.value || '';
  const thn = document.getElementById('filter-tahun')?.value || '';
  const list = arsipList.filter(r => {
    // ★ FIX TIMEZONE
    const d = parseTanggal(r.tanggal);
    if (bln && BULAN_ID[d.getMonth()] !== bln) return false;
    if (thn && String(d.getFullYear()) !== thn) return false;
    if (q && !JSON.stringify(r).toLowerCase().includes(q)) return false;
    return true;
  });
  const el = document.getElementById('arsip-list');
  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><div class="icon">📭</div><h3>Belum ada arsip</h3><p>${getGasUrl()?'Data cloud kosong.':'Arsip muncul setelah generate pertama.'}</p></div>`;
    return;
  }
  el.innerHTML = list.map(r => {
    // ★ FIX TIMEZONE
    const d          = parseTanggal(r.tanggal);
    const files      = uploadFiles[r.id] || [];
    const allFiles   = [...files, ...(r.uploadedFiles||[])];
    const totalCloud = new Set(allFiles.filter(f => f?.status==='done').map(f => f.name)).size;
    const hasDraft   = files.some(f => f._isDraft);
    return `<div class="arsip-item" id="arsip-item-${r.id}" onclick="showArsipDetail(${r.id})">
      <div class="arsip-date-box"><div class="day">${d.getDate()}</div><div class="month">${SH_ID[d.getMonth()]}</div></div>
      <div class="arsip-info">
        <div class="arsip-title">${r.agenda.substring(0,60)}${r.agenda.length>60?'...':''}</div>
        <div class="arsip-meta">
          <span>📅 ${r.hari}, ${d.getFullYear()}</span>
          <span>🕐 ${r.jam} WIB</span>
          <span>👥 ${(r.peserta||[]).length}</span>
          ${totalCloud ? `<span style="color:var(--blue)">☁ ${totalCloud}</span>` : ''}
          ${hasDraft   ? `<span style="color:var(--gold)">📝 draft</span>` : ''}
          ${r.nomorSurat ? `<span>${r.nomorSurat}</span>` : ''}
        </div>
      </div>
      <div class="arsip-actions" onclick="event.stopPropagation()">
        <button class="btn-sm" onclick="hapusArsip(${r.id})">Hapus</button>
      </div>
    </div>`;
  }).join('');
}

function hapusArsip(id) {
  if (!confirm('Hapus arsip ini dari lokal dan cloud?')) return;
  arsipList = arsipList.filter(r => r.id !== id);
  saveLocal(); delete uploadFiles[id]; hapusArsipCloud(id);
  renderArsip(); renderCalInline(); refreshStats();
  showToast('Arsip dihapus','info');
}

// ════ MODAL DETAIL ════════════════════════════════════════════
function printDetail() {
  if (!currentModalId) return;
  const r = arsipList.find(x => x.id === currentModalId); if (!r) return;
  // ★ FIX TIMEZONE
  const d = parseTanggal(r.tanggal);
  const w = window.open('','_blank','width=800,height=600');
  w.document.write(`<html><head><title>Print Detail Rapat</title>
    <style>@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
    </head><body><div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto">
    <h2 style="text-align:center;border-bottom:2px solid #7a1020;color:#7a1020">Detail Arsip Rapat</h2>
    <table style="width:100%;border-collapse:collapse;margin-top:20px;font-size:14px">
      <tr><td style="padding:8px 0;font-weight:600;width:150px;color:#5a3040">Agenda</td><td>${r.agenda}</td></tr>
      <tr><td style="padding:8px 0;font-weight:600;color:#5a3040">Tanggal</td><td>${r.hari}, ${tglFull(d)}</td></tr>
      <tr><td style="padding:8px 0;font-weight:600;color:#5a3040">Pukul</td><td>${r.jam} WIB</td></tr>
      <tr><td style="padding:8px 0;font-weight:600;color:#5a3040">Tempat</td><td>${r.tempat}</td></tr>
      <tr><td style="padding:8px 0;font-weight:600;color:#5a3040">Nomor Surat</td><td>${r.nomorSurat||'-'}</td></tr>
      <tr><td style="padding:8px 0;font-weight:600;color:#5a3040">Tgl Generate</td><td>${r.tglGeneret||'-'}</td></tr>
    </table>
    <h3 style="margin-top:30px;color:#7a1020">Daftar Peserta (${(r.peserta||[]).length} Orang)</h3>
    <ol style="padding-left:20px;font-size:14px;line-height:1.6">${(r.peserta||[]).map(n=>`<li>${n}</li>`).join('')}</ol>
    </div></body></html>`);
  w.document.close(); w.focus();
  setTimeout(() => { w.print(); w.close(); }, 250);
}

function shareFiles() {
  if (!currentModalId) return;
  const r = arsipList.find(x => x.id === currentModalId); if (!r) return;
  const allDone = [...(uploadFiles[currentModalId]||[]), ...(r.uploadedFiles||[])]
    .filter(f => f?.status === 'done' && f.url)
    .reduce((acc, f) => { if (!acc.find(x => x.name === f.name)) acc.push(f); return acc; }, []);
  if (!allDone.length) { showToast('Belum ada dokumen tersimpan di Drive.','error'); return; }
  // ★ FIX TIMEZONE
  const d = parseTanggal(r.tanggal);
  const text = `🗂 Dokumen Rapat: ${r.agenda}\n📅 ${r.hari}, ${tglFull(d)}\n\n` +
    allDone.map(f => `📄 ${f.name}\n${f.url}`).join('\n\n');
  if (navigator.share) navigator.share({title:'Dokumen Rapat',text}).catch(()=>{});
  else navigator.clipboard.writeText(text).then(() => showToast('✓ Link disalin ke clipboard!','success'))
    .catch(() => prompt('Salin teks berikut:', text));
}

function showArsipDetail(id) {
  currentModalId = id;
  const r = arsipList.find(x => x.id === id); if (!r) return;
  // ★ FIX TIMEZONE
  const d = parseTanggal(r.tanggal);
  const folderName = `${String(d.getDate()).padStart(2,'0')} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
  if (r.uploadedFiles?.length && !uploadFiles[id]?.length)
    uploadFiles[id] = r.uploadedFiles.map(f => ({...f, file:null, type:f.type||'', _showPreview:false}));
  const hasDriveFiles = [...(uploadFiles[id]||[]), ...(r.uploadedFiles||[])].some(f => f?.status==='done' && f.url);
  const shareBtn = document.getElementById('modal-share-btn');
  if (shareBtn) shareBtn.style.display = hasDriveFiles ? '' : 'none';
  document.getElementById('modal-title').textContent = 'Detail Rapat';
  document.getElementById('modal-body').innerHTML = `
    <div class="detail-row"><div class="detail-label">Tanggal</div><div class="detail-val">${r.hari}, ${tglFull(d)}</div></div>
    <div class="detail-row"><div class="detail-label">Pukul</div><div class="detail-val">${r.jam} WIB</div></div>
    <div class="detail-row"><div class="detail-label">Tempat</div><div class="detail-val">${r.tempat}</div></div>
    <div class="detail-row"><div class="detail-label">Agenda</div><div class="detail-val">${r.agenda}</div></div>
    <div class="detail-row"><div class="detail-label">Nomor Surat</div><div class="detail-val">${r.nomorSurat||'-'}</div></div>
    <div class="detail-row"><div class="detail-label">Di-generate</div><div class="detail-val">${r.tglGeneret||'-'}</div></div>
    <div class="detail-row" style="border-bottom:none"><div class="detail-label">Peserta (${(r.peserta||[]).length})</div>
      <div class="detail-val">${(r.peserta||[]).map((n,i)=>`${i+1}. ${n}`).join('<br>')}</div>
    </div>
    ${renderDraftSection(id)}
    <div class="upload-section">
      <div class="upload-section-title">☁ Upload Dokumen ke Drive <span class="folder-tag">📁 ${folderName}</span></div>
      ${!getGasUrl()?'<div class="no-gas-warning">⚠ URL Apps Script belum diisi di Pengaturan.</div>':''}
      <div class="upload-zone" id="dropzone-${id}"
           ondrop="handleDrop(event,${id})" ondragover="event.preventDefault();this.classList.add('dragover')"
           ondragleave="this.classList.remove('dragover')" onclick="document.getElementById('fi-${id}').click()">
        <div class="upload-zone-icon">📂</div>
        <div class="upload-zone-text"><strong>Drag & drop file</strong><br>atau klik untuk pilih<br>
          <span style="font-size:10px">.docx .pdf .zip .jpg .png .webp — maks 10MB</span></div>
        <input type="file" id="fi-${id}" multiple accept=".docx,.doc,.pdf,.zip,.jpg,.jpeg,.png,.webp,.gif" onchange="handleFileInput(event,${id})">
      </div>
      <div class="uploaded-files" id="file-list-${id}"></div>
      <div class="upload-actions" id="upload-actions-${id}" style="display:none">
        <button class="btn-upload-all" id="upload-btn-${id}" onclick="uploadSemuaFile(${id},'${folderName}')">☁ Upload ke Drive</button>
      </div>
    </div>`;
  renderFileList(id);
  document.getElementById('modal-overlay').classList.add('open');
}

function renderDraftSection(id) {
  const drafts = (uploadFiles[id]||[]).filter(f => f._isDraft && f._blob);
  if (!drafts.length) return '';
  return `<div class="draft-section">
    <div class="draft-section-title">📝 Draft Dokumen Tergenerate</div>
    <div class="draft-files">${drafts.map(f =>
      `<div class="draft-file-item">
        <div class="draft-file-icon">📝</div>
        <div class="draft-file-name">${f.name}</div>
        <span style="font-size:10px;color:var(--text-muted)">${fmtSize(f.size)}</span>
        <button class="draft-file-dl" onclick="downloadDraft(${id},${(uploadFiles[id]||[]).indexOf(f)})">⬇ Unduh</button>
      </div>`).join('')}
    </div>
    <div style="font-size:10px;color:var(--text-muted);margin-top:6px">💡 File draft hanya tersedia selama sesi ini.</div>
  </div>`;
}

function downloadDraft(arsipId, fileIdx) {
  const f = (uploadFiles[arsipId]||[])[fileIdx];
  if (!f?._blob) return;
  dlBlob(f._blob, f.name);
}

function renderFileList(id) {
  const files  = (uploadFiles[id]||[]).filter(f => !f._isDraft);
  const el     = document.getElementById(`file-list-${id}`); if (!el) return;
  const actEl  = document.getElementById(`upload-actions-${id}`);
  if (actEl) actEl.style.display = files.length ? 'flex' : 'none';
  if (!files.length) { el.innerHTML = ''; return; }

  el.innerHTML = files.map(f => {
    const realIdx = (uploadFiles[id]||[]).indexOf(f);
    const isDone  = f.status === 'done' && f.url;
    const imgFile = isImage(f.name);
    const pdfFile = isPdf(f.name);
    let btns = '';
    if (isDone) {
      btns += `<a class="file-link" href="${f.url}" target="_blank">Buka ↗</a>`;
      btns += ` <button class="file-preview-btn" onclick="shareSingleFile('${f.url}','${f.name}')" title="Share">🔗</button>`;
    } else {
      btns += `<span class="file-status ${f.status}">${statusLbl(f.status)}</span>`;
    }
    if ((imgFile && (f._blobUrl||isDone)) || (pdfFile && isDone)) {
      btns += ` <button class="file-preview-btn${f._showPreview?' active':''}" onclick="togglePreview(${id},${realIdx})" title="${f._showPreview?'Tutup':'Lihat'} preview">👁</button>`;
      btns += ` <button class="file-preview-btn" onclick="printSingleFile(${id},${realIdx})" title="Print">🖨️</button>`;
    }
    let preview = '';
    if (f._showPreview) {
      if (imgFile) {
        const src = f._blobUrl || (isDone ? (extractDriveId(f.url) ? `https://drive.google.com/thumbnail?id=${extractDriveId(f.url)}&sz=w800` : f.url) : '');
        if (src) preview = `<div class="file-preview-area"><img src="${src}" alt="${f.name}" style="max-width:100%;max-height:360px;border-radius:8px;object-fit:contain;display:block;margin:0 auto" onerror="this.style.display='none'"></div>`;
      } else if (pdfFile && isDone) {
        const driveId = extractDriveId(f.url);
        const src = driveId ? `https://drive.google.com/file/d/${driveId}/preview` : f.url;
        preview = `<div class="file-preview-area"><iframe src="${src}" style="width:100%;height:440px;border:none;border-radius:8px" allowfullscreen loading="lazy"></iframe></div>`;
      }
    }
    return `<div class="uploaded-file-item" id="fitem-${id}-${realIdx}" style="flex-direction:column;align-items:stretch">
      <div style="display:flex;align-items:center;gap:9px">
        <div class="file-icon">${getFileIcon(f.name)}</div>
        <div class="file-name">${f.name}</div>
        <div class="file-size">${fmtSize(f.size)}</div>
        <div style="display:flex;align-items:center;gap:5px;flex-shrink:0;margin-left:auto">
          ${btns}
          ${f.status!=='uploading' ? `<button onclick="hapusFile(${id},${realIdx})" title="Hapus" style="background:none;border:none;cursor:pointer;font-size:12px;padding:2px 5px;border-radius:3px;color:var(--text-muted)">✕</button>` : ''}
        </div>
      </div>${preview}
    </div>`;
  }).join('');
}

function togglePreview(arsipId, fileIdx) {
  const files = uploadFiles[arsipId]; if (!files?.[fileIdx]) return;
  files[fileIdx]._showPreview = !files[fileIdx]._showPreview;
  renderFileList(arsipId);
}
function revokeBlobUrl(arsipId, fileIdx) {
  const f = (uploadFiles[arsipId]||[])[fileIdx];
  if (f?._blobUrl) URL.revokeObjectURL(f._blobUrl);
}
function closeModal(e) {
  if (!e || e.target.id === 'modal-overlay') {
    document.getElementById('modal-overlay').classList.remove('open');
    currentModalId = null;
  }
}

// ════ UPLOAD ══════════════════════════════════════════════════
function handleFileInput(ev, id) { addFiles(id, Array.from(ev.target.files)); ev.target.value = ''; }
function handleDrop(ev, id) {
  ev.preventDefault();
  document.getElementById(`dropzone-${id}`)?.classList.remove('dragover');
  addFiles(id, Array.from(ev.dataTransfer.files));
}
function addFiles(id, files) {
  uploadFiles[id] ??= [];
  files.forEach(f => {
    const maxMB = f.type.startsWith('image/') ? 20 : 10;
    if (f.size > maxMB*1024*1024) { showToast(`${f.name} terlalu besar (maks ${maxMB}MB)`,'error'); return; }
    const blobUrl = f.type.startsWith('image/') ? URL.createObjectURL(f) : null;
    uploadFiles[id].push({file:f, name:f.name, size:f.size, status:'pending', url:null, type:f.type||'', _blobUrl:blobUrl, _showPreview:false});
  });
  renderFileList(id);
}

function hapusFile(id, i) {
  if (!confirm('Hapus file ini?')) return;
  if (!uploadFiles[id]) return;
  revokeBlobUrl(id, i); uploadFiles[id].splice(i, 1); renderFileList(id);
  const r = arsipList.find(x => x.id === id);
  if (r) {
    r.uploadedFiles = uploadFiles[id].filter(f => f.status==='done').map(f => ({name:f.name, size:f.size, status:f.status, url:f.url||null}));
    saveLocal();
    if (getGasUrl()) gasCall('updateArsipFiles', {id, uploadedFiles:r.uploadedFiles}).catch(()=>{});
  }
  renderArsip(); showToast('File dihapus','info');
}

async function uploadSemuaFile(id, folderName) {
  if (!getGasUrl()) { showToast('URL Apps Script belum diisi!','error'); return; }
  const allFiles = uploadFiles[id] || [];
  allFiles.forEach(f => { if (f._isDraft && f._blob && f.status==='draft') { f.file=f._blob; f.status='pending'; } });
  const pending = allFiles.filter(f => f.status==='pending' || f.status==='err');
  if (!pending.length) { showToast('Tidak ada file yang perlu diupload.','info'); return; }
  const btn = document.getElementById(`upload-btn-${id}`);
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Mengupload...'; }
  let ok = 0, fail = 0;
  for (let i = 0; i < allFiles.length; i++) {
    const f = allFiles[i]; if (f.status!=='pending' && f.status!=='err') continue;
    if (!f.file) { allFiles[i].status='err'; fail++; renderFileList(id); continue; }
    allFiles[i].status = 'uploading'; renderFileList(id);
    try {
      const res = await gasCall('uploadFile', {fileName:f.name, fileBase64:await toBase64(f.file), mimeType:f.file.type||'application/octet-stream', folderName});
      if (!res.success) throw new Error(res.error||'Unknown');
      allFiles[i].status='done'; allFiles[i].url=res.fileUrl; allFiles[i].type=allFiles[i].type||f.file?.type||'';
      allFiles[i]._isDraft=false; ok++;
    } catch { allFiles[i].status='err'; fail++; }
    renderFileList(id);
  }
  if (btn) { btn.disabled=false; btn.textContent='☁ Upload ke Drive'; }
  showToast(`Upload: ${ok} berhasil${fail?`, ${fail} gagal`:''}`, ok?'success':'error');
  const r = arsipList.find(x => x.id===id);
  if (r) {
    r.uploadedFiles = allFiles.map(f => ({name:f.name, size:f.size, status:f.status, url:f.url||null}));
    saveLocal(); if (getGasUrl()) gasCall('updateArsipFiles', {id, uploadedFiles:r.uploadedFiles}).catch(()=>{});
  }
  const shareBtn = document.getElementById('modal-share-btn');
  if (shareBtn) shareBtn.style.display = allFiles.some(f=>f.status==='done'&&f.url) ? '' : 'none';
  renderArsip();
}

// ════ SHARE & PRINT FILE ══════════════════════════════════════
function shareSingleFile(url, name) {
  const text = `File Rapat: ${name}\n${url}`;
  if (navigator.share) navigator.share({title:name, text}).catch(()=>{});
  else navigator.clipboard.writeText(text).then(() => showToast('✓ Link disalin!','success'))
    .catch(() => prompt('Salin link:', text));
}

function printSingleFile(arsipId, fileIdx) {
  const f = (uploadFiles[arsipId]||[])[fileIdx]; if (!f) return;
  if (isImage(f.name)) {
    const src = f._blobUrl || (f.url ? (extractDriveId(f.url) ? `https://drive.google.com/thumbnail?id=${extractDriveId(f.url)}&sz=w2000` : f.url) : '');
    if (!src) { showToast('File belum siap di-print','error'); return; }
    const w = window.open('','_blank');
    w.document.write(`<html><head><title>Print - ${f.name}</title>
      <style>@media print{@page{margin:0}body{margin:0;display:flex;justify-content:center;align-items:center;height:100vh}img{max-width:100%;max-height:100vh;object-fit:contain}}</style>
      </head><body onload="setTimeout(function(){window.print();window.close()},500)">
      <img src="${src}" alt="${f.name}" style="max-width:100%;max-height:100vh;object-fit:contain">
      </body></html>`);
    w.document.close();
  } else if (isPdf(f.name) && f.url) {
    window.open(f.url, '_blank');
  } else {
    showToast('File belum siap di-print','error');
  }
}

// ════ PESERTA — MANAGE PAGE ═══════════════════════════════════
function renderPesertaManage() {
  document.getElementById('peserta-manage-list').innerHTML = pesertaList.map((p, i) =>
    `<div class="peserta-row" draggable="true"
         ondragstart="pDragStart(event,${i})" ondragover="pDragOver(event)"
         ondragenter="pDragEnter(event,${i})" ondragleave="pDragLeave(event)"
         ondrop="pDrop(event,${i})" ondragend="pDragEnd(event)">
      <div class="drag-handle" title="Geser untuk ubah urutan">⠿</div>
      <div class="peserta-num">${i+1}</div>
      <input type="text" value="${p.nama}" placeholder="Nama + gelar" id="pm-nama-${i}">
      <input type="text" value="${p.jabatan}" placeholder="Jabatan" id="pm-jab-${i}" style="max-width:260px">
      <button class="btn-icon" onclick="hapusPesertaRow(${i})">✕</button>
    </div>`
  ).join('');
}

let pDragIdx = null;
function syncPesertaDOM() {
  pesertaList.forEach((_, i) => {
    const n = document.getElementById('pm-nama-'+i), j = document.getElementById('pm-jab-'+i);
    if (n) pesertaList[i].nama = n.value;
    if (j) pesertaList[i].jabatan = j.value;
  });
}
function pDragStart(e, i) { syncPesertaDOM(); pDragIdx=i; e.dataTransfer.effectAllowed='move'; setTimeout(()=>e.target.classList.add('dragging'),0); }
function pDragOver(e)     { e.preventDefault(); e.dataTransfer.dropEffect='move'; }
function pDragEnter(e, i) { e.preventDefault(); if (i!==pDragIdx) e.currentTarget.classList.add('drop-target'); }
function pDragLeave(e)    { e.currentTarget.classList.remove('drop-target'); }
function pDrop(e, i) {
  e.stopPropagation(); e.currentTarget.classList.remove('drop-target');
  if (pDragIdx===null || pDragIdx===i) return;
  pesertaList.splice(i, 0, pesertaList.splice(pDragIdx, 1)[0]);
  renderPesertaManage();
  localStorage.setItem('sirapat_peserta', JSON.stringify(pesertaList));
  renderPesertaGen();
  if (getGasUrl()) gasCall('simpanPeserta', {peserta:pesertaList}).catch(()=>{});
}
function pDragEnd(e) {
  e.target.classList.remove('dragging');
  document.querySelectorAll('.peserta-row').forEach(el => el.classList.remove('drop-target'));
  pDragIdx = null;
}
function tambahPeserta() { pesertaList.push({nama:'',jabatan:''}); renderPesertaManage(); }
function hapusPesertaRow(i) {
  if (!confirm('Hapus peserta ini?')) return;
  pesertaList.splice(i, 1); renderPesertaManage();
  showToast('Peserta dihapus','info');
}
function simpanPeserta() {
  pesertaList = pesertaList.map((_,i) => ({
    nama:    document.getElementById('pm-nama-'+i)?.value||'',
    jabatan: document.getElementById('pm-jab-'+i)?.value||''
  })).filter(p => p.nama.trim());
  localStorage.setItem('sirapat_peserta', JSON.stringify(pesertaList));
  renderPesertaGen(); showToast('Daftar peserta disimpan!','success');
  if (getGasUrl()) gasCall('simpanPeserta', {peserta:pesertaList}).catch(()=>{});
}
function resetPeserta() {
  if (!confirm('Reset ke default?')) return;
  pesertaList = DEFAULT_PESERTA.map(p => ({...p}));
  localStorage.setItem('sirapat_peserta', JSON.stringify(pesertaList));
  renderPesertaManage(); renderPesertaGen(); showToast('Direset ke default.','info');
}

// ════ PENGATURAN ══════════════════════════════════════════════
function loadPengaturan() {
  ['instansi','kota','ketua','sekretaris'].forEach(k => { const el=document.getElementById('set-'+k); if(el) el.value=settings[k]||''; });
  const fields = {nf:'set-nomor-fmt', nl:'set-nomor-last', gu:'set-gas-url', uu:'url-und', ua:'url-abs', ur:'url-ris'};
  const vals   = {nf:settings.nomorFmt, nl:settings.nomorLast||0, gu:settings.gasUrl, uu:settings.urlUnd, ua:settings.urlAbs, ur:settings.urlRis};
  Object.entries(fields).forEach(([k,id]) => { const el=document.getElementById(id); if(el) el.value=vals[k]||''; });
  if (settings.tplMode === 'manual') document.querySelectorAll('.tpl-mode-tab')[1]?.click();
}
function simpanPengaturan() {
  ['instansi','kota','ketua','sekretaris'].forEach(k => { const el=document.getElementById('set-'+k); if(el) settings[k]=el.value; });
  const nf=document.getElementById('set-nomor-fmt');  if(nf) settings.nomorFmt=nf.value;
  const nl=document.getElementById('set-nomor-last'); if(nl) settings.nomorLast=parseInt(nl.value)||0;
  const gu=document.getElementById('set-gas-url');    if(gu) settings.gasUrl=gu.value.trim();
  const uu=document.getElementById('url-und');        if(uu) settings.urlUnd=uu.value;
  const ua=document.getElementById('url-abs');        if(ua) settings.urlAbs=ua.value;
  const ur=document.getElementById('url-ris');        if(ur) settings.urlRis=ur.value;
  settings.tplMode = tplMode;
  localStorage.setItem('sirapat_settings', JSON.stringify(settings));
  showToast('Pengaturan disimpan!','success'); fetchNomor();
}
function toggleFaq(el) { el.classList.toggle('open'); el.nextElementSibling.classList.toggle('open'); }

// ════ NAV & TOAST ═════════════════════════════════════════════
function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn, .nav-drawer .nav-btn').forEach(b => b.classList.remove('active'));
  
  const targetPage = document.getElementById('page-' + id);
  if (targetPage) targetPage.classList.add('active');
  if (btn) btn.classList.add('active');
  
  if (id === 'peserta')    renderPesertaManage();
  if (id === 'beranda') {
    renderCalInline();
    renderArsip();
    renderUpNext();        // ← tambah
    renderRisalahQuick();  // ← tambah
    renderHealthMeter();   // ← tambah
  }
  if (id === 'pengaturan') loadPengaturan();
}
let toastT;
function showToast(msg, type='info') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type} show`;
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 4500);
}

// ════ LOGIN & AUTO SYNC ═══════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('documeet_auth') === 'true') {
    const screen = document.getElementById('login-screen'); if (screen) screen.style.display='none';
    mulaiAutoSync();
  }
});

async function loginAdmin() {
  const inp = document.getElementById('admin-pin').value;
  const err = document.getElementById('login-error');
  const btn = document.getElementById('btn-login');
  if (!inp) return;
  btn.textContent='Memeriksa PIN...'; btn.disabled=true;
  try {
    const data = await gasCall('getPin');
    if (inp === String(data.pin)) {
      sessionStorage.setItem('documeet_auth','true');
      document.getElementById('login-screen').style.display='none';
      showToast('✓ Berhasil masuk','success');
      mulaiAutoSync();
    } else {
      tampilError('❌ PIN salah! Silakan coba lagi.');
    }
  } catch { tampilError('❌ Gagal terhubung ke Google Sheets.'); }
  function tampilError(p) {
    err.textContent=p; err.style.display='block';
    setTimeout(()=>{ err.style.display='none'; },3500);
    btn.textContent='Masuk Kelola Arsip'; btn.disabled=false;
  }
}

function mulaiAutoSync() {
  Promise.all([fetchNomor(), loadArsipFromCloud(), loadPesertaFromCloud()]).then(() => {
    renderCalInline(); refreshStats(); updateNomorPreview(); renderPesertaGen();
    if (document.getElementById('page-peserta')?.classList.contains('active')) renderPesertaManage();
    checkBooking();
  });
}

async function loadPesertaFromCloud() {
  if (!getGasUrl()) return;
  try {
    const data = await gasCall('getPeserta');
    if (data.peserta?.length) {
      pesertaList = data.peserta;
      localStorage.setItem('sirapat_peserta', JSON.stringify(pesertaList));
    }
  } catch (e) { console.error('Gagal memuat peserta dari cloud:', e); }
}

// ════ AGENDA TERDEKAT (UP NEXT) ══════════════════════════════
function renderUpNext() {
  const el = document.getElementById('upnext-list'); if (!el) return;
  
  // todayMs digunakan HANYA untuk menghitung selisih hari (label "Hari ini" / "Besok")
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  // nowMs adalah waktu detil saat ini (termasuk jam dan menit)
  const nowMs = new Date().getTime();

  const upcoming = arsipList
    .filter(r => {
      const d = parseTanggal(r.tanggal);
      // Sisipkan jam dan menit ke dalam objek tanggal
      if (r.jam) {
        const parts = r.jam.split(':');
        d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
      }
      // Bandingkan dengan jam riil sekarang
      return d.getTime() >= nowMs;
    })
    .sort((a, b) => {
      // Sortir berdasarkan tanggal sekaligus jam agar lebih presisi
      const dA = parseTanggal(a.tanggal);
      if (a.jam) dA.setHours(...a.jam.split(':').map(Number));
      const dB = parseTanggal(b.tanggal);
      if (b.jam) dB.setHours(...b.jam.split(':').map(Number));
      return dA.getTime() - dB.getTime();
    })
    .slice(0, 3);

  if (!upcoming.length) {
    el.innerHTML = '<div class="upnext-empty">📭 Tidak ada rapat mendatang.</div>';
    return;
  }
  
  el.innerHTML = upcoming.map((r, i) => {
    const d = parseTanggal(r.tanggal);
    const diffMs = d.getTime() - todayMs;
    const diffDay = Math.round(diffMs / 86400000);
    const labelHari = diffDay === 0 ? 'Hari ini' : diffDay === 1 ? 'Besok' : diffDay + ' hari';
    const isSoon = diffDay <= 3;
    const isFirst = i === 0;
    
    return `<div class="upnext-item${isFirst ? ' next' : ''}" onclick="showArsipDetail(${r.id})">
      <div class="upnext-datebox${isFirst ? '' : ' future'}">
        <span class="ud">${String(d.getDate()).padStart(2,'0')}</span>
        <span class="um">${SH_ID[d.getMonth()].toUpperCase()}</span>
      </div>
      <div class="upnext-info">
        <div class="upnext-agenda">${r.agenda.substring(0,55)}${r.agenda.length>55?'...':''}</div>
        <div class="upnext-meta">
          <span>🕒 ${r.jam} WIB</span>
          <span>📍 ${(r.tempat||'').substring(0,28)}</span>
        </div>
      </div>
      <span class="upnext-badge ${isSoon ? 'soon' : 'far'}">${labelHari}</span>
    </div>`;
  }).join('');
}

// ════ RISALAH TERAKHIR QUICK ACCESS ══════════════════════════
function renderRisalahQuick() {
  const sub = document.getElementById('risalah-quick-sub');
  const st  = document.getElementById('risalah-quick-status');
  if (!sub || !st) return;
  if (!arsipList.length) {
    sub.textContent = 'Belum ada arsip rapat';
    st.className = 'risalah-quick-status none'; st.textContent = '—'; return;
  }
  // Cari arsip terbaru (arsipList sudah urut descending)
  const latest = arsipList[0];
  const d      = parseTanggal(latest.tanggal);
  sub.textContent = `${(latest.agenda||'').substring(0,45)}${(latest.agenda||'').length>45?'...':''} — ${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;

  // Cek apakah risalah sudah ada di Drive
  const allFiles = [...(uploadFiles[latest.id]||[]), ...(latest.uploadedFiles||[])];
  const risalahFile = allFiles.find(f => f?.name && /risalah/i.test(f.name) && f.status === 'done');
  if (risalahFile) {
    st.className = 'risalah-quick-status ok'; st.textContent = '☁ Drive';
  } else {
    const hasDraft = (uploadFiles[latest.id]||[]).some(f => /risalah/i.test(f.name||''));
    st.className = 'risalah-quick-status ' + (hasDraft ? 'pending' : 'none');
    st.textContent = hasDraft ? '📝 Draft' : '—';
  }
}

function bukaRisalahTerakhir() {
  if (!arsipList.length) { showToast('Belum ada arsip rapat.','error'); return; }
  showArsipDetail(arsipList[0].id);
}
// ════ HEALTH METER ════════════════════════════════════════════
function renderHealthMeter() {
  const rowsEl  = document.getElementById('health-rows');
  const scoreEl = document.getElementById('health-score');
  const footEl  = document.getElementById('health-footer-text');
  if (!rowsEl) return;

  const yr      = today.getFullYear();
  // Gunakan arsip tahun ini saja agar relevan
  const list    = arsipList.filter(r => parseTanggal(r.tanggal).getFullYear() === yr);
  const total   = list.length;

  if (!total) {
    rowsEl.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:6px 0">Belum ada arsip tahun ini.</div>';
    if (scoreEl) { scoreEl.textContent = '—'; scoreEl.className = 'health-score'; }
    if (footEl)  footEl.textContent = 'Tidak ada data';
    return;
  }

  // 1. Hitung dokumen dengan keyword tertentu yang berstatus 'done' DAN berformat .pdf
  const countDonePdf = (keyword) => list.filter(r => {
    const allFiles = [...(uploadFiles[r.id]||[]), ...(r.uploadedFiles||[])];
    return allFiles.some(f => 
      f?.name && 
      new RegExp(keyword, 'i').test(f.name) && 
      f.name.toLowerCase().endsWith('.pdf') && // Wajib PDF
      f.status === 'done'
    );
  }).length;

  const undOk = countDonePdf('undangan');
  const absOk = countDonePdf('absen');
  const risOk = countDonePdf('risalah');

  // 2. Hitung arsip yang punya minimal 1 foto/gambar (menggunakan fungsi isImage bawaan kodemu)
  const fotoOk = list.filter(r => {
    const allFiles = [...(uploadFiles[r.id]||[]), ...(r.uploadedFiles||[])];
    return allFiles.some(f => f?.name && isImage(f.name) && f.status === 'done');
  }).length;

  // Persentase sekarang dibagi 4 komponen
  const pct = u => Math.round(u / total * 100);
  const pUnd = pct(undOk), pAbs = pct(absOk), pRis = pct(risOk), pFoto = pct(fotoOk);
  const overall = Math.round((pUnd + pAbs + pRis + pFoto) / 4);

  const cls  = v => v >= 90 ? 'ok' : v >= 60 ? 'warn' : 'err';
  const vcls = v => v >= 90 ? 'ok' : v >= 60 ? 'warn' : 'err';

  // Render elemen baris
  rowsEl.innerHTML = [
    {icon:'📨', label:'Undangan (PDF)', ok:undOk, pct:pUnd},
    {icon:'✅', label:'Absen Hadir (PDF)', ok:absOk, pct:pAbs},
    {icon:'📝', label:'Risalah (PDF)', ok:risOk, pct:pRis},
    {icon:'📸', label:'Dokumentasi (Foto)', ok:fotoOk, pct:pFoto},
  ].map(row => `
    <div class="health-row">
      <div class="health-row-top">
        <span class="health-row-label">${row.icon} ${row.label}</span>
        <span class="health-row-val ${vcls(row.pct)}">${row.ok}/${total}</span>
      </div>
      <div class="health-bar-bg"><div class="health-bar-fill ${cls(row.pct)}" style="width:${row.pct}%"></div></div>
    </div>`).join('');

  if (scoreEl) {
    scoreEl.textContent = overall + '%';
    scoreEl.className = 'health-score ' + (overall >= 90 ? 'high' : overall >= 60 ? 'mid' : 'low');
  }

  // Cek arsip mana saja yang BELUM LENGKAP ke-4 syaratnya
  const belum = list.filter(r => {
    const allFiles = [...(uploadFiles[r.id]||[]), ...(r.uploadedFiles||[])];
    const doneFiles = allFiles.filter(f => f?.status === 'done' && f?.name);
    
    const hasUnd  = doneFiles.some(f => /undangan/i.test(f.name) && f.name.toLowerCase().endsWith('.pdf'));
    const hasAbs  = doneFiles.some(f => /absen/i.test(f.name) && f.name.toLowerCase().endsWith('.pdf'));
    const hasRis  = doneFiles.some(f => /risalah/i.test(f.name) && f.name.toLowerCase().endsWith('.pdf'));
    const hasFoto = doneFiles.some(f => isImage(f.name));

    return !(hasUnd && hasAbs && hasRis && hasFoto); // Jika salah satu tidak ada, berarti belum lengkap
  }).length;

  if (footEl) footEl.textContent = belum > 0 ? `${belum} arsip belum lengkap dokumen Drive` : '✓ Semua arsip tahun ini lengkap';
}

function scrollToArsipBelum() {
  const yr    = today.getFullYear();
  const belum = arsipList.find(r => {
    if (parseTanggal(r.tanggal).getFullYear() !== yr) return false;
    
    const allFiles = [...(uploadFiles[r.id]||[]), ...(r.uploadedFiles||[])];
    const doneFiles = allFiles.filter(f => f?.status === 'done' && f?.name);
    
    const hasUnd  = doneFiles.some(f => /undangan/i.test(f.name) && f.name.toLowerCase().endsWith('.pdf'));
    const hasAbs  = doneFiles.some(f => /absen/i.test(f.name) && f.name.toLowerCase().endsWith('.pdf'));
    const hasRis  = doneFiles.some(f => /risalah/i.test(f.name) && f.name.toLowerCase().endsWith('.pdf'));
    const hasFoto = doneFiles.some(f => isImage(f.name));

    // Kembalikan true jika ada dokumen yang KURANG LENGKAP
    return !(hasUnd && hasAbs && hasRis && hasFoto);
  });
  
  if (!belum) { showToast('Semua arsip tahun ini sudah lengkap!','success'); return; }
  
  const el = document.getElementById('arsip-item-' + belum.id);
  if (el) { 
    el.classList.add('highlight'); 
    el.scrollIntoView({behavior:'smooth',block:'center'}); 
    setTimeout(()=>el.classList.remove('highlight'),2500); 
  }
  showArsipDetail(belum.id);
}

// ════ INIT ════════════════════════════════════════════════════
document.getElementById('inp-tanggal').value = today.toISOString().split('T')[0];
initCalInline(); renderCalInline(); renderPesertaGen(); refreshStats();
if (settings.tplMode === 'manual') { tplMode='manual'; document.querySelectorAll('.tpl-mode-tab')[1]?.click(); }
Promise.all([
  getGasUrl() ? fetchNomor() : Promise.resolve(),
  loadArsipFromCloud()
]).then(() => { renderCalInline(); refreshStats(); updateNomorPreview(); checkBooking(); });
