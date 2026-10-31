const fs = require('node:fs'), path = require('node:path');
let build = fs.readFileSync(path.join(__dirname, 'web-build-first.cjs'), 'utf8').replaceAll('source182-first', 'source182-second').replaceAll('web-build-first', 'web-build-second').replaceAll('13183', '13184');
fs.writeFileSync(path.join(__dirname, 'web-build-second.cjs'), build, { flag: 'wx' });
let server = fs.readFileSync(path.join(__dirname, 'browser-web-first.cjs'), 'utf8').replaceAll('web-build-first', 'web-build-second').replaceAll('browser-web-first', 'browser-web-second');
fs.writeFileSync(path.join(__dirname, 'browser-web-second.cjs'), server, { flag: 'wx' });
let browser = fs.readFileSync(path.join(__dirname, 'browser-second.cjs'), 'utf8').replaceAll('web-build-first.json', 'web-build-second.json').replace("path.join(__dirname, 'browser-second')", "path.join(__dirname, 'browser-third')").replaceAll('http://localhost:13183', 'http://localhost:13184').replaceAll('webPort: 13183', 'webPort: 13184');
browser = browser.replace('await panel(page).scrollIntoViewIfNeeded();', "await panel(page).evaluate(element => element.scrollIntoView({ block: 'start' }));");
browser = browser.replace('await panel(page).scrollIntoViewIfNeeded(); assert(await page.evaluate', "await panel(page).evaluate(element => element.scrollIntoView({ block: 'start' })); await expect(panel(page)).toHaveCSS('scroll-margin-top', '72px'); assert(await page.evaluate");
fs.writeFileSync(path.join(__dirname, 'browser-third.cjs'), browser, { flag: 'wx' });
