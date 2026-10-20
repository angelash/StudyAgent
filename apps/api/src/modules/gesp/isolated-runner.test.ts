import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const runner = require('../../../../../scripts/gesp/run_submission.cjs');
const probe = spawnSync('wsl.exe', ['-d', process.env.STUDY_GESP_WSL_DISTRO || 'Ubuntu', 'bash', '-lc',
  'command -v g++ >/dev/null && command -v unshare >/dev/null && command -v timeout >/dev/null'], { windowsHide: true, timeout: 5000 });
const available = process.platform === 'win32' && probe.status === 0;

describe.skipIf(!available)('isolated GESP C++ runner', () => {
  it('compiles once and compares multiple independent test runs', () => {
    const receipt = runner.runSubmission({ source: '#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}',
      tests: [{ input: '2 3\n', expected: '5' }, { input: '-4 9\n', expected: '5' }] });
    expect(receipt).toMatchObject({ format: 'gesp-isolated-run-v2', host: 'wsl:Ubuntu', passed: true, compile: { passed: true } });
    expect(receipt.tests.map((row: any) => row.status)).toEqual(['passed', 'passed']);
    expect(JSON.stringify(receipt)).not.toContain('-4 9');
  }, 30_000);
  it('reports compile errors and wrong answers without exposing expected output in the receipt', () => {
    const compileError = runner.runSubmission({ source: 'int main(){ this is invalid; }', tests: [{ input: '', expected: '' }] });
    expect(compileError.passed).toBe(false); expect(compileError.compile.passed).toBe(false); expect(compileError.compile.stderr.length).toBeGreaterThan(0);
    const wrong = runner.runSubmission({ source: '#include <iostream>\nint main(){std::cout<<"wrong\\n";}', tests: [{ input: '', expected: 'hidden-expected' }] });
    expect(wrong.passed).toBe(false); expect(wrong.tests[0]).toMatchObject({ status: 'wrong_output', passed: false });
    expect(JSON.stringify(wrong)).not.toContain('hidden-expected');
  }, 40_000);
  it('terminates an infinite loop and records the wall-time status', () => {
    const receipt = runner.runSubmission({ source: 'int main(){volatile unsigned long long x=0;for(;;){x++;}}', tests: [{ input: '', expected: '' }] });
    expect(receipt.passed).toBe(false); expect(receipt.tests[0]).toMatchObject({ status: 'timeout', exitCode: 124, passed: false });
  }, 30_000);
  it('hides the Windows mount from compiled code', () => {
    const receipt = runner.runSubmission({ source: '#include <fstream>\n#include <iostream>\nint main(){std::ifstream f("/mnt/c/Windows/win.ini");std::cout<<(f?"OPENED":"BLOCKED")<<"\\n";}',
      tests: [{ input: '', expected: 'BLOCKED' }] });
    expect(receipt.passed).toBe(true); expect(receipt.tests[0].stdout.trim()).toBe('BLOCKED');
  }, 30_000);
});
