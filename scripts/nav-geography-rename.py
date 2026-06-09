#!/usr/bin/env python3
"""
Nav: rename "Data" to "Geography" and remove the "Regions" menu item.
Run from the repo root:

    python scripts/nav-geography-rename.py

- app/DesktopNav.tsx: Data dropdown label -> "Geography"; the top-level Regions
  link removed.
- app/MobileMenu.tsx: the "Data" group -> "Geography"; the Regions item removed.

Idempotent; backs up touched files to *.v8.bak. Nothing committed.
"""
import os, sys, shutil

NAV = os.path.join("app", "DesktopNav.tsx")
MOBILE = os.path.join("app", "MobileMenu.tsx")

DN_DATA_OLD = '      <Dropdown id="data" label="Data" openId={openId} setOpenId={setOpenId}>'
DN_DATA_NEW = '      <Dropdown id="data" label="Geography" openId={openId} setOpenId={setOpenId}>'
DN_REGIONS_OLD = '''      <a href="/#regions" className="text-sm hover:text-[var(--accent)] transition-colors">
        Regions
      </a>

'''
DN_REGIONS_NEW = ''

MB_REGIONS_OLD = "  { href: '/#regions', label: 'Regions', hint: 'Group view by world region' },\n"
MB_REGIONS_NEW = ''
MB_GROUP_OLD = "group: 'Data'"
MB_GROUP_NEW = "group: 'Geography'"


def fail(m): print("ABORTED: " + m); sys.exit(1)


def main():
    # DesktopNav
    if not os.path.isfile(NAV): fail(NAV + " not found. Run from the repo root.")
    nav = open(NAV, encoding="utf-8").read()
    if 'label="Geography"' in nav:
        print("  skip    " + NAV + " (already renamed)")
    else:
        if DN_DATA_OLD not in nav: fail("Data dropdown anchor not found in " + NAV + ".")
        if DN_REGIONS_OLD not in nav: fail("Regions link anchor not found in " + NAV + ".")
        shutil.copyfile(NAV, NAV + ".v8.bak")
        nav = nav.replace(DN_DATA_OLD, DN_DATA_NEW, 1).replace(DN_REGIONS_OLD, DN_REGIONS_NEW, 1)
        open(NAV, "w", encoding="utf-8", newline="\n").write(nav)
        print("  patched " + NAV + " (Data -> Geography; Regions removed)")

    # MobileMenu
    if not os.path.isfile(MOBILE): fail(MOBILE + " not found. Run from the repo root.")
    mb = open(MOBILE, encoding="utf-8").read()
    if "group: 'Geography'" in mb:
        print("  skip    " + MOBILE + " (already renamed)")
    else:
        if MB_GROUP_OLD not in mb: fail("Data group anchor not found in " + MOBILE + ".")
        if MB_REGIONS_OLD not in mb: fail("Regions item anchor not found in " + MOBILE + ".")
        shutil.copyfile(MOBILE, MOBILE + ".v8.bak")
        mb = mb.replace(MB_REGIONS_OLD, MB_REGIONS_NEW, 1).replace(MB_GROUP_OLD, MB_GROUP_NEW)  # replace_all groups
        open(MOBILE, "w", encoding="utf-8", newline="\n").write(mb)
        print("  patched " + MOBILE + " (Data -> Geography; Regions removed)")

    print()
    print("Done. Run your TS type check, then preview the nav (desktop + mobile) before committing.")


if __name__ == "__main__":
    main()
