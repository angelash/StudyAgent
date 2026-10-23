/* Full browser acceptance uses an isolated Web build and anonymous fixture API.
   Source-course responses are deterministic; live-model receipts are separate. */
if (!process.argv.includes('--full')) process.argv.push('--full');
require('./run-source-course-browser.cjs');
