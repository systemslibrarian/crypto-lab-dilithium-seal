import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const npmCli = join(process.execPath, '..', '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');

// Exercise the actual npm entry point at the GitHub boundary. The fixture
// replaces gh before launching npm, so neither control can request a deploy.
function request(exitCode: number) {
  const dir = mkdtempSync(join(tmpdir(), 'dilithium-publish-control-'));
  const gh = join(dir, 'gh');
  writeFileSync(gh, '#!/usr/bin/env node\nconsole.log(JSON.stringify(process.argv.slice(2)));\nprocess.exit(Number(process.env.PUBLISH_CONTROL_EXIT));\n');
  chmodSync(gh, 0o700);
  try {
    return spawnSync(process.execPath, [npmCli, 'run', 'deploy', '--silent'], {
      cwd: root,
      env: { ...process.env, PATH: dir + delimiter + process.env.PATH, GH_TOKEN: '', PUBLISH_CONTROL_EXIT: String(exitCode) },
      encoding: 'utf8',
      timeout: 5000,
    });
  } finally {
    rmSync(dir, { recursive: true });
  }
}

describe('gated publishing request', () => {
  it('requests the existing reviewed-main workflow without uploading local files', () => {
    const result = request(0);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual([
      'workflow', 'run', 'deploy.yml', '--repo',
      'systemslibrarian/crypto-lab-dilithium-seal', '--ref', 'main',
    ]);
  });

  it('propagates a rejected request instead of reporting successful publishing', () => {
    const result = request(73);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(73);
  });
});
