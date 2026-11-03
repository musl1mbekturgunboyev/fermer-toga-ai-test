// Cross-platform ZIP writer using only Node built-ins. Never package a directory manually.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..');
const target=path.resolve(process.argv[2]||path.join(root,'..','Fermer_Toga_Audit_Tuzatilgan.zip'));
const roots=new Set(['api','public','scripts','supabase','tests','.openai']);
const allowedRoot=new Set(['package.json','package-lock.json','server.js','render.yaml','vercel.json','.gitignore','.env.example']);
const forbidden=n=>['.git','node_modules','dist','.vercel'].includes(n)||n==='.vapid.json'||(n.startsWith('.env')&&n!=='.env.example')||/\.(zip|log|bak)$/i.test(n);
const files=[];
function walk(dir,rel=''){
 for(const item of fs.readdirSync(dir,{withFileTypes:true})){
  if(forbidden(item.name)||item.isSymbolicLink())continue;
  if(!rel&&!roots.has(item.name)&&!allowedRoot.has(item.name)&&!(/\.(md|txt)$/i.test(item.name)))continue;
  const name=rel?rel+'/'+item.name:item.name,full=path.join(dir,item.name);
  if(full===target)continue;
  if(item.isDirectory())walk(full,name);else if(item.isFile())files.push({name,full});
 }
}
walk(root);
const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?(0xedb88320^(n>>>1)):(n>>>1);return n>>>0});
function crc(buf){let n=0xffffffff;for(const b of buf)n=table[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
let offset=0;const data=[],central=[];
for(const {name,full}of files.sort((a,b)=>a.name.localeCompare(b.name))){
 const bytes=fs.readFileSync(full),filename=Buffer.from(name);
 if(/\.(js|cjs|html|md|txt|json|sql|example)$/i.test(name)&&!name.startsWith('tests/')){
  const text=bytes.toString();
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)||/\bAIza[A-Za-z0-9_-]{35}\b/.test(text)||/\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b/.test(text))throw Error('Possible secret in '+name+'; release blocked');
  // Decode JWT payloads only to detect privileged Supabase keys; never print them.
  for(const token of text.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)){
   try{if(JSON.parse(Buffer.from(token[1],'base64url')).role==='service_role')throw Error('PRIVILEGED_KEY')}catch(e){if(e.message==='PRIVILEGED_KEY')throw Error('Privileged JWT in '+name+'; release blocked');}
  }
 }
 if(name==='.env.example'&&bytes.toString().split(/\r?\n/).some(l=>/^[A-Z_]+=.+/.test(l)&&!/^REMINDER_NODE_TIMER=0$/.test(l)))throw Error('Environment example must not contain values');
 const zipped=zlib.deflateRawSync(bytes),sum=crc(bytes),local=Buffer.alloc(30);
 local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt16LE(0x21,12);local.writeUInt32LE(sum,14);local.writeUInt32LE(zipped.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(filename.length,26);
 const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(8,10);c.writeUInt16LE(0x21,14);c.writeUInt32LE(sum,16);c.writeUInt32LE(zipped.length,20);c.writeUInt32LE(bytes.length,24);c.writeUInt16LE(filename.length,28);c.writeUInt32LE(offset,42);
 data.push(local,filename,zipped);central.push(c,filename);offset+=local.length+filename.length+zipped.length;
}
const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,Buffer.concat([...data,cd,end]));console.log('Safe release ZIP:',target,'files:',files.length);
