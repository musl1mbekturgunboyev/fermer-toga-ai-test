const {auth}=require('./_lib');
const {db}=require('./_billing');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return res.status(405).end();
 const user=await auth(req,res);if(!user)return;
 const {id,status}=req.body||{};
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id||''))||!['sold','removed'].includes(status))return res.status(400).json({error:'E’lon holati noto‘g‘ri.'});
 try{
  const ok=await db('rpc/set_listing_status',{method:'POST',body:JSON.stringify({p_user:user.id,p_id:id,p_status:status})});
  if(ok!==true)return res.status(409).json({error:'Faqat o‘zingizning faol e’loningizni sotildi deb belgilash mumkin.'});
  return res.json({ok:true});
 }catch(_){return res.status(503).json({error:'E’lon holatini saqlab bo‘lmadi.'});}
};
