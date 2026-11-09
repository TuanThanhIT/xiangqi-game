import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const require=createRequire(import.meta.url);
const {DatabaseService}=require('../../server/dist/db/database.service.js');
const {accounts}=require('../../server/dist/db/schema.js');
const {hashPassword}=require('../../server/dist/auth/password.js');
const {eq,sql}=require('drizzle-orm');
const shots=resolve('../../docs/design/screenshots/casual-waiting');

async function setup(browser,info){
 const database=new DatabaseService();const users=[];const contexts=[];const pages=[];const tokens=[];
 try{
  expect((await database.db.execute(sql`select current_database() as name`)).rows[0].name).toBe('xiangqi_dev');
  for(let i=0;i<2;i++){
   const id=randomUUID(),suffix=id.slice(0,8),password=randomBytes(24).toString('base64url');
   const user={id,email:`waiting-${suffix}@example.test`,nickname:`Kỳ thủ ${i?'Đen':'Đỏ'} ${suffix}`};
   // Isolated verified fixtures; no registration mail is sent.
   await database.db.insert(accounts).values({...user,passwordHash:await hashPassword(password),emailVerifiedAt:new Date()});users.push(user);
   const context=await browser.newContext({viewport:info.project.use.viewport,isMobile:info.project.name==='mobile',hasTouch:info.project.name==='mobile'});contexts.push(context);
   const page=await context.newPage();pages.push(page);
   await page.goto('http://localhost:3000/login');await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Mật khẩu',{exact:true}).fill(password);
   const response=page.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.status()===200);
   await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();tokens.push((await (await response).json()).accessToken);await expect(page).toHaveURL(/\/lobby$/);
  }
  return {database,users,contexts,pages,tokens,async close(){for(const context of contexts)await context.close();for(const user of users)await database.db.delete(accounts).where(eq(accounts.id,user.id));await database.onApplicationShutdown();}};
 }catch{for(const context of contexts)await context.close();for(const user of users)await database.db.delete(accounts).where(eq(accounts.id,user.id));await database.onApplicationShutdown();throw new Error('Không chuẩn bị được fixture phòng chờ; kiểm tra backend và xiangqi_dev.');}
}
async function enter(f){
 const [host,guest]=f.pages;
 await host.getByRole('link',{name:'Tạo phòng',exact:true}).click();
 await expect(host.getByLabel('Biệt danh (1–30 ký tự)',{exact:true})).toHaveValue(f.users[0].nickname);
 await expect(host.getByLabel('Biệt danh (1–30 ký tự)',{exact:true})).toHaveAttribute('readonly','');
 await host.getByRole('radio',{name:/Trúc lâm/}).check();await host.getByRole('button',{name:'Tạo phòng',exact:true}).click();
 await expect(host.getByRole('heading',{name:'Phòng chờ',exact:true})).toBeVisible();
 await expect(host.getByRole('status').filter({hasText:'Đã kết nối và xác thực'})).toBeVisible();
 const code=await host.locator('[data-room-code]').innerText();
 await guest.getByRole('link',{name:'Vào bằng mã',exact:true}).click();await guest.getByLabel('Mã phòng muốn vào',{exact:true}).fill(code);await guest.getByRole('button',{name:'Vào phòng',exact:true}).click();
 for(const page of [host,guest]){await expect(page.locator('[data-seat=black]')).toContainText(f.users[1].nickname);await expect(page.locator('[data-seat=black]')).toContainText('Đang online');await expect(page.locator('.board-intersection')).toHaveCount(0);}
 return code;
}
async function measure(page,info){
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));});
 const geometry=await page.evaluate(()=>({height:innerHeight,client:document.scrollingElement.clientHeight,document:document.scrollingElement.scrollHeight,width:innerWidth,documentWidth:document.scrollingElement.scrollWidth,scrollY}));
 expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.width);
 if(info.project.name==='desktop'){expect(geometry.document).toBeLessThanOrEqual(geometry.client);const button=await page.getByRole('button',{name:'Sẵn sàng',exact:true}).boundingBox();expect(button.y+button.height).toBeLessThanOrEqual(geometry.height);expect(geometry.scrollY).toBe(0);}
 await mkdir(shots,{recursive:true});await page.screenshot({path:resolve(shots,`waiting-${info.project.name}.png`),fullPage:true});await writeFile(resolve(shots,`metrics-${info.project.name}.json`),JSON.stringify(geometry,null,2));
}
test('Casual: two authenticated players, reload, ready toggle and simultaneous start',async({browser},info)=>{
 const f=await setup(browser,info);try{
  const code=await enter(f),[host,guest]=f.pages;await measure(host,info);
  await host.context().grantPermissions(['clipboard-read','clipboard-write']);await host.getByRole('button',{name:'Sao chép mã',exact:true}).click();expect(await host.evaluate(()=>navigator.clipboard.readText())).toBe(code);await host.getByRole('button',{name:'Đóng thông báo',exact:true}).click();
  await host.getByRole('button',{name:'Sẵn sàng',exact:true}).click();await expect(guest.locator('[data-seat=red]')).toContainText('Đã sẵn sàng');await expect(host.locator('.board-intersection')).toHaveCount(0);
  await host.getByRole('button',{name:'Bỏ sẵn sàng',exact:true}).click();await expect(guest.locator('[data-seat=red]')).toContainText('Chưa sẵn sàng');
  await host.getByRole('button',{name:'Sẵn sàng',exact:true}).click();await expect(host.getByRole('button',{name:'Bỏ sẵn sàng',exact:true})).toBeVisible();await host.reload();
  await expect(host.getByRole('heading',{name:'Phòng chờ',exact:true})).toBeVisible();await expect(host.getByRole('button',{name:'Sẵn sàng',exact:true})).toBeEnabled();await expect(guest.locator('[data-seat=red]')).toContainText('Chưa sẵn sàng');expect(await host.locator('[data-room-code]').innerText()).toBe(code);
  const duplicate=await host.request.post('/api/casual-rooms',{headers:{Origin:'http://localhost:3000',Authorization:`Bearer ${f.tokens[0]}`},data:{themeId:'earth'}});expect(duplicate.status()).toBe(409);
  await Promise.all([host.getByRole('button',{name:'Sẵn sàng',exact:true}).click(),guest.getByRole('button',{name:'Sẵn sàng',exact:true}).click()]);
  for(const page of [host,guest]){await expect(page.locator('.board-intersection')).toHaveCount(90);await expect(page.locator('main')).toHaveAttribute('data-theme','bamboo');await expect(page.getByRole('heading',{name:'Phòng chờ',exact:true})).toHaveCount(0);}
 }finally{await f.close();}
});
test('Casual: guest leaves, host retains code and can accept guest again; host closes room',async({browser},info)=>{
 const f=await setup(browser,info);try{
  const code=await enter(f),[host,guest]=f.pages;
  await host.getByRole('button',{name:'Sẵn sàng',exact:true}).click();await expect(host.getByRole('button',{name:'Bỏ sẵn sàng',exact:true})).toBeVisible();
  await guest.getByRole('button',{name:'Rời phòng',exact:true}).click();await expect(guest).toHaveURL(/\/lobby\?room=left/);await expect(host.locator('[data-seat=black]')).toContainText('Ghế trống');await expect(host.getByRole('button',{name:'Sẵn sàng',exact:true})).toBeEnabled();expect(await host.locator('[data-room-code]').innerText()).toBe(code);
  await guest.getByRole('link',{name:'Vào bằng mã',exact:true}).click();await guest.getByLabel('Mã phòng muốn vào',{exact:true}).fill(code);await guest.getByRole('button',{name:'Vào phòng',exact:true}).click();await expect(guest.getByRole('heading',{name:'Phòng chờ',exact:true})).toBeVisible();
  await host.getByRole('button',{name:'Rời phòng',exact:true}).click();await expect(guest).toHaveURL(/\/lobby\?room=closed/);await expect(guest.locator('[data-toast]')).toContainText('Phòng đã đóng');await expect(host).toHaveURL(/\/lobby\?room=left/);
  const missing=await guest.request.post(`/api/casual-rooms/${code}/join`,{headers:{Origin:'http://localhost:3000',Authorization:`Bearer ${f.tokens[1]}`},data:{}});expect(missing.status()).toBe(404);
 }finally{await f.close();}
});
