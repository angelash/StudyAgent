// Read-only Git audit: prove that every existing branch is included in main.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const main = git('rev-parse', 'main');
const current = git('branch', '--show-current');
const localBranches = git('for-each-ref', '--format=%(refname:short)', 'refs/heads').split('\n').filter(Boolean);
const worktrees = git('worktree', 'list', '--porcelain').split('\n').filter(line => line.startsWith('worktree ')).map(line => line.slice(9));
const remoteHeads = git('ls-remote', '--heads', 'origin').split('\n').filter(Boolean).map(line => {
  const [sha, ref] = line.split(/\s+/);
  const result = spawnSync('git', ['merge-base', '--is-ancestor', sha, main], { cwd: root, windowsHide: true });
  return { ref, sha, includedInMain: result.status === 0 };
});
const report = {
  at: new Date().toISOString(), main, current, localBranches, worktrees,
  remoteHeads, historicalBranches: remoteHeads.filter(row => row.ref !== 'refs/heads/main').length,
  unmerged: remoteHeads.filter(row => !row.includedInMain),
  remoteMutation: false,
  passed: current === 'main' && localBranches.length === 1 && localBranches[0] === 'main' && worktrees.length === 1 && remoteHeads.length > 0 && remoteHeads.every(row => row.includedInMain),
};
if (process.argv[2]) {
  const target = path.resolve(root, process.argv[2]);
  if (!target.startsWith(root + path.sep)) throw new Error('Output must stay in the repository');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify({ passed: report.passed, main, localBranches, worktrees: worktrees.length, historicalBranches: report.historicalBranches, unmerged: report.unmerged }));
if (!report.passed) process.exitCode = 1;
