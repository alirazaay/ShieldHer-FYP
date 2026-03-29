#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const STAGED_ONLY = process.argv.includes('--staged');

const IGNORED_FILES = new Set([
  '.env.example',
  'package-lock.json',
]);

const IGNORED_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf', '.zip', '.db', '.mp3', '.mp4', '.wav', '.ttf', '.otf',
]);

const SECRET_PATTERNS = [
  {
    label: 'Firebase API key',
    regex: /AIza[0-9A-Za-z\-_]{35}/g,
  },
  {
    label: 'Private key block',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    label: 'Twilio SID',
    regex: /\bAC[a-fA-F0-9]{32}\b/g,
  },
  {
    label: 'Twilio auth token assignment',
    regex: /TWILIO_AUTH_TOKEN\s*=\s*[^\s"']{16,}/g,
  },
  {
    label: 'Potential hardcoded secret assignment',
    regex: /(?:API_KEY|AUTH_TOKEN|SECRET_KEY|ACCESS_TOKEN|PRIVATE_KEY)\s*[:=]\s*["'][^"']{16,}["']/g,
  },
];

function getCandidateFiles() {
  const command = STAGED_ONLY ? 'git diff --cached --name-only' : 'git ls-files';
  const output = execSync(command, { encoding: 'utf8' }).trim();
  if (!output) return [];
  return output.split(/\r?\n/).filter(Boolean);
}

function shouldScanFile(relPath) {
  if (IGNORED_FILES.has(relPath)) return false;
  if (relPath.startsWith('node_modules/')) return false;
  if (relPath.startsWith('android/build/') || relPath.startsWith('android/app/build/')) return false;

  const ext = path.extname(relPath).toLowerCase();
  if (IGNORED_EXTENSIONS.has(ext)) return false;

  return true;
}

function findMatches(content) {
  const findings = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((line, idx) => {
    SECRET_PATTERNS.forEach((pattern) => {
      if (pattern.regex.test(line)) {
        findings.push({
          line: idx + 1,
          label: pattern.label,
          preview: line.trim().slice(0, 160),
        });
      }
      pattern.regex.lastIndex = 0;
    });
  });

  return findings;
}

function main() {
  let files;
  try {
    files = getCandidateFiles();
  } catch (err) {
    console.error(`[secret-scan] Unable to list git files: ${err.message || String(err)}`);
    process.exit(2);
  }

  const findings = [];

  files.forEach((relPath) => {
    if (!shouldScanFile(relPath)) return;

    const absPath = path.join(ROOT, relPath);
    if (!fs.existsSync(absPath)) return;

    let content;
    try {
      content = fs.readFileSync(absPath, 'utf8');
    } catch {
      return;
    }

    const fileFindings = findMatches(content);
    fileFindings.forEach((f) => findings.push({ file: relPath, ...f }));
  });

  if (findings.length === 0) {
    console.log(`[secret-scan] OK: no potential secrets found (${STAGED_ONLY ? 'staged' : 'tracked'} files).`);
    return;
  }

  console.error('[secret-scan] Potential secrets detected:');
  findings.forEach((f) => {
    console.error(`- ${f.file}:${f.line} [${f.label}] ${f.preview}`);
  });
  console.error('[secret-scan] Commit blocked. Remove secrets or move them to environment variables.');
  process.exit(1);
}

main();
