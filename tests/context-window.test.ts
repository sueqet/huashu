import assert from "node:assert/strict";
import test from "node:test";
import {
  inChainOrder,
  keepNewestWithinBudget,
  partitionChain,
} from "../src/services/context-window.ts";

function chainOf(count: number, pinned: number[] = []) {
  return Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    isPinned: pinned.includes(i),
  }));
}

test("keeps first round, recent rounds and pinned middle nodes as fixed", () => {
  const chain = chainOf(10, [3]);
  const { fixed, candidates } = partitionChain(chain, 2);

  assert.deepEqual(
    fixed.map((n) => n.id),
    ["n0", "n1", "n3", "n6", "n7", "n8", "n9"]
  );
  assert.deepEqual(
    candidates.map((n) => n.id),
    ["n2", "n4", "n5"]
  );
});

test("short chains have no candidates", () => {
  const { fixed, candidates } = partitionChain(chainOf(4), 3);
  assert.equal(fixed.length, 4);
  assert.equal(candidates.length, 0);
});

test("budget keeps newest entries first and skips ones that do not fit", () => {
  assert.deepEqual([...keepNewestWithinBudget([5, 5, 50, 5], 12)].sort(), [1, 3]);
  assert.equal(keepNewestWithinBudget([1, 2, 3], 0).size, 0);
  assert.equal(keepNewestWithinBudget([1, 2, 3], -10).size, 0);
});

test("pinned middle nodes stay in chronological order", () => {
  const chain = chainOf(10, [3]);
  const { fixed, candidates } = partitionChain(chain, 2);
  const kept = new Set([...fixed, ...candidates].map((n) => n.id));

  assert.deepEqual(
    inChainOrder(chain, kept).map((n) => n.id),
    chain.map((n) => n.id)
  );
});
