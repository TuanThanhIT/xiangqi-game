import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const shots=resolve('../../docs/design/screenshots/auth-lobby-approved');
const profile={id:'6b477683-312d-4c43-812d-c9ae45a14b75',email:'lobby.fixture@example.test',nickname:'Kỳ thủ thử nghiệm',avatar:{id:'default',name:'Mặc định',assetPath:null}};
async function mockSession(page,user=profile){
 await page.route('**/api/auth/refresh',r=>r.fulfill({json:{accessToken:'test-only-token',expiresAt:new Date(Date.now()+900000).toISOString(),profile:user}}));
 await page.route('**/api/me',r=>r.fulfill({json:user}));
 await page.route('**/api/auth/logout',r=>r.fulfill({json:{ok:true}}));
}
async function open(page){await page.goto('/lobby');await expect(page.getByRole('heading',{name:'Sảnh chính',exact:true})).toBeVisible();await page.evaluate(()=>document.fonts.ready);await expect(page.getByRole('img',{name:/Bàn cờ tướng 3D/})).toBeVisible();}
async function dimensions(page){return page.evaluate(()=>({height:innerHeight,client:document.scrollingElement.clientHeight,document:document.scrollingElement.scrollHeight,width:innerWidth,documentWidth:document.scrollingElement.scrollWidth,scrollY}));}
async function inViewport(page,node){const box=await node.boundingBox();expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(await page.evaluate(()=>innerHeight));}
for(const size of [{width:1920,height:1080},{width:1600,height:900},{width:1366,height:768},{width:375,height:812}]){
 test(`Lobby approved layout ${size.width}x${size.height}`,async({page},info)=>{
  test.skip((size.width===375)!==(info.project.name==='mobile'),'Matching viewport project');await page.setViewportSize(size);await mockSession(page);
  let sockets=0;page.on('websocket',socket=>{if(socket.url().includes('/socket.io/'))sockets++});
  await open(page);await expect(page.getByRole('img',{name:'Avatar quân cờ mặc định'})).toBeVisible();await expect(page.getByText(profile.nickname,{exact:true})).toBeVisible();
  const data=await dimensions(page);expect(data.documentWidth).toBeLessThanOrEqual(size.width);
  const create=page.getByRole('link',{name:'Tạo phòng',exact:true}),join=page.getByRole('link',{name:'Vào bằng mã',exact:true}),local=page.getByRole('link',{name:'Chơi cùng thiết bị',exact:true});
  await expect(create).toHaveAttribute('href','/play?mode=create&casual=1');await expect(join).toHaveAttribute('href','/play?mode=join&casual=1');await expect(local).toHaveAttribute('href','/local');
  expect(await page.getByRole('region',{name:'Tiện ích sắp ra mắt'}).getByRole('link').count()).toBe(0);
  for(const name of ['Điểm danh','Nhiệm vụ','Cửa hàng','Kho','Lịch sử'])await expect(page.getByLabel(`${name}: Sắp ra mắt`,{exact:true})).toBeVisible();
  if(size.width>375){expect(data.document).toBeLessThanOrEqual(data.client);expect(data.scrollY).toBe(0);for(const node of [create,join,local,page.getByRole('region',{name:'Tiện ích sắp ra mắt'})])await inViewport(page,node);expect(await page.evaluate(()=>scrollY)).toBe(0);}
  const tabs=page.getByRole('tablist',{name:'Chế độ chơi'});
  await expect(tabs.getByRole('tab')).toHaveCount(3);await expect(tabs.getByRole('tab',{name:'Giải trí',exact:true})).toHaveAttribute('aria-selected','true');
  for(const name of ['Xếp hạng','Hướng dẫn'])await expect(tabs.getByRole('tab',{name:new RegExp(name)})).toBeDisabled();
  await expect(page.getByRole('region',{name:'Tiện ích sắp ra mắt'}).getByRole('listitem')).toHaveCount(5);
  const panel=await page.getByRole('region',{name:'Chế độ chơi',exact:true}).boundingBox(),friends=await page.getByRole('complementary',{name:'Bạn bè'}).boundingBox();
  await expect(page.getByRole('tabpanel').getByRole('link',{name:'Vào bằng mã'})).toBeVisible();
  if(size.width>375){expect(panel.y).toBeCloseTo(friends.y,1);expect(panel.height).toBeGreaterThan(friends.height);}
  else {expect(panel.y+panel.height).toBeLessThan(friends.y);}
  expect(sockets).toBe(0);await mkdir(shots,{recursive:true});await page.screenshot({path:resolve(shots,`lobby-${size.width}x${size.height}.png`),fullPage:true});
  const menu=page.getByRole('button',{name:/^Tài khoản /});await menu.focus();await page.keyboard.press('ArrowDown');await expect(page.getByRole('menuitem',{name:'Đăng xuất',exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(menu).toBeFocused();await expect(menu).toHaveAttribute('aria-expanded','false');
  await page.keyboard.press('Enter');await expect(page.getByRole('menuitem',{name:'Đăng xuất',exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(menu).toHaveAttribute('aria-expanded','false');
  await page.reload();await expect(page.getByRole('heading',{name:'Sảnh chính'})).toBeVisible();
  const saved={version:1,roomCode:'ABC234',seatToken:'A'.repeat(43),seat:'red',nickname:'Người thử'};
  await page.evaluate(value=>localStorage.setItem('xiangqi.room.v1',JSON.stringify(value)),saved);await page.reload();
  await expect(page.getByRole('link',{name:'Tiếp tục trận',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Tạo phòng',exact:true})).toHaveAttribute('href','/play?mode=create&casual=1');
  const resumed=await dimensions(page);expect(resumed.documentWidth).toBeLessThanOrEqual(size.width);
  if(size.width>375){expect(resumed.document).toBeLessThanOrEqual(resumed.client);await inViewport(page,page.getByRole('region',{name:'Tiện ích sắp ra mắt'}));}
  await page.screenshot({path:resolve(shots,`lobby-resume-${size.width}x${size.height}.png`),fullPage:true});
  await writeFile(resolve(shots,`metrics-${size.width}.json`),JSON.stringify({normal:data,resumed},null,2));
 });
}
test('Lobby long nickname, saved room is read-only and play links work',async({page},info)=>{
 const user={...profile,nickname:'Đ'.repeat(30),avatar:{...profile.avatar,assetPath:'/missing-test-avatar.png'}};await mockSession(page,user);
 const saved={version:1,roomCode:'ABC234',seatToken:'A'.repeat(43),seat:'red',nickname:'Người thử'};
 await page.addInitScript(value=>{sessionStorage.setItem('xiangqi.room.v1',JSON.stringify(value));},saved);
 let sockets=0;page.on('websocket',socket=>{if(socket.url().includes('/socket.io/'))sockets++});await open(page);await expect(page.getByRole('img',{name:'Avatar quân cờ mặc định'})).toBeVisible();
 const resume=page.getByRole('link',{name:'Tiếp tục trận',exact:true});await expect(resume).toHaveAttribute('href','/play');expect(sockets).toBe(0);
 expect(await page.evaluate(()=>localStorage.getItem('xiangqi.room.v1'))).toBeNull();expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('xiangqi.room.v1')).roomCode)).toBe('ABC234');
 expect((await dimensions(page)).documentWidth).toBeLessThanOrEqual(info.project.name==='mobile'?375:1366);
 await page.getByRole('button',{name:/^Tài khoản /}).click();await expect(page.getByRole('menu').getByText(user.nickname,{exact:true})).toBeVisible();await page.keyboard.press('Escape');
 await mkdir(shots,{recursive:true});await page.screenshot({path:resolve(shots,`lobby-long-name-${info.project.name}.png`),fullPage:true});
 await resume.click();await expect(page).toHaveURL(/\/play$/);await expect(page.getByRole('button',{name:'Tiếp tục phòng',exact:true})).toBeVisible();
 // The legacy session is authenticated only after the player explicitly continues in V1.
 await page.getByRole('button',{name:'Tiếp tục phòng',exact:true}).click();await expect.poll(()=>sockets).toBeGreaterThan(0);
});
test('Lobby create, join and local navigation without saved room',async({page})=>{
 await mockSession(page);await open(page);await page.getByRole('link',{name:'Tạo phòng',exact:true}).click();await expect(page).toHaveURL(/\/play\?mode=create&casual=1$/);await expect(page.getByRole('heading',{name:'Tạo phòng',exact:true})).toBeVisible();
 await open(page);await page.getByRole('link',{name:'Vào bằng mã',exact:true}).click();await expect(page).toHaveURL(/\/play\?mode=join&casual=1$/);await expect(page.getByRole('heading',{name:'Vào phòng',exact:true})).toBeVisible();
 await open(page);await page.getByRole('link',{name:'Chơi cùng thiết bị',exact:true}).click();await expect(page).toHaveURL(/\/local$/);await expect(page.locator('.board-intersection')).toHaveCount(90);
});


test('Lobby resumes a real V1 room only after explicit continuation',async({page})=>{
 await mockSession(page);await open(page);
 const response=await page.request.post('/api/rooms',{data:{nickname:'Người giữ phòng',themeId:'earth'}});expect(response.status()).toBe(201);
 const room=await response.json();
 await page.evaluate(value=>localStorage.setItem('xiangqi.room.v1',JSON.stringify({version:1,...value})),room);
 let sockets=0;page.on('websocket',socket=>{if(socket.url().includes('/socket.io/'))sockets++});
 await open(page);expect(sockets).toBe(0);await page.getByRole('link',{name:'Tiếp tục trận',exact:true}).click();
 await expect(page.getByRole('button',{name:'Tiếp tục phòng',exact:true})).toBeVisible();expect(sockets).toBe(0);
 await page.getByRole('button',{name:'Tiếp tục phòng',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Đã kết nối và xác thực'})).toBeVisible();
 await expect(page.getByText('Người giữ phòng',{exact:true}).first()).toBeVisible();
});
