const {auth,isAdmin,ins}=require('./_lib');const {db}=require('./_billing');const timedFetch=require('./_http');const {pages}=require('./send-reminders');
async function all(base,key){const rows=[];for await(const page of pages(base,key))rows.push(...page);return rows;}
module.exports=async(req,res)=>{
 if(req.method!=='GET')return res.status(405).end();const u=await auth(req,res,'admin');if(!u)return;if(!await isAdmin(u.id))return res.status(403).json({error:'Sizda bu ma’lumotni ko‘rish huquqi yo‘q.'});
 try{
 const [states,profiles,subs]=await Promise.all([all('app_state?select=user_id,json','user_id'),all('profiles?select=id,full_name','id'),all('subscriptions?select=id,owner_id,plan,period_end&period_end=gt.'+new Date().toISOString()+'&status=eq.active','id')]);
 let animals=0;for(const s of states){try{const state=JSON.parse(s.json);if(Array.isArray(state.animals))animals+=state.animals.length}catch{}}
 const plans={},byUser=new Map();for(const s of subs){const rank={Bepul:0,Pro:1,Ferma:2};if((rank[s.plan]||0)>(rank[byUser.get(s.owner_id)]||0))byUser.set(s.owner_id,s.plan);}
 for(const p of profiles){const plan=byUser.get(p.id)||'Bepul';plans[plan]=(plans[plan]||0)+1;}
 const since=new Date(Date.now()-30*864e5).toISOString(),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const count=async query=>{const r=await timedFetch(process.env.SUPABASE_URL+'/rest/v1/'+query,{headers:{apikey:key,Authorization:'Bearer '+key,Prefer:'count=exact',Range:'0-0'}});if(!r.ok)throw Error('Count failed');const n=Number((r.headers.get('content-range')||'').split('/')[1]);if(!Number.isFinite(n))throw Error('Invalid count');return n;};
 const [scans,chats,recent,pending,audit]=await Promise.all([count('ai_usage?select=id&kind=eq.scan&at=gte.'+since),count('ai_usage?select=id&kind=eq.chat&at=gte.'+since),db('profiles?select=id,full_name,region,created_at&order=created_at.desc&limit=8'),db('listings?select=id,title,phone,price,status,photo_path,photos&status=in.(pending_payment,pending_review)&order=created_at.desc&limit=30'),db('audit_logs?select=at,action&order=at.desc&limit=8')]);
 await ins('audit_logs',{actor_id:u.id,action:'admin_stats_view'});
 res.json({users:profiles.length,animals,plans,scans,chats,recent,pending,audit,ai:require('./_ai').status(),activePaid:subs.filter(s=>['Pro','Ferma'].includes(s.plan)).map(s=>({...s,full_name:profiles.find(p=>p.id===s.owner_id)?.full_name||'Foydalanuvchi'}))});
 }catch{return res.status(503).json({error:'Statistikani yuklab bo‘lmadi. Qayta urinib ko‘ring.'})}
};
