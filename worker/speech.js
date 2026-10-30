function localSpeechUrl(value){
  try{
    const url=new URL(value),host=url.hostname.toLowerCase(),octets=host.split('.').map(Number);
    const ipv4=/^\d+\.\d+\.\d+\.\d+$/.test(host)&&octets.every(value=>value>=0&&value<=255);
    const privateIpv4=ipv4&&(octets[0]===127||octets[0]===10||octets[0]===192&&octets[1]===168||octets[0]===172&&octets[1]>=16&&octets[1]<=31);
    const privateHost=host==='localhost'||host==='[::1]'||host.endsWith('.internal')||host.endsWith('.local')||(!host.includes('.')&&!host.includes(':'))||privateIpv4||/^\[f[cd]/.test(host);
    return ['http:','https:'].includes(url.protocol)&&privateHost&&!url.username&&!url.password?url.href:null;
  }catch{return null;}
}
function speechSettings(env){
  const airGap=env.AIR_GAP==='1',local=Boolean(localSpeechUrl(env.LOCAL_SPEECH_URL));
  let cloudUrl=env.SPEECH_API_URL||'',key=env.SPEECH_API_KEY||'';
  if(!cloudUrl&&!key&&env.LLM_API_KEY){try{if(new URL(env.LLM_BASE_URL).hostname==='api.proxyapi.ru'){cloudUrl='https://api.proxyapi.ru/v1/audio/transcriptions';key=env.LLM_API_KEY;}}catch{}}
  return {airGap,local,cloud:!airGap&&Boolean(cloudUrl&&key),cloudUrl,key};
}
function speechMedia(bytes){
  const starts=(...values)=>values.every((value,index)=>bytes[index]===value);
  const ascii=(start,end)=>String.fromCharCode(...bytes.slice(start,end));
  if(starts(0x1a,0x45,0xdf,0xa3))return ['audio/webm','webm'];
  if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WAVE')return ['audio/wav','wav'];
  if(ascii(4,8)==='ftyp')return ['audio/mp4','m4a'];
  if(ascii(0,4)==='OggS')return ['audio/ogg','ogg'];
  if(ascii(0,3)==='ID3'||bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0)return ['audio/mpeg','mp3'];
  return null;
}
async function speechRoute(request,env,isConfig=false,options={}){
  const settings=speechSettings(env);
  if(isConfig){if(request.method!=='GET')fail('method_not_allowed',405);return json({api:settings.cloud,local:settings.local,airGap:settings.airGap,cloudModel:env.SPEECH_MODEL||'openai/whisper-1',localModel:settings.local?(env.LOCAL_SPEECH_MODEL||'local'):'not_connected'});}
  if(request.method!=='POST')fail('method_not_allowed',405);
  if(!request.headers.get('content-type')?.startsWith('multipart/form-data;'))fail('invalid_input',400);
  const maxBytes=options.maxBytes||8*1024*1024;if(Number(request.headers.get('content-length')||0)>maxBytes+65536)fail('speech_too_large',413);
  const input=await request.formData(),mode=input.get('mode'),file=input.get('file');
  if(!['api','local'].includes(mode)||!file||typeof file==='string'||typeof file.arrayBuffer!=='function')fail('invalid_input',400);
  if(mode==='api'&&settings.airGap)fail('speech_air_gap',403);
  if(mode==='local'&&!settings.local)fail('speech_local_not_connected',503);
  if(mode==='api'&&!settings.cloud)fail('speech_api_not_configured',503);
  if(file.size<44||file.size>maxBytes)fail('speech_too_large',413);
  const bytes=new Uint8Array(await file.arrayBuffer()),media=speechMedia(bytes);
  if(!media)fail('speech_invalid_audio',400);
  const endpoint=mode==='local'?env.LOCAL_SPEECH_URL:settings.cloudUrl;
  let target;try{target=new URL(endpoint)}catch{fail('speech_unavailable',503)}
  if(!['http:','https:'].includes(target.protocol)||mode==='api'&&target.protocol!=='https:')fail('speech_unavailable',503);
  const form=new FormData();form.set('file',new Blob([bytes],{type:media[0]}),'voice.'+media[1]);form.set('model',mode==='local'?(env.LOCAL_SPEECH_MODEL||'local'):(env.SPEECH_MODEL||'openai/whisper-1'));form.set('response_format','json');
  const headers={},token=mode==='local'?env.LOCAL_SPEECH_KEY:settings.key;if(token)headers.authorization='Bearer '+token;
  let upstream;try{upstream=await fetch(target.href,{method:'POST',headers,body:form,redirect:'manual',signal:AbortSignal.timeout(65000)});}catch(error){console.warn('Транскрибация: ошибка соединения',error.name);fail('speech_unavailable',503)}
  if(!upstream.ok){const status=upstream.status;await upstream.body?.cancel();return json({error:mode==='local'?'speech_local_unavailable':'speech_upstream_error',upstreamStatus:status},503);}
  let body;try{body=await upstream.json()}catch(error){console.warn('Транскрибация: ответ не JSON',upstream.status,upstream.headers.get('content-type'));fail('speech_unavailable',503)}
  if(typeof body.text!=='string'||body.text.length>40000)fail('speech_unavailable',503);
  return json({text:body.text.replaceAll('\u0451','\u0435').replaceAll('\u0401','\u0415').replace(/[\u2013\u2014]/g,'-').trim(),mode,model:mode==='local'?(env.LOCAL_SPEECH_MODEL||'local'):(env.SPEECH_MODEL||'openai/whisper-1')});
}
