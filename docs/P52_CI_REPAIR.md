# P52 GitHub CI repair

## Root cause (reproduced locally)

`tests/mission/p35-access-contract.test.ts` hard-coded the Lovable workspace path `/dev-server`
for its child-process `cwd`, `mock.module` targets and dynamic imports. GitHub runners check out to
`/home/runner/work/<repo>/<repo>`, so `Bun.spawnSync` threw
`ENOENT: no such file or directory, posix_spawn 'bun'`. The message names `bun`, but Bun was
installed by `oven-sh/setup-bun`; the missing directory was the `cwd`. Reproduced by running the
previous test from a copy at a runner-style path (1 fail, same error).

## Fix

- Test resolves the repository root from `import.meta.dir` and spawns `process.execPath`.
  All 32 security assertions are unchanged; a deliberately weakened Crew Self rule in a
  throwaway copy still fails the test (`expected denied`).
- `quality.yml`, `p41-full-validation.yml`, `release-candidate.yml` now pin
  `oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6` (v2.2.0) with Bun `1.4.4`,
  matching `medical-v3-release-gate.yml` and the local runtime.
- Six static verifiers called by `bun run check` were still looking for code in places it no longer is
  (shared four-domain profile argument, shared catalog picker, `DomainEvidencePanel`,
  P48.2 revalidation controller). They now check the current equivalent locations with the
  same requirements; none were removed.

## Owner-gated checks that still fail by design

`verify-p3663-activation`, `verify-p3664-owner-risk`, `verify-submission-gate` (P20) remain
blocked pending owner/external evidence. They run in the Medical v3 Release Gate
"All static scientific and private-evidence gates" step, so that workflow will still report
failure until that evidence exists. This is intended, not a CI defect.

GitHub CI status is not attested here; see the chat report for run status.
