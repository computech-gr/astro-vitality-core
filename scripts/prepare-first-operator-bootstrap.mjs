import { createHash, randomBytes } from 'node:crypto';

// Run locally in a trusted terminal. Never paste output into chat or commit it.
const secret = randomBytes(32).toString('base64url');
const hash = createHash('sha256').update(secret, 'utf8').digest('hex');
console.log('ONE-TIME BOOTSTRAP SECRET (keep private; enter only in the authenticated Mission Identity page):');
console.log(secret);
console.log('\nSQL FOR AN AUTHORIZED PRIVILEGED DATABASE CONSOLE (not the public browser):');
console.log(`select public.configure_mission_bootstrap('${hash}'::text);`);
console.log('\nDo not run this SQL unless you are the authorized deployment administrator.');
console.log('The SQL arms only the one-time hash; it does not create a mission or account.');
console.log('Keep the secret securely until redemption; do not share it with Lovable or Git.');
