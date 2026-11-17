require("reflect-metadata");
const test=require("node:test");
const assert=require("node:assert/strict");
const {randomUUID}=require("node:crypto");
const {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync}=require("node:fs");
const {tmpdir}=require("node:os");
const {resolve}=require("node:path");
const {Pool}=require("pg");
const {drizzle}=require("drizzle-orm/node-postgres");
const {migrate}=require("drizzle-orm/node-postgres/migrator");
const {and,eq}=require("drizzle-orm");
const {NestFactory}=require("@nestjs/core");
const {databaseUrl}=require("../dist/db/config.js");
const schema=require("../dist/db/schema.js");
const {DatabaseService}=require("../dist/db/database.service.js");
const {AppModule}=require("../dist/app.module.js");
const {configureHttp}=require("../dist/configure-http.js");
const {CheckInService,vietnamDate,nextVietnamReset}=require("../dist/check-in/check-in.service.js");
const {WalletService}=require("../dist/wallet/wallet.service.js");
const {hashPassword}=require("../dist/auth/password.js");

test("Daily check-in: isolated PostgreSQL, cycle, wallet and HTTP",{timeout:90000},async t=>{
 const testSchema="check_in_test_"+randomUUID().replaceAll("-","");assert.match(testSchema,/^check_in_test_[0-9a-f]{32}$/);
 const admin=new Pool({connectionString:databaseUrl(),connectionTimeoutMillis:5000});let pool,app,temp;
 try{
  assert.equal((await admin.query("select current_database() as name")).rows[0].name,"xiangqi_dev");await admin.query(`CREATE SCHEMA "${testSchema}"`);
  pool=new Pool({connectionString:databaseUrl(),options:`-c search_path=${testSchema}`,connectionTimeoutMillis:5000});const db=drizzle(pool,{schema});
  const names=["0000_cultured_marten_broadcloak.sql","0001_dear_proteus.sql","0002_colorful_titanium_man.sql","0003_thin_payback.sql","0004_shallow_blacklash.sql","0005_secret_sabretooth.sql","0006_peaceful_mongoose.sql","0007_fearless_human_fly.sql"];
  temp=mkdtempSync(resolve(tmpdir(),"xiangqi-check-in-migrations-"));mkdirSync(resolve(temp,"meta"));
  for(const name of names)writeFileSync(resolve(temp,name),readFileSync(resolve(__dirname,"../drizzle",name),"utf8").replaceAll('"public".',`"${testSchema}".`));
  writeFileSync(resolve(temp,"meta","_journal.json"),readFileSync(resolve(__dirname,"../drizzle/meta/_journal.json"),"utf8"));
  const migrationSchema=`${testSchema}_migrations`;await migrate(db,{migrationsFolder:temp,migrationsSchema:migrationSchema});await migrate(db,{migrationsFolder:temp,migrationsSchema:migrationSchema});
  assert.equal((await admin.query(`select count(*)::int count from "${migrationSchema}"."__drizzle_migrations"`)).rows[0].count,8);
  app=await NestFactory.create(AppModule,{logger:false,abortOnError:false,bodyParser:false});app.get(DatabaseService).db=db;
  const service=app.get(CheckInService),wallet=app.get(WalletService);let now=new Date("2026-01-01T05:00:00.000Z");service.clock={now:()=>new Date(now)};
  const password="Check-in-test-password-2026",passwordHash=await hashPassword(password);
  async function user(){const id=randomUUID(),email=`check-in-${id}@example.test`;await db.insert(schema.accounts).values({id,email,nickname:`Check ${id}`,passwordHash,emailVerifiedAt:new Date()});return{id,email};}
  const set=(iso)=>{now=new Date(iso);},balance=id=>wallet.balance(id),claims=id=>db.select().from(schema.dailyCheckIns).where(eq(schema.dailyCheckIns.accountId,id));

  await t.test("30-day policy, weekly milestones, day 30 and wrap preserve consecutive days",async()=>{
   const u=await user(),start=Date.parse("2026-01-01T05:00:00.000Z");let total=0;
   for(let day=1;day<=30;day++){now=new Date(start+(day-1)*86400000);const claim=await service.claim(u.id);total+=claim.totalReward;
    assert.equal(claim.cycleDay,day);assert.equal(claim.consecutiveDays,day);
    if([7,14,21,28].includes(day)){assert.equal(claim.weeklyBonus,50);assert.equal(claim.totalReward,70);}
    if(day===30){assert.equal(claim.weeklyBonus,0);assert.equal(claim.monthlyBonus,200);assert.equal(claim.totalReward,220);}}
   assert.equal(total,1000);assert.equal((await balance(u.id)).availableGold,1100);
   now=new Date(start+30*86400000);const wrapped=await service.claim(u.id);assert.equal(wrapped.cycleDay,1);assert.equal(wrapped.consecutiveDays,31);assert.equal(wrapped.totalReward,20);
   const entries=await db.select().from(schema.walletEntries).where(eq(schema.walletEntries.accountId,u.id));
   assert.equal(entries.filter(x=>x.reason==="daily_check_in_reward").length,31);assert.equal(entries.filter(x=>x.reason==="check_in_7_day_bonus").length,4);assert.equal(entries.filter(x=>x.reason==="check_in_30_day_bonus").length,1);
   const weekly=entries.find(x=>x.reason==="check_in_7_day_bonus");assert.equal(weekly.availableDelta,50);assert.equal(weekly.metadata.cycleVersion,"daily_check_in_v1");assert.ok(weekly.checkInId);
  });
  await t.test("missed local date resets cycle and consecutive days",async()=>{const u=await user();set("2026-02-01T05:00:00Z");await service.claim(u.id);set("2026-02-03T05:00:00Z");const c=await service.claim(u.id);assert.equal(c.cycleDay,1);assert.equal(c.consecutiveDays,1);});
  await t.test("same-day and concurrent retries return one durable claim",async()=>{const u=await user();set("2026-03-01T05:00:00Z");const values=await Promise.all(Array.from({length:12},()=>service.claim(u.id)));assert.ok(values.every(v=>v.checkInId===values[0].checkInId));assert.equal((await claims(u.id)).length,1);assert.equal((await balance(u.id)).availableGold,120);assert.deepEqual(await service.claim(u.id),values[0]);});
  await t.test("rollback changes neither claim nor wallet; held gold is preserved",async()=>{const u=await user();await db.update(schema.wallets).set({availableGold:80,heldGold:20}).where(eq(schema.wallets.accountId,u.id));set("2026-04-01T05:00:00Z");
   await pool.query("CREATE FUNCTION fail_check_in() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason='daily_check_in_reward' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$");await pool.query("CREATE TRIGGER fail_check_in BEFORE INSERT ON wallet_entries FOR EACH ROW EXECUTE FUNCTION fail_check_in()");
   try{await assert.rejects(()=>service.claim(u.id));}finally{await pool.query("DROP TRIGGER fail_check_in ON wallet_entries");await pool.query("DROP FUNCTION fail_check_in()")};
   assert.equal((await claims(u.id)).length,0);assert.deepEqual(await balance(u.id),{availableGold:80,heldGold:20,totalGold:100,version:1});const c=await service.claim(u.id);assert.equal(c.walletBalance,100);assert.equal((await balance(u.id)).heldGold,20);
  });
  await t.test("Vietnam midnight, month/year and leap boundaries use local dates",async()=>{const u=await user();set("2026-12-31T16:59:59Z");assert.equal(vietnamDate(now),"2026-12-31");const a=await service.claim(u.id);set("2026-12-31T17:00:00Z");const b=await service.claim(u.id);assert.equal(b.localDate,"2027-01-01");assert.equal(b.cycleDay,a.cycleDay+1);assert.equal(nextVietnamReset("2027-01-01").toISOString(),"2027-01-01T17:00:00.000Z");
   const leap=await user();set("2028-02-28T05:00:00Z");await service.claim(leap.id);set("2028-02-29T05:00:00Z");assert.equal((await service.claim(leap.id)).cycleDay,2);set("2028-03-01T05:00:00Z");assert.equal((await service.claim(leap.id)).cycleDay,3);
   const month=await user();set("2026-01-31T05:00:00Z");await service.claim(month.id);set("2026-02-01T05:00:00Z");assert.equal((await service.claim(month.id)).cycleDay,2);
  });
  await t.test("authenticated API owns identity, rejects forged fields and exposes status",async()=>{configureHttp(app);await app.listen(0,"127.0.0.1");const base=await app.getUrl(),u=await user();
   const request=(path,token,body,method=body===undefined?"GET":"POST")=>fetch(base+path,{method,headers:{Origin:"http://localhost:3000","Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
   assert.equal((await request("/check-in")).status,401);let response=await request("/auth/login",null,{email:u.email,password});assert.equal(response.status,200);const token=(await response.json()).accessToken;
   assert.equal((await request("/check-in/claim",token,{accountId:randomUUID(),localDate:"2099-01-01",amount:999})).status,400);set("2026-06-01T05:00:00Z");response=await request("/check-in/claim",token,{});assert.equal(response.status,201);const claim=await response.json();assert.equal(claim.totalReward,20);
   const status=await(await request("/check-in",token)).json();assert.equal(status.timezone,"Asia/Ho_Chi_Minh");assert.equal(status.claimedToday,true);assert.equal(status.canClaim,false);assert.equal(status.todayClaim.checkInId,claim.checkInId);
  });
 }finally{if(app)await app.close();if(pool)await pool.end();if(/^check_in_test_[0-9a-f]{32}$/.test(testSchema)){await admin.query(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);await admin.query(`DROP SCHEMA IF EXISTS "${testSchema}_migrations" CASCADE`);}if(temp)rmSync(temp,{recursive:true,force:true});await admin.end();}
});
