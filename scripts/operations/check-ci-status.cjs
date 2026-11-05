#!/usr/bin/env node
// Release gate: a commit may be published only after every GitHub Actions check run
// for that exact SHA has completed successfully.
//   node scripts/operations/check-ci-status.cjs [sha]        default: HEAD
// Uses the GitHub CLI (`gh`, already authenticated) when available; otherwise
// GITHUB_TOKEN with the REST API. Exit 0 = all green, 1 = failed, 2 = pending/unknown.
const { spawnSync } = require('node:child_process');

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

function repositorySlug() {
  const remote = git(['remote', 'get-url', 'origin']);
  const match = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remote);
  if (!match) throw new Error(`origin is not a GitHub remote: ${remote}`);
  return `${match[1]}/${match[2]}`;
}

async function checkRuns(slug, sha) {
  const route = `repos/${slug}/commits/${sha}/check-runs?per_page=100`;
  const gh = spawnSync('gh', ['api', route], { encoding: 'utf8', shell: process.platform === 'win32' });
  if (gh.status === 0) return JSON.parse(gh.stdout).check_runs;
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('Neither an authenticated `gh` CLI nor GITHUB_TOKEN is available');
  const response = await fetch(`https://api.github.com/${route}`, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
  return (await response.json()).check_runs;
}

async function main() {
  const sha = git(['rev-parse', process.argv[2] ?? 'HEAD']);
  const slug = repositorySlug();
  const runs = await checkRuns(slug, sha);
  if (!runs.length) { process.stdout.write(`No CI check runs found for ${sha}. Push first and wait for Verify.\n`); process.exit(2); }
  const lines = runs.map(run => `  ${run.status === 'completed' ? run.conclusion : run.status}  ${run.name}`);
  const pending = runs.filter(run => run.status !== 'completed');
  const failed = runs.filter(run => run.status === 'completed' && !['success', 'skipped', 'neutral'].includes(run.conclusion));
  process.stdout.write(`CI for ${slug}@${sha.slice(0, 12)}:\n${lines.join('\n')}\n`);
  if (failed.length) { process.stdout.write('Release blocked: CI failed.\n'); process.exit(1); }
  if (pending.length) { process.stdout.write('Release blocked: CI still running.\n'); process.exit(2); }
  process.stdout.write('CI green: this exact commit may be published.\n');
}

main().catch(error => { process.stderr.write(`Release gate could not verify CI: ${error.message}\n`); process.exit(2); });
