// Bound encoded size and decoded dimensions before sending images to AI/storage.
const MAX=8192,PIXELS=32000000;
const dimensions=(w,h)=>w>0&&h>0&&w<=MAX&&h<=MAX&&w*h<=PIXELS;
function inspect(buf){
 if(!Buffer.isBuffer(buf)||buf.length<24||buf.length>1125000)return false;
 if(buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){
  if(buf.readUInt32BE(8)!==13||buf.toString('ascii',12,16)!=='IHDR'||!dimensions(buf.readUInt32BE(16),buf.readUInt32BE(20)))return false;
  let offset=8,data=false;
  while(offset+12<=buf.length){const size=buf.readUInt32BE(offset),type=buf.toString('ascii',offset+4,offset+8);if(size>buf.length-offset-12)return false;if(type==='IDAT')data=true;if(type==='IEND')return size===0&&data&&offset+12===buf.length;offset+=size+12;}return false;
 }
 if(buf[0]!==255||buf[1]!==216||buf[buf.length-2]!==255||buf[buf.length-1]!==217)return false;
 let pos=2,frame=false;
 while(pos+3<buf.length){if(buf[pos++]!==255)return false;while(buf[pos]===255)pos++;const marker=buf[pos++];if(marker===0xda)return frame;if(marker===0xd9)return false;const len=buf.readUInt16BE(pos);if(len<2||pos+len>buf.length)return false;if([0xc0,0xc1,0xc2].includes(marker)){if(len<8||!dimensions(buf.readUInt16BE(pos+5),buf.readUInt16BE(pos+3)))return false;frame=true;}pos+=len;}
 return false;
}
function validBuffer(buf){try{return inspect(buf)}catch{return false}}
function imageBuffer(data){
 if(typeof data!=='string'||data.length>1500000)return null;
 const m=/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);if(!m||m[2].length%4!==0)return null;
 const b=Buffer.from(m[2],'base64');if(b.toString('base64')!==m[2]||!validBuffer(b))return null;
 if(m[1]==='png'&&b[0]!==137||m[1]==='jpeg'&&b[0]!==255)return null;
 return b;
}
module.exports={imageBuffer,validBuffer};
