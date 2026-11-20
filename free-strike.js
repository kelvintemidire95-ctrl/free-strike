const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000, W = 3000, MAXP = 20, DT = 0.05, SPEED = 230, R = 16;
const WEAPONS = {
  pistol: { dmg: 14, rate: 450, spd: 900, range: 600, pel: 1, spread: .04 },
  smg: { dmg: 9, rate: 90, spd: 900, range: 500, pel: 1, spread: .1 },
  shotgun: { dmg: 11, rate: 800, spd: 800, range: 350, pel: 6, spread: .25 },
  rifle: { dmg: 18, rate: 140, spd: 1100, range: 800, pel: 1, spread: .05 },
  sniper: { dmg: 70, rate: 1200, spd: 1800, range: 1400, pel: 1, spread: .005 }
};
const WL = Object.keys(WEAPONS);
const PH = [[25, 20, 1100], [20, 20, 700], [15, 20, 400], [15, 20, 180], [10, 15, 40]];
const BN = ['Ghost', 'Viper', 'Nova', 'Rex', 'Blaze', 'Kilo', 'Zed', 'Echo', 'Fang', 'Hawk', 'Jinx', 'Onyx', 'Rogue', 'Sky', 'Titan', 'Volt', 'Wolf', 'Yuki', 'Zara', 'Axel'];
const rnd = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rooms = new Map();
let uid = 1;

const PAGE = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover\">\n<title>Free Strike</title>\n<style>\n:root{--ink:#16232b;--panel:#1f323d;--sand:#efe3c0;--amber:#ffb21a;--red:#e4572e;--teal:#3fb6a8;color-scheme:dark}\n*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;touch-action:none;user-select:none}\nhtml,body{margin:0;height:100%;background:var(--ink);color:var(--sand);font-family:system-ui,-apple-system,\"Segoe UI\",sans-serif;overflow:hidden}\ncanvas{position:fixed;inset:0;width:100%;height:100%}\n.ov{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:20px;background:rgba(22,35,43,.94);text-align:center}\n.hide{display:none!important}\nh1{margin:0;font:900 54px/1 Impact,\"Arial Black\",sans-serif;letter-spacing:1px;color:var(--amber);transform:skew(-6deg)}\np{margin:0;opacity:.8}\ninput,button{font:inherit;border-radius:8px;border:2px solid #36505f;background:var(--panel);color:var(--sand);padding:12px 14px;width:min(320px,86vw)}\ninput{text-align:center;touch-action:auto;user-select:text}\nbutton{font-weight:700;background:var(--amber);color:#2a1a00;border-color:var(--amber)}\nbutton.alt{background:var(--panel);color:var(--sand);border-color:#36505f}\n.row{display:flex;gap:8px;width:min(320px,86vw)}.row button{width:50%}\n.sel{background:var(--teal)!important;color:#06231f!important;border-color:var(--teal)!important}\n#hud{position:fixed;inset:0;pointer-events:none}\n#top{position:absolute;top:calc(env(safe-area-inset-top,0px) + 8px);left:10px;right:10px;display:flex;justify-content:space-between;font-weight:700}\n#top span{background:rgba(22,35,43,.78);padding:6px 10px;border-radius:8px}\n#feed{position:absolute;top:calc(env(safe-area-inset-top,0px) + 52px);right:10px;text-align:right;font-size:13px}\n#feed div{background:rgba(22,35,43,.78);padding:3px 8px;margin-bottom:3px;border-radius:6px}\n#bar{position:absolute;left:10px;bottom:calc(env(safe-area-inset-bottom,0px) + 10px);width:170px}\n#hp{height:12px;background:#0b1419;border-radius:6px;overflow:hidden}#hpf{height:100%;width:100%;background:var(--teal)}\n#wn{margin-top:4px;font-weight:700;text-shadow:0 1px 2px #000}\n#warn{position:absolute;top:30%;width:100%;text-align:center;font-weight:800;color:var(--red);text-shadow:0 1px 3px #000}\n</style>\n</head>\n<body>\n<canvas id=\"c\"></canvas>\n\n<div id=\"hud\" class=\"hide\">\n  <div id=\"top\"><span id=\"al\"></span><span id=\"ki\"></span></div>\n  <div id=\"feed\"></div><div id=\"warn\"></div>\n  <div id=\"bar\"><div id=\"hp\"><div id=\"hpf\"></div></div><div id=\"wn\"></div></div>\n</div>\n\n<div id=\"menu\" class=\"ov\">\n  <h1>FREE STRIKE</h1>\n  <p>Last team standing wins.</p>\n  <input id=\"nm\" maxlength=\"14\" placeholder=\"Your name\">\n  <div class=\"row\"><button id=\"m-solo\" class=\"sel\">Solo</button><button id=\"m-squad\" class=\"alt\">Squad of 4</button></div>\n  <button id=\"play\">Find match</button>\n  <input id=\"cd\" maxlength=\"5\" placeholder=\"Friends room code (optional)\">\n  <button id=\"priv\" class=\"alt\">Join or create room</button>\n  <p id=\"er\" style=\"color:var(--red)\"></p>\n</div>\n\n<div id=\"lobby\" class=\"ov hide\">\n  <h1 style=\"font-size:36px\">Waiting for players</h1>\n  <p id=\"lc\"></p><p id=\"ln\"></p><p>Bots fill empty spots when the match starts.</p>\n  <button id=\"go\" class=\"hide\">Start now</button>\n</div>\n\n<div id=\"endv\" class=\"ov hide\">\n  <h1 id=\"et\" style=\"font-size:40px\"></h1><p id=\"es\"></p>\n  <button id=\"again\">Play again</button>\n</div>\n\n<script>\nconst $=id=>document.getElementById(id), cv=$('c'), g=cv.getContext('2d');\nlet ws,mode='solo',me=0,W=3000,obs=[],roster={},st=null,disp={},feed=[],dead=false,joined=false;\nconst WN=['Pistol','SMG','Shotgun','Rifle','Sniper'],LC={med:'#3fb6a8',smg:'#8a7cff',shotgun:'#e4572e',rifle:'#ffb21a',sniper:'#f4f1ea'};\nconst inp={mx:0,my:0,ang:0,fire:false},keys={};\n$('nm').value=localStorage.getItem('fsName')||'';\nfunction pick(m){mode=m;$('m-solo').className=m==='solo'?'sel':'alt';$('m-squad').className=m==='squad'?'sel':'alt'}\n$('m-solo').onclick=()=>pick('solo');$('m-squad').onclick=()=>pick('squad');\nfunction join(code){\n  const name=$('nm').value.trim()||'Player';try{localStorage.setItem('fsName',name)}catch{}\n  $('er').textContent='';\n  ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host);\n  ws.onopen=()=>ws.send(JSON.stringify({t:'join',name,mode,code}));\n  ws.onmessage=e=>on(JSON.parse(e.data));\n  ws.onclose=()=>{if(joined&&$('endv').classList.contains('hide')){joined=false;show('menu');$('er').textContent='Connection lost.'}};\n}\n$('play').onclick=()=>join('');\n$('priv').onclick=()=>{const c=$('cd').value.trim();if(!c){$('er').textContent='Type a room code first.';return}join(c)};\n$('go').onclick=()=>ws.send(JSON.stringify({t:'start'}));\n$('again').onclick=()=>{if(ws)ws.close();joined=false;show('menu')};\nfunction show(id){['menu','lobby','endv'].forEach(x=>$(x).classList.toggle('hide',x!==id));$('hud').classList.toggle('hide',id!==null)}\nfunction on(m){\n  if(m.t==='lobby'){joined=true;show('lobby');$('lc').textContent='Room code: '+m.code;$('ln').textContent=m.n+' player'+(m.n>1?'s':'')+' in room - starts in '+m.left+'s';$('go').classList.toggle('hide',!(m.priv&&m.host))}\n  else if(m.t==='err'){$('er').textContent=m.msg;ws.close();joined=false}\n  else if(m.t==='start'){me=m.you;obs=m.obs;W=m.W;roster={};m.ps.forEach(p=>roster[p.id]=p);disp={};dead=false;feed=[];show(null)}\n  else if(m.t==='s'){st=m;m.f.forEach(t=>{feed.push({t,e:Date.now()+5000})});m.ps.forEach(p=>{const d=disp[p[0]];if(!d)disp[p[0]]={x:p[1],y:p[2],a:p[3]};})}\n  else if(m.t==='dead'){dead=true}\n  else if(m.t==='end'){setTimeout(()=>{show('endv');$('et').textContent=m.win?'Victory!':'Eliminated';$('es').textContent='Rank #'+m.rank+' - '+m.kills+' kills'},m.win?600:1500)}\n}\nsetInterval(()=>{if(ws&&ws.readyState===1&&st)ws.send(JSON.stringify({t:'in',...inp}))},40);\n\naddEventListener('keydown',e=>{keys[e.key.toLowerCase()]=1;kmove()});addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=0;kmove()});\nfunction kmove(){if(touchMove)return;inp.mx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0);inp.my=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0)}\ncv.addEventListener('mousemove',e=>{inp.ang=Math.atan2(e.clientY-cv.height/2/dpr,e.clientX-cv.width/2/dpr)});\ncv.addEventListener('mousedown',e=>{inp.ang=Math.atan2(e.clientY-innerHeight/2,e.clientX-innerWidth/2);inp.fire=true});\naddEventListener('mouseup',()=>inp.fire=false);\nlet touchMove=null,touchAim=null;\ncv.addEventListener('touchstart',e=>{for(const t of e.changedTouches){\n  if(t.clientX<innerWidth/2&&!touchMove)touchMove={id:t.identifier,x:t.clientX,y:t.clientY};\n  else if(t.clientX>=innerWidth/2&&!touchAim){touchAim={id:t.identifier,x:t.clientX,y:t.clientY};inp.fire=true}}});\ncv.addEventListener('touchmove',e=>{for(const t of e.changedTouches){\n  if(touchMove&&t.identifier===touchMove.id){const dx=t.clientX-touchMove.x,dy=t.clientY-touchMove.y,d=Math.hypot(dx,dy);if(d>8){inp.mx=dx/Math.max(d,50);inp.my=dy/Math.max(d,50)}else{inp.mx=inp.my=0}}\n  if(touchAim&&t.identifier===touchAim.id){const dx=t.clientX-touchAim.x,dy=t.clientY-touchAim.y;if(Math.hypot(dx,dy)>12)inp.ang=Math.atan2(dy,dx)}}});\nconst tend=e=>{for(const t of e.changedTouches){\n  if(touchMove&&t.identifier===touchMove.id){touchMove=null;inp.mx=inp.my=0}\n  if(touchAim&&t.identifier===touchAim.id){touchAim=null;inp.fire=false}}};\ncv.addEventListener('touchend',tend);cv.addEventListener('touchcancel',tend);\n\nlet dpr=1;function fit(){dpr=Math.min(devicePixelRatio||1,2);cv.width=innerWidth*dpr;cv.height=innerHeight*dpr}\naddEventListener('resize',fit);fit();\n\nfunction col(p){const t=roster[p[0]];if(p[0]===me)return'#3fb6a8';const mt=roster[me];return mt&&t&&t.t===mt.t?'#6aa8ff':'#e4572e'}\nfunction draw(){\n  requestAnimationFrame(draw);\n  g.setTransform(dpr,0,0,dpr,0,0);g.fillStyle='#16232b';g.fillRect(0,0,innerWidth,innerHeight);\n  if(!st||$('hud').classList.contains('hide'))return;\n  for(const p of st.ps){const d=disp[p[0]]||(disp[p[0]]={x:p[1],y:p[2],a:p[3]});d.x+=(p[1]-d.x)*.4;d.y+=(p[2]-d.y)*.4;d.a=p[3]}\n  let focus=st.ps.find(p=>p[0]===me);\n  if(!focus||!focus[6]){const mt=roster[me];focus=st.ps.find(p=>p[6]&&roster[p[0]]&&mt&&roster[p[0]].t===mt.t)||st.ps.find(p=>p[6])||focus}\n  if(!focus)return;\n  const f=disp[focus[0]],s=Math.min(1,Math.max(.6,Math.min(innerWidth,innerHeight)/700)),cx=innerWidth/2,cy=innerHeight/2;\n  g.save();g.translate(cx,cy);g.scale(s,s);g.translate(-f.x,-f.y);\n  g.fillStyle='#cfc59c';g.fillRect(0,0,W,W);\n  g.strokeStyle='rgba(0,0,0,.06)';g.lineWidth=1;g.beginPath();\n  for(let x=Math.floor((f.x-700)/100)*100;x<f.x+700;x+=100){g.moveTo(x,f.y-600);g.lineTo(x,f.y+600)}\n  for(let y=Math.floor((f.y-600)/100)*100;y<f.y+600;y+=100){g.moveTo(f.x-700,y);g.lineTo(f.x+700,y)}\n  g.stroke();\n  const z=st.z;\n  g.fillStyle='rgba(228,87,46,.28)';g.beginPath();g.rect(-200,-200,W+400,W+400);g.arc(z[0],z[1],z[2],0,7);g.fill('evenodd');\n  g.strokeStyle='#e4572e';g.lineWidth=4;g.beginPath();g.arc(z[0],z[1],z[2],0,7);g.stroke();\n  g.strokeStyle='#fff';g.lineWidth=3;g.setLineDash([14,10]);g.beginPath();g.arc(z[3],z[4],z[5],0,7);g.stroke();g.setLineDash([]);\n  for(const o of obs){g.fillStyle='#5c4a3a';g.fillRect(o.x,o.y,o.w,o.h);g.fillStyle='#7a6450';g.fillRect(o.x+6,o.y+6,o.w-12,o.h-12)}\n  for(const l of st.l){g.fillStyle=LC[l[3]];g.beginPath();g.arc(l[1],l[2],10,0,7);g.fill();g.strokeStyle='#16232b';g.lineWidth=2;g.stroke();\n    g.fillStyle='#16232b';g.font='bold 11px sans-serif';g.textAlign='center';g.fillText(l[3]==='med'?'+':WN[WL(l[3])][0],l[1],l[2]+4)}\n  g.fillStyle='#16232b';for(const b of st.b){g.beginPath();g.arc(b[0],b[1],3.5,0,7);g.fill()}\n  for(const p of st.ps){if(!p[6])continue;const d=disp[p[0]],c=col(p);\n    g.save();g.translate(d.x,d.y);g.rotate(d.a);g.fillStyle='#222';g.fillRect(8,-3,22,6);g.restore();\n    g.fillStyle=c;g.beginPath();g.arc(d.x,d.y,16,0,7);g.fill();g.strokeStyle='#16232b';g.lineWidth=3;g.stroke();\n    if(p[0]!==me){g.fillStyle='#0b1419';g.fillRect(d.x-18,d.y-28,36,5);g.fillStyle=c;g.fillRect(d.x-18,d.y-28,36*p[4]/100,5);\n      g.fillStyle='#16232b';g.font='bold 11px sans-serif';g.textAlign='center';g.fillText(roster[p[0]]?roster[p[0]].n:'',d.x,d.y-33)}}\n  g.restore();\n  const mp=st.ps.find(p=>p[0]===me);\n  if(mp){$('hpf').style.width=Math.max(0,mp[4])+'%';$('wn').textContent=WN[mp[5]]}\n  $('al').textContent='Alive '+st.a;$('ki').textContent='Kills '+st.k;\n  const now=Date.now();feed=feed.filter(x=>x.e>now).slice(-5);$('feed').innerHTML=feed.map(x=>'<div>'+x.t.replace(/</g,'&lt;')+'</div>').join('');\n  const out=mp&&Math.hypot(mp[1]-z[0],mp[2]-z[1])>z[2];\n  $('warn').textContent=dead?'You are out - watching your team':out?'Outside the zone - get inside':st.z[6]?'Zone is closing':'';\n}\nfunction WL(k){return['pistol','smg','shotgun','rifle','sniper'].indexOf(k)}\ndraw();\n</script>\n</body>\n</html>\n";
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(PAGE);
});
const wss = new WebSocketServer({ server });
const send = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };

function mkRoom(code, mode, priv) {
  const r = { code, mode, priv, state: 'lobby', ps: [], bl: [], loot: [], obs: [], feed: [], zone: null, lobbyEnd: Date.now() + (priv ? 90000 : 15000), over: 0, lid: 1, tick: 0 };
  rooms.set(code, r); return r;
}
function mkP(name, ws) {
  return { id: uid++, name, ws, isBot: !ws, x: 0, y: 0, ang: 0, hp: 100, w: 'pistol', next: 0, alive: true, team: 0, kills: 0, in: { mx: 0, my: 0, ang: 0, fire: false }, sd: 1, sdT: 0, wp: null, last: { x: 0, y: 0, t: 0 } };
}
function hitsObs(r, x, y, pad) {
  return r.obs.some(o => x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad);
}
function freeSpot(r) {
  for (let i = 0; i < 60; i++) { const x = rnd(150, W - 150), y = rnd(150, W - 150); if (!hitsObs(r, x, y, 40)) return { x, y }; }
  return { x: W / 2, y: W / 2 };
}
function pickNext(z) {
  const a = rnd(0, Math.PI * 2), d = rnd(0, Math.max(0, z.r - PH[z.ph][2]) * 0.8);
  z.nr = PH[z.ph][2]; z.nx = z.cx + Math.cos(a) * d; z.ny = z.cy + Math.sin(a) * d;
}

function startMatch(r) {
  r.state = 'play';
  for (let i = 0; i < 45; i++) {
    const w = rnd(80, 220), h = rnd(80, 220);
    r.obs.push({ x: Math.round(rnd(100, W - 300)), y: Math.round(rnd(100, W - 300)), w: Math.round(w), h: Math.round(h) });
  }
  while (r.ps.length < MAXP) r.ps.push(mkP(BN[r.ps.length % BN.length] + '_bot', null));
  r.ps.forEach((p, i) => {
    p.team = r.mode === 'squad' ? Math.floor(i / 4) : p.id;
    if (r.mode === 'squad' && i % 4 !== 0) {
      const lead = r.ps[i - (i % 4)];
      p.x = lead.x + rnd(-60, 60); p.y = lead.y + rnd(-60, 60);
    } else { const s = freeSpot(r); p.x = s.x; p.y = s.y; }
  });
  for (let i = 0; i < 130; i++) {
    const s = freeSpot(r), k = Math.random();
    r.loot.push({ id: r.lid++, x: s.x, y: s.y, k: k < .4 ? 'med' : k < .6 ? 'smg' : k < .75 ? 'shotgun' : k < .9 ? 'rifle' : 'sniper' });
  }
  r.zone = { cx: W / 2, cy: W / 2, r: 1700, ph: 0, st: 'wait', t: Date.now(), fr: 1700, fc: [W / 2, W / 2], nx: 0, ny: 0, nr: 0 };
  pickNext(r.zone);
  const roster = r.ps.map(p => ({ id: p.id, n: p.name, t: p.team }));
  r.ps.forEach(p => send(p.ws, { t: 'start', you: p.id, obs: r.obs, ps: roster, W }));
}

function ai(r, p, now) {
  const z = r.zone; let tgt = null, bd = 1e9;
  for (const q of r.ps) { if (!q.alive || q.team === p.team) continue; const d = dist(p, q); if (d < bd) { bd = d; tgt = q; } }
  let mx = 0, my = 0, ang = p.in.ang, fire = false;
  const toward = (x, y) => { const a = Math.atan2(y - p.y, x - p.x); mx = Math.cos(a); my = Math.sin(a); return a; };
  if (now - p.last.t > 1000) {
    if (Math.hypot(p.x - p.last.x, p.y - p.last.y) < 25) p.wp = null;
    p.last = { x: p.x, y: p.y, t: now };
  }
  if (now > p.sdT) { p.sd = Math.random() < .5 ? 1 : -1; p.sdT = now + rnd(800, 2000); }
  if (Math.hypot(p.x - z.cx, p.y - z.cy) > z.r - 80) { ang = toward(z.cx, z.cy); }
  else if (tgt && bd < 700) {
    ang = Math.atan2(tgt.y - p.y, tgt.x - p.x);
    const w = WEAPONS[p.w], px = -Math.sin(ang) * p.sd, py = Math.cos(ang) * p.sd;
    const f = bd > 380 ? 1 : bd < 200 ? -1 : 0;
    mx = Math.cos(ang) * f * .7 + px * .8; my = Math.sin(ang) * f * .7 + py * .8;
    if (bd < w.range) { fire = Math.random() < .7; ang += rnd(-.18, .18); }
  } else {
    let best = null, bl = 800;
    for (const l of r.loot) { if (l.k === 'med' && p.hp > 70) continue; if (l.k !== 'med' && p.w !== 'pistol' && Math.random() < .995) continue; const d = dist(p, l); if (d < bl) { bl = d; best = l; } }
    if (best) ang = toward(best.x, best.y);
    else {
      if (!p.wp || dist(p, p.wp) < 60) p.wp = { x: z.cx + rnd(-z.r, z.r) * .7, y: z.cy + rnd(-z.r, z.r) * .7 };
      ang = toward(p.wp.x, p.wp.y);
    }
  }
  p.in = { mx, my, ang, fire };
}

function kill(r, v, by) {
  v.alive = false; v.hp = 0;
  const alive = r.ps.filter(p => p.alive).length;
  v.rank = alive + 1;
  if (by) { by.kills++; r.feed.push(by.name + ' eliminated ' + v.name); } else r.feed.push(v.name + ' was lost in the zone');
  if (v.w !== 'pistol') r.loot.push({ id: r.lid++, x: v.x, y: v.y, k: v.w });
  send(v.ws, { t: 'dead', rank: v.rank, kills: v.kills });
}

function step(r, now) {
  const z = r.zone, el = (now - z.t) / 1000;
  if (z.st === 'wait' && el >= PH[z.ph][0]) { z.st = 'shrink'; z.t = now; z.fr = z.r; z.fc = [z.cx, z.cy]; }
  else if (z.st === 'shrink') {
    const k = Math.min(1, el / PH[z.ph][1]);
    z.r = z.fr + (z.nr - z.fr) * k; z.cx = z.fc[0] + (z.nx - z.fc[0]) * k; z.cy = z.fc[1] + (z.ny - z.fc[1]) * k;
    if (k >= 1) { if (z.ph < PH.length - 1) { z.ph++; z.st = 'wait'; z.t = now; pickNext(z); } else z.st = 'done'; }
  }
  for (const p of r.ps) {
    if (!p.alive) continue;
    if (p.isBot) ai(r, p, now);
    const i = p.in; let mx = +i.mx || 0, my = +i.my || 0; const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    p.x = Math.max(R, Math.min(W - R, p.x + mx * SPEED * DT)); p.y = Math.max(R, Math.min(W - R, p.y + my * SPEED * DT));
    for (const o of r.obs) {
      const cx = Math.max(o.x, Math.min(p.x, o.x + o.w)), cy = Math.max(o.y, Math.min(p.y, o.y + o.h));
      const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy);
      if (d < R) { if (d === 0) p.x += R; else { p.x += dx / d * (R - d); p.y += dy / d * (R - d); } }
    }
    p.ang = +i.ang || 0;
    if (Math.hypot(p.x - z.cx, p.y - z.cy) > z.r) { p.hp -= (3 + z.ph * 2) * DT; if (p.hp <= 0) { kill(r, p, null); continue; } }
    for (let n = r.loot.length - 1; n >= 0; n--) {
      const l = r.loot[n]; if (Math.hypot(p.x - l.x, p.y - l.y) > 28) continue;
      if (l.k === 'med') { if (p.hp >= 100) continue; p.hp = Math.min(100, p.hp + 40); r.loot.splice(n, 1); }
      else if (l.k !== p.w) { const old = p.w; p.w = l.k; r.loot.splice(n, 1); if (old !== 'pistol') r.loot.push({ id: r.lid++, x: p.x + 20, y: p.y, k: old }); }
    }
    const w = WEAPONS[p.w];
    if (i.fire && now >= p.next) {
      p.next = now + w.rate;
      for (let n = 0; n < w.pel; n++) {
        const a = p.ang + rnd(-w.spread, w.spread);
        r.bl.push({ x: p.x + Math.cos(a) * 22, y: p.y + Math.sin(a) * 22, vx: Math.cos(a) * w.spd, vy: Math.sin(a) * w.spd, life: w.range / w.spd, dmg: w.dmg, o: p });
      }
    }
  }
  r.bl = r.bl.filter(b => {
    b.x += b.vx * DT; b.y += b.vy * DT; b.life -= DT;
    if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > W || b.y > W) return false;
    if (hitsObs(r, b.x, b.y, 0)) return false;
    for (const p of r.ps) {
      if (!p.alive || p.team === b.o.team) continue;
      if (Math.hypot(p.x - b.x, p.y - b.y) < R + 3) { p.hp -= b.dmg; if (p.hp <= 0) kill(r, p, b.o); return false; }
    }
    return true;
  });
  const alive = r.ps.filter(p => p.alive), teams = new Set(alive.map(p => p.team));
  if (teams.size <= 1) {
    r.state = 'over'; r.over = now + 8000;
    const win = alive[0] ? alive[0].team : -1;
    r.ps.forEach(p => send(p.ws, { t: 'end', win: p.team === win, kills: p.kills, rank: p.alive ? 1 : p.rank || 2 }));
  }
}

function snapshot(r) {
  const z = r.zone, alive = r.ps.filter(p => p.alive).length;
  const ps = r.ps.map(p => [p.id, p.x | 0, p.y | 0, +p.ang.toFixed(2), Math.ceil(p.hp), WL.indexOf(p.w), p.alive ? 1 : 0]);
  const b = r.bl.map(o => [o.x | 0, o.y | 0]);
  const zz = [z.cx | 0, z.cy | 0, z.r | 0, z.nx | 0, z.ny | 0, z.nr, z.st === 'wait' ? 0 : 1];
  const f = r.feed; r.feed = [];
  for (const h of r.ps) {
    if (h.isBot) continue;
    const l = r.loot.filter(o => Math.abs(o.x - h.x) < 7