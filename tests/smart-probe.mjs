import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport:{width:412,height:892}})).newPage();
let errs=0; p.on('pageerror', e=>{errs++; console.log('ERR',e.message);}); p.on('console', m=>{ if(m.type()==='error' && /worker/.test(m.text())) {errs++; console.log('CERR', m.text().slice(0,200));} });
await p.goto('http://localhost:4173/?devads'); await p.evaluate(()=>localStorage.clear()); await p.reload();
await p.waitForFunction(()=>window.__WE&&window.__WE.game.ready,null,{timeout:30000});
const W=(f,a)=>p.evaluate(f,a);
async function waitGame(sec){const s=await W(()=>window.__WE.game.time); const end=Date.now()+90000; while((await W(()=>window.__WE.game.time))-s<sec && Date.now()<end) await p.waitForTimeout(150);}
const R={};
await W(()=>{const g=window.__WE.game; g.state.money=1e9; g.state.level=40; for(let i=1;i<=3;i++) g.land.buy(i); g.construction.build('sander');
  const roles=['lumberjack','lumberjack','lumberjack','lumberjack','carrier','carrier','carrier','loader','loader','loader'];
  for(const r of roles) g.workers.hire(r);
  const d=g.sites.get('depot1'); for(let i=0;i<60;i++) if(!d.buffer.isFull()) d.buffer.push({kind:'log',wood:'pine',dep:1,o:0});
  g.state.smartLogistics=true; g.state.autoAssign=true; window.__WE.timeScale(3);
  // her 0.2 sn: aynı kaynağa, kaynaktaki üründen fazla kapasiteyle giden işçi var mı? (gereksiz tekrar)
  window._dup=0; window._samples=0; window._overfill=0;
  setInterval(()=>{ const W=g.workers; window._samples++;
    const by=new Map(); for(const w of W.list){ const f = w.state==='pick' ? (w.route?.from || w.src?.id) : null; if(!f) continue; if(!by.has(f)) by.set(f,[]); by.get(f).push(w); }
    for(const [f,ws] of by){ if(ws.length<2) continue; const st=g.sites.get(f); const buf=st.outBuf||st.buffer; const cap=ws.slice(1).reduce((a,w)=>a+w.stack.capacity,0); if(buf && buf.count + 2 < cap && ws.length>2) window._dup++; }
    for(const m of g.production.machines){ if(m.inBuf.count>m.inBuf.capacity) window._overfill++; }
  },200);
});
for(let k=0;k<6;k++){ await waitGame(10); console.log(JSON.stringify(await W(()=>{const g=window.__WE.game,W=g.workers; const saw=g.sites.get('saw'), sd=g.sites.get('sander');
  return {t:Math.round(g.time), roles:W.list.map(w=>w.data.role[0]+(w.data.origRole?'*':'')).join(''), waiting:W.waitingList().length, jobs:W.jobs?.size||0, jobIds:[...(W.jobs?.keys()||[])].slice(0,3), saw:[saw.inBuf.count,saw.outBuf.count+'/'+saw.outBuf.capacity, saw.throttle], sander:[sd.inBuf.count+'/'+sd.inBuf.capacity, sd.outBuf.count], dup:window._dup, samples:window._samples};})));}
// 3/4: makine doldu → taşıma durdu mu, boşalınca başladı mı
R.full = await W(()=>{const g=window.__WE.game, sd=g.sites.get('sander'), saw=g.sites.get('saw'); while(!sd.inBuf.isFull()) sd.inBuf.push({kind:'plank',wood:'pine',dep:1,o:0}); while(!saw.outBuf.isFull()) saw.outBuf.push({kind:'plank',wood:'pine',dep:1,o:0});
  const probe={data:{fac:null,role:'carrier',target:'auto'},pos:{x:0,z:0},stack:{capacity:6,count:0}}; const r=g.workers.pickRoute(probe,true); return {routeWhenFull:r?.id||null, throttled:g.production.throttled(saw)};});
R.reopen = await W(()=>{const g=window.__WE.game, sd=g.sites.get('sander'); sd.inBuf.items.length=0; sd.outBuf.items.length=0; const probe={data:{fac:null,role:'carrier',target:'auto'},pos:{x:0,z:0},stack:{capacity:6,count:0}}; return {routeWhenEmpty:g.workers.pickRoute(probe,true)?.id||null, throttled:g.production.throttled(g.sites.get('saw'))};});
// 7: yükü olan işçi görev değiştirmez
R.loaded = await W(()=>{const g=window.__WE.game, W=g.workers; const w=W.list[W.list.length-1]; w.stack.items.length=0; w.stack.push({kind:'sanded',wood:'pine',dep:1,o:0}); w.waitedT=99; w.state='idle'; const role0=w.data.role; W.autoAssign(); return {before:role0, after:w.data.role};});
// 8: otomatik kapat → asıl görevler
await waitGame(2);
R.restore = await W(()=>{const g=window.__WE.game,W=g.workers; const changed=W.list.filter(w=>w.data.origRole).length; g.state.autoAssign=false; W.restoreRoles(); return {changed, stillAuto:W.list.filter(w=>w.data.origRole && !w.restorePending).length, pending:W.list.filter(w=>w.restorePending).length};});
// 10: performans: 30 işçiyle işçi güncellemesi kaç ms?
R.perf = await W(()=>{const g=window.__WE.game,W=g.workers; for(let i=0;i<20;i++) W.hire(['carrier','loader','lumberjack'][i%3]); g.state.autoAssign=true; const t0=performance.now(); for(let i=0;i<200;i++) W.update(1/60); return {workers:W.list.length, msPerFrame:+((performance.now()-t0)/200).toFixed(3)};});
// 9: kaydet / yeniden aç
await W(()=>window.__WE.saveNow());
const before = await W(()=>({smart:window.__WE.game.state.smartLogistics, auto:window.__WE.game.state.autoAssign, n:window.__WE.game.workers.list.length, money:Math.round(window.__WE.game.state.money)}));
await p.reload(); await p.waitForFunction(()=>window.__WE&&window.__WE.game.ready,null,{timeout:30000});
const after = await W(()=>({smart:window.__WE.game.state.smartLogistics, auto:window.__WE.game.state.autoAssign, n:window.__WE.game.workers.list.length, money:Math.round(window.__WE.game.state.money)}));
R.save={before,after};
R.errors=errs;
console.log(JSON.stringify(R,null,1));
await b.close();
