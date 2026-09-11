import { describe, it, expect } from "vitest";
import { groupTabsFallback } from "./grouping-fallback";

describe("groupTabsFallback", () => {
  it("groups tabs by hostname, stripping www.", () => {
    const groups = groupTabsFallback([
      { title: "Vue docs", url: "https://vuejs.org/guide" },
      { title: "Vue API", url: "https://www.vuejs.org/api" },
      { title: "React docs", url: "https://react.dev" },
    ]);
    const names = groups.map((g) => g.name).sort();
    expect(names).toEqual(["react.dev", "vuejs.org"]);
    const vueGroup = groups.find((g) => g.name === "vuejs.org")!;
    expect(vueGroup.tabs).toHaveLength(2);
  });

  it("puts unparseable URLs into an 'other' group instead of throwing", () => {
    const groups = groupTabsFallback([{ title: "Internal", url: "chrome://extensions" }]);
    expect(groups.some((g) => g.name === "other" || g.name === "extensions")).toBe(true);
  });

  it("returns an empty array for no tabs", () => {
    expect(groupTabsFallback([])).toEqual([]);
  });
});
