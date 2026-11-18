require("reflect-metadata");
const test=require("node:test"),assert=require("node:assert/strict");
const {randomUUID}=require("node:crypto");
const {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync}=require("node:fs"),{tmpdir}=require("node:os"),{resolve}=require("node:path");
const {Pool}=require("pg"),{drizzle}=require("drizzle-orm/node-postgres"),{migrate}=require("drizzle-orm/node-postgres/migrator"),{and,eq}=require("drizzle-orm");
const {NestFactory}=require("@nestjs/core"),{databaseUrl}=require("../dist/db/config.js"),schema=require("../dist/db/schema.js");
const {DatabaseService}=require("../dist/db/database.service.js"),{AppModule}=require("../dist/app.module.js"),{configureHttp}=require("../dist/configure-http.js");
const {MissionService,weeklyPeriodKey,nextWeeklyReset}=require("../dist/missions/mission.service.js");
const {contributionSummaries}=require("../dist/missions/mission-contribution.js"),{WalletService}=require("../dist/wallet/wallet.service.js"),{hashPassword}=require("../dist/auth/password.js");

test("Missions: catalog, contribution, periods, progress, claim and API",{timeout:120000},async t=>{
 const testSchema="mission_test_"+randomUUID().replaceAll("-","");assert.match(testSchema,/^mission_test_[0-9a-f]{32}$/);
 const admin=new Pool({connectionString:databaseUrl(),connectionTimeoutMillis:5000});let pool,app,temp;
 try{
  assert.equal((await admin.query("select current_database() name")).rows[0].name,"xiangqi_dev");await admin.query(`CREATE SCHEMA "${testSchema}"`);
  pool=new Pool({connectionString:databaseUrl(),options:`-c search_path=${testSchema}`,connectionTimeoutMillis:5000});const db=drizzle(pool,{schema});
  const names=["0000_cultured_marten_broadcloak.sql","0001_dear_proteus.sql","0002_colorful_titanium_man.sql","0003_thin_payback.sql","0004_shallow_blacklash.sql","0005_secret_sabretooth.sql","0006_peaceful_mongoose.sql","0007_fearless_human_fly.sql","0008_futuristic_romulus.sql"];
  temp=mkdtempSync(resolve(tmpdir(),"xiangqi-mission-migrations-"));mkdirSync(resolve(temp,"meta"));
  for(const name of names)writeFileSync(resolve(temp,name),readFileSync(resolve(__dirname,"../drizzle",name),"utf8").replaceAll('"public".',`"${testSchema}".`));
  writeFileSync(resolve(temp,"meta","_journal.json"),readFileSync(resolve(__dirname,"../drizzle/meta/_journal.json"),"utf8"));const migrationSchema=`${testSchema}_migrations`;
  await migrate(db,{migrationsFolder:temp,migrationsSchema:migrationSchema});await migrate(db,{migrationsFolder:temp,migrationsSchema:migrationSchema});
  assert.equal((await admin.query(`select count(*)::int count from "${migrationSchema}"."__drizzle_migrations"`)).rows[0].count,9);
  app=await NestFactory.create(AppModule,{logger:false,abortOnError:false,bodyParser:false});app.get(DatabaseService).db=db;
  const service=app.get(MissionService),wallet=app.get(WalletService);let now=new Date("2026-11-16T05:00:00.000Z");service.clock={now:()=>new Date(now)};
  const password="Mission-test-password-2026",passwordHash=await hashPassword(password);
  async function user(){const id=randomUUID(),email=`mission-${id}@example.test`;await db.insert(schema.accounts).values({id,email,nickname:`Mission ${id}`,passwordHash,emailVerifiedAt:new Date()});return{id,email};}
  const input=(matchId,at,red,black,overrides={})=>({matchId,resultStatus:"finished",reason:"checkmate",resultAt:new Date(at),contributions:[
    {accountId:red.id,completedMatches:1,wins:1,captures:5,cannonCaptures:1,itemUsages:1,wonWithoutItem:0,...overrides.red},
    {accountId:black.id,completedMatches:1,wins:0,captures:0,cannonCaptures:0,itemUsages:0,wonWithoutItem:0,...overrides.black}]});

  await t.test("catalog has exact 7 daily, 8 weekly and 10 achievement definitions",async()=>{const rows=await db.select().from(schema.missionDefinitions);assert.equal(rows.length,25);
   assert.deepEqual(Object.fromEntries(["daily","weekly","achievement"].map(c=>[c,rows.filter(x=>x.category===c).length])),{daily:7,weekly:8,achievement:10});
   const d=rows.find(x=>x.code==="daily_complete_3"),w=rows.find(x=>x.code==="weekly_win_10"),a=rows.find(x=>x.code==="achievement_win_100");assert.deepEqual([d.target,d.rewardGold,w.target,w.rewardGold,a.target,a.rewardGold],[3,10,10,50,100,250]);
  });
  await t.test("eligibility matrix counts captures, revived cannon recapture and successful items only",()=>{const accounts={red:randomUUID(),black:randomUUID()};
   const captures=[{id:"b-cannon",side:"black",type:"cannon",position:{row:1,col:1}},{id:"b-cannon",side:"black",type:"cannon",position:{row:1,col:1}}];
   for(const reason of ["checkmate","stalemate","total_timeout","turn_timeout"]){const rows=contributionSummaries({status:"finished",winner:"red",loser:"black",reason},accounts,captures,[{side:"black"}]);assert.deepEqual(rows.map(x=>[x.completedMatches,x.wins,x.captures,x.cannonCaptures,x.itemUsages,x.wonWithoutItem]),[[1,1,2,2,0,1],[1,0,0,0,1,0]]);}
   let rows=contributionSummaries({status:"finished",winner:"red",loser:"black",reason:"resignation"},accounts,captures,[{side:"black"}]);assert.deepEqual(rows.map(x=>[x.completedMatches,x.captures,x.itemUsages]),[[1,2,0],[0,0,0]]);
   rows=contributionSummaries({status:"draw",reason:"agreement"},accounts,captures,[{side:"red"}]);assert.deepEqual(rows.map(x=>[x.completedMatches,x.wins,x.itemUsages]),[[1,0,1],[1,0,0]]);
   for(const result of [{status:"finished",winner:"red",loser:"black",reason:"disconnect_timeout"},{status:"cancelled",reason:"both_disconnected"}])assert.ok(contributionSummaries(result,accounts,captures,[{side:"red"}]).every(x=>x.completedMatches+x.captures+x.itemUsages===0));
  });
  await t.test("daily/weekly/lifetime progress updates shared metrics once under concurrent retry",async()=>{const red=await user(),black=await user(),matchId=randomUUID(),value=input(matchId,now,red,black);
   await Promise.all(Array.from({length:8},()=>service.finish(value)));const rows=await db.select().from(schema.missionProgress).where(eq(schema.missionProgress.accountId,red.id));
   assert.equal(rows.find(x=>x.missionCode==="daily_complete_1").status,"completed");assert.equal(rows.find(x=>x.missionCode==="daily_complete_3").progress,1);
   assert.equal(rows.find(x=>x.missionCode==="daily_capture_5").status,"completed");assert.equal(rows.find(x=>x.missionCode==="daily_capture_cannon").status,"completed");
   assert.equal(rows.find(x=>x.missionCode==="weekly_capture_40").progress,5);assert.equal(rows.find(x=>x.missionCode==="achievement_first_win").status,"completed");
   assert.equal((await db.select().from(schema.missionContributions).where(eq(schema.missionContributions.matchId,matchId))).length,2);
  });
  await t.test("lost record response and restart recovery apply one contribution only",async()=>{const red=await user(),black=await user(),matchId=randomUUID(),value=input(matchId,now,red,black,{red:{captures:0,cannonCaptures:0,itemUsages:0,wonWithoutItem:1}});
   await service.record(value);await service.record(value);assert.equal(await service.recover(),1);assert.equal(await service.recover(),0);
   const rows=await db.select().from(schema.missionProgress).where(and(eq(schema.missionProgress.accountId,red.id),eq(schema.missionProgress.missionCode,"daily_complete_1")));assert.equal(rows.length,1);assert.equal(rows[0].progress,1);
  });
  await t.test("Vietnam daily and Monday weekly boundaries create new periods without carry",async()=>{const red=await user(),black=await user();
   await service.finish(input(randomUUID(),"2026-11-15T16:59:59Z",red,black));await service.finish(input(randomUUID(),"2026-11-15T17:00:00Z",red,black));
   const rows=await db.select().from(schema.missionProgress).where(and(eq(schema.missionProgress.accountId,red.id),eq(schema.missionProgress.missionCode,"weekly_complete_10")));
   assert.deepEqual(rows.map(x=>[x.periodKey,x.progress]).sort(),[["2026-11-09",1],["2026-11-16",1]]);assert.equal(weeklyPeriodKey("2026-11-15"),"2026-11-09");assert.equal(weeklyPeriodKey("2026-11-16"),"2026-11-16");
   assert.equal(nextWeeklyReset(new Date("2026-11-15T16:59:59Z")).toISOString(),"2026-11-15T17:00:00.000Z");
  });
  await t.test("achievement accumulates across dates and completed reward claims atomically once",async()=>{const red=await user(),black=await user();for(let i=0;i<10;i++)await service.finish(input(randomUUID(),new Date(Date.parse("2026-10-01T05:00:00Z")+i*86400000),red,black,{red:{captures:0,cannonCaptures:0,itemUsages:0,wonWithoutItem:1}}));
   const progress=(await db.select().from(schema.missionProgress).where(and(eq(schema.missionProgress.accountId,red.id),eq(schema.missionProgress.missionCode,"achievement_win_10"))))[0];assert.equal(progress.status,"completed");assert.equal(progress.progress,10);
   now=new Date("2026-12-01T05:00:00Z");const results=await Promise.allSettled(Array.from({length:8},()=>service.claim(red.id,"achievement_win_10")));assert.equal(results.filter(x=>x.status==="fulfilled").length,1);assert.equal((await wallet.balance(red.id)).availableGold,150);
   const entries=(await db.select().from(schema.walletEntries).where(and(eq(schema.walletEntries.accountId,red.id),eq(schema.walletEntries.reason,"mission_reward"))));assert.equal(entries.length,1);assert.equal(entries[0].metadata.missionCode,"achievement_win_10");
  });
  await t.test("not completed, expired, rollback and retry never credit twice or change held gold",async()=>{const red=await user(),black=await user();await assert.rejects(()=>service.claim(red.id,"daily_win_1"),e=>e.response.code==="mission_not_completed");
   now=new Date("2026-11-16T05:00:00Z");await service.finish(input(randomUUID(),now,red,black,{red:{itemUsages:0,wonWithoutItem:1}}));await db.update(schema.wallets).set({availableGold:80,heldGold:20}).where(eq(schema.wallets.accountId,red.id));
   await pool.query("CREATE FUNCTION fail_mission_reward() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason='mission_reward' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$");await pool.query("CREATE TRIGGER fail_mission_reward BEFORE INSERT ON wallet_entries FOR EACH ROW EXECUTE FUNCTION fail_mission_reward()");
   try{await assert.rejects(()=>service.claim(red.id,"daily_win_1"));}finally{await pool.query("DROP TRIGGER fail_mission_reward ON wallet_entries");await pool.query("DROP FUNCTION fail_mission_reward()")};assert.deepEqual(await wallet.balance(red.id),{availableGold:80,heldGold:20,totalGold:100,version:1});
   const claimed=await service.claim(red.id,"daily_win_1");assert.equal(claimed.walletBalance,90);await assert.rejects(()=>service.claim(red.id,"daily_win_1"),e=>e.response.code==="mission_already_claimed");assert.equal((await wallet.balance(red.id)).heldGold,20);
   const late=await user(),opponent=await user();now=new Date("2026-11-16T05:00:00Z");await service.finish(input(randomUUID(),now,late,opponent));now=new Date("2026-11-17T05:00:00Z");await service.list(late.id,"daily");await assert.rejects(()=>service.claim(late.id,"daily_win_1"),e=>e.response.code==="mission_expired");
   const expired=(await db.select().from(schema.missionProgress).where(and(eq(schema.missionProgress.accountId,late.id),eq(schema.missionProgress.missionCode,"daily_win_1"))))[0];assert.equal(expired.status,"expired");
  });
  await t.test("authenticated API owns identity and rejects category or forged claim body",async()=>{configureHttp(app);await app.listen(0,"127.0.0.1");const base=await app.getUrl(),u=await user();
   const request=(path,token,body,method=body===undefined?"GET":"POST")=>fetch(base+path,{method,headers:{Origin:"http://localhost:3000","Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
   assert.equal((await request("/missions")).status,401);let response=await request("/auth/login",null,{email:u.email,password});const token=(await response.json()).accessToken;
   assert.equal((await request("/missions?category=ranked",token)).status,400);assert.equal((await request("/missions/daily_win_1/claim",token,{accountId:randomUUID(),progress:99,amount:999})).status,409);
   response=await request("/missions?category=daily",token);assert.equal(response.status,200);const body=await response.json();assert.equal(body.missions.length,7);assert.equal(body.timezone,"Asia/Ho_Chi_Minh");assert.ok(body.missions.every(x=>x.periodKey));
  });
 }finally{if(app)await app.close();if(pool)await pool.end();if(/^mission_test_[0-9a-f]{32}$/.test(testSchema)){await admin.query(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);await admin.query(`DROP SCHEMA IF EXISTS "${testSchema}_migrations" CASCADE`);}if(temp)rmSync(temp,{recursive:true,force:true});await admin.end();}
});
