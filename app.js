const SUPABASE_URL = 'https://dvkusfutsnygppvtbxmg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TJDfKd2G-C0bFCB_3hnKGg_U68DBDNz';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let profile = null;
let game = null;

const $ = id => document.getElementById(id);
const money = n => Number(n || 0).toLocaleString('es-VE');
function message(text, type='success') {
  $('authMessage').innerHTML = `<div class="${type}">${text}</div>`;
}
function showRegister(){ $('loginForm').classList.add('hidden'); $('registerForm').classList.remove('hidden'); }
function showLogin(){ $('registerForm').classList.add('hidden'); $('loginForm').classList.remove('hidden'); }

async function register() {
  const first_name=$('regFirst').value.trim(), last_name=$('regLast').value.trim();
  const national_id=$('regId').value.trim(), phone=$('regPhone').value.trim();
  const email=$('regEmail').value.trim(), password=$('regPassword').value;
  const referral_code=$('regReferral').value.trim().toUpperCase();
  if(!first_name || !last_name || !national_id || !phone || !email || password.length < 8) return message('Completa todos los datos y usa una contraseña de al menos 8 caracteres.','alert');
  const {data,error}=await supabase.auth.signUp({email,password,options:{data:{first_name,last_name,national_id,phone}}});
  if(error) return message(error.message,'alert');
  if(!data.user) return message('Cuenta creada. Revisa tu correo para confirmar el acceso.','success');
  if(referral_code) await applyReferral(data.user.id, referral_code);
  message('Cuenta creada correctamente. Ya puedes iniciar sesión.','success');
  showLogin();
}

async function login() {
  const email=$('loginEmail').value.trim(), password=$('loginPassword').value;
  const {error}=await supabase.auth.signInWithPassword({email,password});
  if(error) return message(error.message,'alert');
}
async function logout(){ await supabase.auth.signOut(); location.reload(); }

async function applyReferral(newUserId, code) {
  await supabase.rpc('apply_referral',{p_new_user:newUserId,p_code:code});
}

async function loadProfile() {
  const {data,error}=await supabase.from('profiles').select('*').eq('id',currentUser.id).maybeSingle();
  if(error || !data) return message('No fue posible cargar el perfil.','alert');
  profile=data;
  $('userName').textContent=`${profile.first_name || ''} ${profile.last_name || ''}`;
  $('balance').textContent=money(profile.points);
  $('periodPoints').textContent=money(profile.period_points);
  $('level').textContent=Math.max(1,Math.floor(profile.points/2000)+1);
  $('adminButton').classList.toggle('hidden',profile.role !== 'admin');
  if(profile.suspended){ alert('Tu cuenta se encuentra suspendida.'); await logout(); }
}

async function startSession() {
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){ $('authView').classList.remove('hidden'); $('appView').classList.add('hidden'); return; }
  currentUser=session.user; $('authView').classList.add('hidden'); $('appView').classList.remove('hidden');
  supabase.functions.invoke('record-login');
  await loadProfile();
}
supabase.auth.onAuthStateChange((_event,session)=>{
  if(session && !currentUser) startSession();
});
window.addEventListener('load', ()=>startSession());
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');

function showAdmin(){ $('userView').classList.add('hidden'); $('adminView').classList.remove('hidden'); adminTab('dashboard',$('adminView').querySelector('.tab')); }
function showUser(){ $('adminView').classList.add('hidden'); $('userView').classList.remove('hidden'); }

async function openRanking() {
  const {data}=await supabase.from('profiles').select('first_name,last_name,period_points').eq('suspended',false).order('period_points',{ascending:false}).limit(10);
  showModal('🏆 Ranking de 10 días',`<table><tr><th>#</th><th>Jugador</th><th>Puntos</th></tr>${(data||[]).map((p,i)=>`<tr><td>${i+1}</td><td>${esc(p.first_name)} ${esc(p.last_name)}</td><td>${money(p.period_points)}</td></tr>`).join('')}</table>`);
}
async function openPrizes() {
  const {data}=await supabase.from('prizes').select('*').eq('active',true).order('points',{ascending:true});
  if(!profile.avatar_url){ alert('Necesitas una foto de perfil para verificar tu cuenta y canjear premios.'); openProfile(); return; }
  const cards=(data||[]).map(p=>`<div class="prize"><strong>${esc(p.name)}</strong><p>${money(p.points)} puntos</p><button class="secondary" onclick="startRedemption('${p.id}',${p.points})">Canjear</button></div>`).join('');
  showModal('🎁 Premios disponibles',`<div class="prize-grid">${cards || '<p>No hay premios disponibles.</p>'}</div>`);
}
async function startRedemption(prizeId,requiredPoints) {
  if(profile.points < requiredPoints) return alert('No tienes puntos suficientes.');
  closeModal();
  showModal('Código de compra',`<p>Ingresa el código de 6 dígitos asignado por Tequeñería Delicias.</p><div class="field"><input id="redeemCode" maxlength="6" inputmode="numeric" pattern="[0-9]*"></div><button class="primary" onclick="redeem('${prizeId}','${requiredPoints}')">Validar y canjear</button>`);
}
async function redeem(prizeId) {
  const code=$('redeemCode').value.trim();
  if(!/^\d{6}$/.test(code)) return alert('El código debe tener 6 dígitos.');
  const {data,error}=await supabase.rpc('redeem_prize',{p_prize_id:prizeId,p_code:code});
  if(error || !data?.success){ closeModal(); return alert(error?.message || data?.message || 'No fue posible realizar el canje.'); }
  closeModal(); await loadProfile(); alert('¡Canje registrado! Te enviaremos los detalles para entregarte el premio.');
}

function openProfile() {
  showModal('Foto de perfil',`<p>La foto es obligatoria para verificar tu cuenta y canjear premios.</p>
  <div class="field"><label>Foto desde galería o cámara</label><input id="avatarInput" type="file" accept="image/*" capture="user"></div>
  <button class="primary" onclick="uploadAvatar()">Guardar foto</button>`);
}
async function uploadAvatar() {
  const file=$('avatarInput').files[0]; if(!file) return alert('Selecciona una foto.');
  if(file.size > 5*1024*1024) return alert('La foto debe pesar menos de 5 MB.');
  const path=`${profile.id}/${Date.now()}-${file.name}`;
  const {error}=await supabase.storage.from('avatars').upload(path,file,{upsert:true});
  if(error) return alert(error.message);
  const {data}=supabase.storage.from('avatars').getPublicUrl(path);
  const {error:upErr}=await supabase.from('profiles').update({avatar_url:data.publicUrl}).eq('id',profile.id);
  if(upErr) return alert(upErr.message);
  closeModal(); await loadProfile(); alert('Foto guardada.');
}

function showModal(title,html){ closeModal(); const div=document.createElement('div'); div.id='modalDynamic'; div.className='modal-backdrop'; div.innerHTML=`<div class="modal wide"><div style="display:flex;justify-content:space-between;gap:10px"><h2>${title}</h2><button class="secondary" onclick="closeModal()">Cerrar</button></div>${html}</div>`; document.body.appendChild(div); }
function closeModal(){ $('modalDynamic')?.remove(); }
function esc(s=''){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[c]); }

async function adminTab(tab,button) {
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active')); button?.classList.add('active');
  const box=$('adminContent');
  if(tab==='dashboard'){
    const [{count:users},{count:codes},{count:suspended},{count:recent},{count:ipAlerts}]=await Promise.all([
      supabase.from('profiles').select('*',{count:'exact',head:true}),
      supabase.from('purchase_codes').select('*',{count:'exact',head:true}).eq('used',false),
      supabase.from('profiles').select('*',{count:'exact',head:true}).eq('suspended',true),
      supabase.from('profiles').select('*',{count:'exact',head:true}).gte('created_at',new Date(Date.now()-7*864e5).toISOString()),
      supabase.from('account_ip_alerts').select('*',{count:'exact',head:true}).eq('resolved',false)
    ]);
    box.innerHTML=`<div class="admin-grid"><div class="stat">Usuarios<strong>${users||0}</strong></div><div class="stat">Códigos activos<strong>${codes||0}</strong></div><div class="stat">Cuentas suspendidas<strong>${suspended||0}</strong></div><div class="stat">Altas recientes<strong>${recent||0}</strong></div><div class="stat">Alertas por IP<strong>${ipAlerts||0}</strong></div></div><h3>Usuarios registrados recientemente</h3><div id="recentUsers">Cargando...</div>`;
    const {data}=await supabase.from('profiles').select('first_name,last_name,national_id,phone,created_at').order('created_at',{ascending:false}).limit(10);
    $('recentUsers').innerHTML=`<table><tr><th>Usuario</th><th>Cédula</th><th>Teléfono</th><th>Registro</th></tr>${(data||[]).map(u=>`<tr><td>${esc(u.first_name)} ${esc(u.last_name)}</td><td>${esc(u.national_id)}</td><td>${esc(u.phone)}</td><td>${new Date(u.created_at).toLocaleDateString()}</td></tr>`).join('')}</table>`;
  }
  if(tab==='codes'){
    box.innerHTML=`<button class="primary" style="width:auto;margin-bottom:12px" onclick="newCode()">Crear y asignar código</button><div id="codeTable">Cargando...</div>`;
    const {data}=await supabase.from('purchase_codes').select('*,profiles(first_name,last_name,national_id)').order('created_at',{ascending:false});
    $('codeTable').innerHTML=`<table><tr><th>Código</th><th>Usuario</th><th>Cédula</th><th>Estado</th><th></th></tr>${(data||[]).map(c=>`<tr><td><b>${c.code}</b></td><td>${esc(c.profiles?.first_name||'')} ${esc(c.profiles?.last_name||'')}</td><td>${esc(c.profiles?.national_id||'')}</td><td>${c.used?'Canjeado':'Activo'}</td><td><button class="link" onclick="deleteCode('${c.id}')">Eliminar</button></td></tr>`).join('')}</table>`;
  }
  if(tab==='users'){
    box.innerHTML=`<div class="field"><input id="userSearch" placeholder="Buscar por nombre, teléfono o cédula" oninput="searchUsers()"></div><div id="usersTable">Cargando...</div>`;
    searchUsers();
  }
  if(tab==='prizes'){
    box.innerHTML=`<div class="card"><h3>Nuevo premio</h3><div class="field"><label>Nombre</label><input id="prizeName"></div><div class="field"><label>Puntos</label><input id="prizePoints" type="number"></div><button class="secondary" onclick="createPrize()">Crear premio</button></div><div id="prizeTable" style="margin-top:12px"></div>`;
    loadPrizeTable();
  }
  if(tab==='referrals') loadReferrals();
}

async function newCode() {
  const {data}=await supabase.from('profiles').select('id,first_name,last_name,national_id,phone').order('first_name');
  showModal('Asignar código de compra',`<div class="field"><input id="assignSearch" placeholder="Buscar por cédula..." oninput="filterAssignUsers()"></div><div id="assignUsers">${(data||[]).map(u=>`<div style="padding:8px;border-bottom:1px solid #ddd">${esc(u.first_name)} ${esc(u.last_name)} · ${esc(u.national_id)} <button class="link" onclick="createCode('${u.id}')">Asignar</button></div>`).join('')}</div>`);
  window.assignData=data||[];
}
function filterAssignUsers(){ const q=$('assignSearch').value.toLowerCase(); $('assignUsers').innerHTML=window.assignData.filter(u=>`${u.first_name} ${u.last_name} ${u.national_id} ${u.phone}`.toLowerCase().includes(q)).map(u=>`<div style="padding:8px;border-bottom:1px solid #ddd">${esc(u.first_name)} ${esc(u.last_name)} · ${esc(u.national_id)} <button class="link" onclick="createCode('${u.id}')">Asignar</button></div>`).join('') || 'Sin resultados'; }
async function createCode(userId){
  let code; let exists=true;
  while(exists){ code=String(Math.floor(100000+Math.random()*900000)); const {data}=await supabase.from('purchase_codes').select('id').eq('code',code).maybeSingle(); exists=!!data; }
  const {error}=await supabase.from('purchase_codes').insert({user_id:userId,code,used:false});
  if(error) return alert(error.message); closeModal(); alert(`Código asignado: ${code}`); adminTab('codes',document.querySelector('.tab.active'));
}
async function deleteCode(id){ if(!confirm('¿Eliminar este código?')) return; await supabase.from('purchase_codes').delete().eq('id',id); adminTab('codes',document.querySelector('.tab.active')); }

async function searchUsers(){
  const q=($('userSearch')?.value||'').toLowerCase();
  const {data}=await supabase.from('profiles').select('*').order('created_at',{ascending:false});
  const rows=(data||[]).filter(u=>`${u.first_name||''} ${u.last_name||''} ${u.national_id||''} ${u.phone||''}`.toLowerCase().includes(q));
  $('usersTable').innerHTML=`<table><tr><th>Usuario</th><th>Cédula</th><th>Puntos</th><th>Estado</th><th>Acción</th></tr>${rows.map(u=>`<tr><td>${esc(u.first_name)} ${esc(u.last_name)}</td><td>${esc(u.national_id)}</td><td>${money(u.points)}</td><td>${u.suspended?'Suspendido':'Activo'}</td><td><button class="link" onclick="toggleSuspended('${u.id}',${!u.suspended})">${u.suspended?'Reactivar':'Suspender'}</button></td></tr>`).join('')}</table>`;
}
async function toggleSuspended(id,suspend){ await supabase.from('profiles').update({suspended:suspend}).eq('id',id); searchUsers(); }

async function createPrize(){ const name=$('prizeName').value.trim(), points=Number($('prizePoints').value); if(!name || points<=0) return alert('Completa los datos.'); await supabase.from('prizes').insert({name,points}); $('prizeName').value=''; $('prizePoints').value=''; loadPrizeTable(); }
async function loadPrizeTable(){ const {data}=await supabase.from('prizes').select('*').order('created_at',{ascending:false}); $('prizeTable').innerHTML=`<table><tr><th>Premio</th><th>Puntos</th><th>Activo</th></tr>${(data||[]).map(p=>`<tr><td>${esc(p.name)}</td><td>${money(p.points)}</td><td><button class="link" onclick="togglePrize('${p.id}',${!p.active})">${p.active?'Desactivar':'Activar'}</button></td></tr>`).join('')}</table>`; }
async function togglePrize(id,active){ await supabase.from('prizes').update({active}).eq('id',id); loadPrizeTable(); }

async function loadReferrals(){
  const {data}=await supabase.from('profiles').select('first_name,last_name,national_id,referral_code,points').order('created_at',{ascending:false});
  const active=(data||[]).filter(p=>p.referral_code);
  const {data: referred}=await supabase.from('profiles').select('referral_owner_id');
  const counts=(referred||[]).reduce((a,r)=>{if(r.referral_owner_id)a[r.referral_owner_id]=(a[r.referral_owner_id]||0)+1;return a;}, {});
  $('adminContent').innerHTML=`<div class="stats"><div class="stat">Códigos activos<strong>${active.length}</strong></div></div><table><tr><th>Usuario</th><th>Código</th><th>Referidos</th></tr>${active.map(p=>`<tr><td>${esc(p.first_name)} ${esc(p.last_name)}</td><td>${esc(p.referral_code)}</td><td>${counts[p.id]||0}</td></tr>`).join('')}</table><button class="secondary" style="margin-top:12px" onclick="resetRanking()">Reiniciar ranking de 10 días</button>`;
}
async function resetRanking(){ if(!confirm('¿Reiniciar todos los puntos del ranking actual? Los puntos disponibles no cambiarán.')) return; const {error}=await supabase.from('profiles').update({period_points:0}).neq('id','00000000-0000-0000-0000-000000000000'); if(error) alert(error.message); else alert('Ranking reiniciado.'); }

function openGame(){ $('gameModal').classList.remove('hidden'); startGameEngine(); }
function closeGame(){ if(game){saveGameScore(); cancelAnimationFrame(game.frame);game=null;} $('gameModal').classList.add('hidden'); }

function startGameEngine(){
  const canvas=$('gameCanvas'),ctx=canvas.getContext('2d');
  game={frame:null,t:0,score:0,last:0,ground:350,player:{x:130,y:290,w:58,h:60,vy:0},obstacles:[],speed:5,jumps:false,saved:false};
  function jump(){ if(game.player.y>=game.ground-game.player.h-1){game.player.vy=-15; game.jumps=true;} }
  canvas.onpointerdown=jump; window.onkeydown=e=>{if([' ','ArrowUp'].includes(e.key)){e.preventDefault();jump();}};
  function spawn(){ const size=30+Math.random()*25; game.obstacles.push({x:930,y:game.ground-size,w:size,h:size}); }
  function loop(ts){
    if(!game)return; const dt=Math.min(2,(ts-game.last)/16.67||1);game.last=ts;game.t+=dt;
    if(game.t-game.lastSpawn>90-Math.min(45,game.score/100)){game.lastSpawn=game.t;spawn();}
    game.player.vy+=0.8*dt;game.player.y+=game.player.vy*dt;if(game.player.y>game.ground-game.player.h){game.player.y=game.ground-game.player.h;game.player.vy=0;}
    game.obstacles.forEach(o=>o.x-=game.speed*dt);game.obstacles=game.obstacles.filter(o=>o.x>-80);
    game.speed=Math.min(11,5+game.score/700);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#87d4f7';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#f0bd65';ctx.fillRect(0,game.ground,canvas.width,70);
    ctx.fillStyle='#5a311d';ctx.fillRect(0,game.ground,canvas.width,7);
    drawTequeno(ctx,game.player.x,game.player.y);
    ctx.fillStyle='#e46d32';game.obstacles.forEach(o=>{ctx.beginPath();ctx.moveTo(o.x,o.y+o.h);ctx.lineTo(o.x+o.w/2,o.y);ctx.lineTo(o.x+o.w,o.y+o.h);ctx.fill();});
    const p=game.player;
    for(const o of game.obstacles){ if(p.x+48>o.x+5 && p.x+5<o.x+o.w-5 && p.y+50>o.y+4){gameOver();return;} }
    game.score+=dt*0.12*10; $('liveScore').textContent=`${Math.floor(game.score)} pts`;
    game.frame=requestAnimationFrame(loop);
  }
  game.lastSpawn=0; game.frame=requestAnimationFrame(loop);
}
function drawTequeno(ctx,x,y){
  ctx.save();ctx.translate(x,y);
  ctx.fillStyle='#3b3028';ctx.beginPath();ctx.arc(18,62,10,0,7);ctx.arc(53,62,10,0,7);ctx.fill();
  ctx.fillStyle='#efb51d';ctx.fillRect(2,10,58,48);ctx.strokeStyle='#75421f';ctx.lineWidth=4;ctx.strokeRect(2,10,58,48);
  ctx.fillStyle='#4a3021';ctx.beginPath();ctx.arc(22,31,3,0,7);ctx.arc(43,31,3,0,7);ctx.fill();
  ctx.strokeStyle='#75421f';ctx.lineWidth=3;ctx.beginPath();ctx.arc(32,38,12,0.1*Math.PI,0.9*Math.PI);ctx.stroke();
  ctx.restore();
}
async function gameOver(){
  if(!game || game.saved)return;cancelAnimationFrame(game.frame);
  await saveGameScore();
}
async function saveGameScore(){
  if(!game || game.saved) return;
  game.saved=true;
  const points=Math.floor(game.score);
  const {error}=await supabase.rpc('award_game_points',{p_points:points});
  if(error){alert('El juego terminó, pero no se pudieron guardar los puntos: '+error.message);}
  else {await loadProfile();alert(`Juego terminado: ${points} puntos registrados.`);}
}
