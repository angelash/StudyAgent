const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runSubmission } = require('../gesp/run_submission.cjs');

const output = path.resolve(process.argv[2] ?? 'data/qa/gesp-runner-runtime.json');
const started = Date.now();
const valid = runSubmission({ source: '#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}',
  tests: [{ input: '2 3\n', expected: '5' }, { input: '-4 9\n', expected: '5' }] });
assert.equal(valid.passed, true); assert.deepEqual(valid.tests.map(row => row.status), ['passed', 'passed']);
const wrong = runSubmission({ source: '#include <iostream>\nint main(){std::cout<<"wrong\\n";}', tests: [{ input: '', expected: 'hidden-expected' }] });
assert.equal(wrong.passed, false); assert.equal(wrong.tests[0].status, 'wrong_output'); assert(!JSON.stringify(wrong).includes('hidden-expected'));
const timeout = runSubmission({ source: 'int main(){volatile unsigned long long x=0;for(;;){x++;}}', tests: [{ input: '', expected: '' }] });
assert.equal(timeout.passed, false); assert.equal(timeout.tests[0].status, 'timeout'); assert.equal(timeout.tests[0].exitCode, 124);
const blocked = runSubmission({ source: '#include <fstream>\n#include <iostream>\nint main(){std::ifstream f("/mnt/c/Windows/win.ini");std::cout<<(f?"OPENED":"BLOCKED")<<"\\n";}',
  tests: [{ input: '', expected: 'BLOCKED' }] });
assert.equal(blocked.passed, true); assert.equal(blocked.tests[0].stdout.trim(), 'BLOCKED');
const receipt = { format: 'study-agent-gesp-runner-acceptance-v1', at: new Date().toISOString(), passed: true,
  elapsedMs: Date.now() - started, checks: { valid: valid.passed, wrong: wrong.tests[0].status, timeout: timeout.tests[0].status,
    filesystemBoundary: blocked.tests[0].stdout.trim() }, toolchain: valid.toolchain, limits: valid.limits,
  receiptSha256: { valid: valid.sourceSha256, wrong: wrong.sourceSha256, timeout: timeout.sourceSha256, filesystemBoundary: blocked.sourceSha256 },
  scope: 'One local WSL Linux namespace and static C++17 toolchain. This establishes the runner boundary only, not curriculum review or human programming assessment.' };
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
