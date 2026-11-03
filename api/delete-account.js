const {auth,ins}=require('./_lib');const {clearPrefix}=require('./_storage');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return res.status(405).end();const u=await auth(req,res);if(!u)return;
 try{
  // Remove private and public objects before Auth deletion (Storage may reject users with owned objects).
  await clearPrefix('animal-photos',u.id);
  await clearPrefix('listing-photos',u.id);
  await clearPrefix('listing-photos','feed/'+u.id);
  const k=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r=await fetch(process.env.SUPABASE_URL+'/auth/v1/admin/users/'+u.id,{method:'DELETE',signal:AbortSignal.timeout(15000),headers:{apikey:k,Authorization:'Bearer '+k}});
  if(!r.ok)return res.status(503).json({error:'Hisob o‘chirilmadi. Baza migratsiyasini va ulanishni tekshiring.'});
  await ins('audit_logs',{actor_id:u.id,action:'account_deleted'});return res.json({ok:true});
 }catch{return res.status(503).json({error:'Hisob o‘chirilmadi. Qayta urinib ko‘ring.'})}
};
