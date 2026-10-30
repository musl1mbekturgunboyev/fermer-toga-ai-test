// Run only on the server: npm run setup:admin
require('../server');
const EMAIL='muslimbekturgunboyev08@gmail.com';
async function main(){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key||key==='...')throw Error('SUPABASE_URL va SUPABASE_SERVICE_ROLE_KEY ni .env.local ga kiriting.');
 const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
 let user;
 for(let page=1;page<=100;page++){
  const r=await fetch(url+'/auth/v1/admin/users?page='+page+'&per_page=100',{headers,signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('Foydalanuvchilarni tekshirib bo‘lmadi: HTTP '+r.status);
  const j=await r.json(),users=j.users||[];user=users.find(x=>(x.email||'').toLowerCase()===EMAIL);
  if(user||users.length<100)break;
 }
 if(!user)throw Error('Avval '+EMAIL+' orqali saytda ro‘yxatdan o‘ting.');
 if(!user.email_confirmed_at)throw Error('Avval emailingizni tasdiqlang. Tasdiqlanmagan hisob admin qilinmaydi.');
 const r=await fetch(url+'/rest/v1/profiles?id=eq.'+user.id,{method:'PATCH',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify({role:'admin'}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Admin huquqini berib bo‘lmadi: HTTP '+r.status);
 const rows=await r.json();if(!rows[0]||rows[0].role!=='admin')throw Error('Profil topilmadi. Baza sxemasini tekshiring.');
 console.log(EMAIL+' — admin huquqi tasdiqlandi. Saytdan chiqib qayta kiring va /#/admin ni oching.');
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)});
