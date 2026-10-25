import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { terminateChildProcess } from './terminate-child-process';

describe('owned model process cancellation', () => {
  it('waits for the real parent and its spawned worker to exit', async () => {
    const grouped = process.platform !== 'win32';
    const source = "const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});console.log(JSON.stringify({parent:process.pid,child:child.pid}));setInterval(()=>{},1000);";
    const child: ChildProcess = spawn(process.execPath, ['-e', source], { windowsHide: true, detached: grouped, stdio: ['ignore', 'pipe', 'pipe'] });
    let ids: { parent: number; child: number } | undefined;
    try {
      const output = await Promise.race([once(child.stdout!, 'data'), new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error('Synthetic process did not start')), 5000); timer.unref(); })]);
      ids = JSON.parse(String(output[0])); expect(ids!.parent).toBe(child.pid); expect(ids!.child).toBeGreaterThan(0);
      await terminateChildProcess(child, grouped);
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
      for (const pid of [ids!.parent, ids!.child]) {
        const executing = () => { try { process.kill(pid, 0); return process.platform !== 'linux' || !/^\d+ \(.*\) Z /.test(readFileSync('/proc/' + pid + '/stat', 'utf8')); } catch { return false; } };
        const deadline = Date.now() + 5000; while (executing() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
        expect(executing()).toBe(false);
      }
    } finally {
      if (child.exitCode === null && child.signalCode === null) await terminateChildProcess(child, grouped);
    }
  });
});
