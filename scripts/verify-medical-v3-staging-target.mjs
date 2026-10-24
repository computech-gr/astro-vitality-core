/** Read-only staging target guard. Does not attest service isolation. */
import { isIP } from 'node:net';
const fail = (reason) => { console.error(`BLOCKED: ${reason}`); process.exitCode = 2; };
const raw = process.env.MITO_V3_STAGING_ORIGIN;
const expected = process.env.MITO_V3_STAGING_EXPECTED_HOST;
if (!raw || !expected) {
  fail('Set MITO_V3_STAGING_ORIGIN and MITO_V3_STAGING_EXPECTED_HOST for an owner-approved isolated environment.');
} else {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const allowLocal = process.env.MITO_V3_ALLOW_LOCAL_STAGING === 'true';
    const local = host === 'localhost' || host === '127.0.0.1';
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') fail('Origin must contain no credentials, path, query or fragment.');
    if (host !== expected.toLowerCase()) fail('Staging hostname differs from separately configured expected host.');
    if (url.protocol !== 'https:' && !(allowLocal && local && url.protocol === 'http:')) fail('HTTPS required except explicitly permitted loopback-only testing.');
    if (host.endsWith('.edocinfo.com') || host.endsWith('.lovable.app') || host.endsWith('.lovableproject.com')) fail('Shared/production domains are forbidden for isolated acceptance.');
    if (isIP(host) && !local) fail('Non-loopback IP addresses require separate documented review.');
    if (host === 'localhost' && !allowLocal) fail('Local testing requires explicit MITO_V3_ALLOW_LOCAL_STAGING=true.');
    if (!process.exitCode) console.log('PASS: staging target string policy only; Auth/Data API, network isolation and browser acceptance remain UNVERIFIED.');
  } catch { fail('Invalid staging origin.'); }
}
