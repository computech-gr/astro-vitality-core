import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BONE_HEALTH_VARIABLES } from "@/domain/bone-health/catalog";
import {
  filterCatalogVariables,
  moveActiveIndex,
  resolveCatalogSelection,
} from "@/domain/bone-health/variable-combobox";
import { BoneVariableCombobox } from "@/components/bone-variable-combobox";

const first = BONE_HEALTH_VARIABLES[0];
const entrySource = readFileSync("src/components/bone-health-entry.tsx", "utf8");

describe("bone variable combobox", () => {
  test("filters by name and by catalog ID, case-insensitively", () => {
    expect(filterCatalogVariables(BONE_HEALTH_VARIABLES, first.name.toUpperCase())).toContainEqual(
      first,
    );
    expect(filterCatalogVariables(BONE_HEALTH_VARIABLES, first.id.toLowerCase())).toContainEqual(
      first,
    );
    expect(filterCatalogVariables(BONE_HEALTH_VARIABLES, "  ").length).toBe(
      BONE_HEALTH_VARIABLES.length,
    );
  });
  test("non-matching query yields empty list", () => {
    expect(filterCatalogVariables(BONE_HEALTH_VARIABLES, "zz-no-such-variable-zz")).toEqual([]);
  });
  test("only exact catalog IDs resolve as selections", () => {
    expect(resolveCatalogSelection(BONE_HEALTH_VARIABLES, first.id)).toEqual(first);
    expect(resolveCatalogSelection(BONE_HEALTH_VARIABLES, first.name)).toBeNull();
    expect(resolveCatalogSelection(BONE_HEALTH_VARIABLES, undefined)).toBeNull();
  });
  test("keyboard index wraps and is -1 for empty lists", () => {
    expect(moveActiveIndex(-1, 1, 3)).toBe(0);
    expect(moveActiveIndex(-1, -1, 3)).toBe(2);
    expect(moveActiveIndex(2, 1, 3)).toBe(0);
    expect(moveActiveIndex(0, -1, 3)).toBe(2);
    expect(moveActiveIndex(0, 1, 0)).toBe(-1);
  });
  test("renders an accessible combobox showing the preserved selection", () => {
    const html = renderToStaticMarkup(
      createElement(BoneVariableCombobox, {
        variables: BONE_HEALTH_VARIABLES,
        value: first.id,
        onChange: () => {},
      }),
    );
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(`(${first.id})`);
  });
  test("Bone Health uses one combobox instead of separate search and select", () => {
    expect(entrySource).toContain("<BoneVariableCombobox");
    expect(entrySource).not.toContain("Search handbook variables");
    expect(entrySource).not.toContain("bone-variable-search");
    expect(entrySource).toContain("onChange={setVariableId}");
    expect(entrySource).toContain("setVariableId(row.variableId)");
  });
});
