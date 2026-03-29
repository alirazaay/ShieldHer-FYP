#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const { execSync } = require('child_process');

function run(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    return {
      failed: true,
      message: String(error.stderr || error.message || error),
    };
  }
}

function pass(label, detail) {
  console.log(`[PASS] ${label}${detail ? ` - ${detail}` : ''}`);
}

function warn(label, detail) {
  console.log(`[WARN] ${label}${detail ? ` - ${detail}` : ''}`);
}

function fail(label, detail) {
  console.log(`[FAIL] ${label}${detail ? ` - ${detail}` : ''}`);
}

function main() {
  let issues = 0;

  const hookPath = run('git config --get core.hooksPath');
  if (typeof hookPath === 'string' && hookPath === '.githooks') {
    pass('Git hooks path configured', hookPath);
  } else {
    issues += 1;
    warn('Git hooks path not configured', 'run: npm run hooks:install');
  }

  const trackedEnv = run('git ls-files -- .env');
  if (typeof trackedEnv === 'string' && trackedEnv.length > 0) {
    issues += 1;
    fail('.env is tracked by git', 'remove it from history and index immediately');
  } else {
    pass('.env is not tracked in current index');
  }

  if (fs.existsSync('.env')) {
    warn('.env file exists locally', 'ensure it is not committed and values are rotated if ever exposed');
  } else {
    pass('.env file not found in working tree');
  }

  const historyCheck = run('git rev-list --all -- .env');
  if (typeof historyCheck === 'string' && historyCheck.length > 0) {
    issues += 1;
    warn('.env found in git history', 'perform history rewrite and force-push per incident response plan');
  } else {
    pass('.env not found in git history');
  }

  const secretScan = run('node scripts/secret-scan.js');
  if (typeof secretScan === 'string' && !secretScan.failed) {
    pass('Secret scan command executed', 'no potential secrets found');
  } else {
    issues += 1;
    fail('Secret scan failed', secretScan.message || 'unknown error');
  }

  console.log(`\nSecurity status summary: ${issues === 0 ? 'healthy' : 'action required'} (${issues} issue(s)).`);
  process.exit(issues === 0 ? 0 : 1);
}

main();
