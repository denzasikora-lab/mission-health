import {createHmac,createSecretKey,randomBytes,timingSafeEqual} from 'node:crypto';

export const SESSION_COOKIE='__Host-mission_guest';

export function createSessions({secret,ttlSeconds=30*24*60*60,now=Date.now}={}){
  if(!(typeof secret==='string'||Buffer.isBuffer(secret)||secret instanceof Uint8Array))throw new Error('session_secret_required');
  const bytes=Buffer.from(secret);
  if(bytes.length<32)throw new Error('session_secret_too_short');
  if(!Number.isSafeInteger(ttlSeconds)||ttlSeconds<1||ttlSeconds>366*24*60*60||typeof now!=='function')throw new Error('invalid_session_options');
  const key=createSecretKey(bytes);
  const sign=value=>createHmac('sha256',key).update(value,'utf8').digest();
  function timestamp(){const value=now();return typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.floor(value/1000):null;}
  function issue(){
    const at=timestamp();if(at===null)throw new Error('invalid_session_clock');
    const id=randomBytes(32).toString('base64url'),payload='v1.'+id+'.'+(at+ttlSeconds),token=payload+'.'+sign(payload).toString('base64url');
    return {owner:'guest:'+id,cookie:SESSION_COOKIE+'='+token+'; Path=/; Max-Age='+ttlSeconds+'; Secure; HttpOnly; SameSite=Lax'};
  }
  function verify(cookieHeader){
    if(typeof cookieHeader!=='string'||cookieHeader.length>16384)return null;
    const values=cookieHeader.split(';').map(value=>value.trim()).filter(value=>value.startsWith(SESSION_COOKIE+'='));
    if(values.length!==1)return null;
    const token=values[0].slice(SESSION_COOKIE.length+1),match=token.match(/^v1\.([A-Za-z0-9_-]{43})\.([1-9][0-9]{0,11})\.([A-Za-z0-9_-]{43})$/);
    if(!match)return null;
    const [,id,expiry,signature]=match,at=timestamp(),expires=Number(expiry);
    if(at===null||!Number.isSafeInteger(expires)||expires<=at||Buffer.from(id,'base64url').toString('base64url')!==id)return null;
    const actual=Buffer.from(signature,'base64url');
    if(actual.length!==32||actual.toString('base64url')!==signature)return null;
    const expected=sign('v1.'+id+'.'+expiry);
    return timingSafeEqual(actual,expected)?'guest:'+id:null;
  }
  return Object.freeze({issue,verify});
}
