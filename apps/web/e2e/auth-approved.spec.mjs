import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve('../../docs/design/screenshots/auth-lobby-approved');
const accountId = '6b477683-312d-4c43-812d-c9ae45a14b75';
const profile = { id: accountId, email: 'player@example.test', nickname: 'Kỳ thủ thử nghiệm', avatar: { id: 'default', name: 'Mặc định', assetPath: null } };
const state = () => ({ status: 'pending_verification', accountId, maskedEmail: 'p***@example.test', pendingExpiresAt: new Date(Date.now()+86400000).toISOString(), otpExpiresAt: new Date(Date.now()+300000).toISOString(), resendAt: new Date().toISOString(), delivery: 'sent' });

test('Approved Auth frames and fixture registration to lobby, paste and resend', async ({ page, context }, info) => {
  let sends = 0, verified = false;
  await page.route('**/api/auth/register', r => r.fulfill({json:state()}));
  await page.route('**/api/auth/verification/status', r => r.fulfill({json:state()}));
  await page.route('**/api/auth/verification/resend', r => { sends++; return r.fulfill({json:{...state(),resendAt:new Date(Date.now()+60000).toISOString()}}); });
  await page.route('**/api/auth/verification/verify', r => { verified = true; return r.fulfill({json:{ok:true}}); });
  await page.route('**/api/auth/login', r => r.fulfill({json:{accessToken:'fixture-only',expiresAt:new Date(Date.now()+900000).toISOString(),profile}}));
  await page.route('**/api/me', r => r.fulfill({json:profile}));
  await mkdir(directory,{recursive:true});
  const metrics = [];
  async function capture(name) {
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));});
    const measured = await page.evaluate(()=>({height:innerHeight,document:document.scrollingElement.scrollHeight,width:innerWidth,documentWidth:document.scrollingElement.scrollWidth,header:document.querySelector('header').getBoundingClientRect().height,frame:document.querySelector('[data-auth-frame]')?.getBoundingClientRect().toJSON()}));
    expect(measured.documentWidth).toBeLessThanOrEqual(measured.width);
    if(info.project.name==='desktop'){expect(measured.document).toBeLessThanOrEqual(measured.height);expect(measured.header).toBe(64);}
    else expect(measured.header).toBe(56);
    metrics.push({name,...measured});
    await page.screenshot({path:resolve(directory,`${name}-${info.project.name}.png`),fullPage:true});
  }
  await page.goto('/login');await capture('login');
  await page.getByRole('link',{name:'Đăng ký',exact:true}).click();await expect(page).toHaveURL(/\/register$/);await page.getByRole('button',{name:'Tạo tài khoản',exact:true}).waitFor();await capture('register');
  await page.getByLabel('Biệt danh',{exact:true}).fill(profile.nickname);
  await page.getByLabel('Email',{exact:true}).fill(profile.email);
  await page.getByLabel('Mật khẩu',{exact:true}).fill('fixture-only-password');
  await page.getByLabel('Mật khẩu',{exact:true}).press('Enter');
  await expect(page).toHaveURL(/verify-email/);await page.getByRole('button',{name:'Xác minh',exact:true}).waitFor();await capture('otp');
  await page.getByRole('button',{name:'Gửi lại mã',exact:true}).click();expect(sends).toBe(1);
  await expect(page.getByText(/Gửi lại mã sau/)).toBeVisible();
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.evaluate(()=>navigator.clipboard.writeText('123456'));
  const code=page.getByLabel('Mã xác minh',{exact:true});await code.focus();await page.keyboard.press('Control+V');await expect(code).toHaveValue('123456');await code.press('Enter');
  await expect(page).toHaveURL(/login\?verified=1/);expect(verified).toBe(true);
  await expect(page.locator('[data-toast]')).toContainText('Xác minh email thành công');
  await page.getByLabel('Email',{exact:true}).fill(profile.email);await page.getByLabel('Mật khẩu',{exact:true}).fill('fixture-only-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await expect(page).toHaveURL(/\/lobby$/);await expect(page.getByRole('heading',{name:'Sảnh chính'})).toBeVisible();
  await writeFile(resolve(directory,`auth-metrics-${info.project.name}.json`),JSON.stringify(metrics,null,2));
});
