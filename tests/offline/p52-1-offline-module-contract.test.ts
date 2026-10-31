import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { InMemoryOfflineMissionStore, synchronizeOfflineMissionQueue } from "@/infrastructure/offline";
import { synchronizeGroundQueueIfAuthenticated } from "@/infrastructure/ground-research/runtime";

const testsRoot = join(import.meta.dir, "..");

function testFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return testFiles(path);
    return /\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("P52.1 offline module contract", () => {
  test("the offline barrel exposes the store and queue synchronization used across the app", () => {
    expect(typeof InMemoryOfflineMissionStore).toBe("function");
    expect(typeof synchronizeOfflineMissionQueue).toBe("function");
    expect(typeof synchronizeGroundQueueIfAuthenticated).toBe("function");
  });

  test("every Bun stand-in for the offline barrel keeps the real exports and restores them", () => {
    // Bun module mocks are process-wide; a partial stand-in removes exports for later test files.
    const offenders: string[] = [];
    for (const file of testFiles(testsRoot)) {
      if (file === import.meta.path) continue;
      const source = readFileSync(file, "utf8");
      if (!source.includes('mock.module("@/infrastructure/offline"')) continue;
      const keepsActual = /mock\.module\("@\/infrastructure\/offline",\s*\(\)\s*=>\s*\(\{\s*\.\.\.actualOffline/.test(source);
      const restores = /afterAll\(\(\)\s*=>\s*\{\s*mock\.module\("@\/infrastructure\/offline",\s*\(\)\s*=>\s*actualOffline\)/.test(source);
      if (!keepsActual || !restores) offenders.push(relative(testsRoot, file));
    }
    expect(offenders).toEqual([]);
  });
});
