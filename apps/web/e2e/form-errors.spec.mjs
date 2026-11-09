import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const directory = resolve('../../docs/design/screenshots/form-toast');
const accountId = '6b477683-312d-4c43-812d-c9ae45a14b75';
const forms = [
  { name: 'register', route: '/register', button: 'Tạo tài khoản', link: 'Đăng nhập', endpoint: 'register', first: 'Biệt danh' },
  { name: 'login', route: '/login', button: 'Đăng nhập', link: 'Đăng ký', endpoint: 'login', first: 'Email' },
  { name: 'otp', route: `/verify-email?account=${accountId}`, button: 'Xác minh', link: 'Về đăng nhập', endpoint: 'verification/verify', first: 'Mã xác minh' },
];
const state = (delivery = 'not_sent') => ({ status: 'pending_verification', accountId, maskedEmail: 't***@example.test', pendingExpiresAt: new Date(Date.now()+86400000).toISOString(), otpExpiresAt: new Date(Date.now()+300000).toISOString(), resendAt: new Date().toISOString(), delivery });
async function geometry(page, button) {
  return page.evaluate(label => {
    const box = node => { const b = node.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
    return { card: box(document.querySelector('main section')), button: box([...document.querySelectorAll('button')].find(node => node.textContent === label)), document: document.documentElement.scrollHeight, viewport: innerHeight, documentWidth: document.documentElement.scrollWidth, scrollY };
  }, button);
}
async function fill(page, form) {
  if (form.name === 'otp') await page.getByLabel('Mã xác minh', { exact: true }).fill('123456');
  else {
    if (form.name === 'register') await page.getByLabel('Biệt danh', { exact: true }).fill('Người thử');
    await page.getByLabel('Email', { exact: true }).fill('tester@example.test');
    await page.getByLabel('Mật khẩu', { exact: true }).fill('fake-only-password');
  }
}
async function shot(page, form, name) {
  await mkdir(directory, { recursive: true });
  const input = page.getByLabel(form.name === 'otp' ? 'Mã xác minh' : 'Mật khẩu', { exact: true });
  await page.screenshot({ path: resolve(directory, name+'.png'), fullPage: !name.endsWith("-460"), mask: [input], maskColor: '#2b190f' });
}
const overlaps = (a,b) => a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y;
for (const size of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test(`Auth inline errors and independent toast ${size.width}x${size.height}`, async ({ page }, info) => {
    test.skip((size.width === 375) !== (info.project.name === 'mobile'), 'Matching viewport project');
    await page.setViewportSize(size); await page.route('**/api/auth/verification/status', r => r.fulfill({json:state()}));
    const measured = [];
    for (const form of forms) {
      let errorCode = form.name === 'login' ? 'INVALID_CREDENTIALS' : 'INTERNAL_ERROR', calls = 0;
      await page.route(`**/api/auth/${form.endpoint}`, r => { calls++; return r.fulfill({ status: errorCode === 'NICKNAME_IN_USE' || errorCode === 'EMAIL_IN_USE' ? 409 : 400, json: {statusCode:400, code:errorCode, message:'RAW_BACKEND_DETAIL_MUST_NOT_APPEAR'} }); });
      await page.goto(form.route); const send = page.getByRole('button', {name:form.button,exact:true}); await send.waitFor(); await page.evaluate(()=>document.fonts.ready);
      const clean = await geometry(page,form.button);
      expect(clean.scrollY).toBe(0); expect(clean.document).toBeLessThanOrEqual(size.height);
      expect(await page.locator('[data-error-toast]').count()).toBe(0);
      expect(await page.locator('form [id$="-error"]').count()).toBe(0);
      const link = await page.getByRole('link',{name:form.link,exact:true}).boundingBox(); expect(link.y+link.height).toBeLessThanOrEqual(size.height);
      await shot(page,form,`${form.name}-clean-after-${size.width}`);
      await send.click(); await expect(page.getByLabel(form.first,{exact:true})).toBeFocused();
      await expect(page.getByLabel(form.first,{exact:true})).toHaveAttribute('aria-invalid','true');
      const description = await page.getByLabel(form.first,{exact:true}).getAttribute('aria-describedby'); expect(description).toContain('error');
      const fields = await geometry(page,form.button); expect(fields.card.width).toBe(clean.card.width); expect(fields.documentWidth).toBeLessThanOrEqual(size.width);
      await shot(page,form,`${form.name}-fields-${size.width}`);
      // Reset field errors before comparing toast geometry: only the toast changes.
      await page.goto(form.route); await send.waitFor(); await fill(page,form); await page.evaluate(()=>document.fonts.ready);
      const baseline = await geometry(page,form.button); await send.click();
      const toast = page.locator('[data-error-toast]'); await expect(toast).toBeVisible();
      await expect(toast.getByRole('alert')).not.toBeEmpty(); await expect(page.locator('body')).not.toContainText('RAW_BACKEND_DETAIL_MUST_NOT_APPEAR');
      const withToast = await geometry(page,form.button);
      expect(withToast.card).toEqual(baseline.card); expect(withToast.button).toEqual(baseline.button);
      expect(withToast.document).toBe(baseline.document); expect(withToast.scrollY).toBe(0);
      expect(await page.locator('form [role="alert"]').count()).toBe(0); expect(await toast.count()).toBe(1);
      expect(await page.evaluate(()=>!!document.activeElement?.closest('[data-error-toast]'))).toBe(false);
      const secret = page.getByLabel(form.name==='otp'?'Mã xác minh':'Mật khẩu',{exact:true}); await secret.focus();
      if (size.width===375) {
        for (const height of [812,460]) {
          await page.setViewportSize({width:375,height}); await secret.focus();
          await expect.poll(async()=>overlaps(await toast.boundingBox(),await secret.boundingBox())).toBe(false);
          await expect.poll(async()=>overlaps(await toast.boundingBox(),await send.boundingBox())).toBe(false);
          expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
          if (height === 460) {
            await send.focus();
            const visibleButton = await send.boundingBox();
            expect(visibleButton.y).toBeGreaterThanOrEqual(0); expect(visibleButton.y + visibleButton.height).toBeLessThanOrEqual(height);
            await expect.poll(async()=>overlaps(await toast.boundingBox(),await send.boundingBox())).toBe(false);
          }
          await shot(page,form,`${form.name}-toast-mobile-${height}`);
        }
        await page.setViewportSize(size);
      } else await shot(page,form,`${form.name}-toast-${size.width}`);
      await toast.getByRole('button',{name:'Đóng thông báo lỗi'}).focus(); await page.keyboard.press('Enter'); await expect(toast).toHaveCount(0);
      const afterClose=await geometry(page,form.button); expect(afterClose.card.width).toBe(baseline.card.width); expect(afterClose.card.height).toBe(baseline.card.height);
      await send.click(); await expect(toast).toBeVisible(); expect(calls).toBe(2); await send.click(); await expect(toast).toHaveCount(1); expect(calls).toBe(3);
      // Unknown and prototype-looking codes are always generic, never raw server messages.
      errorCode='toString'; await send.click(); await expect(toast).toContainText('Chưa thể xử lý yêu cầu. Vui lòng thử lại sau.'); expect(calls).toBe(4);
      // Known per-field failures belong to the field, not to a toast.
      if(form.name==='register') {
        for(const [code,label] of [['NICKNAME_IN_USE','Biệt danh'],['EMAIL_IN_USE','Email']]){
          errorCode=code; await send.click(); await expect(toast).toHaveCount(0); await expect(page.getByLabel(label,{exact:true})).toBeFocused(); await expect(page.getByLabel(label,{exact:true})).toHaveAttribute('aria-invalid','true');
          await expect(page.getByLabel('Biệt danh',{exact:true})).toHaveValue('Người thử');
        }
      }
      if(form.name==='otp') {
        errorCode='OTP_INVALID'; await send.click(); await expect(toast).toHaveCount(0); await expect(secret).toBeFocused(); await expect(secret).toHaveAttribute('aria-invalid','true'); await expect(secret).toHaveValue('123456');
        errorCode='OTP_EXPIRED'; await send.click(); await expect(toast).toContainText('Mã đã hết hiệu lực'); await expect(page.locator('main')).not.toContainText('Mã đã hết hiệu lực'); await expect(page.getByRole('button',{name:'Gửi lại mã',exact:true})).toBeVisible();
        await shot(page,form,`otp-expired-${size.width}`);
        await page.route('**/api/auth/verification/resend',r=>r.fulfill({json:state('failed')}));
        await page.getByRole('button',{name:'Gửi lại mã',exact:true}).click(); await expect(toast).toContainText('Chưa gửi được mã xác minh'); await expect(toast).toHaveCount(1);
      }
      if(size.width===375){
        await page.goto(form.route); await send.waitFor(); await send.click();
        const error=page.locator('form [id$="-error"]').first();
        await error.evaluate(node=>{node.textContent='Thông báo lỗi dài cần đọc đầy đủ và sửa lại nội dung đã nhập. '.repeat(10)});
        expect(await error.evaluate(node=>node.scrollHeight<=node.clientHeight)).toBe(true);
        await page.setViewportSize({width:375,height:460}); await send.focus(); await expect(send).toBeFocused();
        expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
        await page.keyboard.press('Enter'); await expect(page.getByLabel(form.first,{exact:true})).toBeFocused();
        await page.setViewportSize(size);
      }
      measured.push({form:form.name,clean,fields,baseline,withToast});
    }
    await writeFile(resolve(directory,`metrics-${size.width}.json`),JSON.stringify(measured,null,2));
  });
}

test('Room errors: inline invalid fields and one operation toast',async({page})=>{
 for(const mode of ['create','join']){
  await page.route(mode==='create'?'**/api/rooms':'**/api/rooms/*/join',r=>r.fulfill({status:500,json:{statusCode:500,code:'INTERNAL_ERROR',message:'safe'}}));
  await page.goto(`/play?mode=${mode}`);const send=page.getByRole('button',{name:mode==='create'?'Tạo phòng':'Vào phòng',exact:true});await send.waitFor();await send.click();
  await expect(page.locator('#room-nickname')).toBeFocused();await expect(page.locator('#room-nickname')).toHaveAttribute('aria-invalid','true');
  await page.locator('#room-nickname').fill('Người thử');if(mode==='join'){await send.click();await expect(page.locator('#room-code')).toBeFocused();await page.locator('#room-code').fill('ABC234');}
  await send.click();await expect(page.locator('[data-error-toast]')).toBeVisible();await expect(page.locator('form [role="alert"]')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('[data-error-toast] button').focus();await page.keyboard.press('Enter');await expect(page.locator('[data-error-toast]')).toHaveCount(0);
 }
});

test('Room forms: create then join a real room through the proxy', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'One integration run; responsive errors covered separately');
  await page.goto('/play?mode=create');
  await page.getByLabel('Biệt danh (1–30 ký tự)', { exact: true }).fill('Người tạo thử');
  const created = page.waitForResponse(r => r.url().endsWith('/api/rooms') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Tạo phòng', exact: true }).click();
  const response = await created; expect(response.status()).toBe(201);
  const { roomCode } = await response.json();
  const second = await browser.newContext({ viewport: { width: 375, height: 812 } });
  try {
    const guest = await second.newPage(); await guest.goto('http://localhost:3000/play?mode=join');
    await guest.getByLabel('Biệt danh (1–30 ký tự)', { exact: true }).fill('Người vào thử');
    await guest.getByLabel('Mã phòng muốn vào', { exact: true }).fill(roomCode);
    const joined = guest.waitForResponse(r => r.url().endsWith('/join') && r.request().method() === 'POST');
    await guest.getByRole('button', { name: 'Vào phòng', exact: true }).click();
    expect((await joined).status()).toBe(200);
    await expect(guest.getByText('Người tạo thử', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Người vào thử', { exact: true }).first()).toBeVisible();
  } finally { await second.close(); }
});


test('Registration mail failure survives navigation as one safe toast', async ({page}) => {
  await page.route('**/api/auth/register',r=>r.fulfill({json:state('failed')}));
  await page.route('**/api/auth/verification/status',r=>r.fulfill({json:state()}));
  await page.goto('/register'); await fill(page,forms[0]);
  await page.getByRole('button',{name:'Tạo tài khoản',exact:true}).click();
  await expect(page).toHaveURL(/verify-email/);
  await expect(page.locator('[data-error-toast]')).toHaveCount(1);
  await expect(page.locator('[data-error-toast]')).toContainText('Chưa gửi được mã xác minh');
  await expect(page.locator('main')).not.toContainText('Chưa gửi được mã xác minh');
  await page.getByRole('button',{name:'Đóng thông báo lỗi'}).click();
  await expect(page.locator('[data-error-toast]')).toHaveCount(0);
});


for (const size of [{width:1366,height:768},{width:1440,height:900},{width:375,height:812}]) {
  test(`Verified success is a toast, not a form banner ${size.width}`, async ({page},info) => {
    test.skip((size.width===375)!==(info.project.name==='mobile'),'Matching viewport project');
    const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.name));
    await page.setViewportSize(size);await page.goto('/login');
    await page.getByRole('button',{name:'Đăng nhập',exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
    const clean=await geometry(page,'Đăng nhập');
    await page.goto('/login?verified=1');
    const toast=page.locator('[data-toast][data-tone="success"]');
    await expect(toast.getByRole('status')).toContainText('Xác minh email thành công');
    await expect(page.locator('main')).not.toContainText('Xác minh email thành công');
    await expect(page.locator('[data-toast]')).toHaveCount(1);
    await page.evaluate(()=>document.fonts.ready);
    expect(await geometry(page,'Đăng nhập')).toEqual(clean);
    await page.getByLabel('Email',{exact:true}).focus();await expect(page.getByLabel('Email',{exact:true})).toBeFocused();
    if(size.width===375){
      await page.setViewportSize({width:375,height:460});
      await expect.poll(async()=>overlaps(await toast.boundingBox(),await page.getByLabel('Email',{exact:true}).boundingBox())).toBe(false);
      await page.setViewportSize(size);
    }
    await mkdir(directory,{recursive:true});await page.screenshot({path:resolve(directory,`verified-success-toast-${size.width}.png`),fullPage:true});
    await toast.getByRole('button',{name:'Đóng thông báo',exact:true}).focus();await page.keyboard.press('Enter');await expect(toast).toHaveCount(0);
    expect(await geometry(page,'Đăng nhập')).toEqual(clean);
    await page.goto('/login?verified=1');await expect(toast).toBeVisible();
    await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page.locator('[data-toast]')).toHaveCount(0);
    await expect(page.getByLabel('Email',{exact:true})).toBeFocused();expect(pageErrors).toEqual([]);
  });
}
