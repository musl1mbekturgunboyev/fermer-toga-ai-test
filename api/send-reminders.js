const crypto=require('crypto');const {db}=require('./_billing');const push=require('./_push');const {dueReminder}=require('./_reminder-time');
async function* pages(base,key){let cursor='';for(;;){const rows=await db(base+'&order='+key+'.asc&limit=250'+(cursor?'&'+key+'=gt.'+encodeURIComponent(cursor):''));if(!Array.isArray(rows))throw Error('Invalid page');if(!rows.length)return;const next=String(rows[rows.length-1][key]||'');if(!next||next===cursor)throw Error('Invalid cursor');yield rows;cursor=next;}}
module.exports=async(req,res)=>{try{
 if(!['GET','POST'].includes(req.method||'POST'))return res.status(405).end();
 if(!await push.cronAllowed(req))return res.status(401).end();
 const devicesByUser=new Map();let sent=0,failed=0,invalid=0;
 for await(const rows of pages('push_subs?select=endpoint,user_id,sub','endpoint'))for(const s of rows){const devices=devicesByUser.get(s.user_id)||[];if(devices.length<20)devices.push(s);devicesByUser.set(s.user_id,devices);}
 for await(const rows of pages('app_state?select=user_id,json','user_id'))for(const r of rows){
  const devices=devicesByUser.get(r.user_id);if(!devices?.length)continue;
  let rems;try{rems=(typeof r.json==='string'?JSON.parse(r.json):r.json)?.rem;if(!Array.isArray(rems))continue;}catch{invalid++;continue;}
  for(const rem of rems.slice(0,500)){
   try{
    const due=dueReminder(rem);if(!due)continue;
    const id=crypto.createHash('sha256').update(r.user_id+'|'+due.key).digest('hex');
    if(!await db('rpc/claim_reminder',{method:'POST',body:JSON.stringify({p_id:id,p_user:r.user_id})}))continue;
    let success=false;
    for(let i=0;i<devices.length;i+=4)await Promise.all(devices.slice(i,i+4).map(async d=>{try{await push.send(d.sub,{title:due.lead?'⏰ '+due.lead+' daqiqa qoldi':'⏰ Eslatma vaqti',body:due.title+' · '+due.time+' (Toshkent vaqti)',tag:id,url:'/#/reminders'});success=true;}catch(e){failed++;if([404,410].includes(e.statusCode))await db('push_subs?endpoint=eq.'+encodeURIComponent(d.sub.endpoint),{method:'DELETE'});}}));
    if(success){await db('reminder_deliveries?id=eq.'+id,{method:'PATCH',body:JSON.stringify({status:'sent',sent_at:new Date().toISOString()})});sent++;}
    else await db('reminder_deliveries?id=eq.'+id,{method:'PATCH',body:JSON.stringify({locked_until:new Date(0).toISOString()})});
   }catch{invalid++;}
  }
 }
 return res.json({sent,failed,invalid});
}catch{return res.status(503).json({error:'Eslatma yuborish xizmati ishlamadi.'})}};
module.exports.pages=pages;
