# mktcap-refresh review queue -- 2026-08-29
# Overwritten every run. 'none' below means nothing needs review this week.
# NOTE 2026-08-29 (restored by hand): the 09:02Z scheduled run found 22 new
# unmapped companies and pushed the ntfy alert this note follows up on. Two
# manual re-runs later the same day (verifying the sunset-plan mktcap_unicorns
# fix) overwrote this file with "none" -- not because the companies got
# mapped, but because the QUEUE_LINE logic only reports symbols new to
# mktcap_companies THIS run; once the 09:02Z run auto-stubbed them into
# mktcap_geo, later runs no longer see them as "new" even though metro is
# still null. Confirmed via direct query (2026-08-29): all 22 below still
# have metro=null, mapped_by='auto-stub'. Restored from that query so this
# routine and Ashwin still see the real pending list.
- METRO QUEUE (new, unmapped — for Ashwin): Hengli Petrochemical [600346.SS] (China), Erste Bank Polska [EBP.WA] (Poland), HD Construction Equipment [267270.KS] (South Korea), Hyosung Corporation [004800.KS] (South Korea), Daiwabo Holdings [3107.T] (Japan), Lyntris Inc. [LYNX] (United States), Sansan, Inc. [4443.T] (Japan), JustSystems Corporation [4686.T] (Japan), Tomen Devices Corporation [2737.T] (Japan), Ryerson [RYZ] (United States), Vincorion SE [V1NC.DE] (Germany), Hyosung TNC Corporation [298020.KS] (South Korea), LX International [001120.KS] (South Korea), Furukawa Co.,Ltd. [5715.T] (Japan), Snt Dynamics [003570.KS] (South Korea), LX Hausys [108670.KS] (South Korea), Hyosung Chemical Corporation [298000.KS] (South Korea), VivoPower [VIVO] (United Kingdom), Hyosung ITX [094280.KS] (South Korea), SYLA Holdings [8887.T] (Japan), Panasonic Manufacturing Malaysia Berhad [3719.KL] (Malaysia), First Breach Inc. [FBDT] (United States)
