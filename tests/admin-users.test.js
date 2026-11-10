const test=require('node:test'),assert=require('node:assert/strict');
const lib=require('../api/_lib'),handler=require('../api/admin-users');
const res=()=>({statusCode:200,status(n){this.statusCode=n;return this},json(b){this.body=b;return this},end(){}});
test('admin users rejects ordinary accounts before listing private profiles',async t=>{
 const old=global.fetch;t.after(()=>global.fetch=old);lib.resetRateLimits();let listed=false;
 global.fetch=async u=>{if(u.endsWith('/auth/v1/user'))return Response.json({id:'u'});if(u.includes('select=role'))return Response.json([{role:'user'}]);listed=true;throw Error()};
 const r=res();await handler({method:'POST',headers:{authorization:'Bearer a'},body:{}},r);assert.equal(r.statusCode,403);assert.equal(listed,false);
});
test('admin users paginates beyond the last eight with stable ordering and next-page flag',async t=>{
 const old=global.fetch;t.after(()=>global.fetch=old);lib.resetRateLimits();let query;
 global.fetch=async u=>{if(u.endsWith('/auth/v1/user'))return Response.json({id:'admin'});if(u.includes('select=role'))return Response.json([{role:'admin'}]);query=u;return Response.json(Array.from({length:26},(_,i)=>({id:'u'+(25+i)})))};
 const r=res();await handler({method:'POST',headers:{authorization:'Bearer a'},body:{page:1}},r);assert.equal(r.statusCode,200);assert.equal(r.body.users.length,25);assert.equal(r.body.users[0].id,'u25');assert.equal(r.body.hasMore,true);assert.match(query,/offset=25&limit=26/);assert.match(query,/order=created_at.desc,id.asc/);
 const bad=res();await handler({method:'POST',headers:{authorization:'Bearer a'},body:{page:-1}},bad);assert.equal(bad.statusCode,400);
});
test('billing exposes independent crop quota and requested monthly prices',()=>{
 const {PLANS}=require('../api/_billing');assert.deepEqual(PLANS.Bepul,{animals:10,scan:2,agro:2,chat:5,price:0});assert.equal(PLANS.Pro.price,49900);assert.equal(PLANS.Ferma.price,149999);
});
