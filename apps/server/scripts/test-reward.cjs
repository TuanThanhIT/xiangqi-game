// PostgreSQL integration for casual rewards. Uses a random schema and never writes public game data.
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
const {eq}=require("drizzle-orm");
const {databaseUrl}=require("../dist/db/config.js");
const schema=require("../dist/db/schema.js");
const {DatabaseService}=require("../dist/db/database.service.js");
const {WalletService}=require("../dist/wallet/wallet.service.js");
const {BettingService}=require("../dist/wallet/betting.service.js");
const {MatchRewardService}=require("../dist/wallet/match-reward.service.js");
const {hashPassword}=require("../dist/auth/password.js");

test("Reward: isolated PostgreSQL and durable idempotency",{timeout:90000},async t=>{
 const testSchema="reward_test_"+randomUUID().replaceAll("-","");
 assert.match(testSchema,/^reward_test_[0-9a-f]{32}$/);
 const admin=new Pool({connectionString:databaseUrl(),connectionTimeoutMillis:5000});let pool,tempMigrations;
 try{
  assert.equal((await admin.query("select current_database() as name")).rows[0].name,"xiangqi_dev");
  await admin.query(`CREATE SCHEMA "${testSchema}"`);
  pool=new Pool({connectionString:databaseUrl(),options:`-c search_path=${testSchema}`,connectionTimeoutMillis:5000});
  const names=["0000_cultured_marten_broadcloak.sql","0001_dear_proteus.sql","0002_colorful_titanium_man.sql","0003_thin_payback.sql","0004_shallow_blacklash.sql","0005_secret_sabretooth.sql","0006_peaceful_mongoose.sql","0007_fearless_human_fly.sql"];
  tempMigrations=mkdtempSync(resolve(tmpdir(),"xiangqi-reward-migrations-"));mkdirSync(resolve(tempMigrations,"meta"));
  for(const name of names)writeFileSync(resolve(tempMigrations,name),readFileSync(resolve(__dirname,"../drizzle",name),"utf8").replaceAll('"public".',`"${testSchema}".`));
  writeFileSync(resolve(tempMigrations,"meta","_journal.json"),readFileSync(resolve(__dirname,"../drizzle/meta/_journal.json"),"utf8"));
  const db=drizzle(pool,{schema}),database={db},migrationSchema=`${testSchema}_migrations`;
  await migrate(db,{migrationsFolder:tempMigrations,migrationsSchema:migrationSchema});
  await migrate(db,{migrationsFolder:tempMigrations,migrationsSchema:migrationSchema});
  assert.equal((await admin.query(`select count(*)::int as count from "${migrationSchema}"."__drizzle_migrations"`)).rows[0].count,8);
  const wallet=new WalletService(database),betting=new BettingService(database,wallet),rewards=new MatchRewardService(database,wallet);
  const passwordHash=await hashPassword("Reward-test-only-password-2026");
  async function user(){const id=randomUUID();await db.insert(schema.accounts).values({id,email:`reward-${id}@example.test`,nickname:`Reward ${id}`,passwordHash,emailVerifiedAt:new Date()});return {id};}
  async function fixture(){const red=await user(),black=await user();return {matchId:randomUUID(),roomCode:"ABC234",redAccountId:red.id,blackAccountId:black.id,red,black};}
  const result=(reason,winner="red")=>({status:"finished",winner,loser:winner==="red"?"black":"red",reason});
  async function balance(id){return (await wallet.balance(id)).availableGold;}

  await t.test("allowlist credits exactly five and creates a separate ledger entry",async()=>{
   for(const reason of ["checkmate","stalemate","total_timeout","turn_timeout","resignation"]){
    const f=await fixture();const row=await rewards.finish({...f,result:result(reason)});
    assert.equal(row.rewardStatus,"credited");assert.equal(row.rewardAmount,5);assert.equal(await balance(f.red.id),105);assert.equal(await balance(f.black.id),100);
    const history=await wallet.history(f.red.id);assert.equal(history.items[0].reason,"casual_match_win_reward");assert.equal(history.items[0].matchId,f.matchId);assert.equal(history.items[0].availableDelta,5);
   }
  });
  await t.test("disconnect, draw and cancellation persist as not eligible",async()=>{
   for(const resultValue of [result("disconnect_timeout"),{status:"draw",reason:"agreement"},{status:"cancelled",reason:"both_disconnected"},{status:"cancelled",reason:"backend_restart"}]){
    const f=await fixture(),row=await rewards.finish({...f,result:resultValue});assert.equal(row.rewardStatus,"not_eligible");
    assert.equal(await balance(f.red.id),100);assert.equal(await balance(f.black.id),100);
   }
  });
  await t.test("duplicate and concurrent retry credit once; conflicting result is rejected",async()=>{
   const f=await fixture(),input={...f,result:result("checkmate")};
   await Promise.all(Array.from({length:12},()=>rewards.finish(input)));await rewards.finish(input);
   assert.equal(await balance(f.red.id),105);
   assert.equal((await db.select().from(schema.walletEntries).where(eq(schema.walletEntries.rewardMatchId,f.matchId))).length,1);
   await assert.rejects(()=>rewards.finish({...f,result:result("turn_timeout","black")}));
  });
  await t.test("reward rollback stays pending and retry credits once",async()=>{
   const f=await fixture(),input={...f,result:result("checkmate")};await rewards.record(input);
   await pool.query(`CREATE FUNCTION "${testSchema}".fail_reward() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason='casual_match_win_reward' THEN RAISE EXCEPTION 'injected reward failure'; END IF; RETURN NEW; END $$`);
   await pool.query(`CREATE TRIGGER fail_reward BEFORE INSERT ON "${testSchema}".wallet_entries FOR EACH ROW EXECUTE FUNCTION "${testSchema}".fail_reward()`);
   await assert.rejects(()=>rewards.credit(f.matchId));assert.equal(await balance(f.red.id),100);assert.equal((await rewards.get(f.matchId)).rewardStatus,"pending");
   await pool.query(`DROP TRIGGER fail_reward ON "${testSchema}".wallet_entries`);await rewards.recover();await rewards.recover();assert.equal(await balance(f.red.id),105);
  });
  await t.test("wager settlement and reward are independent ledger operations",async()=>{
   const f=await fixture();await betting.hold(f.matchId,f.roomCode,f.red.id,f.black.id,20);
   await betting.finish(f.matchId,result("resignation"));await rewards.finish({...f,result:result("resignation")});
   assert.equal(await balance(f.red.id),125);assert.equal(await balance(f.black.id),80);
   const reasons=(await wallet.history(f.red.id,undefined,10)).items.map(x=>x.reason);assert.ok(reasons.includes("bet_payout"));assert.ok(reasons.includes("casual_match_win_reward"));
  });
 }finally{
  if(pool)await pool.end();
  if(/^reward_test_[0-9a-f]{32}$/.test(testSchema))await admin.query(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
  if(/^reward_test_[0-9a-f]{32}$/.test(testSchema))await admin.query(`DROP SCHEMA IF EXISTS "${testSchema}_migrations" CASCADE`);
  if(tempMigrations)rmSync(tempMigrations,{recursive:true,force:true});
  await admin.end();
 }
});
