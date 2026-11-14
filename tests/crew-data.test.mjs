import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../public/crew.js',import.meta.url),'utf8');
const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');

test('Named astronaut profiles contain public identity without invented medical measurements',()=>{
  const scope={};vm.runInNewContext(source+';globalThis.actual=crew;',scope);
  assert.equal(scope.actual.length,3);
  for(const profile of scope.actual){
    assert.ok(profile.name&&profile.photo&&profile.bio&&profile.credit);
    assert.equal(profile.readingsSource,null);assert.equal(profile.status,'unavailable');
    assert.equal(profile.events.length,0);
    for(const value of Object.values(profile.metrics))assert.equal(value,null);
    for(const value of Object.values(profile.baseline))assert.equal(value,null);
    for(const values of Object.values(profile.history))assert.equal(values.length,0);
  }
});

test('Profile charts accept explicit shared records without synthesizing missing periods',()=>{
  const start=app.indexOf('function seriesFor('),end=app.indexOf('\nfunction ',start+1),scope={};
  vm.runInNewContext(app.slice(start,end)+';globalThis.series=seriesFor;',scope);
  assert.equal(scope.series({history:{hr:[70,80]}},'hr','24h').length,0);
  const profile={readingsSource:'shared-measurements',recordedHistory:{hr:{'24h':[70,null,80]}}};
  assert.equal(JSON.stringify(scope.series(profile,'hr','24h')),JSON.stringify([70,null,80]));
  assert.equal(scope.series(profile,'hr','1h').length,0);
});
