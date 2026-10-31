const fs = require('node:fs'), path = require('node:path');
function rewrite(from, to, substitutions) { let value = fs.readFileSync(path.join(__dirname, from), 'utf8'); for (const [before, after] of substitutions) value = value.replaceAll(before, after); fs.writeFileSync(path.join(__dirname, to), value, { flag: 'wx' }); }
const ports = [['16181', '16182'], ['13181', '13182']];
rewrite('web-build-first.cjs', 'web-build-second.cjs', [['.next-curriculum181-first', '.next-curriculum181-second'], ['web-build-first', 'web-build-second'], ...ports]);
rewrite('browser-api-first.cjs', 'browser-api-second.cjs', [['scope-browser-first', 'scope-browser-second'], ['browser-api-first', 'browser-api-second'], ['browser-runtime-first', 'browser-runtime-second'], ...ports]);
rewrite('browser-web-first.cjs', 'browser-web-second.cjs', [['web-build-first', 'web-build-second'], ['browser-web-first', 'browser-web-second']]);
rewrite('browser-first.cjs', 'browser-second.cjs', [['browser-runtime-first', 'browser-runtime-second'], ['web-build-first', 'web-build-second'], ["'browser-first'", "'browser-second'"], ...ports,
  ["getByLabel('选择目录', { exact: true })", "getByRole('combobox', { name: '选择目录', exact: true })"], ["getByLabel('学科', { exact: true })", "getByRole('combobox', { name: '学科', exact: true })"], ["getByLabel('学期', { exact: true })", "getByRole('combobox', { name: '学期', exact: true })"]]);
let browser = fs.readFileSync(path.join(__dirname, 'browser-second.cjs'), 'utf8');
const marker = "    await run(browser, 'delayed-old-scope-cannot-replace-current-results'";
if (!browser.includes(marker)) throw Error('Original full browser journey required');
browser = browser.replace(marker, `    await run(browser, 'empty-registered-scope-is-not-complete-coverage', async ({ page }) => {
      await enter(page); await scope(page, 'english', 1);
      await expect(list(page).getByRole('status').filter({ hasText: '本范围' })).toContainText('本范围0册：0册有课时，0册尚无可核对课时；共0个课时');
      await expect(gaps(page).getByText('本范围尚未登记教材，请先核对学科、年级和学期。', { exact: true })).toBeVisible();
      await expect(gaps(page).getByRole('button', { name: /^核对教材目录/ })).toHaveCount(0); await picture(page, 'empty-registered-scope');
    });
` + marker);
fs.writeFileSync(path.join(__dirname, 'browser-second.cjs'), browser);
