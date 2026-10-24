import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Execute the actual inline reporter, using synthetic HTTP pages and no credentials/network.
const workflow = readFileSync(".github/workflows/medical-v3-exact-commit-status.yml", "utf8");
const source = workflow.split("python3 - <<'PY'\n")[1]?.split("          PY")[0];
if (!source) throw new Error("Exact-commit reporter missing");
const script = source
  .split("\n")
  .map((line) => line.replace(/^ {10}/, ""))
  .join("\n");
function report(pages: unknown[][]) {
  const harness = `
import io,json,os,urllib.request
from unittest.mock import patch
pages=json.loads(${JSON.stringify(JSON.stringify(pages))})
calls=[]; summary=io.StringIO()
def request(req,timeout):
    calls.append(req.full_url)
    return io.StringIO(json.dumps({'workflow_runs':pages[len(calls)-1]}))
class Summary:
    def __enter__(self): return summary
    def __exit__(self,*args): pass
with patch.dict(os.environ,{'REPO':'synthetic/repository','TARGET_SHA':'target','GH_TOKEN':'test-only-not-a-credential','GITHUB_STEP_SUMMARY':'unused'}),patch('urllib.request.urlopen',request),patch('builtins.open',lambda *args:Summary()):
    exec(${JSON.stringify(script)})
print('PAGE_COUNT='+str(len(calls)))
`;
  const result = spawnSync("python3", ["-c", harness], { encoding: "utf8" });
  expect(result.status).toBe(0);
  return result.stdout;
}
const run = (name: string, changes: Record<string, unknown> = {}) => ({
  name,
  head_sha: "target",
  id: 1,
  run_attempt: 1,
  created_at: "2026-10-24T10:00:00Z",
  status: "completed",
  conclusion: "success",
  run_number: 1,
  html_url: "https://github.com/synthetic/repository/actions/runs/1",
  ...changes,
});
const names = ["Quality", "Security Scan", "Medical v3 Release Gate"];
describe("exact-commit CI conclusions", () => {
  test("reads later pages before declaring matching checks missing", () => {
    const output = report([
      Array.from({ length: 100 }, () => run("Other workflow")),
      names.map((name) => run(name)),
    ]);
    expect(output).toContain("PAGE_COUNT=2");
    expect(output).toContain("All three green on exact SHA:** YES");
  });
  test("newer failed run takes precedence over an older successful rerun", () => {
    const output = report([
      [
        ...names.map((name) => run(name, { run_attempt: 9 })),
        run("Quality", { id: 2, created_at: "2026-10-24T11:00:00Z", conclusion: "failure" }),
      ],
    ]);
    expect(output).toContain("completed | failure");
    expect(output).toContain("NO — NOT RELEASE READY");
  });
  test("missing, pending and other-commit checks never attest success", () => {
    for (const changes of [{ head_sha: "other" }, { status: "in_progress", conclusion: null }]) {
      const output = report([[run("Quality", changes), run("Security Scan")]]);
      expect(output).toContain("Medical v3 Release Gate | — | missing | UNVERIFIED");
      expect(output).toContain("NO — NOT RELEASE READY");
    }
  });
});
