const {auth}=require('./_lib');const {db}=require('./_billing');
const HANDLE=/^[a-z0-9][a-z0-9._]{2,23}$/;
module.exports=async(req,res)=>{
 if(req.method!=='POST')return res.status(405).end();const u=await auth(req,res);if(!u)return;
 try{const b=req.body||{};
  if(b.action==='update'){
   const nickname=String(b.nickname||'').trim().toLowerCase().replace(/^@/,'');
   const display_name=String(b.display_name||'').trim(),bio=String(b.bio||'').trim();
   if(!HANDLE.test(nickname)||display_name.length>80||bio.length>300)return res.status(400).json({error:'Nik 3–24 belgi: lotin harflari, raqam, nuqta va pastki chiziq. Tavsif 300 belgigacha.'});
   const taken=await db('seller_profiles?select=user_id&nickname=eq.'+encodeURIComponent(nickname));if(taken.some(x=>x.user_id!==u.id))return res.status(409).json({error:'Bu nik band. Boshqasini tanlang.'});
   const rows=await db('seller_profiles',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({user_id:u.id,nickname,display_name,bio})});return res.json({profile:rows[0]});
  }
  if(b.action==='mine'){const rows=await db('seller_profiles?select=nickname,display_name,bio&user_id=eq.'+u.id);return res.json({profile:rows[0]||null})}
  if(b.nickname){const nickname=String(b.nickname).toLowerCase().replace(/^@/,'');if(!HANDLE.test(nickname))return res.status(400).json({error:'Nik noto‘g‘ri'});
   const rows=await db('seller_profiles?select=user_id,nickname,display_name,bio,created_at&nickname=eq.'+encodeURIComponent(nickname));const profile=rows[0];if(!profile)return res.status(404).json({error:'Sotuvchi topilmadi'});
   const listings=await db('listings?select=*&status=in.(active,sold)&seller_id=eq.'+profile.user_id+'&order=created_at.desc&limit=100');return res.json({profile,listings});
  }
  const query=String(b.query||'').trim().toLowerCase().replace(/^@/,'').replace(/[^a-z0-9._]/g,'').slice(0,24);
  if(query.length<2)return res.json({profiles:[]});
  // Escape LIKE wildcards; dot/underscore are literal nickname characters.
  const escaped=query.replace(/_/g,'\\_');
  const profiles=await db('seller_profiles?select=user_id,nickname,display_name,bio&nickname=ilike.'+encodeURIComponent('%'+escaped+'%')+'&order=nickname&limit=30');return res.json({profiles});
 }catch(e){res.status(503).json({error:'Sotuvchi profilini yuklab yoki saqlab bo‘lmadi. Nik band emasligini va bazadagi yangilanishni tekshiring.'})}
};
