import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('P36.6 release preflight is non-deploying', () => {
  const script = readFileSync('scripts/verify-p366-cloud-release.mjs', 'utf8');
  const doc = readFileSync('docs/P36_6_CLOUD_ACTIVATION_GITHUB_RELEASE.md', 'utf8');
  it('only reads local migration files', () => {
    expect(script).toContain('readFileSync');
    expect(script).not.toContain('execSync');
    expect(script).not.toContain('supabase db push');
  });
  it('requires real live approval evidence and verified recovery', () => {
    expect(doc).toContain('verified restore checkpoint');
    expect(doc).toContain('FV01-TEST-B');
    expect(doc).toContain('GitHub');
  });
  it('retains all scientific and security gates', () => {
    expect(doc).toContain('FV-01-13 OPEN');
    expect(doc).toContain('Final Security Gate BLOCKED');
  });
});
