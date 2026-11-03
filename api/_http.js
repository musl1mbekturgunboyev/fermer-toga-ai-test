module.exports=(url,options={})=>fetch(url,{signal:AbortSignal.timeout(15000),...options});
