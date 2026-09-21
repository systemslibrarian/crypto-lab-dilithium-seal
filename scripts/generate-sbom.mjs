#!/usr/bin/env node
/**
 * A CycloneDX 1.6 software bill of materials, generated from package-lock.json.
 *
 * ── Why this is hand-rolled rather than `@cyclonedx/cyclonedx-npm` ────────
 * Adding a tool to describe the dependency tree would add ~40 packages to the
 * dependency tree it describes, and every one of them would then be inside the
 * `npm audit --audit-level=moderate` gate that can block this repository's
 * merges. Paying that to emit a JSON document of a published, stable shape is a
 * poor trade for a project whose whole supply-chain posture is "one runtime
 * dependency, pinned".
 *
 * The lockfile already holds everything an SBOM needs — name, exact version,
 * resolved tarball URL and a subresource-integrity hash per package — so this
 * reads it directly and is unit-tested against a synthetic lockfile.
 *
 * Usage:
 *   node scripts/generate-sbom.mjs                  # write sbom.cdx.json
 *   node scripts/generate-sbom.mjs --stdout         # print instead
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** CycloneDX names SHA-256/384/512; npm writes `sha512-<base64>`. */
const INTEGRITY_ALGORITHMS = { sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' };

/** `sha512-<base64>` → `{ alg, content }` in CycloneDX's hex form. */
export function integrityToHash(integrity) {
  if (typeof integrity !== 'string') return null;
  const [algorithm, base64] = integrity.split('-', 2);
  const alg = INTEGRITY_ALGORITHMS[algorithm];
  if (!alg || !base64) return null;
  return { alg, content: Buffer.from(base64, 'base64').toString('hex') };
}

/**
 * Package URL for an npm package, per the purl spec.
 *
 * Scoped names keep their `@`, and the scope's slash is NOT encoded — `pkg:npm/`
 * uses the namespace/name form, so `@noble/post-quantum` becomes
 * `pkg:npm/%40noble/post-quantum`.
 */
export function purlFor(name, version) {
  if (name.startsWith('@')) {
    const [scope, bare] = name.slice(1).split('/', 2);
    return `pkg:npm/%40${encodeURIComponent(scope)}/${encodeURIComponent(bare)}@${version}`;
  }
  return `pkg:npm/${encodeURIComponent(name)}@${version}`;
}

/** The npm path `node_modules/a/node_modules/b` names package `b`. */
function packageNameFrom(path) {
  const index = path.lastIndexOf('node_modules/');
  return index === -1 ? path : path.slice(index + 'node_modules/'.length);
}

/**
 * Build the SBOM document.
 *
 * `serialNumber` and `timestamp` are supplied by the caller so the output is
 * deterministic under test; the CLI path below fills them in.
 */
export function buildSbom(lock, pkg, { serialNumber, timestamp }) {
  const components = [];
  const seen = new Set();

  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    // "" is the root project, which is the `metadata.component`, not a dependency.
    if (path === '' || !entry.version) continue;
    if (entry.link) continue; // a symlink to a workspace, not a published artifact

    const name = packageNameFrom(path);
    const key = `${name}@${entry.version}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const hash = integrityToHash(entry.integrity);
    components.push({
      type: 'library',
      'bom-ref': purlFor(name, entry.version),
      name,
      version: entry.version,
      purl: purlFor(name, entry.version),
      scope: entry.dev ? 'excluded' : 'required',
      ...(hash ? { hashes: [hash] } : {}),
      ...(entry.resolved ? { externalReferences: [{ type: 'distribution', url: entry.resolved }] } : {}),
      ...(entry.license ? { licenses: [{ license: { id: entry.license } }] } : {}),
    });
  }

  // Sorted by purl so two runs over the same lockfile produce identical bytes.
  components.sort((a, b) => a.purl.localeCompare(b.purl));

  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber,
    version: 1,
    metadata: {
      timestamp,
      tools: {
        components: [
          { type: 'application', name: 'generate-sbom.mjs', version: '1.0.0', author: 'dilithium-seal' },
        ],
      },
      component: {
        type: 'application',
        'bom-ref': purlFor(pkg.name, pkg.version),
        name: pkg.name,
        version: pkg.version,
        purl: purlFor(pkg.name, pkg.version),
        ...(pkg.description ? { description: pkg.description } : {}),
      },
    },
    components,
  };
}

function main() {
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

  // A stable, content-derived URN: the same lockfile always yields the same
  // serial number, so two SBOMs can be compared without diffing a random UUID.
  const digest = createHash('sha256')
    .update(readFileSync(join(ROOT, 'package-lock.json')))
    .digest('hex');
  const serialNumber =
    `urn:uuid:${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}` +
    `-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;

  const sbom = buildSbom(lock, pkg, {
    serialNumber,
    timestamp: new Date().toISOString(),
  });
  const json = `${JSON.stringify(sbom, null, 2)}\n`;

  if (process.argv.includes('--stdout')) {
    // `node scripts/generate-sbom.mjs --stdout | head` closes the pipe early;
    // without this Node throws EPIPE and prints a stack trace over the output.
    process.stdout.on('error', (err) => {
      if (err.code !== 'EPIPE') throw err;
    });
    process.stdout.write(json);
  } else {
    const out = join(ROOT, 'sbom.cdx.json');
    writeFileSync(out, json);
    process.stderr.write(
      `generate-sbom: ${sbom.components.length} components -> ${out.slice(ROOT.length)}\n`
    );
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main();
}
