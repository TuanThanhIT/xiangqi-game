import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const colors = (text) => Object.fromEntries([...text.matchAll(/--xq-([\w-]+):\s*(#[\da-f]{6});/g)].map(m=>[m[1],m[2]]));
function luminance(hex) {
  const a = hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
  return a[0]*.2126+a[1]*.7152+a[2]*.0722;
}
function ratio(a,b) { const x=luminance(a), y=luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }

test("Năm theme: tương phản chữ/nút/focus/lưới/phe trên đúng palette CSS", () => {
  const base = colors(read("apps/web/src/styles/ui.css").match(/:root\s*\{([^}]+)\}/)[1]);
  const themes = [...read("apps/web/src/styles/themes.css").matchAll(/\[data-theme="([a-z]+)"\]\s*\{([^}]+)\}/g)];
  assert.equal(themes.length,5);
  for (const [,id,text] of themes) {
    const v={...base,...colors(text)};
    for (const [fg,bgs,minimum] of [
      ["text",["surface","surface-raised","background"],4.5], ["text-muted",["surface","surface-raised","background"],4.5],
      ["accent",["surface","surface-raised"],4.5], ["on-primary",["primary","primary-hover","primary-pressed"],4.5],
      ["danger-text",["surface","surface-raised","danger-hover","danger-pressed"],4.5], ["success-text",["surface-raised"],4.5],
      ["disabled-text",["primary-disabled","secondary-disabled","danger-disabled"],4.5], ["border-control",["surface","surface-raised"],3],
      ["accent",["secondary-hover"],3], ["primary-border",["primary","primary-hover","surface"],3],
      ["focus-dark",["surface","surface-raised","background"],3], ["board-line",["board","river"],3],
      ["board-focus",["board","river","river-depth","piece"],3], ["board-last-move",["board","river","river-depth","piece"],3],
      ["board-line",["river-depth"],3],
      ["side-red",["piece"],4.5], ["side-black",["piece"],4.5],
      ["nameplate-text",["nameplate","nameplate-active"],4.5],
      ["nameplate-muted",["nameplate","nameplate-active"],4.5],
      ["nameplate-accent",["nameplate","nameplate-active"],4.5],
      ["nameplate-online",["nameplate","nameplate-active"],3],
    ]) for (const bg of bgs) assert.ok(ratio(v[fg],v[bg])>=minimum,`${id}: ${fg}/${bg} under ${minimum}:1`);
  }
});

test("Gradient quân: chữ hai phe rõ trên cả ba stop màu ngà", () => {
  for (const fg of ["#a52121", "#262626"]) for (const bg of ["#fff6e3", "#f4e5c7", "#dfc99e"]) assert.ok(ratio(fg,bg)>=4.5);
});

test("Asset local: đúng 15 file WebP, preview nhỏ; không dùng concept làm nền", () => {
  const manifest = JSON.parse(read("apps/web/public/themes/ASSETS.json"));
  assert.equal(manifest.assets.length,15);
  for (const asset of manifest.assets) {
    const bytes = fs.statSync("apps/web/public/themes/"+asset.file).size;
    const limit = asset.file.endsWith("page-bg.webp") ? 400000 : asset.file.endsWith("ground.webp") ? 150000 : 35000;
    assert.ok(bytes<=limit,`${asset.file} over budget`);
  }
  const source = read("apps/web/src/features/rooms/room-theme.ts");
  assert.ok(!source.includes("concepts/")); assert.ok(!source.includes("http://")); assert.ok(!source.includes("https://"));
});
