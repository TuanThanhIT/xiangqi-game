// PostgreSQL integration in a generated schema; public data is never modified.
require("reflect-metadata");
const test=require("node:test");
const assert=require("node:assert/strict");
const {randomUUID}=require("node:crypto");
const {readFileSync}=require("node:fs");
const {resolve}=require("node:path");
const {Pool}=require("pg");
const {drizzle}=require("drizzle-orm/node-postgres");
const {and,eq,sql}=require("drizzle-orm");
const {NestFactory}=require("@nestjs/core");
const {databaseUrl}=require("../dist/db/config.js");
const schema=require("../dist/db/schema.js");
const {DatabaseService}=require("../dist/db/database.service.js");
const {AppModule}=require("../dist/app.module.js");
const {configureHttp}=require("../dist/configure-http.js");
const {hashPassword}=require("../dist/auth/password.js");
const {CatalogService}=require("../dist/items/catalog.service.js");
const {InventoryService}=require("../dist/items/inventory.service.js");
const {ShopService}=require("../dist/items/shop.service.js");
const {LoadoutService}=require("../dist/items/loadout.service.js");
const {ItemUsageService}=require("../dist/items/item-usage.service.js");
const {WalletService}=require("../dist/wallet/wallet.service.js");
const {BettingService}=require("../dist/wallet/betting.service.js");
const {RoomsService}=require("../dist/rooms/rooms.service.js");

test("shop, inventory and private pre-match loadouts",{timeout:90000},async t=>{
 const testSchema="items_test_"+randomUUID().replaceAll("-","");
 assert.match(testSchema,/^items_test_[0-9a-f]{32}$/);
 const admin=new Pool({connectionString:databaseUrl(),connectionTimeoutMillis:5000});let pool,app;
 try{
  assert.equal((await admin.query("select current_database() as name")).rows[0].name,"xiangqi_dev");
  await admin.query(`CREATE SCHEMA "${testSchema}"`);
  pool=new Pool({connectionString:databaseUrl(),options:`-c search_path=${testSchema}`,connectionTimeoutMillis:5000});
  const db=drizzle(pool,{schema});
  async function migrate(name){const migration=readFileSync(resolve(__dirname,"../drizzle",name),"utf8").replaceAll('"public".',`"${testSchema}".`);const client=await pool.connect();try{await client.query("BEGIN");for(const statement of migration.split("--> statement-breakpoint"))if(statement.trim())await client.query(statement);await client.query("COMMIT");}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}}
  await migrate("0000_cultured_marten_broadcloak.sql");await migrate("0001_dear_proteus.sql");
  const password="Items-test-password-2026",passwordHash=await hashPassword(password);
  async function createUser(verified=true){const id=randomUUID(),email=`items-${id}@example.test`;await db.insert(schema.accounts).values({id,email,nickname:`Player ${id}`,passwordHash,emailVerifiedAt:verified?new Date():null});return{id,email};}
  const old=await createUser(),pending=await createUser(false);
  await migrate("0002_colorful_titanium_man.sql");await migrate("0003_thin_payback.sql");await migrate("0004_shallow_blacklash.sql");await migrate("0005_secret_sabretooth.sql");await migrate("0006_peaceful_mongoose.sql");await migrate("0007_fearless_human_fly.sql");
  app=await NestFactory.create(AppModule,{logger:false,abortOnError:false,bodyParser:false});app.get(DatabaseService).db=db;configureHttp(app);await app.listen(0,"127.0.0.1");
  const catalog=app.get(CatalogService),inventory=app.get(InventoryService),shop=app.get(ShopService),wallet=app.get(WalletService),betting=app.get(BettingService),loadouts=app.get(LoadoutService),usage=app.get(ItemUsageService),rooms=app.get(RoomsService);
  const base=await app.getUrl();
  async function request(path,token,body,method=body===undefined?"GET":"POST"){return fetch(base+path,{method,headers:{Origin:"http://localhost:3000",...(token?{Authorization:`Bearer ${token}`} : {}),"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});}
  async function login(user){const response=await request("/auth/login",null,{email:user.email,password});assert.equal(response.status,200);user.token=(await response.json()).accessToken;return user;}
  async function quantities(accountId){return new Map((await inventory.list(accountId)).map(row=>[row.code,row.quantity]));}

  await t.test("migration seeds approved catalog and grants every trial item exactly once to old and new verified accounts",async()=>{
   const items=await catalog.list();assert.equal(items.length,10);assert.deepEqual(items.map(i=>[i.name,i.priceGold]),[["Trinh sát",30],["Tiết kiệm thời gian",40],["Phá ấn",50],["Phá khiên",50],["Thời áp",60],["Gia hạn",70],["Tĩnh tâm",80],["Khiên",100],["Phong ấn",130],["Hồi sinh",180]]);
   assert.equal((await quantities(old.id)).size,10);assert.ok([...(await quantities(old.id)).values()].every(value=>value===1));
   await Promise.all(Array.from({length:4},()=>db.execute(sql`select grant_inventory_starter(${old.id}::uuid)`)));assert.ok([...(await quantities(old.id)).values()].every(value=>value===1));
   await db.update(schema.accounts).set({emailVerifiedAt:new Date()}).where(eq(schema.accounts.id,pending.id));assert.equal((await quantities(pending.id)).size,10);
   await db.insert(schema.shopItems).values({code:"future_test",name:"Future",description:"Controlled future grant",groupCode:"future",priceGold:1,displayOrder:11,starterQuantity:1});
   await db.execute(sql`select grant_inventory_starter(${old.id}::uuid)`);const after=await quantities(old.id);assert.equal(after.get("future_test"),1);assert.equal(after.get("scout"),1);
  });

  await t.test("authenticated HTTP exposes only own catalog/inventory and purchase uses server price",async()=>{
   await login(old);assert.equal((await request("/shop/items")).status,401);
   const items=await request("/shop/items",old.token);assert.equal(items.status,200);assert.equal((await items.json()).length,11);
   assert.equal((await request("/inventory",old.token)).status,200);
   const id=randomUUID(),response=await request("/shop/purchases",old.token,{requestId:id,itemCode:"scout",quantity:2});assert.equal(response.status,200);
   assert.deepEqual(Object.assign({},await response.json(),{createdAt:"ignored"}),{requestId:id,itemCode:"scout",quantity:2,unitPrice:30,totalPrice:60,inventoryQuantity:3,availableGold:40,createdAt:"ignored"});
   const history=await wallet.history(old.id);assert.equal(history.items[0].reason,"item_purchase");assert.ok(history.items[0].purchaseId);assert.equal(history.items[0].availableDelta,-60);
   const created=await request("/casual-rooms",old.token,{themeId:"earth"});assert.equal(created.status,201);const seat=await created.json();
   assert.equal((await request(`/casual-rooms/${seat.roomCode}/items`,old.token,{enabled:true})).status,200);
   assert.equal((await request(`/casual-rooms/${seat.roomCode}/loadout`,old.token,{itemCodes:["scout"]})).status,200);
   const withoutOrigin=await fetch(base+`/casual-rooms/${seat.roomCode}/loadout`,{headers:{Authorization:`Bearer ${old.token}`}});assert.equal(withoutOrigin.status,200);assert.deepEqual((await withoutOrigin.json()).itemCodes,["scout"]);
   await login(pending);assert.equal((await request(`/casual-rooms/${seat.roomCode}/loadout`,pending.token)).status,403);
  });

  await t.test("idempotent retry and concurrent duplicate buy once; changed payload conflicts",async()=>{
   const buyer=await createUser();await login(buyer);const id=randomUUID(),payload={requestId:id,itemCode:"time_saver",quantity:2};
   const responses=await Promise.all(Array.from({length:3},()=>request("/shop/purchases",buyer.token,payload)));assert.ok(responses.every(r=>r.status===200));
   assert.equal((await quantities(buyer.id)).get("time_saver"),3);assert.equal((await wallet.balance(buyer.id)).availableGold,20);
   const changed=await request("/shop/purchases",buyer.token,{...payload,quantity:1});assert.equal(changed.status,409);assert.equal((await changed.json()).code,"IDEMPOTENCY_KEY_CONFLICT");
  });

  await t.test("invalid quantity, unavailable item, insufficient available gold and held gold are rejected",async()=>{
   const buyer=await createUser(),opponent=await createUser();await login(buyer);
   for(const quantity of [0,100,1.5,"2"])assert.equal((await request("/shop/purchases",buyer.token,{requestId:randomUUID(),itemCode:"scout",quantity})).status,400);
   await db.update(schema.shopItems).set({onSale:false}).where(eq(schema.shopItems.code,"scout"));assert.equal((await request("/shop/purchases",buyer.token,{requestId:randomUUID(),itemCode:"scout",quantity:1})).status,409);await db.update(schema.shopItems).set({onSale:true}).where(eq(schema.shopItems.code,"scout"));
   assert.equal((await request("/shop/purchases",buyer.token,{requestId:randomUUID(),itemCode:"revive",quantity:1})).status,409);
   const matchId=randomUUID();await betting.hold(matchId,"ITEM23",buyer.id,opponent.id,80);assert.equal((await wallet.balance(buyer.id)).availableGold,20);
   assert.equal((await request("/shop/purchases",buyer.token,{requestId:randomUUID(),itemCode:"scout",quantity:1})).status,409);
   await betting.finish(matchId,{status:"cancelled",reason:"both_disconnected"});
  });

  await t.test("transaction failure rolls wallet and inventory back; DB forbids negative inventory",async()=>{
   const buyer=await createUser();const before=await wallet.balance(buyer.id);
   await pool.query("CREATE FUNCTION fail_item_purchase() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$");await pool.query("CREATE TRIGGER fail_purchase BEFORE INSERT ON wallet_entries FOR EACH ROW WHEN (NEW.reason='item_purchase') EXECUTE FUNCTION fail_item_purchase()");
   try{await assert.rejects(()=>shop.purchase(buyer.id,{requestId:randomUUID(),itemCode:"scout",quantity:1}));}finally{await pool.query("DROP TRIGGER fail_purchase ON wallet_entries");await pool.query("DROP FUNCTION fail_item_purchase()");}
   assert.deepEqual(await wallet.balance(buyer.id),before);assert.equal((await quantities(buyer.id)).get("scout"),1);
   await assert.rejects(()=>db.update(schema.inventoryItems).set({quantity:-1}).where(and(eq(schema.inventoryItems.accountId,buyer.id),eq(schema.inventoryItems.itemCode,"scout"))));
   assert.equal((await new InventoryService(app.get(DatabaseService)).list(buyer.id)).find(i=>i.code==="scout").quantity,1);
  });

  function profile(user){return{id:user.id,email:user.email,nickname:user.id,avatar:{id:"default",name:"Default",assetPath:null}};}
  function attach(local,seat,side){local.claimSocket({roomCode:seat.roomCode,seat:side},side);local.markSocketAttached({roomCode:seat.roomCode,seat:side},side);}
  await t.test("loadout is private, ownership checked, ready reset, concurrent start snapshots once without consumption",async()=>{
   const red=await createUser(),black=await createUser();const local=new RoomsService(()=>"LOAD23",{now:()=>1000,schedule:()=>()=>{}},betting,wallet,loadouts);
   const rs=local.createCasual(profile(red),"earth"),bs=local.joinCasual(rs.roomCode,profile(black));attach(local,rs,"red");attach(local,bs,"black");
   local.setItemsEnabled(rs.roomCode,red.id,true);await local.setLoadout(rs.roomCode,red.id,["scout","shield"]);await local.setLoadout(rs.roomCode,black.id,[]);
   assert.throws(()=>loadouts.normalize(["scout","scout"]));assert.throws(()=>loadouts.normalize(["scout","shield","seal","revive"]));
   const publicJson=JSON.stringify(local.publicState(rs.roomCode));assert.equal(publicJson.includes("scout"),false);assert.equal(publicJson.includes("loadout"),false);assert.deepEqual(local.ownLoadout(rs.roomCode,red.id).itemCodes,["scout","shield"]);
   await local.setReady(rs.roomCode,red.id,true);await local.setLoadout(rs.roomCode,red.id,["scout"]);assert.equal(local.rooms.get(rs.roomCode).red.ready,false);
   await db.update(schema.inventoryItems).set({quantity:0}).where(and(eq(schema.inventoryItems.accountId,red.id),eq(schema.inventoryItems.itemCode,"seal")));await assert.rejects(()=>local.setLoadout(rs.roomCode,red.id,["seal"]));
   await local.setLoadout(rs.roomCode,red.id,["scout"]);await Promise.all([local.setReady(rs.roomCode,red.id,true),local.setReady(rs.roomCode,black.id,true)]);
   const room=local.rooms.get(rs.roomCode);assert.ok(room.game);assert.ok(room.gameMatchId);assert.equal((await loadouts.snapshotForAccount(room.gameMatchId,red.id))[0].itemCode,"scout");assert.equal((await quantities(red.id)).get("scout"),1);
   local.releaseSocket({roomCode:rs.roomCode,seat:"red"},"red");local.claimSocket({roomCode:rs.roomCode,seat:"red"},"red2");local.markSocketAttached({roomCode:rs.roomCode,seat:"red"},"red2");assert.deepEqual(local.ownLoadout(rs.roomCode,red.id).itemCodes,["scout"]);await local.onModuleDestroy();
  });

  await t.test("only owner toggles items while nobody ready; disabled room starts with no snapshot",async()=>{
   const red=await createUser(),black=await createUser();const local=new RoomsService(()=>"NOITEM",{now:()=>1000,schedule:()=>()=>{}},betting,wallet,loadouts);
   const rs=local.createCasual(profile(red),"earth"),bs=local.joinCasual(rs.roomCode,profile(black));attach(local,rs,"red");attach(local,bs,"black");
   assert.throws(()=>local.setItemsEnabled(rs.roomCode,black.id,true));local.setItemsEnabled(rs.roomCode,red.id,true);await local.setReady(rs.roomCode,red.id,true);assert.throws(()=>local.setItemsEnabled(rs.roomCode,red.id,false));await local.setReady(rs.roomCode,red.id,false);local.setItemsEnabled(rs.roomCode,red.id,false);
   await local.setReady(rs.roomCode,red.id,true);await local.setReady(rs.roomCode,black.id,true);const room=local.rooms.get(rs.roomCode);assert.ok(room.game);assert.ok(room.gameMatchId);
   assert.deepEqual(await loadouts.snapshotForAccount(room.gameMatchId,red.id),[]);assert.deepEqual(await loadouts.snapshotForAccount(room.gameMatchId,black.id),[]);
   assert.deepEqual(local.matchSnapshot({roomCode:rs.roomCode,seat:"red"},"red").ownLoadout,[]);
   assert.equal(local.publicState(rs.roomCode).itemsEnabled,false);await local.onModuleDestroy();
  });
  await t.test("item usage transaction consumes once, durable retry is stable and rollback preserves inventory",async()=>{
   const red=await createUser(),black=await createUser();let now=1000;
   const local=new RoomsService(()=>"USE234",{now:()=>now,schedule:()=>()=>{}},betting,wallet,loadouts,usage);
   const rs=local.createCasual(profile(red),"earth"),bs=local.joinCasual(rs.roomCode,profile(black));attach(local,rs,"red");attach(local,bs,"black");
   local.setItemsEnabled(rs.roomCode,red.id,true);await local.setLoadout(rs.roomCode,red.id,["scout","time_pressure"]);await local.setLoadout(rs.roomCode,black.id,[]);
   await Promise.all([local.setReady(rs.roomCode,red.id,true),local.setReady(rs.roomCode,black.id,true)]);
   const state=()=>local.matchSnapshot({roomCode:rs.roomCode,seat:"red"},"red");
   const request={matchId:state().matchId,requestId:randomUUID(),expectedVersion:state().stateVersion,itemCode:"scout",targetPieceId:"black-soldier-0"};
   const results=await Promise.all([local.useItem({roomCode:rs.roomCode,seat:"red"},"red",request),local.useItem({roomCode:rs.roomCode,seat:"red"},"red",request)]);
   assert.deepEqual(results[0],results[1]);assert.equal(results[0].ok,true);assert.equal((await quantities(red.id)).get("scout"),0);
   assert.equal((await db.select().from(schema.itemUsages).where(eq(schema.itemUsages.accountId,red.id))).length,1);
   assert.equal((await local.useItem({roomCode:rs.roomCode,seat:"red"},"red",{matchId:request.matchId,requestId:randomUUID(),expectedVersion:state().stateVersion,itemCode:"time_pressure"})).code,"item_already_used_this_turn");
   const red2=await createUser(),black2=await createUser();const failing=new RoomsService(()=>"FAIL23",{now:()=>now,schedule:()=>()=>{}},betting,wallet,loadouts,usage);
   const r2=failing.createCasual(profile(red2),"earth"),b2=failing.joinCasual(r2.roomCode,profile(black2));attach(failing,r2,"red");attach(failing,b2,"black");
   failing.setItemsEnabled(r2.roomCode,red2.id,true);await failing.setLoadout(r2.roomCode,red2.id,["scout"]);await failing.setLoadout(r2.roomCode,black2.id,[]);
   await Promise.all([failing.setReady(r2.roomCode,red2.id,true),failing.setReady(r2.roomCode,black2.id,true)]);
   const failState=failing.matchSnapshot({roomCode:r2.roomCode,seat:"red"},"red");
   await pool.query("CREATE FUNCTION fail_item_usage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$");await pool.query("CREATE TRIGGER fail_usage BEFORE INSERT ON item_usages FOR EACH ROW EXECUTE FUNCTION fail_item_usage()");
   try{const ack=await failing.useItem({roomCode:r2.roomCode,seat:"red"},"red",{matchId:failState.matchId,requestId:randomUUID(),expectedVersion:failState.stateVersion,itemCode:"scout",targetPieceId:"black-soldier-0"});assert.equal(ack.ok,false);}
   finally{await pool.query("DROP TRIGGER fail_usage ON item_usages");await pool.query("DROP FUNCTION fail_item_usage()");}
   assert.equal((await quantities(red2.id)).get("scout"),1);assert.equal(failing.matchSnapshot({roomCode:r2.roomCode,seat:"red"},"red").stateVersion,0);
   await local.onModuleDestroy();await failing.onModuleDestroy();
  });
 }finally{
  if(app)await app.close();if(pool)await pool.end();assert.match(testSchema,/^items_test_[0-9a-f]{32}$/);await admin.query(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);await admin.end();
 }
});
