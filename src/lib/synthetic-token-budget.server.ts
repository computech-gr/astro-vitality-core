import { Tiktoken } from "js-tiktoken/lite";
import ranks from "js-tiktoken/ranks/o200k_base";
import { SYNTHETIC_ACTIVATION_POLICY as policy } from "@/domain/health-intelligence/synthetic-activation-policy";

let tokenizer: Tiktoken | undefined;
/** Bundled, local tokenizer; no network, filesystem or provider call. */
export function assertSyntheticTokenBudget(body: string): number {
  tokenizer ??= new Tiktoken(ranks);
  // Entire serialized request includes instructions/schema; framing allowance is conservative.
  const count = tokenizer.encode(body, [], []).length + policy.inputOverheadTokens;
  if (count > policy.inputTokens) throw new Error("Synthetic input token limit exceeded");
  return count;
}

export function assertSyntheticOutputBudget(text: string): void {
  tokenizer ??= new Tiktoken(ranks);
  if (tokenizer.encode(text, [], []).length > policy.outputTokens)
    throw new Error("Synthetic output token limit exceeded");
}