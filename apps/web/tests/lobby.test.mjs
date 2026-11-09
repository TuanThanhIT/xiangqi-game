import test from 'node:test';
import assert from 'node:assert/strict';
import { loader } from './load-source.mjs';
const hasSavedRoom=loader()('apps/web/src/features/lobby/saved-room.ts').hasSavedRoom;
const session={version:1,roomCode:'ABC234',seatToken:'A'.repeat(43),seat:'red',nickname:'Kỳ thủ'};
function storage(value){return {getItem(){return value},setItem(){assert.fail('Lobby must not write storage')},removeItem(){assert.fail('Lobby must not remove storage')}};}
test('Lobby inspects local and legacy V1 sessions without migration, writes or deletion',()=>{
 assert.equal(hasSavedRoom(()=>storage(JSON.stringify(session)),()=>storage(null)),true);
 assert.equal(hasSavedRoom(()=>storage(null),()=>storage(JSON.stringify(session))),true);
 for(const value of [null,'{bad','{}',JSON.stringify({...session,version:2}),JSON.stringify({...session,seatToken:'bad'}),JSON.stringify({revoked:true})])assert.equal(hasSavedRoom(()=>storage(value),()=>storage(null)),false);
 assert.equal(hasSavedRoom(()=>{throw Error('blocked')},()=>storage(JSON.stringify(session))),true);
 assert.equal(hasSavedRoom(()=>{throw Error('blocked')},()=>{throw Error('blocked')}),false);
});
