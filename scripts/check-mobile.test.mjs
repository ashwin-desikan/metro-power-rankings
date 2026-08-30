import { describe, it, expect } from "vitest";
import { checkFile } from "./check-mobile.mjs";

/** Rule names found in a source string. */
function rules(src) {
  return checkFile(src, "fixture.tsx").map((f) => f.rule);
}

describe("UNCAPPED_MOBILE_LIST", () => {
  it("flags a mobile-only card list with no cap", () => {
    const src = `
      function C() {
        return (
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            {rows.map((r) => <div key={r.id}>{r.name}</div>)}
          </div>
        );
      }
    `;
    expect(rules(src)).toContain("UNCAPPED_MOBILE_LIST");
  });

  it("passes once the list is wrapped in <CappedList>", () => {
    const src = `
      function C() {
        return (
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            <CappedList initial={12} noun="rows" items={rows.map((r) => <div key={r.id}>{r.name}</div>)} />
          </div>
        );
      }
    `;
    expect(rules(src)).not.toContain("UNCAPPED_MOBILE_LIST");
  });

  it("passes a list that carries its own height cap", () => {
    const src = `
      function C() {
        return (
          <div className="sm:hidden max-h-[32rem] overflow-y-auto">
            {rows.map((r) => <div key={r.id}>{r.name}</div>)}
          </div>
        );
      }
    `;
    expect(rules(src)).not.toContain("UNCAPPED_MOBILE_LIST");
  });

  it("passes an explicit data-mobile-uncapped opt-out", () => {
    const src = `
      function C() {
        return (
          <div className="grid gap-2 sm:hidden" data-mobile-uncapped>
            {THREE_FORMATS.map((f) => <div key={f}>{f}</div>)}
          </div>
        );
      }
    `;
    expect(rules(src)).not.toContain("UNCAPPED_MOBILE_LIST");
  });

  it("still flags a mobile list whose container also has overflow-hidden", () => {
    // Regression: the substring "hidden sm:" inside "overflow-hidden
    // sm:hidden" used to exempt this, hiding /sports/zone-zero-cup's
    // 30.9-phone-screen list from the gate entirely.
    const src = `
      function C() {
        return (
          <div className="rounded-xl border overflow-hidden sm:hidden">
            {rows.map((r) => <div key={r.id}>{r.name}</div>)}
          </div>
        );
      }
    `;
    expect(rules(src)).toContain("UNCAPPED_MOBILE_LIST");
  });

  it("ignores the DESKTOP half of the same pattern", () => {
    const src = `
      function C() {
        return (
          <div className="hidden sm:block">
            {rows.map((r) => <div key={r.id}>{r.name}</div>)}
          </div>
        );
      }
    `;
    expect(rules(src)).not.toContain("UNCAPPED_MOBILE_LIST");
  });

  it("ignores a <select> of options — the OS renders its own picker", () => {
    const src = `
      function C() {
        return (
          <div className="sm:hidden">
            <select>{opts.map((o) => <option key={o}>{o}</option>)}</select>
          </div>
        );
      }
    `;
    expect(rules(src)).not.toContain("UNCAPPED_MOBILE_LIST");
  });
});

describe("GRID_CHILD_NO_MIN_W_0", () => {
  it("flags a grid child holding a table with no min-w-0", () => {
    const src = `
      function C() {
        return (
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-xl">
              <TableScroll><table><tbody /></table></TableScroll>
            </div>
          </div>
        );
      }
    `;
    expect(rules(src)).toContain("GRID_CHILD_NO_MIN_W_0");
  });

  it("passes once min-w-0 is present", () => {
    const src = `
      function C() {
        return (
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="min-w-0 rounded-xl">
              <TableScroll><table><tbody /></table></TableScroll>
            </div>
          </div>
        );
      }
    `;
    expect(rules(src)).not.toContain("GRID_CHILD_NO_MIN_W_0");
  });

  it("does not flag a custom component — the fix belongs in the component", () => {
    const src = `
      function C() {
        return (
          <div className="grid lg:grid-cols-2 gap-4">
            <Block title="x"><table><tbody /></table></Block>
          </div>
        );
      }
    `;
    expect(rules(src)).not.toContain("GRID_CHILD_NO_MIN_W_0");
  });
});

describe("RIGID_WIDE_GRID", () => {
  it("flags grid-cols-4 with no responsive prefix", () => {
    expect(rules(`const C = () => <div className="grid grid-cols-4 gap-2" />;`)).toContain(
      "RIGID_WIDE_GRID"
    );
  });

  it("passes when the wide track is behind a breakpoint", () => {
    expect(
      rules(`const C = () => <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" />;`)
    ).not.toContain("RIGID_WIDE_GRID");
  });
});

describe("HARD_WIDTH", () => {
  it("flags a fixed width wider than a phone", () => {
    expect(rules(`const C = () => <div className="min-w-[640px]" />;`)).toContain("HARD_WIDTH");
  });

  it("passes inside a horizontal scroll box — that width is the point", () => {
    const src = `
      const C = () => (
        <div className="overflow-x-auto">
          <div className="flex min-w-[640px]" />
        </div>
      );
    `;
    expect(rules(src)).not.toContain("HARD_WIDTH");
  });

  it("passes a <table>, which always lives in a scroll box", () => {
    expect(rules(`const C = () => <table className="min-w-[660px]" />;`)).not.toContain(
      "HARD_WIDTH"
    );
  });
});

describe("NAV_CLEARANCE", () => {
  it("flags clearance padding for a nav that is sticky, not fixed", () => {
    expect(rules(`const C = () => <div className="pt-24" />;`)).toContain("NAV_CLEARANCE");
  });

  it("passes ordinary page padding", () => {
    expect(rules(`const C = () => <main className="mx-auto max-w-6xl px-4 py-8" />;`)).not.toContain(
      "NAV_CLEARANCE"
    );
  });
});

describe("NOWRAP_LIST_NO_SCROLL", () => {
  it("flags a nowrap chip row with nowhere to scroll", () => {
    const src = `
      const C = () => (
        <div className="flex gap-2 whitespace-nowrap">
          {tags.map((t) => <span key={t}>{t}</span>)}
        </div>
      );
    `;
    expect(rules(src)).toContain("NOWRAP_LIST_NO_SCROLL");
  });

  it("passes table internals — check:table-scroll already owns those", () => {
    const src = `
      const C = () => (
        <table className="whitespace-nowrap">
          <tbody>{rows.map((r) => <tr key={r.id} />)}</tbody>
        </table>
      );
    `;
    expect(rules(src)).not.toContain("NOWRAP_LIST_NO_SCROLL");
  });
});
