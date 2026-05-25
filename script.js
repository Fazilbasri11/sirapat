
// ════ STATE ════
const DEFAULT_PESERTA=[
  {nama:'ISKANDAR, S.Sos.',jabatan:'Ketua'},
  {nama:'DARKASYI ABDUL HAMID, S.Pd.',jabatan:'Anggota'},
  {nama:'ABDULLAH, S.Sos.',jabatan:'Anggota'},
  {nama:'MASRUR, MA.',jabatan:'Anggota'},
  {nama:'HASMUNIR, SH.',jabatan:'Anggota'},
  {nama:'ISWANDI, S.Sos.',jabatan:'Sekretaris'},
  {nama:'DAHLAN, A.Md.',jabatan:'Kasubbag Keuangan, Umum, dan Logistik'},
  {nama:'MASYKUR, S.Pd.I.',jabatan:'Kasubbag Perencanaan, Data dan Informasi'},
  {nama:'MAHMUNIR, S.Kom.',jabatan:'Kasubbag Teknis Penyelenggaraan Pemilu, dan Hukum'},
  {nama:'MAIMUN MAHMILUL, S.IP.',jabatan:'Kasubbag Keuangan, Umum dan Logistik'},
  {nama:'ISNAINI, SE.',jabatan:'Analis Pengelola Keuangan APBN Ahli Muda'},
  {nama:'NURHAYATI, A.Md.',jabatan:'Bendahara Pengeluaran'},
  {nama:'FAZIL BASRI, S.Kom.',jabatan:'Notulen'},
];
let pesertaList=JSON.parse(localStorage.getItem('sirapat_peserta')||'null')||DEFAULT_PESERTA.map(p=>({...p}));
let arsipList=JSON.parse(localStorage.getItem('sirapat_arsip')||'[]');
let settings=JSON.parse(localStorage.getItem('sirapat_settings')||'null')||{
  instansi:'KIP Kabupaten Pidie Jaya',kota:'Meureudu',ketua:'Iskandar',sekretaris:'Iswandi',
  nomorFmt:'[NO]/PK.01-Und/1118/1/[TAHUN]',nomorLast:0,
  gasUrl:'',urlUnd:'',urlAbs:'',urlRis:'',tplMode:'auto'
};
// Patch untuk memaksa ganti format [BULAN] menjadi angka 1
if(settings.nomorFmt && settings.nomorFmt.includes('[BULAN]')){
  settings.nomorFmt = settings.nomorFmt.replace('[BULAN]', '1');
  localStorage.setItem('sirapat_settings', JSON.stringify(settings));
}
const AUTO_PATHS={und:'./templates/UND_template.docx',abs:'./templates/ABSEN_template.docx',ris:'./templates/RISALAH_template.docx'};
const BULAN_ID=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const HARI_ID=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const SH_ID=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
let tplMode=settings.tplMode||'auto';
let calYearInline,calMonthInline;
const today=new Date();
let lastGenId=null;
let uploadFiles={};
// Simpan blob terakhir generate untuk keperluan arsip draft
let lastGenBlobs=null;
let lastGenPrefix=null;
let currentModalId=null;

// ════ HAMBURGER NAV ════
function toggleDrawer(){
  const d=document.getElementById('nav-drawer');
  const t=document.getElementById('nav-toggle');
  const open=d.classList.toggle('open');
  t.textContent=open?'✕':'☰';
}
function closeDrawer(){
  document.getElementById('nav-drawer').classList.remove('open');
  document.getElementById('nav-toggle').textContent='☰';
}
document.addEventListener('click',function(e){
  const d=document.getElementById('nav-drawer');
  const t=document.getElementById('nav-toggle');
  if(d.classList.contains('open')&&!d.contains(e.target)&&!t.contains(e.target)){closeDrawer();}
});

// ════ HERO CANVAS ════
(function(){
  const canvas=document.getElementById('hero-canvas');if(!canvas) return;
  const ctx=canvas.getContext('2d');let W,H,particles=[];
  function resize(){const h=canvas.parentElement;W=canvas.width=h.offsetWidth;H=canvas.height=h.offsetHeight;}
  function mk(){return{x:Math.random()*W,y:H+10,r:Math.random()*2.5+.5,speed:Math.random()*.6+.3,opacity:Math.random()*.6+.2,drift:(Math.random()-.5)*.4,life:0,maxLife:Math.random()*160+80};}
  function draw(){
    ctx.clearRect(0,0,W,H);
    if(particles.length<55&&Math.random()<.35) particles.push(mk());
    particles=particles.filter(p=>{p.y-=p.speed;p.x+=p.drift;p.life++;const t=p.life/p.maxLife;const a=t<.2?t/.2:t>.8?(1-t)/.2:1;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=`rgba(201,147,42,${p.opacity*a})`;ctx.fill();return p.life<p.maxLife&&p.y>-10;});
    requestAnimationFrame(draw);
  }
  resize();window.addEventListener('resize',resize);draw();
})();

function getGasUrl(){
  // URL GAS sudah ditanam permanen di sini
  return "https://script.google.com/macros/s/AKfycbz2CWZbBPaBBfXL1jtSQDhd65FnUAWZogzA-yl51cjxIQMFznhmgneI2G71xN593w/exec";
}
function buildNomor(no,tgl){return settings.nomorFmt.replace('[NO]',String(no)).replace('[BULAN]',tgl instanceof Date?tgl.getMonth()+1:no).replace('[TAHUN]',tgl instanceof Date?tgl.getFullYear():today.getFullYear());}
function tglGeneret(){return`${today.getDate()} ${BULAN_ID[today.getMonth()]} ${today.getFullYear()}`;}
function tglFull(d){return`${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;}
function saveLocal(){localStorage.setItem('sirapat_arsip',JSON.stringify(arsipList));}

function sanitasiArsip(list){
  return list.map(r=>{
    if(r.tanggal&&String(r.tanggal).includes('T')) r.tanggal=String(r.tanggal).split('T')[0];
    if(r.jam&&String(r.jam).includes('T')){try{const d=new Date(r.jam);r.jam=String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0');}catch(e){r.jam='00:00';}}
    if(r.jam&&String(r.jam).length>5&&String(r.jam).includes(':')) r.jam=String(r.jam).substring(0,5);
    if(r.jam&&String(r.jam).includes(' ')) r.jam=String(r.jam).split(' ')[0];
    if(r.tglGeneret&&String(r.tglGeneret).includes('T')){try{const d=new Date(r.tglGeneret);r.tglGeneret=d.getUTCDate()+' '+BULAN_ID[d.getUTCMonth()]+' '+d.getUTCFullYear();}catch(e){}}
    if(r.tglGeneret&&/^\d{4}-\d{2}-\d{2}$/.test(String(r.tglGeneret))){try{const p=r.tglGeneret.split('-');r.tglGeneret=parseInt(p[2])+' '+BULAN_ID[parseInt(p[1])-1]+' '+p[0];}catch(e){}}
    return r;
  });
}

function updateHeroStats(){
  const total=arsipList.length;
  const ti=arsipList.filter(r=>new Date(r.tanggal).getFullYear()===today.getFullYear()).length;
  const ht=document.getElementById('hs-total');if(ht) animCount(ht,total);
  const hy=document.getElementById('hs-tahun');if(hy) animCount(hy,ti);
  const hn=document.getElementById('hs-nomor');if(hn) hn.textContent='#'+(settings.nomorLast+1);
}
function animCount(el,target){let cur=0;const step=Math.max(1,Math.floor(target/20));const t=setInterval(()=>{cur=Math.min(cur+step,target);el.textContent=cur;if(cur>=target)clearInterval(t);},40);}
function renderDashHome(){
  const total=arsipList.length;
  const ti=arsipList.filter(r=>new Date(r.tanggal).getFullYear()===today.getFullYear()).length;
  const avg=total?Math.round(arsipList.reduce((a,r)=>a+(r.peserta||[]).length,0)/total):0;
  const dt=document.getElementById('dash-total');if(dt) animCount(dt,total);
  const dy=document.getElementById('dash-tahun');if(dy) animCount(dy,ti);
  const da=document.getElementById('dash-avg');if(da) animCount(da,avg);
  const dd=document.getElementById('dash-dok');if(dd) animCount(dd,total*3);
  const dl=document.getElementById('dash-tahun-lbl');if(dl) dl.textContent='Rapat '+today.getFullYear();
  const cl=document.getElementById('chart-tahun-lbl');if(cl) cl.textContent=today.getFullYear();
  const months=Array(12).fill(0);
  arsipList.filter(r=>new Date(r.tanggal).getFullYear()===today.getFullYear()).forEach(r=>months[new Date(r.tanggal).getMonth()]++);
  const max=Math.max(...months,1);
  const bc=document.getElementById('bar-chart-home');
  if(bc) bc.innerHTML=months.map((n,i)=>`<div class="bar-group">${n>0?`<div class="bar-val">${n}</div>`:''}<div class="bar" style="height:${Math.round(n/max*80)}px"><div class="bar-inner" style="height:100%"></div></div><div class="bar-label">${SH_ID[i]}</div></div>`).join('');
}

let syncTimer;
function showSync(msg,state='syncing'){
  const el=document.getElementById('sync-indicator');
  document.getElementById('sync-dot').className='sync-dot '+state;
  document.getElementById('sync-text').textContent=msg;
  el.classList.add('show');
  clearTimeout(syncTimer);
  if(state!=='syncing') syncTimer=setTimeout(()=>el.classList.remove('show'),3500);
}
function setHeroSync(state,msg){
  const dot=document.getElementById('hero-sync-dot');
  const tx=document.getElementById('hero-sync-text');
  if(dot) dot.className='hero-sync-dot '+state;
  if(tx) tx.textContent=msg;
}

async function gasGet(action){const url=getGasUrl();if(!url) throw new Error('GAS URL belum diisi');const r=await fetch(`${url}?action=${action}`);const d=await r.json();if(d.error) throw new Error(d.error);return d;}
async function gasPost(payload){const url=getGasUrl();if(!url) throw new Error('GAS URL belum diisi');const r=await fetch(url,{method:'POST',body:JSON.stringify(payload)});const d=await r.json();if(d.error) throw new Error(d.error);return d;}

function setCloudBanner(state,msg){
  const b=document.getElementById('cloud-status-banner');
  const sp=document.getElementById('cloud-spin');
  const tx=document.getElementById('cloud-status-text');
  if(!b) return;
  b.style.display='flex';b.className='cloud-banner '+state;
  if(sp) sp.style.display=(state==='loading')?'block':'none';
  if(tx) tx.textContent=msg;
  if(state==='ok'||state==='err') setTimeout(()=>{b.style.display='none';},5000);
}

async function loadArsipFromCloud(){
  if(!getGasUrl()){setHeroSync('err','GAS URL belum diisi');setCloudBanner('warn','URL GAS belum diisi — data hanya dari browser lokal.');return;}
  setHeroSync('syncing','Menyinkron data cloud...');showSync('Memuat dari cloud...','syncing');
  try{
    const data=await gasGet('getArsip');
    const cloudArsip=sanitasiArsip(data.arsip||[]);
    const cloudIds=new Set(cloudArsip.map(r=>String(r.id)));
    const localOnly=arsipList.filter(r=>!cloudIds.has(String(r.id)));
    arsipList=[...cloudArsip,...localOnly];
    arsipList.sort((a,b)=>String(b.id).localeCompare(String(a.id)));
    saveLocal();
    arsipList.forEach(r=>{if(r.uploadedFiles&&r.uploadedFiles.length&&!(uploadFiles[r.id]||[]).length) uploadFiles[r.id]=r.uploadedFiles.map(f=>({...f,file:null,type:f.type||'',_showPreview:false}));});
    if(localOnly.length) for(const item of localOnly) gasPost({action:'simpanArsip',...item}).catch(()=>{});
    setHeroSync('ok',`✓ ${arsipList.length} arsip tersinkron`);
    showSync(`${arsipList.length} arsip tersinkron`,'ok');
    setCloudBanner('ok',`✓ ${arsipList.length} arsip dimuat dari cloud`);
    renderArsip();renderCalInline();renderDashHome();updateHeroStats();
  }catch(e){
    setHeroSync('err','Gagal sync — menggunakan data lokal');
    setCloudBanner('err','❌ Gagal memuat dari cloud: '+e.message);
    showSync('Gagal sync cloud','err');
  }
}
async function refreshArsipCloud(){await loadArsipFromCloud();}
async function syncArsipToCloud(item){
  if(!getGasUrl()) return;showSync('Menyimpan ke cloud...','syncing');
  try{await gasPost({action:'simpanArsip',...item,uploadedFiles:(uploadFiles[item.id]||[]).map(f=>({name:f.name,size:f.size,status:f.status,url:f.url||null}))});showSync('Tersimpan ke cloud','ok');}
  catch(e){showSync('Gagal sync cloud','err');}
}
async function hapusArsipCloud(id){if(!getGasUrl()) return;try{await gasPost({action:'hapusArsip',id});}catch(e){}}

async function fetchNomor(){
  const dot=document.getElementById('nomor-dot');const prev=document.getElementById('nomor-preview');
  if(!getGasUrl()){dot.className='nomor-dot err';prev.textContent='— isi URL Apps Script di Pengaturan';return;}
  dot.className='nomor-dot loading';prev.textContent='Membaca dari Sheets...';
  try{const data=await gasGet('getLastNomor');settings.nomorLast=data.lastNomor;localStorage.setItem('sirapat_settings',JSON.stringify(settings));dot.className='nomor-dot ok';updateNomorPreview();updateHeroStats();}
  catch(e){dot.className='nomor-dot err';prev.textContent='❌ Gagal — pakai nomor lokal: '+(settings.nomorLast+1);}
}
function updateNomorPreview(){
  const tgl=document.getElementById('inp-tanggal').value;
  
  // JIKA TANGGAL BELUM DIPILIH: Tetap tampilkan nomor berdasarkan tahun berjalan saat ini agar teks tidak stuck "Membaca..."
  if(!tgl) {
    document.getElementById('nomor-preview').textContent = buildNomor(settings.nomorLast+1, new Date()) + " (Silakan tentukan tanggal rapat)";
    return;
  }
  
  // JIKA TANGGAL SUDAH DIPILIH: Jalankan format normal
  const d=new Date(tgl+'T00:00:00');
  document.getElementById('nomor-preview').textContent=buildNomor(settings.nomorLast+1,d)+` (urut ke-${settings.nomorLast+1})`;
}

function setTplMode(mode,btn){
  tplMode=mode;settings.tplMode=mode;
  document.querySelectorAll('.tpl-mode-tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');
  document.querySelectorAll('.tpl-mode-panel').forEach(p=>p.classList.remove('active'));document.getElementById('tpl-panel-'+mode).classList.add('active');
}
function getTemplateUrl(key){if(tplMode==='auto') return AUTO_PATHS[key];return(document.getElementById('url-'+key)||{value:''}).value.trim();}

async function testUrl(url){const r=await fetch(url);if(!r.ok) throw new Error('HTTP '+r.status);const buf=await r.arrayBuffer();if(buf.byteLength<200) throw new Error('Bukan docx');return buf.byteLength;}
async function testAutoUrl(key){const b=document.getElementById('st-auto-'+key);b.className='tpl-badge loading';b.textContent='Mengecek...';try{const s=await testUrl(AUTO_PATHS[key]);b.className='tpl-badge ok';b.textContent=`✓ OK (${(s/1024).toFixed(1)}KB)`;}catch(e){b.className='tpl-badge err';b.textContent='✗ '+e.message;}}
async function testSemuaAuto(){await Promise.all(['und','abs','ris'].map(k=>testAutoUrl(k)));}
async function testManualUrl(key){const b=document.getElementById('badge-'+key);const url=(document.getElementById('url-'+key)||{value:''}).value.trim();if(!url){showToast('Masukkan URL','error');return;}b.className='tpl-badge loading';b.textContent='Mengecek...';try{const s=await testUrl(url);b.className='tpl-badge ok';b.textContent=`✓ OK (${(s/1024).toFixed(1)}KB)`;showToast('✓ OK','success');}catch(e){b.className='tpl-badge err';b.textContent='✗ '+e.message;showToast('Gagal: '+e.message,'error');}}
async function testGasUrl(){
  const url=(document.getElementById('set-gas-url')||{value:''}).value.trim();
  if(!url){showToast('Masukkan URL GAS','error');return;}
  const st=document.getElementById('gas-status');st.textContent='⏳ Menguji...';st.style.color='#8a6010';
  settings.gasUrl=url;localStorage.setItem('sirapat_settings',JSON.stringify(settings));
  try{const d=await gasGet('getLastNomor');st.textContent=`✅ Terhubung! Nomor terakhir: ${d.lastNomor}`;st.style.color='#2e7d32';showToast('GAS terhubung!','success');fetchNomor();}
  catch(e){st.textContent='❌ Gagal: '+e.message;st.style.color='#c62828';showToast('GAS gagal: '+e.message,'error');}
}

function renderPesertaGen(){
  document.getElementById('peserta-gen-grid').innerHTML=pesertaList.map((p,i)=>`
    <div class="peserta-item checked" id="pgen-${i}" onclick="togglePeserta(${i})">
      <div class="peserta-check"></div>
      <div class="peserta-info"><div class="peserta-nama">${p.nama}</div><div class="peserta-jabatan">${p.jabatan}</div></div>
    </div>`).join('');
}
function togglePeserta(i){document.getElementById('pgen-'+i).classList.toggle('checked');}
function getCheckedPeserta(){return pesertaList.filter((_,i)=>document.getElementById('pgen-'+i)?.classList.contains('checked'));}
function pilihAgenda(el,text){
  document.querySelectorAll('.agenda-chip').forEach(c=>c.classList.remove('active'));el.classList.add('active');
  const ta=document.getElementById('inp-agenda');ta.value=text;ta.disabled=!!text;if(!text){ta.disabled=false;ta.focus();}
}

function initCalInline(){calYearInline=today.getFullYear();calMonthInline=today.getMonth();}
function changeMonthInline(d){calMonthInline+=d;if(calMonthInline<0){calMonthInline=11;calYearInline--;}if(calMonthInline>11){calMonthInline=0;calYearInline++;}renderCalInline();}
function renderCalInline(){
  if(calYearInline===undefined) initCalInline();
  document.getElementById('cal-title-inline').textContent=`${BULAN_ID[calMonthInline]} ${calYearInline}`;
  const rapatMap={};
  arsipList.forEach(r=>{if(!rapatMap[r.tanggal]) rapatMap[r.tanggal]=[];rapatMap[r.tanggal].push({jam:r.jam,tempat:r.tempat,agenda:r.agenda});});
  const selectedTgl=document.getElementById('inp-tanggal').value;
  const selectedJam=document.getElementById('inp-jam').value;
  const selectedTempat=document.getElementById('inp-tempat').value.trim();
  const firstDay=new Date(calYearInline,calMonthInline,1).getDay();
  const days=new Date(calYearInline,calMonthInline+1,0).getDate();
  const todayStr=today.toISOString().split('T')[0];
  let html=HARI_ID.map((_,i)=>`<div class="cal-day-name">${['Min','Sen','Sel','Rab','Kam','Jum','Sab'][i]}</div>`).join('');
  for(let i=0;i<firstDay;i++) html+=`<div class="cal-day other-month"></div>`;
  for(let d=1;d<=days;d++){
    const ds=`${calYearInline}-${String(calMonthInline+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday=ds===todayStr,isSel=ds===selectedTgl;
    const events=rapatMap[ds]||[];const hasEvent=events.length>0;
    const isBooked=hasEvent&&ds===selectedTgl&&events.some(e=>e.jam===selectedJam&&e.tempat===selectedTempat);
    let cls='cal-day';
    if(isToday) cls+=' today';if(isSel&&!isToday) cls+=' selected';
    if(isBooked) cls+=' booked';else if(hasEvent) cls+=' has-event';
    const tip=hasEvent?events.map(e=>`${e.jam} – ${(e.agenda||'').substring(0,25)}`).join(' | '):'';
    html+=`<div class="${cls}" ${tip?`data-tip="${tip.replace(/"/g,'&quot;')}"`:''} onclick="calClickInline('${ds}')">${d}</div>`;
  }
  document.getElementById('cal-grid-inline').innerHTML=html;
}
function calClickInline(ds){
  const events=arsipList.filter(r=>r.tanggal===ds);
  if(events.length>=1){showArsipDetail(events[0].id);return;}
  document.getElementById('inp-tanggal').value=ds;
  renderCalInline();updateNomorPreview();checkBooking();
}
function checkBooking(){
  const tgl=document.getElementById('inp-tanggal').value;const jam=document.getElementById('inp-jam').value;const tempat=document.getElementById('inp-tempat').value.trim();
  const conflict=arsipList.find(r=>r.tanggal===tgl&&r.jam===jam&&r.tempat===tempat);
  document.getElementById('booking-warn').style.display=conflict?'block':'none';renderCalInline();
}

function setPS(id,state){const el=document.getElementById(id);if(el) el.className='prog-step'+(state?' '+state:'');}
async function fetchAndInject(url,data){
  const r=await fetch(url);if(!r.ok) throw new Error(`HTTP ${r.status} untuk "${url}"`);
  const buf=await r.arrayBuffer();
  const zip=new PizZip(buf);
  const doc=new window.docxtemplater(zip,{paragraphLoop:true,linebreaks:true,delimiters:{start:'[[',end:']]'},nullGetter:()=>''});
  doc.render(data);
  return doc.getZip().generate({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',compression:'DEFLATE'});
}

async function generateDokumen(){
  const tanggalVal=document.getElementById('inp-tanggal').value;
  const jamVal=document.getElementById('inp-jam').value;
  const tempat=document.getElementById('inp-tempat').value.trim();
  const agenda=document.getElementById('inp-agenda').value.trim();
  if(!tanggalVal){showToast('Pilih tanggal rapat!','error');return;}
  if(!agenda){showToast('Isi agenda rapat!','error');return;}
  const urlUnd=getTemplateUrl('und'),urlAbs=getTemplateUrl('abs'),urlRis=getTemplateUrl('ris');
  if(!urlUnd||!urlAbs||!urlRis){showToast('URL template belum lengkap!','error');return;}
  const pesertaHadir=getCheckedPeserta();
  if(!pesertaHadir.length){showToast('Pilih minimal 1 peserta!','error');return;}
  document.getElementById('btn-awan').classList.remove('visible');lastGenId=null;lastGenBlobs=null;lastGenPrefix=null;
  const tgl=new Date(tanggalVal+'T00:00:00');
  const hariStr=HARI_ID[tgl.getDay()];const tglStr=tglFull(tgl);const tglGen=tglGeneret();const jamFmt=jamVal+' WIB s/d Selesai';
  let nextNo=settings.nomorLast+1;
  if(getGasUrl()){try{const d=await gasGet('getLastNomor');nextNo=d.nextNomor;}catch(e){}}
  const nomorSurat=buildNomor(nextNo,tgl);
  const data={nomorSurat,hari:hariStr,tanggal:tglStr,tanggalHari:`${hariStr}, ${tglStr}`,jam:jamFmt,jamPolos:jamVal,tempat,agenda,ketua:settings.ketua,sekretaris:settings.sekretaris,kota:settings.kota,kotaTanggal:`${settings.kota}, ${tglStr}`,tahun:String(tgl.getFullYear()),bulan:BULAN_ID[tgl.getMonth()],instansi:settings.instansi,jumlahPeserta:String(pesertaHadir.length),tgl_generet:tglGen,peserta:pesertaHadir.map((p,i)=>({no:String(i+1),nama:p.nama,jabatan:p.jabatan,ttd:''}))};
  const btn=document.getElementById('btn-gen'),sp=document.getElementById('spinner'),tx=document.getElementById('btn-gen-text');
  btn.disabled=true;sp.style.display='block';document.getElementById('progress-bar').style.display='flex';
  ['ps-fetch','ps-inject','ps-zip','ps-done'].forEach(id=>setPS(id,''));

  function dlBlob(blob, filename){
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
  }

  try{
    setPS('ps-fetch','active');tx.textContent='Mengambil template...';
    let blobs;
    try{blobs=await Promise.all([fetchAndInject(urlUnd,data),fetchAndInject(urlAbs,data),fetchAndInject(urlRis,data)]);}
    catch(e){setPS('ps-fetch','err');throw e;}
    setPS('ps-fetch','done');setPS('ps-inject','done');

    setPS('ps-zip','active');tx.textContent='Mengunduh 3 dokumen...';
    const prefix=`Rapat_${tanggalVal.replace(/-/g,'')}`;
    dlBlob(blobs[0],`${prefix}_Undangan.docx`);
    await new Promise(r=>setTimeout(r,300));
    dlBlob(blobs[1],`${prefix}_AbsenHadir.docx`);
    await new Promise(r=>setTimeout(r,300));
    dlBlob(blobs[2],`${prefix}_Risalah.docx`);
    setPS('ps-zip','done');
    setPS('ps-done','done');

    // Simpan blob untuk draft arsip
    lastGenBlobs=blobs;
    lastGenPrefix=prefix;

    const arsipId = Date.now();
    
    // Nama file tetap menggunakan awalan 'Draft_', tetapi langsung siap di-upload (status: 'pending')
    uploadFiles[arsipId] = [
      {file:blobs[0], name:`Draft_${prefix}_Undangan.docx`, size:blobs[0].size, status:'pending', url:null, type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', _blobUrl:null, _showPreview:false, _blob:blobs[0], _isDraft:false},
      {file:blobs[1], name:`Draft_${prefix}_AbsenHadir.docx`, size:blobs[1].size, status:'pending', url:null, type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', _blobUrl:null, _showPreview:false, _blob:blobs[1], _isDraft:false},
      {file:blobs[2], name:`Draft_${prefix}_Risalah.docx`, size:blobs[2].size, status:'pending', url:null, type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', _blobUrl:null, _showPreview:false, _blob:blobs[2], _isDraft:false},
    ];

    const newItem = {id:arsipId, tanggal:tanggalVal, hari:hariStr, jam:jamVal, tempat, agenda, nomorSurat, tglGeneret:tglGen, peserta:pesertaHadir.map(p=>p.nama), uploadedFiles:[]};
    arsipList.unshift(newItem);
    saveLocal();
    
    settings.nomorLast = nextNo;
    localStorage.setItem('sirapat_settings', JSON.stringify(settings));
    
    if(getGasUrl()){
      gasPost({action:'simpanNomor', nomorUrut:nextNo, nomorSurat, tanggal:tglStr, agenda, tujuan:'', tglGeneret:tglGen, pesertaCount:pesertaHadir.length}).catch(()=>{});
      syncArsipToCloud(newItem);
      
      // TRIGGER AUTO UPLOAD: Langsung unggah file berawalan 'Draft_' ke Google Drive
      const folderName = `${String(tgl.getDate()).padStart(2,'0')} ${BULAN_ID[tgl.getMonth()]} ${tgl.getFullYear()}`;
      setTimeout(() => uploadSemuaFile(arsipId, folderName), 500); 
    }
    lastGenId=arsipId;document.getElementById('btn-awan').classList.add('visible');
    updateNomorPreview();renderCalInline();renderDashHome();updateHeroStats();
    showToast('✓ 3 dokumen berhasil diunduh (Undangan, Absen, Risalah)!','success');
  }catch(err){console.error(err);showToast('❌ '+err.message,'error');}
  finally{btn.disabled=false;sp.style.display='none';tx.textContent='Generate 3 Dokumen';}
}

function simpanKeAwan(){
  if(!lastGenId) return;
  showPage('arsip',document.querySelectorAll('.nav-btn')[1]);
  setTimeout(()=>{const el=document.getElementById('arsip-item-'+lastGenId);if(el){el.classList.add('highlight');el.scrollIntoView({behavior:'smooth',block:'center'});}showArsipDetail(lastGenId);},200);
}

function renderArsip(){
  const q=(document.getElementById('search-inp')?.value||'').toLowerCase();
  const bln=document.getElementById('filter-bulan')?.value||'';
  const thn=document.getElementById('filter-tahun')?.value||'';
  const list=arsipList.filter(r=>{const d=new Date(r.tanggal);if(bln&&BULAN_ID[d.getMonth()]!==bln) return false;if(thn&&String(d.getFullYear())!==thn) return false;if(q&&!JSON.stringify(r).toLowerCase().includes(q)) return false;return true;});
  const el=document.getElementById('arsip-list');
  if(!list.length){el.innerHTML=`<div class="empty-state"><div class="icon">📭</div><h3>Belum ada arsip</h3><p>${getGasUrl()?'Data cloud kosong.':'Arsip muncul setelah generate pertama.'}</p></div>`;return;}
  el.innerHTML=list.map(r=>{
    const d=new Date(r.tanggal);
    const files=uploadFiles[r.id]||[];
    const totalCloud=new Set([...files,...(r.uploadedFiles||[])].filter(f=>f&&f.status==='done').map(f=>f.name)).size;
    const hasDraft=(uploadFiles[r.id]||[]).some(f=>f._isDraft);
    return `<div class="arsip-item" id="arsip-item-${r.id}" onclick="showArsipDetail(${r.id})">
      <div class="arsip-date-box"><div class="day">${d.getDate()}</div><div class="month">${SH_ID[d.getMonth()]}</div></div>
      <div class="arsip-info">
        <div class="arsip-title">${r.agenda.substring(0,60)}${r.agenda.length>60?'...':''}</div>
        <div class="arsip-meta">
          <span>📅 ${r.hari}, ${d.getFullYear()}</span>
          <span>🕐 ${r.jam} WIB</span>
          <span>👥 ${(r.peserta||[]).length}</span>
          ${totalCloud?`<span style="color:var(--blue)">☁ ${totalCloud}</span>`:''}
          ${hasDraft?`<span style="color:var(--gold)">📝 draft</span>`:''}
          ${r.nomorSurat?`<span>${r.nomorSurat}</span>`:''}
        </div>
      </div>
      <div class="arsip-actions" onclick="event.stopPropagation()">
        <button class="btn-sm" onclick="hapusArsip(${r.id})">Hapus</button>
      </div>
    </div>`;
  }).join('');
}
function hapusArsip(id){
  if(!confirm('Hapus arsip ini dari lokal dan cloud?')) return;
  arsipList=arsipList.filter(r=>r.id!==id);saveLocal();delete uploadFiles[id];hapusArsipCloud(id);
  renderArsip();renderCalInline();renderDashHome();updateHeroStats();showToast('Arsip dihapus','info');
}

// ════ PRINT DETAIL ════
function printDetail() {
  if (!currentModalId) return;
  const r = arsipList.find(x => x.id === currentModalId);
  if (!r) return;
  const d = new Date(r.tanggal);
  
  // Membuat window baru khusus untuk print agar background web tidak ikut tercetak
  const printContents = `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 800px; margin: 0 auto; color: #1a0a0d;">
      <h2 style="text-align: center; border-bottom: 2px solid #7a1020; padding-bottom: 10px; color: #7a1020; font-family: 'Playfair Display', serif;">
        Detail Arsip Rapat
      </h2>
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px;">
        <tr><td style="padding: 8px 0; font-weight: 600; width: 150px; color: #5a3040;">Agenda</td><td style="padding: 8px 0;">${r.agenda}</td></tr>
        <tr><td style="padding: 8px 0; font-weight: 600; color: #5a3040;">Tanggal</td><td style="padding: 8px 0;">${r.hari}, ${tglFull(d)}</td></tr>
        <tr><td style="padding: 8px 0; font-weight: 600; color: #5a3040;">Pukul</td><td style="padding: 8px 0;">${r.jam} WIB</td></tr>
        <tr><td style="padding: 8px 0; font-weight: 600; color: #5a3040;">Tempat</td><td style="padding: 8px 0;">${r.tempat}</td></tr>
        <tr><td style="padding: 8px 0; font-weight: 600; color: #5a3040;">Nomor Surat</td><td style="padding: 8px 0;">${r.nomorSurat || '-'}</td></tr>
        <tr><td style="padding: 8px 0; font-weight: 600; color: #5a3040;">Tgl Generate</td><td style="padding: 8px 0;">${r.tglGeneret || '-'}</td></tr>
      </table>
      <h3 style="margin-top: 30px; border-bottom: 1px solid #e8ddd5; padding-bottom: 5px; font-size: 16px; color: #7a1020;">
        Daftar Peserta (${(r.peserta||[]).length} Orang)
      </h3>
      <ol style="padding-left: 20px; font-size: 14px; line-height: 1.6;">
        ${(r.peserta||[]).map(n => `<li>${n}</li>`).join('')}
      </ol>
    </div>
  `;
  
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  printWindow.document.write('<html><head><title>Print Detail Rapat - DocuMeet</title>');
  printWindow.document.write('<style>@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }</style>');
  printWindow.document.write('</head><body>');
  printWindow.document.write(printContents);
  printWindow.document.write('</body></html>');
  printWindow.document.close();
  printWindow.focus();
  
  // Memberikan jeda singkat agar DOM di window baru selesai di-render sebelum memanggil print
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
}

// ════ SHARE FILES ════
function shareFiles() {
  if (!currentModalId) return;
  const r = arsipList.find(x => x.id === currentModalId);
  if (!r) return;
  
  // Ambil file yang statusnya sudah ter-upload ('done') dan memiliki URL
  const files = (uploadFiles[currentModalId] || []).filter(f => f.status === 'done' && f.url);
  const cloudFiles = (r.uploadedFiles || []).filter(f => f.status === 'done' && f.url);
  
  // Gabung file dari cache lokal dan data tersimpan, lalu hapus duplikasi
  const allDone = [...files, ...cloudFiles].reduce((acc, f) => {
    if (!acc.find(x => x.name === f.name)) acc.push(f);
    return acc;
  }, []);
  
  if (!allDone.length) {
    showToast('Belum ada dokumen rapat yang tersimpan di Drive.', 'error');
    return;
  }
  
  const d = new Date(r.tanggal);
  const lines = allDone.map(f => `📄 ${f.name}\n${f.url}`).join('\n\n');
  
  // Format pesan yang rapi beserta konteks rapatnya
  const shareText = `🗂 Dokumen Rapat: ${r.agenda}\n📅 ${r.hari}, ${tglFull(d)}\n\n${lines}`;
  
  if (navigator.share) {
    // Membuka UI Share bawaan HP/Sistem Operasi
    navigator.share({
      title: 'Dokumen Rapat DocuMeet',
      text: shareText
    }).catch((err) => {
      console.log('Share dibatalkan atau gagal', err);
    });
  } else {
    // Fallback untuk desktop: copy otomatis ke clipboard
    navigator.clipboard.writeText(shareText).then(() => {
      showToast('✓ Link Drive beserta info rapat disalin ke clipboard!', 'success');
    }).catch(() => {
      prompt('Browser tidak mendukung copy otomatis, silakan salin teks berikut:', shareText);
    });
  }
}

function showArsipDetail(id){
  currentModalId=id;
  const r=arsipList.find(x=>x.id===id);if(!r) return;
  const d=new Date(r.tanggal);
  const folderName=`${String(d.getDate()).padStart(2,'0')} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
  if(r.uploadedFiles&&r.uploadedFiles.length&&!(uploadFiles[id]||[]).length) uploadFiles[id]=r.uploadedFiles.map(f=>({...f,file:null,type:f.type||'',_showPreview:false}));
  // Update tombol share: tampilkan hanya jika ada file done
  const hasDriveFiles=(uploadFiles[id]||[]).some(f=>f.status==='done'&&f.url)||(r.uploadedFiles||[]).some(f=>f.status==='done'&&f.url);
  const shareBtn=document.getElementById('modal-share-btn');
  if(shareBtn) shareBtn.style.display=hasDriveFiles?'':'none';
  document.getElementById('modal-title').textContent='Detail Rapat';
  document.getElementById('modal-body').innerHTML=`
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
      <div class="upload-zone" id="dropzone-${id}" ondrop="handleDrop(event,${id})" ondragover="event.preventDefault();this.classList.add('dragover')" ondragleave="this.classList.remove('dragover')" onclick="document.getElementById('fi-${id}').click()">
        <div class="upload-zone-icon">📂</div>
        <div class="upload-zone-text"><strong>Drag & drop file</strong><br>atau klik untuk pilih<br><span style="font-size:10px">.docx .pdf .zip .jpg .png .webp — maks 10MB</span></div>
        <input type="file" id="fi-${id}" multiple accept=".docx,.doc,.pdf,.zip,.jpg,.jpeg,.png,.webp,.gif" onchange="handleFileInput(event,${id})">
      </div>
      <div class="uploaded-files" id="file-list-${id}"></div>
      <div class="upload-actions" id="upload-actions-${id}" style="display:none">
        <button class="btn-upload-all" id="upload-btn-${id}" onclick="uploadSemuaFile(${id},'${folderName}')">☁ Upload ke Drive</button>
      </div>
    </div>`;
  renderFileList(id);document.getElementById('modal-overlay').classList.add('open');
}

// Render section draft files (file yang sudah digenerate, belum diupload)
function renderDraftSection(id){
  const drafts=(uploadFiles[id]||[]).filter(f=>f._isDraft&&f._blob);
  if(!drafts.length) return '';
  return `<div class="draft-section">
    <div class="draft-section-title">📝 Draft Dokumen Tergenerate</div>
    <div class="draft-files">
      ${drafts.map((f,i)=>`<div class="draft-file-item">
        <div class="draft-file-icon">📝</div>
        <div class="draft-file-name">${f.name}</div>
        <span style="font-size:10px;color:var(--text-muted)">${fmtSize(f.size)}</span>
        <button class="draft-file-dl" onclick="downloadDraft(${id},${(uploadFiles[id]||[]).indexOf(f)})">⬇ Unduh</button>
      </div>`).join('')}
    </div>
    <div style="font-size:10px;color:var(--text-muted);margin-top:6px">💡 File draft hanya tersedia selama sesi ini. Upload ke Drive agar tersimpan permanen.</div>
  </div>`;
}

function downloadDraft(arsipId, fileIdx){
  const f=(uploadFiles[arsipId]||[])[fileIdx];
  if(!f||!f._blob) return;
  const a=document.createElement('a');
  a.href=URL.createObjectURL(f._blob);
  a.download=f.name;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
}

function renderFileList(id){
  const files=(uploadFiles[id]||[]).filter(f=>!f._isDraft);
  const el=document.getElementById(`file-list-${id}`);if(!el) return;
  const actEl=document.getElementById(`upload-actions-${id}`);if(actEl) actEl.style.display=files.length?'flex':'none';
  if(!files.length){el.innerHTML='';return;}
  
  el.innerHTML=files.map((f,i)=>{
    const realIdx=(uploadFiles[id]||[]).indexOf(f);
    const isDone=f.status==='done'&&f.url;
    const imgFile=isImage(f.name);
    const pdfFile=isPdf(f.name);
    
    let actionBtns='';
    
    if(isDone){
      actionBtns+=`<a class="file-link" href="${f.url}" target="_blank">Buka ↗</a>`;
      // TOMBOL SHARE KHUSUS FILE INI (Muncul jika sudah tersimpan di Drive)
      actionBtns+=` <button class="file-preview-btn" onclick="shareSingleFile('${f.url}', '${f.name}')" title="Share link file">🔗</button>`;
    } else {
      actionBtns+=`<span class="file-status ${f.status}">${statusLbl(f.status)}</span>`;
    }
    
    // TOMBOL PREVIEW (MATA) & PRINT
    // Print hanya dimunculkan untuk gambar/PDF karena dokumen Word (.docx) tidak bisa diprint langsung tanpa di-render.
    if((imgFile && (f._blobUrl||isDone)) || (pdfFile && isDone)){
      actionBtns+=` <button class="file-preview-btn${f._showPreview?' active':''}" onclick="togglePreview(${id},${realIdx})" title="${f._showPreview?'Tutup preview':'Lihat preview'}">👁</button>`;
      actionBtns+=` <button class="file-preview-btn" onclick="printSingleFile(${id},${realIdx})" title="Print file ini">🖨️</button>`;
    }
    
    let previewArea='';
    if(f._showPreview){
      if(imgFile){
        let imgSrc='';
        if(f._blobUrl){imgSrc=f._blobUrl;}
        else if(isDone&&f.url){const driveId=extractDriveId(f.url);imgSrc=driveId?`https://drive.google.com/thumbnail?id=${driveId}&sz=w800`:f.url;}
        if(imgSrc){previewArea=`<div class="file-preview-area"><img src="${imgSrc}" alt="${f.name}" style="max-width:100%;max-height:360px;border-radius:8px;object-fit:contain;display:block;margin:0 auto" onerror="this.style.display='none';this.nextSibling.style.display='block'"><span style="display:none;color:var(--text-muted);font-size:12px">Gagal memuat gambar</span></div>`;}
      } else if(pdfFile&&isDone){
        const driveId=extractDriveId(f.url);
        const pdfSrc=driveId?`https://drive.google.com/file/d/${driveId}/preview`:f.url;
        previewArea=`<div class="file-preview-area"><iframe src="${pdfSrc}" style="width:100%;height:440px;border:none;border-radius:8px" allowfullscreen loading="lazy"></iframe></div>`;
      }
    }
    
    return `<div class="uploaded-file-item" id="fitem-${id}-${realIdx}" style="flex-direction:column;align-items:stretch">
      <div style="display:flex;align-items:center;gap:9px">
        <div class="file-icon">${getFileIcon(f.name)}</div>
        <div class="file-name">${f.name}</div>
        <div class="file-size">${fmtSize(f.size)}</div>
        <div style="display:flex;align-items:center;gap:5px;flex-shrink:0;margin-left:auto">
          ${actionBtns}
          ${f.status!=='uploading'?`<button onclick="hapusFile(${id},${realIdx})" title="Hapus" style="background:none;border:none;cursor:pointer;font-size:12px;padding:2px 5px;border-radius:3px;color:var(--text-muted)">✕</button>`:''}
        </div>
      </div>
      ${previewArea}
    </div>`;
  }).join('');
}
function togglePreview(arsipId, fileIdx){
  const files=uploadFiles[arsipId];if(!files||!files[fileIdx]) return;
  files[fileIdx]._showPreview=!files[fileIdx]._showPreview;
  renderFileList(arsipId);
}
function revokeBlobUrl(arsipId, fileIdx){
  const f=(uploadFiles[arsipId]||[])[fileIdx];
  if(f&&f._blobUrl) URL.revokeObjectURL(f._blobUrl);
}
function extractDriveId(url){const m=url.match(/\/d\/([a-zA-Z0-9_-]+)/);return m?m[1]:'';}
function getFileIcon(n){const e=(n||'').split('.').pop().toLowerCase();return{pdf:'📕',doc:'📝',docx:'📝',zip:'📦',jpg:'🖼️',jpeg:'🖼️',png:'🖼️',webp:'🖼️',gif:'🖼️',bmp:'🖼️'}[e]||'📄';}
function isImage(n){return/\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(n||'');}
function isPdf(n){return/\.pdf$/i.test(n||'');}
function fmtSize(b){if(!b) return '';if(b<1024) return b+'B';if(b<1048576) return (b/1024).toFixed(1)+'KB';return (b/1048576).toFixed(1)+'MB';}
function statusLbl(s){return{pending:'Menunggu',uploading:'Uploading...',done:'Tersimpan',draft:'Draft',err:'Gagal'}[s]||s;}
function hapusFile(id,i){
  // Tambahkan pop-up konfirmasi
  if(!confirm('Apakah Anda yakin ingin menghapus file ini?')) return;
  
  if(!uploadFiles[id]) return;
  revokeBlobUrl(id,i);
  uploadFiles[id].splice(i,1);
  renderFileList(id);
  
  const r=arsipList.find(x=>x.id===id);
  if(r){
    r.uploadedFiles=uploadFiles[id].filter(f=>f.status==='done').map(f=>({name:f.name,size:f.size,status:f.status,url:f.url||null}));
    saveLocal();
    if(getGasUrl()) gasPost({action:'updateArsipFiles',id,uploadedFiles:r.uploadedFiles}).catch(()=>{});
  }
  renderArsip();
  
  // Memunculkan toast sukses
  showToast('File berhasil dihapus', 'info');
}
function handleFileInput(ev,id){addFiles(id,Array.from(ev.target.files));ev.target.value='';}
function handleDrop(ev,id){ev.preventDefault();document.getElementById(`dropzone-${id}`)?.classList.remove('dragover');addFiles(id,Array.from(ev.dataTransfer.files));}
function addFiles(id,files){
  if(!uploadFiles[id]) uploadFiles[id]=[];
  files.forEach(f=>{
    const maxMB=f.type.startsWith('image/')?20:10;
    if(f.size>maxMB*1024*1024){showToast(`${f.name} terlalu besar (maks ${maxMB}MB)`,'error');return;}
    const blobUrl=f.type.startsWith('image/')?URL.createObjectURL(f):null;
    uploadFiles[id].push({file:f,name:f.name,size:f.size,status:'pending',url:null,type:f.type||'',_blobUrl:blobUrl,_showPreview:false});
  });
  renderFileList(id);
}
async function uploadSemuaFile(id,folderName){
  if(!getGasUrl()){showToast('URL Apps Script belum diisi!','error');return;}
  const allFiles=uploadFiles[id]||[];
  // Upload draft blob jika ada (ubah status dari draft ke pending dulu)
  allFiles.forEach(f=>{if(f._isDraft&&f._blob&&f.status==='draft'){f.file=f._blob;f.status='pending';}});
  const pending=allFiles.filter(f=>f.status==='pending'||f.status==='err');
  if(!pending.length){showToast('Tidak ada file yang perlu diupload.','info');return;}
  const btn=document.getElementById(`upload-btn-${id}`);if(btn){btn.disabled=true;btn.textContent='⏳ Mengupload...';}
  let ok=0,fail=0;
  for(let i=0;i<allFiles.length;i++){
    const f=allFiles[i];if(f.status!=='pending'&&f.status!=='err') continue;
    if(!f.file){allFiles[i].status='err';fail++;renderFileList(id);continue;}
    allFiles[i].status='uploading';renderFileList(id);
    try{
      const b64=await toBase64(f.file);
      const res=await gasPost({action:'uploadFile',fileName:f.name,fileBase64:b64,mimeType:f.file.type||'application/octet-stream',folderName});
      if(!res.success) throw new Error(res.error||'Unknown');
      allFiles[i].status='done';allFiles[i].url=res.fileUrl;allFiles[i].type=allFiles[i].type||f.file?.type||'';
      allFiles[i]._isDraft=false;// sudah diupload, bukan draft lagi
      ok++;
    }
    catch(e){allFiles[i].status='err';fail++;console.error(e);}
    renderFileList(id);
  }
  if(btn){btn.disabled=false;btn.textContent='☁ Upload ke Drive';}
  showToast(`Upload: ${ok} berhasil${fail?`, ${fail} gagal`:''}`,ok?'success':'error');
  const r=arsipList.find(x=>x.id===id);
  if(r){r.uploadedFiles=allFiles.map(f=>({name:f.name,size:f.size,status:f.status,url:f.url||null}));saveLocal();if(getGasUrl()) gasPost({action:'updateArsipFiles',id,uploadedFiles:r.uploadedFiles}).catch(()=>{});}
  // Update tombol share jika ada file done
  const hasDriveFiles=allFiles.some(f=>f.status==='done'&&f.url);
  const shareBtn=document.getElementById('modal-share-btn');
  if(shareBtn) shareBtn.style.display=hasDriveFiles?'':'none';
  renderArsip();
}
function toBase64(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.onerror=()=>rej(new Error('Baca gagal'));r.readAsDataURL(file);});}
function closeModal(e){
  if(!e||e.target.id==='modal-overlay'){
    document.getElementById('modal-overlay').classList.remove('open');
    currentModalId=null;
  }
}

function renderPesertaManage(){
  document.getElementById('peserta-manage-list').innerHTML=pesertaList.map((p,i)=>`
    <div class="peserta-row" draggable="true" 
         ondragstart="pDragStart(event, ${i})" 
         ondragover="pDragOver(event)" 
         ondragenter="pDragEnter(event, ${i})" 
         ondragleave="pDragLeave(event)" 
         ondrop="pDrop(event, ${i})" 
         ondragend="pDragEnd(event)">
      <div class="drag-handle" title="Tahan dan geser untuk memindahkan urutan">⠿</div>
      <div class="peserta-num">${i+1}</div>
      <input type="text" value="${p.nama}" placeholder="Nama + gelar" id="pm-nama-${i}">
      <input type="text" value="${p.jabatan}" placeholder="Jabatan" id="pm-jab-${i}" style="max-width:260px">
      <button class="btn-icon" onclick="hapusPesertaRow(${i})">✕</button>
    </div>`).join('');
}
  // ════ LOGIKA DRAG & DROP PESERTA ════
let pDragIdx = null;

// Fungsi ini mengamankan teks yang sedang diketik (tapi belum disave) 
// agar tidak hilang saat pengguna menggeser baris
function syncPesertaDOM(){
  pesertaList.forEach((_,i)=>{
    const n = document.getElementById('pm-nama-'+i);
    const j = document.getElementById('pm-jab-'+i);
    if(n) pesertaList[i].nama = n.value;
    if(j) pesertaList[i].jabatan = j.value;
  });
}

function pDragStart(e, i){
  syncPesertaDOM();
  pDragIdx = i;
  e.dataTransfer.effectAllowed = 'move';
  // Delay sedikit agar elemen aslinya tidak langsung hilang saat diseret
  setTimeout(() => e.target.classList.add('dragging'), 0);
}

function pDragOver(e){
  e.preventDefault(); // Wajib agar drop diizinkan oleh browser
  e.dataTransfer.dropEffect = 'move';
}

function pDragEnter(e, i){
  e.preventDefault();
  if(i !== pDragIdx) e.currentTarget.classList.add('drop-target');
}

function pDragLeave(e){
  e.currentTarget.classList.remove('drop-target');
}

function pDrop(e, i){
  e.stopPropagation();
  e.currentTarget.classList.remove('drop-target');
  
  // Jika dibatalkan atau dijatuhkan di posisi yang sama
  if(pDragIdx === null || pDragIdx === i) return;
  
  // Memindahkan data di dalam array pesertaList
  const movedItem = pesertaList.splice(pDragIdx, 1)[0];
  pesertaList.splice(i, 0, movedItem);
  
  // Render ulang UI Manage agar angka urutan (1,2,3) berubah
  renderPesertaManage();
  
  // Auto-Save agar urutan langsung berdampak ke halaman Generate
  localStorage.setItem('sirapat_peserta', JSON.stringify(pesertaList));
  renderPesertaGen(); 
  if(getGasUrl()) gasPost({action:'simpanPeserta', peserta:pesertaList}).catch(()=>{});
}

function pDragEnd(e){
  e.target.classList.remove('dragging');
  document.querySelectorAll('.peserta-row').forEach(el => el.classList.remove('drop-target'));
  pDragIdx = null;
}
function tambahPeserta(){pesertaList.push({nama:'',jabatan:''});renderPesertaManage();}
function hapusPesertaRow(i){
  // Tambahkan pop-up konfirmasi
  if(!confirm('Hapus peserta ini dari daftar?')) return;
  pesertaList.splice(i,1);
  renderPesertaManage();
  // Memunculkan toast sukses
  showToast('Peserta dihapus dari daftar', 'info');
}
function simpanPeserta(){
  pesertaList=pesertaList.map((_,i)=>({nama:document.getElementById('pm-nama-'+i)?.value||'',jabatan:document.getElementById('pm-jab-'+i)?.value||''})).filter(p=>p.nama.trim());
  localStorage.setItem('sirapat_peserta',JSON.stringify(pesertaList));renderPesertaGen();showToast('Daftar peserta disimpan!','success');
  if(getGasUrl()) gasPost({action:'simpanPeserta',peserta:pesertaList}).catch(()=>{});
}
function resetPeserta(){
  if(!confirm('Reset ke default?')) return;
  pesertaList=DEFAULT_PESERTA.map(p=>({...p}));localStorage.setItem('sirapat_peserta',JSON.stringify(pesertaList));
  renderPesertaManage();renderPesertaGen();showToast('Direset ke default.','info');
}

function loadPengaturan(){
  ['instansi','kota','ketua','sekretaris'].forEach(k=>{const el=document.getElementById('set-'+k);if(el)el.value=settings[k]||'';});
  const nf=document.getElementById('set-nomor-fmt');if(nf)nf.value=settings.nomorFmt||'';
  const nl=document.getElementById('set-nomor-last');if(nl)nl.value=settings.nomorLast||0;
  const gu=document.getElementById('set-gas-url');if(gu)gu.value=settings.gasUrl||'';
  const uu=document.getElementById('url-und');if(uu)uu.value=settings.urlUnd||'';
  const ua=document.getElementById('url-abs');if(ua)ua.value=settings.urlAbs||'';
  const ur=document.getElementById('url-ris');if(ur)ur.value=settings.urlRis||'';
  if(settings.tplMode==='manual'){document.querySelectorAll('.tpl-mode-tab')[1]?.click();}
}
function simpanPengaturan(){
  ['instansi','kota','ketua','sekretaris'].forEach(k=>{const el=document.getElementById('set-'+k);if(el)settings[k]=el.value;});
  const nf=document.getElementById('set-nomor-fmt');if(nf)settings.nomorFmt=nf.value;
  const nl=document.getElementById('set-nomor-last');if(nl)settings.nomorLast=parseInt(nl.value)||0;
  const gu=document.getElementById('set-gas-url');if(gu)settings.gasUrl=gu.value.trim();
  const uu=document.getElementById('url-und');if(uu)settings.urlUnd=uu.value;
  const ua=document.getElementById('url-abs');if(ua)settings.urlAbs=ua.value;
  const ur=document.getElementById('url-ris');if(ur)settings.urlRis=ur.value;
  settings.tplMode=tplMode;localStorage.setItem('sirapat_settings',JSON.stringify(settings));
  showToast('Pengaturan disimpan!','success');fetchNomor();
}
function toggleFaq(el){el.classList.toggle('open');el.nextElementSibling.classList.toggle('open');}

function showPage(id,btn){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn, .nav-drawer .nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  if(btn) btn.classList.add('active');
  if(id==='peserta') renderPesertaManage();
  if(id==='arsip') renderArsip();
  if(id==='pengaturan') loadPengaturan();
}

let toastT;
function showToast(msg,type='info'){
  const t=document.getElementById('toast');
  t.textContent=msg;t.className=`toast ${type} show`;
  clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),4500);
}

  // Fungsi untuk membagikan 1 file spesifik
function shareSingleFile(url, name) {
  const shareText = `File Rapat DocuMeet: ${name}\n${url}`;
  if (navigator.share) {
    navigator.share({ title: name, text: shareText }).catch(()=>{});
  } else {
    navigator.clipboard.writeText(shareText).then(() => {
      showToast('✓ Link file disalin ke clipboard!', 'success');
    }).catch(() => {
      prompt('Salin link berikut:', shareText);
    });
  }
}

// Fungsi untuk menge-print 1 file spesifik (Gambar atau PDF)
function printSingleFile(arsipId, fileIdx) {
  const files = uploadFiles[arsipId];
  if (!files || !files[fileIdx]) return;
  const f = files[fileIdx];
  
  const isImg = isImage(f.name);
  const isPd = isPdf(f.name);
  
  let printUrl = '';
  
  if (isImg) {
    if (f._blobUrl) { printUrl = f._blobUrl; }
    else if (f.url) { 
      const driveId = extractDriveId(f.url); 
      // Mengambil resolusi besar (w2000) agar tidak pecah saat di-print
      printUrl = driveId ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w2000` : f.url; 
    }
  } else if (isPd && f.url) {
    printUrl = f.url; 
  }
  
  if (!printUrl) {
    showToast('File belum siap di-print', 'error');
    return;
  }
  
  if (isImg) {
    // Membuka window baru untuk mengeprint gambar saja tanpa UI halaman web
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Print - ${f.name}</title>
          <style>
            @media print {
              @page { margin: 0; }
              body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; }
              img { max-width: 100%; max-height: 100vh; object-fit: contain; }
            }
          </style>
        </head>
        <body onload="setTimeout(function(){ window.print(); window.close(); }, 500);">
          <img src="${printUrl}" alt="${f.name}" style="max-width: 100%; max-height: 100vh; object-fit: contain;">
        </body>
      </html>
    `);
    printWindow.document.close();
  } else if (isPd) {
    // Karena aturan keamanan/CORS Google Drive, PDF tidak bisa di-print langsung dari latar belakang.
    // Membuka tab baru adalah cara paling andal, dan kamu bisa menggunakan tombol print bawaan browser.
    window.open(printUrl, '_blank');
  }
}

 // ════ SISTEM LOGIN DINAMIS & AUTO SYNC ════
window.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('documeet_auth') === 'true') {
    const screen = document.getElementById('login-screen');
    if (screen) screen.style.display = 'none';
    
    // Web dibuka dan sudah login: Langsung Auto Sync!
    mulaiAutoSync(); 
  }
});

async function loginAdmin() {
  const inp = document.getElementById('admin-pin').value;
  const err = document.getElementById('login-error');
  const btn = document.getElementById('btn-login');
  
  if (!inp) return;

  btn.textContent = 'Memeriksa PIN...';
  btn.disabled = true;

  try {
    const data = await gasGet('getPin');
    const realPin = String(data.pin);

    if (inp === realPin) {
      sessionStorage.setItem('documeet_auth', 'true');
      document.getElementById('login-screen').style.display = 'none';
      showToast('✓ Berhasil masuk sebagai Admin', 'success');
      
      // Baru pertama kali login: Langsung Auto Sync!
      mulaiAutoSync();
    } else {
      tampilError("❌ PIN salah! Silakan coba lagi.");
    }
  } catch (e) {
    console.error(e);
    tampilError("❌ Gagal terhubung ke Google Sheets.");
  }

  function tampilError(pesan) {
    err.textContent = pesan;
    err.style.display = 'block';
    setTimeout(() => { err.style.display = 'none'; }, 3500);
    btn.textContent = 'Masuk Kelola Arsip';
    btn.disabled = false;
  }
}

// Fungsi Pusat Pemicu Sinkronisasi
// Fungsi Pusat Pemicu Sinkronisasi
function mulaiAutoSync() {
  Promise.all([
    fetchNomor(),
    loadArsipFromCloud(),
    loadPesertaFromCloud() // Memuat data peserta terbaru dari Google Sheets
  ]).then(() => {
    // Refresh semua tampilan grafik dan dasbor setelah data masuk
    renderCalInline();
    renderDashHome();
    updateHeroStats();
    updateNomorPreview();
    
    // KUNCI PERBAIKAN: Paksa render ulang daftar peserta di halaman Generate
    renderPesertaGen(); 
    
    // Jika sedang berada di halaman manajemen peserta, update juga tampilannya
    if (document.getElementById('page-peserta').classList.contains('active')) {
      renderPesertaManage();
    }
  });
}

// Fungsi baru untuk menarik daftar peserta dari Spreadsheet
async function loadPesertaFromCloud() {
  if (!getGasUrl()) return;
  try {
    const data = await gasGet('getPeserta');
    if (data.peserta && data.peserta.length > 0) {
      pesertaList = data.peserta;
      // Simpan ke memori lokal agar saat offline tetap ada
      localStorage.setItem('sirapat_peserta', JSON.stringify(pesertaList));
    }
  } catch (e) {
    console.error('Gagal memuat peserta dari cloud:', e);
  }
}
  
// INIT
  // INIT
document.getElementById('inp-tanggal').value = today.toISOString().split('T')[0];
initCalInline();
renderCalInline();
renderPesertaGen(); // <-- Pastikan baris ini ada
renderDashHome();
updateHeroStats();

if (settings.tplMode === 'manual') {
  tplMode = 'manual';
  document.querySelectorAll('.tpl-mode-tab')[1]?.click();
}
Promise.all([
  getGasUrl()?fetchNomor():Promise.resolve(),
  loadArsipFromCloud()
]).then(()=>{renderCalInline();renderDashHome();updateHeroStats();updateNomorPreview();});

