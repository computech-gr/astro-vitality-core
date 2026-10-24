import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

describe("isolated browser infrastructure stop gate", () => {
  test("missing independent isolation configuration stops before runtime acceptance", () => {
    const result = spawnSync("python3", ["scripts/medical-v3-isolated-browser-preflight.py"], { encoding: "utf8" });
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("No browser, provider call or database mutation");
  });
  test("shared preview origin and non-loopback backend cannot pass", () => {
    const script = `import importlib.util
s=importlib.util.spec_from_file_location('gate','scripts/medical-v3-isolated-browser-preflight.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
for url in ['http://localhost:8080','https://mitochondria.edocinfo.com','http://example.com:54321','http://localhost:54321?redirect=external']:
 try:m.loopback_url(url)
 except ValueError:continue
 raise AssertionError('Unsafe origin allowed')
assert m.loopback_url('http://127.0.0.1:8091')=='http://127.0.0.1:8091'
`;
    const result = spawnSync("python3", ["-B", "-c", script], { encoding: "utf8" });
    expect(result.status).toBe(0);
  });
});