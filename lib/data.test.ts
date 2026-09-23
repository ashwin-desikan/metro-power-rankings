import { describe, it, expect } from "vitest";
import { getMetroDetail } from "./data";

// The path-traversal guard on getMetroDetail. The slug is interpolated into a
// file path, so before the guard a slug of "../../../package" resolved to the
// repo's own package.json and read it. That mattered because /api/mcp's
// get_metro is unauthenticated and returns whatever this function returns.
//
// These run against the real public/data/details, deliberately: a mocked fs
// would test the regex and not the thing that was actually exploitable.
describe("getMetroDetail slug guard", () => {
  it("returns data for a real slug", () => {
    expect(getMetroDetail("new-york")).not.toBeNull();
  });

  it("refuses the traversal that reached package.json", () => {
    expect(getMetroDetail("../../../package")).toBeNull();
  });

  it("refuses a path separator", () => {
    expect(getMetroDetail("a/b")).toBeNull();
  });

  it("refuses an empty slug", () => {
    expect(getMetroDetail("")).toBeNull();
  });

  // Not cosmetic: the guard is an allowlist, and an uppercase slug is the
  // cheapest proof that it is not a ".." blocklist passing everything else.
  it("refuses an uppercase slug", () => {
    expect(getMetroDetail("NEW YORK")).toBeNull();
  });

  // The shapes a ".." blocklist would let through or mishandle. Each is
  // refused by the pattern rather than by a special case.
  it.each([
    ["..", "the parent directory itself"],
    ["../..", "two levels up"],
    ["..%2f..%2fpackage", "url-encoded separators"],
    ["new-york.json", "a slug that re-adds the extension"],
    ["new_york", "an underscore, which slugs never contain"],
    ["../details/new-york", "a traversal that lands back inside"],
    [".", "a bare dot"],
    ["  new-york  ", "surrounding whitespace"],
  ])("refuses %j (%s)", (slug) => {
    expect(getMetroDetail(slug)).toBeNull();
  });

  // Built rather than typed, so no control character reaches the source file.
  it("refuses a null byte", () => {
    expect(getMetroDetail("new-york" + String.fromCharCode(0) + ".json")).toBeNull();
  });
});
