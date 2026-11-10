const { auth } = require('./_lib');
const { db } = require('./_billing');
module.exports = async (req,res) => {
  if(req.method!=='POST') return res.status(405).end();
  const user=await auth(req,res,'admin'); if(!user)return;
  try {
    const role=await db('profiles?select=role&id=eq.'+encodeURIComponent(user.id));
    if(role?.[0]?.role!=='admin')return res.status(403).json({error:'Faqat administrator uchun.'});
    const page=Number(req.body?.page??0),size=25;
    if(!Number.isSafeInteger(page)||page<0||page>1000000)return res.status(400).json({error:'Sahifa noto‘g‘ri.'});
    const rows=await db('profiles?select=id,full_name,phone,region,role,created_at&order=created_at.desc,id.asc&offset='+(page*size)+'&limit='+(size+1));
    if(!Array.isArray(rows))throw Error();
    res.json({users:rows.slice(0,size),page,hasMore:rows.length>size});
  }catch(_){res.status(503).json({error:'Foydalanuvchilarni yuklab bo‘lmadi. Qayta urinib ko‘ring.'});}
};
