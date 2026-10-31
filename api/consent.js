const {auth}=require('./_lib');const {db}=require('./_billing');
const VERSION='2026-10-31';
module.exports=async(req,res)=>{if(req.method!=='POST')return res.status(405).end();const u=await auth(req,res);if(!u)return;try{const b=req.body||{};if(b.action==='accept'){
 if(b.terms!==true||b.privacy!==true||b.version!==VERSION)return res.status(400).json({error:'Shartlar va maxfiylik siyosatini o‘qib, ikkala rozilikni belgilang.'});
 const old=await db('terms_acceptances?select=user_id&user_id=eq.'+u.id);if(!old.length)await db('terms_acceptances',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({user_id:u.id,terms_version:VERSION,privacy_version:VERSION})});
 }const rows=await db('terms_acceptances?select=terms_version,privacy_version,accepted_at&user_id=eq.'+u.id);res.json({accepted:rows.length>0,version:VERSION,record:rows[0]||null})}catch(e){res.status(503).json({error:'Rozilikni saqlab bo‘lmadi. Qayta urinib ko‘ring.'})}};
