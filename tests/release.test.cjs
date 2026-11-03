const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
test('release excludes secrets, git, symlinks and blocks embedded credentials',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fermer-release-'));
 try{
 for(const d of ['scripts','api','.git','node_modules'])fs.mkdirSync(path.join(root,d));
 fs.copyFileSync(path.join(__dirname,'../scripts/package-release.cjs'),path.join(root,'scripts/package-release.cjs'));
 for(const f of ['.env','.env.local','.env.production','.vapid.json','.git/config','node_modules/secret'])fs.writeFileSync(path.join(root,f),'sensitive');
 fs.writeFileSync(path.join(root,'.env.example'),'SECRET=\n');fs.writeFileSync(path.join(root,'api/safe.js'),'module.exports={}');
 const zip=path.join(root,'release.zip');execFileSync(process.execPath,[path.join(root,'scripts/package-release.cjs'),zip]);
 const bytes=fs.readFileSync(zip);for(const name of ['.env.local','.env.production','.vapid.json','.git/config','node_modules/secret'])assert.ok(!bytes.includes(Buffer.from(name)));
 assert.ok(bytes.includes(Buffer.from('api/safe.js')));
 fs.writeFileSync(path.join(root,'api/unsafe.js'),'const key="sk-proj-'+ 'a'.repeat(48)+'";');
 assert.throws(()=>execFileSync(process.execPath,[path.join(root,'scripts/package-release.cjs'),zip],{stdio:'pipe'}));
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
