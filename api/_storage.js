async function request(path,method,body){
 const k=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const r=await fetch(process.env.SUPABASE_URL+'/storage/v1/'+path,{method,signal:AbortSignal.timeout(15000),headers:{apikey:k,Authorization:'Bearer '+k,'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!r.ok)throw Error('Storage operation failed');return r.json();
}
async function removeObjects(bucket,paths){for(let i=0;i<paths.length;i+=100)await request('object/'+bucket,'DELETE',{prefixes:paths.slice(i,i+100)});}
async function clearPrefix(bucket,prefix){
 const folders=[prefix],files=[];
 for(let i=0;i<folders.length;i++){
  const folder=folders[i];let offset=0;
  for(;;){const rows=await request('object/list/'+bucket,'POST',{prefix:folder,limit:100,offset,sortBy:{column:'name',order:'asc'}});if(!Array.isArray(rows))throw Error('Invalid storage response');if(!rows.length)break;
   for(const row of rows){if(typeof row.name!=='string'||!row.name||row.name.includes('/')||row.name==='.'||row.name==='..')throw Error('Invalid object name');const name=folder+'/'+row.name;if(row.id)files.push(name);else folders.push(name);}offset+=rows.length;
  }
 }
 await removeObjects(bucket,files);
}
module.exports={removeObjects,clearPrefix};
