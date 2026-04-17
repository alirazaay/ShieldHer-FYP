const { spawnSync } = require('child_process');

function getJavaMajorVersion() {
  const result = spawnSync('java', ['-version'], { encoding: 'utf8' });
  const output = `${result.stderr || ''}\n${result.stdout || ''}`;

  if (result.error || !output.trim()) {
    return null;
  }

  const quotedMatch = output.match(/version\s+"(\d+)(?:\.(\d+))?/i);
  if (quotedMatch) {
    const first = Number(quotedMatch[1]);
    // Java 8 uses 1.8 format in older distributions.
    if (first === 1 && quotedMatch[2]) {
      return Number(quotedMatch[2]);
    }
    return first;
  }

  const openJdkMatch = output.match(/openjdk\s+(\d+)(?:\.(\d+))?/i);
  if (openJdkMatch) {
    return Number(openJdkMatch[1]);
  }

  return null;
}

function runCommand(command) {
  const child = spawnSync(command, {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });

  return Number.isInteger(child.status) ? child.status : 1;
}

const isStrict = process.env.REQUIRE_FIRESTORE_EMULATOR === 'true' || process.env.CI === 'true';
const javaMajor = getJavaMajorVersion();

if (javaMajor == null || javaMajor < 21) {
  const found = javaMajor == null ? 'not found' : `v${javaMajor}`;
  const message = `[rules] Firestore emulator requires Java 21+. Detected ${found}.`;

  if (isStrict) {
    console.error(`${message} Failing because strict mode is enabled.`);
    process.exit(1);
  }

  console.warn(`${message} Falling back to non-emulator rules tests.`);
  process.exit(runCommand('npm run test:rules'));
}

process.exit(
  runCommand(
    'firebase emulators:exec --only firestore --project demo-shieldher "npm run test:rules"'
  )
);
