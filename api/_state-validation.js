function validateState(state){
 if(!state||typeof state!=='object'||Array.isArray(state)||!Array.isArray(state.animals))return false;
 if(state.animals.some(x=>!x||typeof x!=='object'||Array.isArray(x)||typeof x.id!=='string'||!x.id||x.id.length>100))return false;
 if(new Set(state.animals.map(x=>x.id)).size!==state.animals.length)return false;
 for(const k of ['weight','health','vacc','chatLog'])if(state[k]!==undefined&&(!Array.isArray(state[k])||state[k].length>10000))return false;
 if(state.rem!==undefined){
  if(!Array.isArray(state.rem)||state.rem.length>500)return false;
  for(const r of state.rem){
   if(!Array.isArray(r)||r.length<2||r.length>4||typeof r[0]!=='string'||!r[0].trim()||r[0].length>200||typeof r[1]!=='string')return false;
   if(!['','Har kuni','Bugun'].includes(r[1])&&!/^\d{4}-\d{2}-\d{2}$/.test(r[1]))return false;
   if(r[2]!==undefined&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(r[2]))return false;
   if(r[3]!==undefined&&![0,5,10,15,30].includes(r[3]))return false;
  }
 }
 return true;
}
module.exports={validateState};
