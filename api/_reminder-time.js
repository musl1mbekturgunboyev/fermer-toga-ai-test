const dateAt=ms=>new Date(ms+5*3600000).toISOString().slice(0,10);
function dueReminder(rem,now=Date.now()){
 if(!Array.isArray(rem)||typeof rem[0]!=='string'||typeof rem[1]!=='string')return null;
 const [title,date,time,ahead=10]=rem||[];if(!title||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time||''))return null;
 const lead=[0,5,10,15,30].includes(Number(ahead))?Number(ahead):10;
 const daily=!date||date==='Har kuni';const today=dateAt(now);const dates=daily?[today,dateAt(now+86400000)]:[date==='Bugun'?today:date];
 for(const d of dates){if(!/^\d{4}-\d{2}-\d{2}$/.test(d))continue;const target=Date.parse(d+'T'+time+':00+05:00')-lead*60000;const age=now-target;if(age>=0&&age<5*60000)return {title:String(title),date:d,time,lead,key:[d,time,title,lead].join('|')};}return null;
}
module.exports={dueReminder,dateAt};
