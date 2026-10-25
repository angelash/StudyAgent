import { execFile, type ChildProcess } from 'node:child_process';

/** Only the owned child (and its dedicated group) is eligible for termination. */
export async function terminateChildProcess(child: ChildProcess, grouped: boolean): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  const pid = child.pid;
  let release: () => void = () => {};
  const closed = new Promise<void>(resolve => { release = resolve; child.once('close', resolve); });
  const deadline = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => reject(new Error('无法确认模型进程及其子进程已结束')), 10000);
    timer.unref(); closed.finally(() => clearTimeout(timer));
  });
  try {
    await Promise.race([(async () => {
      if (process.platform === 'win32') {
        await new Promise<void>((resolve, reject) => execFile('taskkill.exe', ['/PID', String(pid), '/T', '/F'],
          { windowsHide: true, timeout: 8000 }, error => {
            // A natural exit during taskkill is already settled by this exact child.
            if (error && child.exitCode === null && child.signalCode === null) reject(new Error('未能终止模型进程树'));
            else resolve();
          }));
      } else {
        try { if (grouped) process.kill(-pid, 'SIGKILL'); else child.kill('SIGKILL'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
      }
      await closed;
    })(), deadline]);
  } finally {
    child.removeListener('close', release);
    release();
  }
}
