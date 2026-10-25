import { expect, test } from "bun:test";
import {
  assertSyntheticTokenBudget,
  assertSyntheticOutputBudget,
} from "../../src/lib/synthetic-token-budget.server";

test("local tokenizer enforces 6144 input tokens including conservative framing", () => {
  expect(assertSyntheticTokenBudget("hello")).toBe(2049);
  expect(() => assertSyntheticTokenBudget("a ".repeat(6144))).toThrow();
});
test("local output validation denies more than 1500 tokens", () => {
  expect(() => assertSyntheticOutputBudget("hello")).not.toThrow();
  expect(() => assertSyntheticOutputBudget("a ".repeat(1501))).toThrow();
});
