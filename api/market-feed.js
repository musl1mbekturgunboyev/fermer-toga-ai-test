// Public previews contain only approved active listings, never contact/account data.
const {db}=require('./_billing');
module.exports=async(req,res)=>{
 if(req.method!=='GET')return res.status(405).end();
 try{const rows=await db('listings?select=id,title,price,species,region,age,weight,photos,photo_path&status=eq.active&order=created_at.desc&limit=12',{signal:AbortSignal.timeout(8000)});
 const listings=(Array.isArray(rows)?rows:[]).map(l=>Object.fromEntries(['id','title','price','species','region','age','weight','photos','photo_path'].map(k=>[k,l[k]])));
 res.setHeader('Cache-Control','public, max-age=30');return res.json({listings});
 }catch(_){return res.status(503).json({error:'E’lonlarni hozir yuklab bo‘lmadi.'});}
};
