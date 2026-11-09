import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const shots=resolve('../../docs/design/screenshots/lobby-blue');
const profile={id:'6b477683-312d-4c43-812d-c9ae45a14b75',email:'lobby.fixture@example.test',nickname:'Kỳ thủ thử nghiệm',avatar:{id:'default',name:'Mặc định',assetPath:null}};
test('Entry background loads on portal, lobby, login and registration only',async({page},info)=>{
 await page.route('**/api/auth/refresh',r=>r.fulfill({json:{accessToken:'test-only-token',expiresAt:new Date(Date.now()+900000).toISOString(),profile}}));
 await page.route('**/api/me',r=>r.fulfill({json:profile}));
 for(const [path,name] of [['/','portal'],['/lobby','lobby'],['/login','login'],['/register','register']]){
  await page.goto(path);await page.locator('header').waitFor();await page.evaluate(()=>document.fonts.ready);
  if(path==='/lobby')await expect(page.getByRole('heading',{name:'Sảnh chính',exact:true})).toBeVisible();
  const background=await page.locator('header').evaluate(header=>{const css=getComputedStyle(header.parentElement);return {image:css.backgroundImage,size:css.backgroundSize,position:css.backgroundPosition}});
  expect(background.image).toContain('/images/entry-background.png');expect(background.size).toContain('cover');
  const image=await page.evaluate(async()=>{const image=new Image();image.src='/images/entry-background.png';await image.decode();return {width:image.naturalWidth,height:image.naturalHeight}});expect(image.width).toBeGreaterThan(0);expect(image.height).toBeGreaterThan(0);
  expect(await page.evaluate(()=>document.scrollingElement.scrollWidth<=innerWidth)).toBe(true);
  await mkdir(shots,{recursive:true});await page.screenshot({path:resolve(shots,`entry-${name}-${info.project.name}.png`),fullPage:true});
 }
 await page.goto('/verify-email');expect(await page.locator('header').evaluate(h=>getComputedStyle(h.parentElement).backgroundImage)).toContain('entry-background.png');
});
test('A real bamboo match retains its selected game background',async({page,browser},info)=>{
 test.skip(info.project.name!=='desktop','One real match verifies isolation from entry background');
 await page.goto('/play?mode=create');
 const response=await page.request.post('/api/rooms',{data:{nickname:'Người thử Đỏ',themeId:'bamboo'}});expect(response.status()).toBe(201);const red=await response.json();
 const join=await page.request.post(`/api/rooms/${red.roomCode}/join`,{data:{nickname:'Người thử Đen'}});expect(join.status()).toBe(200);const black=await join.json();
 const second=await browser.newContext({viewport:{width:1366,height:768}});
 try{
  await page.addInitScript(room=>localStorage.setItem('xiangqi.room.v1',JSON.stringify({version:1,...room})),red);
  await page.goto('/play');await page.getByRole('button',{name:'Tiếp tục phòng',exact:true}).click();
  await second.addInitScript(room=>localStorage.setItem('xiangqi.room.v1',JSON.stringify({version:1,...room})),black);
  const guest=await second.newPage();await guest.goto('http://localhost:3000/play');await guest.getByRole('button',{name:'Tiếp tục phòng',exact:true}).click();
  await expect(page.locator('.board-intersection')).toHaveCount(90);
  const main=page.locator('main[data-theme="bamboo"]');await expect(main).toBeVisible();
  const background=await main.evaluate(node=>getComputedStyle(node).backgroundImage);expect(background).toContain('/themes/bamboo/page-bg.webp');expect(background).not.toContain('/images/entry-background.png');
  await mkdir(shots,{recursive:true});await page.screenshot({path:resolve(shots,'match-bamboo-background.png'),fullPage:true});
 }finally{await second.close();}
});
