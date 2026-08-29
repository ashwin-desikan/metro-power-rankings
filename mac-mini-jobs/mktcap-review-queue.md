# mktcap-refresh review queue -- 2026-08-29
# Overwritten every run. 'none' below means nothing needs review this week.
#
# UPDATE 2026-08-29 (by hand, Claude research pass): of the 22 companies the
# 09:02Z run flagged, 20 were researched and mapped directly in mktcap_geo
# (mapped_by='claude-researched', sourced against official company sites /
# SEC EDGAR filings / exchange filings, verified against mktcap_valid_metros
# and satellite-city precedent already in the table -- e.g. Seongnam/Suwon/
# Anyang -> Seoul, Changwon -> Busan-Ulsan, Falls Church VA -> Washington-
# Baltimore, Shah Alam -> Kuala Lumpur). Invariant re-checked clean: 0 mapped
# metros outside mktcap_valid_metros.
#
# 2 left genuinely unmapped -- real ambiguity, not laziness, ruling needed:
#
# - JustSystems Corporation [4686.T]: dual head office. Legally registered
#   HQ (本店所在地, matches EDINET/TSE filings) is Tokushima. Operational/
#   investor-facing HQ (per the company's own site) is Akasaka, Minato-ku,
#   Tokyo. No existing precedent in this table resolves legal-vs-operational
#   splits one way -- needs your call: Tokushima (registered) or Tokyo
#   (operational)?
#
# - First Breach Inc. [FBDT]: current HQ per its most recent 10-Q cover page
#   is Hagerstown, MD (its own manufacturing campus) -- confirmed NOT the
#   stale Baltimore mailing address EDGAR's metadata field shows. Hagerstown
#   is ~75 miles from both DC and Baltimore, well past the ~30km precedent
#   radius used elsewhere (vs. e.g. Falls Church VA at ~15km, mapped to
#   Washington-Baltimore above). No standalone Hagerstown metro exists in
#   mktcap_valid_metros. Leave unmapped, or fold into Washington-Baltimore
#   on the broader Census CSA definition (which does include Hagerstown-
#   Martinsburg)? Your call.
- METRO QUEUE (new, unmapped — for Ashwin): JustSystems Corporation [4686.T] (Japan, dual-HQ ruling needed), First Breach Inc. [FBDT] (United States, distance-threshold ruling needed)
