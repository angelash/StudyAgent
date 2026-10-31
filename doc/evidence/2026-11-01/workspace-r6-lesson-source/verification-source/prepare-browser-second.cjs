const fs = require('node:fs'), path = require('node:path');
let source = fs.readFileSync(path.join(__dirname, 'browser-first.cjs'), 'utf8');
source = source.replace("path.join(__dirname, 'browser-first')", "path.join(__dirname, 'browser-second')");
source = source.replace("async function run(browser, name, fn, readonly = true) {", "async function run(browser, name, fn, readonly = true) {\n  if (process.argv[2] && name !== process.argv[2]) return;");
const before = "await expect(work(page)).toContainText('当前教研身份或登录会话已变更');";
if (!source.includes(before)) throw Error('Expected first failure context missing');
source = source.replace(before, "await expect(page.getByRole('heading', { name: '当前身份无法访问此管理功能', exact: true })).toBeVisible(); await expect(page.getByRole('link', { name: '返回学习工作台', exact: true })).toBeVisible(); await expect(page.locator('.curriculum-source-text')).toHaveCount(0); await expect(page.locator('.admin-textbook-source iframe')).toHaveCount(0);");
fs.writeFileSync(path.join(__dirname, 'browser-second.cjs'), source, { flag: 'wx' });
