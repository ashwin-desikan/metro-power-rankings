import { describe, it, expect } from "vitest";
import { checkSource } from "./check-table-scroll.mjs";

function reasons(src) {
  return checkSource(src, "fixture.tsx");
}

describe("checkSource", () => {
  it("passes a table wrapped in <TableScroll>", () => {
    const src = `
      function C() {
        return (
          <TableScroll>
            <table><tbody><tr><td>x</td></tr></tbody></table>
          </TableScroll>
        );
      }
    `;
    expect(reasons(src)).toEqual([]);
  });

  it("passes a table wrapped in <ResponsiveTable> (wraps TableScroll internally)", () => {
    const src = `
      function C() {
        return (
          <ResponsiveTable mobileRows={[]}>
            <table><tbody><tr><td>x</td></tr></tbody></table>
          </ResponsiveTable>
        );
      }
    `;
    expect(reasons(src)).toEqual([]);
  });

  it("passes a table whose direct parent has className overflow-x-auto", () => {
    const src = `
      function C() {
        return (
          <div className="rounded-xl overflow-x-auto">
            <table><tbody><tr><td>x</td></tr></tbody></table>
          </div>
        );
      }
    `;
    expect(reasons(src)).toEqual([]);
  });

  it("passes a table whose direct parent has an inline overflowX style", () => {
    const src = `
      function C() {
        return (
          <div className="overflow-y-auto" style={{ overflowX: "auto", maxHeight: 300 }}>
            <table><tbody><tr><td>x</td></tr></tbody></table>
          </div>
        );
      }
    `;
    expect(reasons(src)).toEqual([]);
  });

  it("passes a table with the data-no-scroll-check escape hatch", () => {
    const src = `
      function C() {
        return (
          <div>
            <table data-no-scroll-check><tbody><tr><td>x</td></tr></tbody></table>
          </div>
        );
      }
    `;
    expect(reasons(src)).toEqual([]);
  });

  it("flags a table with no wrapping element", () => {
    const src = `
      function C() {
        return (
          <section>
            <table><tbody><tr><td>x</td></tr></tbody></table>
          </section>
        );
      }
    `;
    const v = reasons(src);
    expect(v).toHaveLength(1);
    expect(v[0].reason).toMatch(/no overflow-x-auto/);
  });

  it("flags a table nested one level deeper than its overflow wrapper", () => {
    // The exact regression this checker exists to catch: a div.overflow-y-auto
    // sits between the div.overflow-x-auto and the table, so the CSS
    // `:has(> table)` rule never matches the outer wrapper.
    const src = `
      function C() {
        return (
          <div className="overflow-x-auto rounded-lg border">
            <div className="max-h-[32rem] overflow-y-auto">
              <table><tbody><tr><td>x</td></tr></tbody></table>
            </div>
          </div>
        );
      }
    `;
    const v = reasons(src);
    expect(v).toHaveLength(1);
    expect(v[0].reason).toMatch(/no overflow-x-auto/);
  });

  it("does not false-positive on a table inside a ternary", () => {
    // {cond ? (<div className="overflow-x-auto"><table/></div>) : null} still
    // renders the table as a direct DOM child of the div; the ternary/parens
    // are pure JS wrappers with no runtime DOM node of their own.
    const src = `
      function C({ cond }) {
        return (
          <div>
            {cond ? (
              <div className="overflow-x-auto">
                <table><tbody><tr><td>x</td></tr></tbody></table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table><tbody><tr><td>y</td></tr></tbody></table>
              </div>
            )}
          </div>
        );
      }
    `;
    expect(reasons(src)).toEqual([]);
  });

  it("does not false-positive on a table inside a && guard", () => {
    const src = `
      function C({ show }) {
        return (
          <div>
            {show && (
              <div className="overflow-x-auto">
                <table><tbody><tr><td>x</td></tr></tbody></table>
              </div>
            )}
          </div>
        );
      }
    `;
    expect(reasons(src)).toEqual([]);
  });

  it("flags a table whose direct parent is a fragment", () => {
    const src = `
      function C() {
        return (
          <>
            <table><tbody><tr><td>x</td></tr></tbody></table>
          </>
        );
      }
    `;
    const v = reasons(src);
    expect(v).toHaveLength(1);
    expect(v[0].reason).toMatch(/fragment/);
  });

  it("returns no violations for files with no <table at all", () => {
    const src = `function C() { return <div>hello</div>; }`;
    expect(reasons(src)).toEqual([]);
  });

  it("reports the correct 1-indexed line number", () => {
    const src = [
      "function C() {",
      "  return (",
      "    <section>",
      "      <table><tbody><tr><td>x</td></tr></tbody></table>",
      "    </section>",
      "  );",
      "}",
    ].join("\n");
    const v = reasons(src);
    expect(v).toHaveLength(1);
    expect(v[0].line).toBe(4);
  });
});
