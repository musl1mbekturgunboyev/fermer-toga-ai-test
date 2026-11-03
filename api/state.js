const {auth}=require('./_lib');
const {db}=require('./_billing');
const {validateState}=require('./_state-validation');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return res.status(405).end();
 const u=await auth(req,res);if(!u)return;
 const b=req.body||{};
 if(typeof b.json!=='string'||Buffer.byteLength(b.json,'utf8')>4000000)return res.status(400).json({error:'Saqlanadigan ma’lumot hajmi noto‘g‘ri'});
 let state;try{state=JSON.parse(b.json)}catch{return res.status(400).json({error:'JSON noto‘g‘ri'})}
 if(!validateState(state))return res.status(400).json({error:'Hayvonlar yoki eslatmalar tuzilmasi noto‘g‘ri'});
 if(!Object.hasOwn(b,'expectedUpdatedAt')||(b.expectedUpdatedAt!==null&&(typeof b.expectedUpdatedAt!=='string'||!Number.isFinite(Date.parse(b.expectedUpdatedAt)))))return res.status(409).json({error:'Saqlashdan oldin sahifani yangilang.'});
 delete state.admin;delete state.plan;
 try{
  const result=await db('rpc/save_app_state',{method:'POST',body:JSON.stringify({p_user:u.id,p_state:state,p_expected:b.expectedUpdatedAt})});
  if(result?.conflict)return res.status(409).json({error:'Ma’lumot boshqa oynada o‘zgargan. Sahifani yangilang; joriy o‘zgarishlar saqlanmadi.'});
  if(result?.quota)return res.status(403).json({error:'Hayvonlar limiti tugadi. Tarifni yangilang.'});
  if(!result?.updated_at)throw Error('Invalid save response');
  res.json({ok:true,updated_at:result.updated_at});
 }catch{return res.status(503).json({error:'Ma’lumot saqlanmadi. Baza sozlamalari va ulanishni tekshiring.'})}
};
