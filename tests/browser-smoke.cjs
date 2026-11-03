const fs=require('fs'),path=require('path'),assert=require('assert/strict');const {chromium}=require('playwright');const {server}=require('../server');
(async()=>{
 let browser;await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{
  const executable=process.env.CHROME_PATH;
  browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to execute/i.test(m.text()))errors.push(m.text())});
  let writes=0;await page.route('**/api/**',async route=>{const name=new URL(route.request().url()).pathname;const result=name==='/api/config'?{url:'https://mock.supabase.co',key:'public-test'}:name==='/api/account'?{plan:'Bepul',limits:{animals:10,scan:5,chat:30}}:name==='/api/consent'?{accepted:true}:name==='/api/state'?{ok:true,updated_at:new Date(Date.UTC(2026,10,3,0,0,0,++writes)).toISOString()}:{listings:[]};await route.fulfill({json:result})});
  await page.route('https://mock.supabase.co/**',r=>r.fulfill({json:[]}));
  await page.goto(origin);await page.waitForFunction(()=>typeof S!=='undefined'&&S.authReady===true);
  assert.ok(await page.locator('#root h1').count());await page.locator('a[href="#/login"]').first().click();await page.locator('#af').waitFor();assert.ok(await page.locator('#e').count());
  await page.evaluate(async()=>{
   const malicious='<img class="injected" src=x onerror="window.__xss=1">';
   const state={animals:[{id:'id" data-bad="1',name:malicious,type:malicious,e:malicious,breed:'test',sex:'Unknown',age:'2',w:'100 kg',h:'Unknown'}],weight:[{a:'id" data-bad="1',d:'2026-11-03',m:malicious,wstr:malicious,kg:100}],health:[],vacc:[],rem:[],farm:{fn:'test',fr:'test',fd:'test'},chatLog:[],fp:null};
   const session={user:{id:'11111111-1111-1111-1111-111111111111',email:'farmer@example.test',user_metadata:{full_name:'Farmer'}},access_token:'test'};
   SB={auth:{getSession:async()=>({data:{session}})},from:table=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:table==='profiles'?{role:'user',full_name:'Farmer'}:{json:JSON.stringify(state),updated_at:'2026-11-03T00:00:00Z'},error:null})})})})};
   await onSession(session);location.hash='#/animals';
  });
  for(const route of ['#/animals','#/farm','#/passport','#/weight','#/reports','#/feeding','#/reminders']){
   await page.evaluate(h=>{location.hash=h},route);await page.waitForFunction(h=>location.hash===h&&document.querySelector('main h1'),route);
   assert.equal(await page.locator('.injected').count(),0,route+' permits markup injection');assert.equal(await page.locator('[data-bad]').count(),0);assert.equal(await page.evaluate(()=>window.__xss||0),0);
  }
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{location.hash='#/app'});await page.locator('.app').waitFor();assert.ok(await page.locator('.bn').isVisible());
  await page.evaluate(async()=>{await persistNow()});assert.ok(writes>0);assert.deepEqual(errors,[]);
  console.log('PASS: real Chromium, public/login + 7 authenticated pages, stored XSS payloads, mobile navigation, state save and strict CSP');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
