// PostgreSQL integration, isolated schema: never inject failures into public wallets.
require("reflect-metadata");
const test=require("node:test");
const assert=require("node:assert/strict");
const {randomUUID}=require("node:crypto");
const {readFileSync}=require("node:fs");
const {resolve}=require("node:path");
const {Pool}=require("pg");
const {drizzle}=require("drizzle-orm/node-postgres");
const {eq,sql}=require("drizzle-orm");
const {NestFactory}=require("@nestjs/core");
const {io}=require("socket.io-client");
const {databaseUrl}=require("../dist/db/config.js");
const schema=require("../dist/db/schema.js");
const {DatabaseService}=require("../dist/db/database.service.js");
const {AppModule}=require("../dist/app.module.js");
const {configureHttp}=require("../dist/configure-http.js");
const {WalletService}=require("../dist/wallet/wallet.service.js");
const {BettingService}=require("../dist/wallet/betting.service.js");
const {RoomsService}=require("../dist/rooms/rooms.service.js");
const {hashPassword}=require("../dist/auth/password.js");
const {RegistrationService}=require("../dist/auth/registration/registration.service.js");
const {OtpService}=require("../dist/auth/otp/otp.service.js");
const {OtpMailer}=require("../dist/auth/otp/delivery/otp-mailer.js");

test("Wallet/bets: isolated PostgreSQL, real HTTP/Auth/Socket.IO",{timeout:90000},async t=>{
 const testSchema="wallet_test_"+randomUUID().replaceAll("-","");
 assert.match(testSchema,/^wallet_test_[0-9a-f]{32}$/);
 const admin=new Pool({connectionString:databaseUrl(),connectionTimeoutMillis:5000});
 let pool,app;const sockets=[];
 try{
  assert.equal((await admin.query("select current_database() as name")).rows[0].name,"xiangqi_dev");
  await admin.query(`CREATE SCHEMA "${testSchema}"`);
  pool=new Pool({connectionString:databaseUrl(),options:`-c search_path=${testSchema}`,connectionTimeoutMillis:5000});
  const db=drizzle(pool,{schema});
  async function migrate(name){
   // Same SQL, with only explicit public FK qualifiers redirected into this schema.
   const migration=readFileSync(resolve(__dirname,"../drizzle",name),"utf8").replaceAll('"public".',`"${testSchema}".`);
   const client=await pool.connect();
   try{await client.query("BEGIN");for(const statement of migration.split("--> statement-breakpoint"))if(statement.trim())await client.query(statement);await client.query("COMMIT");}
   catch(error){await client.query("ROLLBACK");throw new Error(`Test migration failed (${error.code??"unknown"})`);}
   finally{client.release();}
  }
  await migrate("0000_cultured_marten_broadcloak.sql");await migrate("0001_dear_proteus.sql");
  const password="Wallet-test-only-password-2026",passwordHash=await hashPassword(password);
  async function user(verified=true){
   const id=randomUUID(),email=`wallet-${id}@example.test`;
   await db.insert(schema.accounts).values({id,email,nickname:`Test ${id}`,passwordHash,emailVerifiedAt:verified?new Date():null});
   return {id,email};
  }
  const old=await user(),oldPending=await user(false);
  await migrate("0002_colorful_titanium_man.sql");await migrate("0003_thin_payback.sql");
  await migrate("0004_shallow_blacklash.sql");await migrate("0005_secret_sabretooth.sql");
  await migrate("0006_peaceful_mongoose.sql");await migrate("0007_fearless_human_fly.sql");await migrate("0008_futuristic_romulus.sql");
  app=await NestFactory.create(AppModule,{logger:false,abortOnError:false,bodyParser:false});
  app.get(DatabaseService).db=db;
  const wallet=app.get(WalletService),betting=app.get(BettingService),rooms=app.get(RoomsService);
  let now=1000;const roomTimers=new Set();
  rooms.clock={now:()=>now,schedule(callback,delay){const task={callback,at:now+delay};roomTimers.add(task);return()=>roomTimers.delete(task);}};
  const delivered=[];app.get(OtpMailer).send=async mail=>{delivered.push(mail);};
  configureHttp(app);await app.listen(0,"127.0.0.1");const base=await app.getUrl();
  async function request(path,token,body,method=body===undefined?"GET":"POST"){
   return fetch(base+path,{method,headers:{Origin:"http://localhost:3000",...(token?{Authorization:`Bearer ${token}`} : {}),"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
  }
  async function login(u){
   const response=await request("/auth/login",null,{email:u.email,password});assert.equal(response.status,200);
   u.token=(await response.json()).accessToken;return u;
  }
  async function balances(u,a,h){const value=await wallet.balance(u.id);assert.equal(value.availableGold,a);assert.equal(value.heldGold,h);return value;}
  async function pair(){return [await user(),await user()];}
  const win={status:"finished",winner:"red",loser:"black",reason:"checkmate"};
  async function held(stake=20){const [red,black]=await pair(),id=randomUUID();await betting.hold(id,"ABC234",red.id,black.id,stake);return {red,black,id};}
  async function durableDone(room){await new Promise(resolve=>setImmediate(resolve));if(room.settlementFlight)await room.settlementFlight;}
  async function connect(seat,u){
   const socket=io(base+"/rooms",{autoConnect:false,forceNew:true,reconnection:false,transports:["websocket"],extraHeaders:{Origin:"http://localhost:3000"},auth:{roomCode:seat.roomCode,seatToken:seat.seatToken,accessToken:u.token}});sockets.push(socket);
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Socket auth timed out")),4000);socket.once("room:session",()=>{clearTimeout(timer);resolve();});socket.once("connect_error",()=>{clearTimeout(timer);reject(new Error("Socket auth failed"));});socket.connect();});return socket;
  }
  function waitState(socket,predicate){
   return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{socket.off("game:state",listener);reject(new Error("Bet snapshot timed out"));},4000);
    function listener(state){if(predicate(state)){clearTimeout(timer);socket.off("game:state",listener);resolve(state);}}
    socket.on("game:state",listener);
   });
  }
  async function roomPair(stake=0){
   const [red,black]=await pair();await login(red);await login(black);
   const created=await request("/casual-rooms",red.token,{themeId:"earth"});assert.equal(created.status,201);const rs=await created.json();
   const joined=await request(`/casual-rooms/${rs.roomCode}/join`,black.token,{});assert.equal(joined.status,200);const bs=await joined.json();
   const sr=await connect(rs,red),sb=await connect(bs,black);
   if(stake)assert.equal((await request(`/casual-rooms/${rs.roomCode}/bet`,red.token,{stake})).status,200);
   return {red,black,sr,sb,code:rs.roomCode,room:rooms.rooms.get(rs.roomCode)};
  }
  const ready=(f,u,value=true)=>request(`/casual-rooms/${f.code}/ready`,u.token,{ready:value});
  const resign=async f=>{
   const ack=await f.sr.timeout(4000).emitWithAck("game:resign",{requestId:randomUUID()});assert.equal(ack.ok,true);await durableDone(f.room);
  };

  await t.test("migration backfills old verified accounts; verification grants once under concurrent retry",async()=>{
   await balances(old,100,0);assert.equal((await wallet.history(old.id)).items.length,1);
   assert.equal((await db.select().from(schema.wallets).where(eq(schema.wallets.accountId,oldPending.id))).length,0);
   await Promise.all([db.update(schema.accounts).set({emailVerifiedAt:new Date()}).where(eq(schema.accounts.id,oldPending.id)),db.update(schema.accounts).set({emailVerifiedAt:new Date()}).where(eq(schema.accounts.id,oldPending.id))]);
   await Promise.all(Array.from({length:5},()=>db.execute(sql`select grant_wallet_starter(${oldPending.id}::uuid)`)));
   await balances(oldPending,100,0);assert.equal((await wallet.history(oldPending.id)).items.length,1);
   const email=`registration-${randomUUID()}@example.test`;
   const state=await app.get(RegistrationService).register({email,nickname:`Signup ${randomUUID()}`,password});
   assert.equal((await db.select().from(schema.wallets).where(eq(schema.wallets.accountId,state.accountId))).length,0);
   const mail=delivered.find(m=>m.email===email);assert.ok(mail);
   await app.get(OtpService).verify(state.accountId,mail.code);
   await assert.rejects(()=>app.get(OtpService).verify(state.accountId,mail.code));
   await balances({id:state.accountId},100,0);assert.equal((await wallet.history(state.accountId)).items.length,1);
  });
  await t.test("wallet HTTP uses authenticated owner; rejects foreign account selectors and has cursor history",async()=>{
   await login(old);await login(oldPending);
   assert.equal((await request("/wallet")).status,401);
   const response=await request("/wallet",old.token);assert.equal(response.status,200);assert.ok(response.headers.get("x-request-id"));assert.equal(response.headers.get("cache-control"),"no-store");
   assert.deepEqual(await response.json(),{availableGold:100,heldGold:0,totalGold:100,version:1});
   assert.equal((await request(`/wallet?accountId=${oldPending.id}`,old.token)).status,400);
   assert.equal((await request(`/wallet/${oldPending.id}`,old.token)).status,404);
   assert.equal((await request(`/wallet/history?accountId=${oldPending.id}`,old.token)).status,400);
   for(const query of ["limit=101","before=-1","limit=1&limit=2"])assert.equal((await request("/wallet/history?"+query,old.token)).status,400);
   const history=await(await request("/wallet/history?limit=1",old.token)).json();assert.equal(history.items[0].type,"starter_grant");assert.equal(history.items[0].reference,null);assert.equal(history.items[0].netAmount,100);assert.equal(history.nextCursor,null);
  });
  await t.test("atomic holds and duplicate hold/settlement retries never spend the same gold twice",async()=>{
   const f=await held(60);await balances(f.red,40,60);await balances(f.black,40,60);
   await Promise.all(Array.from({length:3},()=>betting.hold(f.id,"ABC234",f.red.id,f.black.id,60)));
   await assert.rejects(()=>betting.hold(randomUUID(),"DEF234",f.red.id,f.black.id,60));
   await balances(f.red,40,60);assert.equal((await wallet.history(f.red.id)).items.length,2);
   await assert.rejects(()=>betting.settle(f.id),error=>error?.getResponse?.().code==="BET_RESULT_MISSING");
   await Promise.all([betting.recordResult(f.id,win),betting.recordResult(f.id,win)]);
   await Promise.all([betting.finish(f.id,win),betting.settle(f.id),betting.settle(f.id)]);
   await balances(f.red,160,0);await balances(f.black,40,0);assert.equal((await wallet.history(f.red.id)).items.length,3);
   await assert.rejects(()=>betting.finish(f.id,{...win,winner:"black",loser:"red"}));
   await login(f.red);await login(old);
   assert.equal((await request(`/wallet/bets/${f.id}`,f.red.token)).status,200);assert.equal((await request(`/wallet/bets/${f.id}`,old.token)).status,404);
   const page=await wallet.history(f.red.id,undefined,1);assert.ok(page.nextCursor);assert.equal((await wallet.history(f.red.id,page.nextCursor,1)).items[0].type,"bet_hold");
  });
  await t.test("different concurrent matches lock wallet balances; exactly one affordable hold",async()=>{
   const [red,black]=await pair(),ids=[randomUUID(),randomUUID()];
   const results=await Promise.allSettled(ids.map(id=>betting.hold(id,"ABC234",red.id,black.id,60)));
   assert.equal(results.filter(r=>r.status==="fulfilled").length,1);await balances(red,40,60);
   const id=ids[results.findIndex(r=>r.status==="fulfilled")];await betting.finish(id,{status:"cancelled",reason:"both_disconnected"});
  });
  await t.test("all server winning reasons pay the pot only; draw/cancel refund, no five-gold reward",async()=>{
   for(const reason of ["checkmate","stalemate","turn_timeout","total_timeout","resignation","disconnect_timeout"]){
    const f=await held();await betting.finish(f.id,{...win,reason});await betting.finish(f.id,{...win,reason});
    await balances(f.red,120,0);await balances(f.black,80,0);assert.equal((await betting.get(f.id)).status,"settled");
   }
   for(const result of [{status:"draw",reason:"agreement"},{status:"cancelled",reason:"both_disconnected"}]){
    const f=await held();await betting.finish(f.id,result);await betting.finish(f.id,result);await balances(f.red,100,0);await balances(f.black,100,0);assert.equal((await betting.get(f.id)).status,"refunded");
   }
  });
  await t.test("restart recovery refunds held; finishes saved results; running twice is idempotent",async()=>{
   const heldOnly=await held(),saved=await held();await betting.recordResult(saved.id,win);
   const restarted=new BettingService(app.get(DatabaseService),wallet);await restarted.recover();await restarted.recover();
   await balances(heldOnly.red,100,0);await balances(heldOnly.black,100,0);assert.equal((await betting.get(heldOnly.id)).result.reason,"backend_restart");
   await balances(saved.red,120,0);await balances(saved.black,80,0);assert.equal((await betting.get(saved.id)).status,"settled");
  });
  await t.test("DB failure between wallet mutations rolls back both balances and wager",async()=>{
   await pool.query("CREATE FUNCTION fail_wallet_hold() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason='bet_hold' AND EXISTS (SELECT 1 FROM wallet_entries WHERE match_id=NEW.match_id AND reason='bet_hold') THEN RAISE EXCEPTION 'injected test failure on second wallet'; END IF; RETURN NEW; END $$");
   await pool.query("CREATE TRIGGER fail_hold BEFORE INSERT ON wallet_entries FOR EACH ROW EXECUTE FUNCTION fail_wallet_hold()");
   const [red,black]=await pair(),id=randomUUID();
   try{await assert.rejects(()=>betting.hold(id,"ABC234",red.id,black.id,20));}
   finally{await pool.query("DROP TRIGGER fail_hold ON wallet_entries");await pool.query("DROP FUNCTION fail_wallet_hold()");}
   await balances(red,100,0);await balances(black,100,0);assert.equal(await betting.get(id),undefined);
  });
  await t.test("no-bet room starts without wallet transaction; configuration ownership/ready lock",async()=>{
   const f=await roomPair(),original=betting.hold;betting.hold=async()=>{throw new Error("No-bet must not call hold");};
   try{assert.equal((await ready(f,f.red)).status,200);assert.equal((await ready(f,f.black)).status,200);assert.ok(f.room.game);}
   finally{betting.hold=original;}
   await balances(f.red,100,0);assert.equal(f.room.matchId,undefined);
   const g=await roomPair();
   assert.equal((await request(`/casual-rooms/${g.code}/bet`,g.black.token,{stake:10})).status,403);
   for(const stake of [-1,0.5,"10",Number.MAX_SAFE_INTEGER+1])assert.equal((await request(`/casual-rooms/${g.code}/bet`,g.red.token,{stake})).status,400);
   assert.equal((await request(`/casual-rooms/${g.code}/bet`,g.red.token,{stake:101})).status,409);
   assert.equal((await request(`/casual-rooms/${g.code}/bet`,g.red.token,{stake:20})).status,200);
   await ready(g,g.red);assert.equal((await request(`/casual-rooms/${g.code}/bet`,g.red.token,{stake:10})).status,409);
  });
  await t.test("insufficient guest gold does not hold host gold and clears guest readiness",async()=>{
   const f=await roomPair(20),[opponent]=await pair(),otherId=randomUUID();
   await betting.hold(otherId,"DEF234",f.black.id,opponent.id,90);
   await ready(f,f.red);const response=await ready(f,f.black);assert.equal(response.status,409);assert.equal((await response.json()).code,"INSUFFICIENT_GOLD");
   assert.equal(f.room.game,null);assert.equal(f.room.red.ready,true);assert.equal(f.room.black.ready,false);
   await balances(f.red,100,0);await balances(f.black,10,90);
   await betting.finish(otherId,{status:"cancelled",reason:"both_disconnected"});
  });
  await t.test("simultaneous HTTP ready + retry commits only one match/hold; socket result settles",async()=>{
   const f=await roomPair(20);let sentPlayingBeforeCommit=false;const original=betting.hold;
   const playing=waitState(f.sr,state=>state.game?.result.status==="playing");
   betting.hold=async(...args)=>{assert.equal(f.room.game,null);return original.apply(betting,args);};
   const listener=state=>{if(state.game?.result.status==="playing"&&f.room.betStatus!=="held")sentPlayingBeforeCommit=true;};f.sr.on("game:state",listener);
   try{const results=await Promise.all([ready(f,f.red),ready(f,f.black),ready(f,f.black)]);assert.ok(results.every(r=>r.status===200));}
   finally{betting.hold=original;f.sr.off("game:state",listener);}
   assert.equal((await playing).bet.status,"held");
   assert.equal(sentPlayingBeforeCommit,false);const id=f.room.matchId;assert.ok(id);assert.equal((await ready(f,f.red)).status,200);assert.equal(f.room.matchId,id);
   await balances(f.red,80,20);await balances(f.black,80,20);assert.equal((await wallet.history(f.red.id)).items.length,2);
   const settled=waitState(f.sb,state=>state.bet?.status==="settled");
   await resign(f);await balances(f.red,80,0);await balances(f.black,125,0);assert.equal((await betting.get(id)).status,"settled");
   assert.equal((await settled).game.result.reason,"resignation");
  });
  await t.test("match draw agreement over real Socket.IO refunds held gold exactly once",async()=>{
   const f=await roomPair(20);await ready(f,f.red);await ready(f,f.black);
   const snap=async socket=>(await socket.timeout(4000).emitWithAck("match:snapshot",{})).snapshot;
   const initial=await snap(f.sr);assert.equal(initial.matchId,f.room.matchId);
   const offer={matchId:initial.matchId,requestId:randomUUID(),expectedVersion:initial.stateVersion};
   const offered=await f.sr.timeout(4000).emitWithAck("match:draw:offer",offer);assert.equal(offered.ok,true);
   assert.deepEqual(await f.sr.timeout(4000).emitWithAck("match:draw:offer",offer),offered);
   const accept={matchId:initial.matchId,requestId:randomUUID(),expectedVersion:(await snap(f.sb)).stateVersion,offerId:offer.requestId};
   assert.equal((await f.sb.timeout(4000).emitWithAck("match:draw:accept",accept)).ok,true);
   await durableDone(f.room);assert.equal((await betting.get(initial.matchId)).status,"refunded");
   assert.deepEqual((await betting.get(initial.matchId)).result,{status:"draw",reason:"agreement"});
   await balances(f.red,100,0);await balances(f.black,100,0);
   const retry=await f.sb.timeout(4000).emitWithAck("match:draw:accept",accept);assert.equal(retry.code,"match_not_active");
   assert.equal((await wallet.history(f.red.id)).items.length,3);assert.equal((await snap(f.sr)).status,"finished");
  });
  await t.test("lost hold commit response refunds once instead of starting an unconfirmed game",async()=>{
   const f=await roomPair(20),original=betting.hold;
   betting.hold=async(...args)=>{await original.apply(betting,args);throw new Error("Lost commit response");};
   try{await ready(f,f.red);assert.equal((await ready(f,f.black)).status,503);}
   finally{betting.hold=original;}
   assert.equal(f.room.game,null);await balances(f.red,100,0);await balances(f.black,100,0);assert.equal(f.room.cleanupPending,false);
  });
  await t.test("disconnect while hold is committing aborts start and refunds both",async()=>{
   const f=await roomPair(20),original=betting.hold;
   betting.hold=async(...args)=>{const bet=await original.apply(betting,args);rooms.releaseSocket({roomCode:f.code,seat:"black"},f.sb.id);return bet;};
   try{await ready(f,f.red);assert.equal((await ready(f,f.black)).status,409);}
   finally{betting.hold=original;}
   assert.equal(f.room.game,null);await balances(f.red,100,0);await balances(f.black,100,0);
  });
  await t.test("unknown hold commit plus DB outage blocks new starts until refund retry succeeds",async()=>{
   const f=await roomPair(20),originalHold=betting.hold,originalGet=betting.get;
   betting.hold=async(...args)=>{await originalHold.apply(betting,args);throw new Error("Lost hold acknowledgement");};
   betting.get=async()=>{throw new Error("DB still unavailable");};
   let firstId;
   try{
    await ready(f,f.red);assert.equal((await ready(f,f.black)).status,503);firstId=f.room.matchId;
    assert.equal(f.room.cleanupPending,true);assert.equal(f.room.game,null);
    assert.equal((await ready(f,f.red)).status,409);await balances(f.red,80,20);await balances(f.black,80,20);
   }finally{betting.hold=originalHold;betting.get=originalGet;}
   await rooms.retrySettlements();await balances(f.red,100,0);await balances(f.black,100,0);assert.equal(f.room.cleanupPending,false);
   await ready(f,f.red);assert.equal((await ready(f,f.black)).status,200);assert.notEqual(f.room.matchId,firstId);await resign(f);
  });
  await t.test("payout failure after the first ledger write rolls back both wallets",async()=>{
   const f=await held();await betting.recordResult(f.id,win);
   await pool.query("CREATE FUNCTION fail_wallet_payout() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason='bet_payout' AND EXISTS (SELECT 1 FROM wallet_entries WHERE match_id=NEW.match_id AND reason='bet_payout') THEN RAISE EXCEPTION 'injected second payout failure'; END IF; RETURN NEW; END $$");
   await pool.query("CREATE TRIGGER fail_payout BEFORE INSERT ON wallet_entries FOR EACH ROW EXECUTE FUNCTION fail_wallet_payout()");
   try{await assert.rejects(()=>betting.settle(f.id));}
   finally{await pool.query("DROP TRIGGER fail_payout ON wallet_entries");await pool.query("DROP FUNCTION fail_wallet_payout()");}
   await balances(f.red,80,20);await balances(f.black,80,20);assert.equal((await betting.get(f.id)).status,"result_pending");
   await betting.settle(f.id);await balances(f.red,120,0);await balances(f.black,80,0);
  });
  await t.test("result_pending remains held on payout failure; retry settles once",async()=>{
   const f=await roomPair(20);await ready(f,f.red);await ready(f,f.black);
   const original=betting.settle;betting.settle=async()=>{throw new Error("Injected payout failure");};
   try{await resign(f);assert.equal((await betting.get(f.room.matchId)).status,"result_pending");await balances(f.red,80,20);await balances(f.black,85,20);assert.equal(rooms.publicGameState(f.code).bet.pending,true);}
   finally{betting.settle=original;}
   await rooms.retrySettlements();await balances(f.red,80,0);await balances(f.black,125,0);await rooms.retrySettlements();await balances(f.black,125,0);
  });
  await t.test("UI-visible result not saved durably is refunded on simulated restart",async()=>{
   const f=await roomPair(20);await ready(f,f.red);await ready(f,f.black);
   const original=betting.recordResult;betting.recordResult=async()=>{throw new Error("Injected result write failure");};
   try{await resign(f);assert.equal(f.room.game.result.status,"finished");assert.equal((await betting.get(f.room.matchId)).status,"held");}
   finally{betting.recordResult=original;}
   // Simulate the old process disappearing: its in-memory retry is no longer running.
   rooms.retryRooms.delete(f.room);
   await new BettingService(app.get(DatabaseService),wallet).recover();
   await balances(f.red,100,0);await balances(f.black,105,0);assert.equal((await betting.get(f.room.matchId)).status,"refunded");
  });
  await t.test("clock terminal result reaches wager settlement through timer, no request needed",async()=>{
   const f=await roomPair(10);await ready(f,f.red);await ready(f,f.black);now=f.room.gameClock.turnStartedAt+60000;
   for(const task of [...roomTimers])if(task.at<=now){roomTimers.delete(task);task.callback();}
   await durableDone(f.room);assert.equal((await betting.get(f.room.matchId)).result.reason,"turn_timeout");
   await balances(f.red,90,0);await balances(f.black,115,0);assert.equal(f.room.betStatus,"settled");
  });
  await t.test("single-backend advisory lock rejects concurrent runtime owners",async()=>{
   const a=new DatabaseService(),b=new DatabaseService();
   // Separate lock slot so a normal dev backend can remain running during tests.
   const slot=2+parseInt(randomUUID().slice(0,6),16);
   try{await a.acquireGameRuntime(slot);await assert.rejects(()=>b.acquireGameRuntime(slot));}
   finally{await a.onApplicationShutdown();await b.onApplicationShutdown();}
  });
  await t.test("shutdown drains a committing hold before the runtime lock can be released",async()=>{
   const [red,black]=await pair();
   const local=new RoomsService(()=>"XYZ234",{now:()=>1000,schedule:()=>()=>{}},betting,wallet);
   const profile=u=>({id:u.id,email:u.email,nickname:u.id,avatar:{id:"default",name:"Default",assetPath:null}});
   local.createCasual(profile(red),"earth");local.joinCasual("XYZ234",profile(black));
   for(const side of ["red","black"]){local.claimSocket({roomCode:"XYZ234",seat:side},side);local.markSocketAttached({roomCode:"XYZ234",seat:side},side);}
   await local.setBet("XYZ234",red.id,20);local.setReady("XYZ234",red.id,true);
   let entered,release;const committed=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
   const original=betting.hold;
   betting.hold=async(...args)=>{const held=await original.apply(betting,args);entered();await gate;return held;};
   try{
    const start=local.setReady("XYZ234",black.id,true);const rejected=assert.rejects(()=>start);
    await committed;let drained=false;const drain=local.onModuleDestroy().then(()=>{drained=true;});
    await new Promise(resolve=>setImmediate(resolve));assert.equal(drained,false);
    release();await rejected;await drain;await balances(red,100,0);await balances(black,100,0);
   }finally{release();betting.hold=original;await local.onModuleDestroy();}
  });
 }finally{
  for(const socket of sockets)socket.disconnect();
  if(app)await app.close();if(pool)await pool.end();
  // Only the generated test schema is eligible for deletion.
  assert.match(testSchema,/^wallet_test_[0-9a-f]{32}$/);
  await admin.query(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);await admin.end();
 }
});
