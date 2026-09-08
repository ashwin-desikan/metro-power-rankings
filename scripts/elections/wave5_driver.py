# -*- coding: utf-8 -*-
"""Wave 5 driver: eight dumps -> /tmp/hubs/wave5-drafts.json.

Run from the repo root:  python3 /tmp/hubs/wave5.py
Each hub lists the article titles it wants and the kind of each. Titles not
matched by `want` are skipped and reported, so nothing silently vanishes.
"""
import json, re, sys
sys.path.insert(0, '/tmp/hubs')
sys.path.insert(0, 'scripts/elections')
from build_wikidump_hub import build
from parse_dump import articles

H = '/tmp/hubs/'

def leg(_): return 'leg'
def pres(_): return 'pres'
def kind_by_word(t):
    return 'pres' if 'presidential' in t.lower() else 'leg'

LEG_WORDS = r'(general|parliamentary|legislative|Constitutional Assembly|Constituent Assembly) election'
def leg_re(extra_excl=None):
    def f(t):
        if not re.match(r'^(\w+ )?\d{4}(–\d{2})? .*' + LEG_WORDS + r's?$', t, re.I):
            return False
        if re.search(r'Bengal|East Pakistan|Division|elections in|results', t):
            return False
        if 'presidential' in t.lower():
            return False
        if extra_excl and re.search(extra_excl, t):
            return False
        return True
    return f
def pres_re(t):
    return re.match(r'^(\w+ )?\d{4} .*presidential election$', t) is not None and not re.search(r'results|Department', t)

HUBS = {
  'ae': dict(path=H+'ae.txt', leg=leg_re()),
  # Bangladesh's "Party | Votes | % | Seats" tables stack a second header row
  # "General | Women | Total | +/-"; a flat reading takes the general
  # (directly elected) seat count and drops the reserved women's seats that
  # are allotted in proportion to it, the same failure the leg-tiered
  # docstring documents for Pakistan. Confirmed against the infobox's
  # totalSeats for every contest 1973-2018 where the source states one.
  'bd': dict(path=H+'bd.txt', leg=leg_re(), legPrefer='leg-tiered'),
  'dd': dict(path=H+'dd.txt', leg=leg_re()),
  'et': dict(path=H+'et.txt', leg=leg_re()),
  # Kenya: the general-election articles from 1992 carry the presidential
  # table too (multi-party era), so they feed both series. From 2013 the
  # article prints the Senate's own "Party | Votes | % | Seats" table before
  # the National Assembly's; a first-table read put the 2013 and 2017
  # legislative rows on the 47/67-seat Senate instead of the 290/349-seat
  # Assembly. "leg-large" (already used by pe for the same shape) keeps the
  # series on the larger chamber throughout.
  'ke': dict(path=H+'ke.txt', leg=leg_re(),
             pres=lambda t: pres_re(t) or (leg_re()(t) and int(re.search(r'\d{4}', t).group()) >= 1992),
             legPrefer='leg-large'),
  # Peru: general elections carry both a presidential and a congressional
  # table, so the general article feeds both series; presidential-only
  # articles feed the presidential one. Peru's bicameral years (1980, 1985,
  # 1990, and 2026 after the restored Senate) print the Senate table before
  # the Chamber of Deputies table; "leg-large" keeps the series on the
  # Chamber of Deputies throughout, matching the unicameral "Congress" rows
  # (1995-2021) on either side of it.
  'pe': dict(path=H+'pe.txt', leg=leg_re(), pres=lambda t: pres_re(t) or leg_re()(t),
             legPrefer='leg-large'),
  # South Vietnam's 1971 lower-house article has no heading in the dump and
  # the parser names it by its lead sentence; accept that sentence.
  'vd': dict(path=H+'vd.txt',
             leg=lambda t: leg_re()(t) or t.startswith('Elections to the House of Representatives were held in South Vietnam'),
             pres=pres_re),
  # Vietnam's 2016 and 2021 articles appear twice under two spellings; the
  # parser's (title, date) key cannot see they are one article, so take the
  # "legislative" spelling only.
  'vn': dict(path=H+'vn.txt', leg=leg_re()),
  # Czech Republic with Czechoslovakia as its predecessor (Ashwin, 2026-09-08):
  # the federal parliamentary and presidential record 1918-1992 runs into the
  # Czech Chamber of Deputies from 1996 and the direct presidency from 2013.
  # The Czech National Council elections (1968-1992, the republic-level house
  # inside the federation) are left out of the series and explained in the
  # eras; the 1946 Slovak National Council vote in the Czechoslovak dump
  # belongs to Slovakia. Second-level pages (debates, results by country,
  # Speaker election, Senate and regional rounds, European Parliament) are out.
  # The "1968 Czech legislative election" article is, on inspection, the
  # first Czech National Council election (indirectly elected by the
  # federal National Assembly) - no federal Czechoslovak election took place
  # in 1968, and its own dump text says so ("the first time Czechs had
  # elected their own legislature"). Excluded like the rest of the National
  # Council series (1971-1992), which the title regex already drops because
  # those articles are titled "... Czech National Council election".
  # Chamber vs Senate ordering is inconsistent across the bicameral years:
  # 1920 prints the Chamber of Deputies table before the Senate's, but 1929
  # prints the Senate first, so taking "whichever table comes first" put
  # 1929's top party on 24 of 150 Senate seats instead of 46 of 300 Chamber
  # seats. "leg-large" keeps every bicameral year (1920-1992, all bicameral:
  # Chamber of Deputies + Senate before the war, House of the People + House
  # of Nations in the federal era) on the larger house by seat sum, same as
  # Peru's "pe" entry above. But applying "leg-large" past 1992 as well
  # misfired: the unicameral 1996- Czech Republic articles for 2021 and 2025
  # each also carry a second, unrelated 200-seat table (the outgoing
  # Chamber's composition on election day), which ties the real results
  # table on seat sum and, being read first in one case and second in the
  # other, got picked instead on one of the two. A per-title preference
  # keeps "leg-large" only where the second table is genuinely the other
  # chamber (<=1992) and leaves 1996 on the plain "first qualifying table"
  # rule that already reads those years correctly.
  'cz': dict(path=H+'czall.txt',
             leg=lambda t: leg_re()(t) and re.match(r'^\d{4} (Czechoslovak|Czech) (parliamentary|legislative) election$', t) is not None and t != '1968 Czech legislative election',
             legPrefer=lambda t: 'leg-large' if re.match(r'^(19[0-8]\d|199[0-2]) ', t) else None,
             pres=lambda t: re.match(r'^\d{4} (Czechoslovak|Czech) presidential election$', t) is not None),
  # Slovakia: its own assemblies from the 1928 provincial election through the
  # Slovak National Council to today's National Council, plus the presidency
  # (indirect 1993 and 1998, direct from 1999).
  'sk': dict(path=H+'sk.txt',
             leg=lambda t: re.match(r'^\d{4} Slovak (provincial|parliamentary) election$', t) is not None,
             pres=lambda t: re.match(r'^\d{4} Slovak [Pp]residential election$', t) is not None),
  # Romania: general elections 1901-2004 carry the Chamber of Deputies and,
  # from 1990, the presidential table too; parliamentary and presidential
  # articles are separate from 2008 and 2009. Poll pages, local and European
  # rounds and the 2024 annulment article are out. The 2024 presidential
  # first round was annulled and re-run in 2025; both articles are in.
  # Seven of the pre-WWI/interwar articles (1901, 1905, 1907, 1912, 1914,
  # 1918, 1926) render with a "Politics of Romania" navbox sitting where the
  # heading should be, so parse_wikidump's title scan never finds the real
  # heading and falls back to synth_title(), which reconstructs a title from
  # the lead sentence/categories but deliberately drops the country name
  # (the dump is single-country, so build_wikidump_hub never needed it) and
  # picks whichever of "general"/"parliamentary" the categories rank higher,
  # which does not always match the sibling articles' "general" usage.
  # Confirmed against ro.txt: all seven are genuine Chamber of Deputies (and,
  # from 1907, Senate) elections with real party/seat tables, just titled
  # "<year> parliamentary election" with no "Romanian". Match that shape too
  # rather than touching the shared parser for one hub's navbox pages.
  'ro': dict(path=H+'ro.txt',
             leg=lambda t: re.match(r'^\d{4}( Romanian)? (general|parliamentary) election$', t) is not None,
             # 1992, 1996 and every parliamentary article from 2008 print the
             # Senate's results table before the Chamber of Deputies' (the
             # reverse of 2000 and 2004, which lead with the Chamber), so the
             # default "first qualifying table" rule put seven contests on
             # the smaller upper house: 2024 came out "134 seats" (the
             # Senate) instead of the Chamber's 331. "leg-large" keeps every
             # bicameral year on the larger, primary chamber, the same fix
             # already used for Peru's Senate-first bicameral articles.
             legPrefer='leg-large',
             pres=lambda t: (re.match(r'^\d{4} Romanian presidential election$', t) is not None
                             or (re.match(r'^\d{4} Romanian general election$', t) is not None
                                 and int(t[:4]) >= 1990))),
  # Finland: Eduskunta 1907-2023 (poster and debate pages, the 2023 Aland
  # election excluded); the 2024 presidential election is the only direct
  # presidential article in the dump.
  'fi': dict(path=H+'fi.txt',
             leg=lambda t: re.match(r'^\d{4} Finnish parliamentary election$', t) is not None,
             pres=lambda t: re.match(r'^\d{4} Finnish presidential election$', t) is not None),
  # Thailand: Siamese and Thai general elections 1933-2026; the 2026
  # constitutional referendum is out.
  # Thailand: two elections apiece in 1957 (February, December) and 1992
  # (March, September) are titled with a leading month ("February 1957 Thai
  # general election"); the plain "^\d{4} ..." form would drop both as
  # unmatched, silently losing four real, distinct contests.
  'th': dict(path=H+'th.txt',
             leg=lambda t: re.match(r'^(\w+ )?\d{4} (Siamese|Thai) general election$', t) is not None),
  # Venezuela: presidential 1936-2024 (general-election articles 1947-2000
  # carry the presidential table with prefer "pres"), parliamentary from the
  # general articles plus the 2005-2025 National Assembly articles. Foreign
  # articles the dump dragged in (Philippines, Mexico, Panama, Iraq, Iran,
  # Bolivia) are excluded by the demonym.
  # 1993 is Congress's only Senate-then-Chamber article (elected on separate
  # ballots for the first time, per the article's own lead; 1958-1988 print
  # a single stacked "Chamber +/- Senate +/-" table the reader already parses
  # onto the Chamber correctly). The plain "first qualifying table" default
  # therefore lands 1993 on the 50-seat Senate table (157 rows, Total 50)
  # instead of the 199-seat Chamber of Deputies table that follows it
  # (ve.txt: "Senate" heading then a Party/Votes/%/Seats/+- table totalling
  # 50, then "Chamber of Deputies" with the same shape). leg-large keeps
  # this one article on the larger chamber.
  've': dict(path=H+'ve.txt',
             leg=lambda t: re.match(r'^\d{4} Venezuelan (general|parliamentary) election$', t) is not None,
             pres=lambda t: re.match(r'^\d{4} Venezuelan (general|presidential) election$', t) is not None,
             legPrefer=lambda t: 'leg-large' if t == '1993 Venezuelan general election' else 'leg'),

}
out = {"series": {}}
for cc, cfg in HUBS.items():
    titles = [t for t, _ in articles(cfg['path'])]
    for kind in ('leg', 'pres'):
        want = cfg.get(kind)
        if not want:
            continue
        prefer = 'pres' if kind == 'pres' else (cfg.get('legPrefer') or ('leg' if cfg.get('pres') else None))
        series = build(cfg['path'], want, (pres if kind == 'pres' else leg), prefer=prefer)
        if cc == 'ae' and kind == 'leg':
            # The 2006 vote was spread over three days by emirate ("16, 18
            # and 20 December 2006"); the extractor keeps the first date
            # token, so restore the article's own form (ae.txt, the 2006
            # infobox and lead).
            for e in series:
                if e['id'] == '2006':
                    e['date'] = '16, 18 and 20 December 2006'
        if cc == 'bd' and kind == 'leg':
            # 2008's results table nests party rows under two alliance
            # headers ("Grand Alliance" / "Alliance" spanning a blank cell
            # before the party name), a shape none of the table readers
            # here parse: the alliance row's wider cell count reads its own
            # subparty name into the seat-share column. Rather than widen a
            # shared parser for one election, fall back to the infobox's
            # top-3 (AL/BNP/JP(E), which is what the article's summary
            # prose also leads with) and mark the contest explicitly
            # partial so the hub says so instead of showing garbled rows.
            # Confirmed against bd.txt lines 128-141: Grand Alliance (AL +
            # 4 partners) took 266 of 300 general seats, Four Party Alliance
            # (BNP + 3 partners) 33, in a 345-seat house.
            from build_wikidump_hub import infobox_parties, to_party
            from parse_dump import articles as _articles
            by_id = {e['id']: e for e in series}
            if '2008' in by_id:
                for title, lines in _articles(cfg['path']):
                    if title == '2008 Bangladeshi general election':
                        rows = infobox_parties(lines)
                        if rows:
                            by_id['2008']['parties'] = [to_party(r) for r in rows]
                            by_id['2008']['partial'] = True
                        break
            # February 1996's table has no per-party Votes or % at all (the
            # source states only the aggregate 11,776,481 total votes and the
            # 20.97% turnout beneath the table), so both columns render as a
            # single collapsed empty cell. The tiered reader's fixed column
            # positions then read the General seat count into the share
            # field: BNP came out at "278.0%" of the vote. Confirmed against
            # bd.txt lines 4560-4569: Party/Votes/%/Seats header, every row's
            # Votes and % cells blank. Clear the borrowed numbers rather than
            # publish a percentage over 100.
            if '1996-february' in by_id:
                for p in by_id['1996-february']['parties']:
                    p['votes'] = None
                    p['share'] = None
        if cc == 'et' and kind == 'leg':
            # The shared lead-sentence date parser over-captures on these four
            # imperial-era stub articles: it either backtracks into an
            # unrelated later clause (1957: grabs "1955", the year the
            # constitution was enacted, from the second sentence) or runs on
            # past the date into "to elect all members of..." (1961/1965/
            # 1969, which have no infobox at all to fall back on). Confirmed
            # against the dump's own lead sentences (et.txt lines 2068, 2389,
            # 2286, 2180). Corrected here rather than in the shared parser so
            # the other seven hubs' output stays untouched.
            ET_DATE_FIX = {
                '1957': '1 and 30 September 1957',
                '1961': '1961',
                '1965': '1965',
                '1969': '1969',
            }
            for e in series:
                if e['id'] in ET_DATE_FIX:
                    e['date'] = ET_DATE_FIX[e['id']]
            # 2010's results table nests the winning EPRDF's own row inside a
            # merged "EPRDF and allies" alliance header cell (party name
            # shifted a column right of every other row); no table reader
            # here parses that shape, so the flat read drops the row for the
            # 499-of-547 seat landslide winner entirely and would otherwise
            # show the 24-seat Ethiopian Somali People's Democratic Party as
            # the largest bloc. Restored from the article's own sidebar
            # infobox ("Seats won 499", "Seat change Increase172"), which
            # agrees with the table's own "Total 545 +174" line (499 + the
            # allied parties listed below it: 24+9+8+3+1+1=46, 545 total).
            # Confirmed against et.txt lines 947-1057.
            et_by_id = {e['id']: e for e in series}
            if '2010' in et_by_id:
                et_by_id['2010']['parties'].insert(0, {
                    'party': None, 'votes2': None, 'share2': None,
                    'name': "Ethiopian People's Revolutionary Democratic Front",
                    'leader': None, 'seats': 499, 'seatChange': 172,
                    'votes': None, 'share': None, 'swing': None,
                })
            # Same alliance-header shape drops 1994's Oromo People's
            # Democratic Organization row (179 of 544 seats, the single
            # largest bloc) for the identical reason: et.txt line 1767 reads
            # "EPRDF and allies\t\tOromo People's Democratic Organization\t\t179".
            # Restored from the infobox's own results-preview box ("OPDO ...
            # 179 +179"), which the table's "Total 463" line corroborates
            # (179+134+37+13+19+13+13+13+12+8+6+6+5+4+2+2+2+2+2+1+1+1+1 = 463).
            if '1994' in et_by_id:
                et_by_id['1994']['parties'].insert(0, {
                    'party': None, 'votes2': None, 'share2': None,
                    'name': "Oromo People's Democratic Organization",
                    'leader': None, 'seats': 179, 'seatChange': 179,
                    'votes': None, 'share': None, 'swing': None,
                })
            # 2015's infobox reads "All 547 seats TO the House of Peoples'
            # Representatives" (every other year in this hub says "IN the
            # House..."); the shared SEATS_RE only matches "seats in", so
            # totalSeats comes back None here even though the table's own
            # party rows sum to 547 and the dump states the figure plainly
            # (et.txt line 669). Filled in from that same line rather than
            # widening the shared regex for one preposition swap.
            if '2015' in et_by_id and et_by_id['2015']['totalSeats'] is None:
                et_by_id['2015']['totalSeats'] = 547
                et_by_id['2015']['majoritySeats'] = 274
            # 2015's table has a lone "Undeclared\t\t1\t-" row (its Votes and
            # % cells blank like every other row that election, only the
            # Seats and +/- cells filled): the flat reader puts that single
            # "1" in the share column instead of seats, so the chronology
            # briefly reads as if the largest bloc took just 1% of the vote.
            # It is the one seat of 547 the table's own rows don't otherwise
            # sum to (500+24+9+8+3+1+1=546); et.txt line 810.
            if '2015' in et_by_id:
                for p in et_by_id['2015']['parties']:
                    if p['name'] == 'Undeclared':
                        p['seats'], p['share'] = 1, None
            # The same 2015 table's ~30 zero-seat rows ("Agew Democratic
            # Party\t\t0\t-") suffer the mirror version of that Undeclared
            # bug: a bare "0" with no Votes or % before it and a dash (not a
            # signed number) for +/- lands in the share column instead of
            # seats, so every one of them reads "seats: null, share: 0.0%"
            # instead of the "won no seats, no prior baseline to compare"
            # the table states. Left as-is this also broke the largest-share
            # chart, which picked one of these 0.0% nobodies as 2015's
            # "leading" party because every real contender's share cell was
            # genuinely blank (None) rather than a false zero.
            if '2015' in et_by_id:
                for p in et_by_id['2015']['parties']:
                    if p['seats'] is None and p['share'] == 0.0:
                        p['seats'], p['share'] = 0, None
        if cc == 'pe' and kind == 'leg':
            # 1936's article carries only the presidential infobox's tiny
            # Nominee/Party/Popular vote table (Benavides halted the count and
            # Congress annulled the whole election on 4 November, so no
            # Congress results table was ever compiled). With no legislative
            # table to prefer, the generic last-resort reader falls back to
            # that infobox summary and reports it as a legislative result,
            # which puts Eguiguren and Flores's PRESIDENTIAL vote shares in
            # the Congress row. Confirmed against pe.txt: the article's own
            # table of contents lists only "President" under Results, no
            # Senate or Chamber of Deputies section. Clear the borrowed
            # numbers so the row stands as the summary-only contest it is.
            for e in series:
                if e['id'] == '1936':
                    e['parties'] = []
                    e['totalSeats'] = None
                    e['tableSeats'] = None
                    e['seatTotalSource'] = None
                    e['majoritySeats'] = None
                    e['turnout'] = None
        if cc == 'pe' and kind == 'pres':
            # 2026's "Results / President" table gives each candidate two
            # running mates, one per physical line, and the party/vote columns
            # sit on the SECOND running mate's line rather than the
            # candidate's own. The generic table reader takes whichever line
            # carries the numbers, so every drafted row was headed by a vice-
            # presidential candidate (Miki Torres, Brigida Curo, Jhon Ramos
            # Malpica, ...) instead of the actual candidate (Keiko Fujimori,
            # Roberto Sanchez, Rafael Lopez Aliaga, ...) with the RIGHT
            # numbers already attached to the wrong name. Rebuilt directly
            # from the table's own two-line-per-candidate layout (pe.txt
            # lines 278-350: header "Candidate\tRunning mate\tParty\t...",
            # then CandidateName\tVP1 on one line and VP2\tParty\tVotes...
            # on the next, repeating once per candidate) rather than
            # widening the shared table reader for a two-VP ticket shape
            # that no other hub's dump uses.
            for title, lines in articles(cfg['path']):
                if title != '2026 Peruvian general election':
                    continue
                for i, l in enumerate(lines):
                    if not l.startswith('Candidate\tRunning mate\tParty'):
                        continue
                    j = i + 2  # skip the header and its Votes/%/Votes/% subheader
                    names = []
                    while j + 1 < len(lines) and not lines[j].startswith('Total\t'):
                        names.append(lines[j].split('\t')[0].strip())
                        j += 2
                    by_id = {e['id']: e for e in series}
                    row = by_id.get('2026')
                    if row and len(names) == len(row['parties']):
                        for name, p in zip(names, row['parties']):
                            p['name'] = name
                    break
                break
        if cc == 'pe':
            # 2006's lead sentence has a source-text typo ("held in Peru in on
            # 9 April 2006"), and 2011's runs straight from the date into "to
            # elect the president, the vice presidents, ..." with no comma
            # until well past it. Neither has an "Election date" label in its
            # infobox for the shared parser to prefer instead, so both fall
            # back to lead_date() and it reads on past the date into that
            # trailing clause ("...to elect the President"). The infobox's own
            # two-line first/second-round date sits right under the
            # "Presidential election" heading in both articles (pe.txt lines
            # 2886-2887 and 2328-2329) and is used verbatim here, matching the
            # shape every other modern Peru row already carries.
            PE_DATE_FIX = {
                '2006': '9 April 2006 (first round), 4 June 2006 (second round)',
                '2011': '10 April 2011 (first round), 5 June 2011 (second round)',
            }
            for e in series:
                if e['id'] in PE_DATE_FIX:
                    e['date'] = PE_DATE_FIX[e['id']]
        if cc == 'ke' and kind == 'leg':
            # 2013 and 2017 print BOTH the Senate's and the National
            # Assembly's results as two-line stacked headers ("Party | Votes
            # | % | Seats" over "Constituency | Women | Youth | Disabled |
            # Total" for the Senate; "Party | Constituency | County (women) |
            # Seats" over "Votes | % | Seats | Votes | % | Seats | Appointed
            # | Total" for the Assembly), so "leg-large" picks the Assembly
            # table by size, but a flat/tiered read of a stacked header takes
            # the LAST "Seats" column positionally and lands on the
            # constituency-only sub-total (72 for The National Alliance in
            # 2013) rather than the true Total column (88): the Assembly
            # table nests two seat tallies (constituency, then county women)
            # ahead of the real total, and the generic tiered reader has no
            # way to know a second "Seats" sub-header follows the first. Read
            # directly from the article's own "Party\tConstituency\tCounty
            # (women)\tSeats" header line, which appears exactly once per
            # article, and take the table's own last column. Confirmed
            # against ke.txt lines 1053 (2017) and 1613 (2013): row sums are
            # 344 of a stated 349 seats (2017) and the full 349 (2013), both
            # matching the articles' own "Total" rows; the 2017 shortfall is
            # a handful of minor parties whose county-women cell is blank
            # rather than "0", one column short of the header width that the
            # generic tiered reader requires.
            from build_wikidump_hub import to_party
            from parse_dump import tiered_table as _tiered_table
            for title, art_lines in articles(cfg['path']):
                if title not in ('2013 Kenyan general election', '2017 Kenyan general election'):
                    continue
                yr = title[:4]
                start = None
                for idx, l in enumerate(art_lines):
                    cells = l.split('\t')
                    if cells[0] == 'Party' and len(cells) > 1 and cells[1] == 'Constituency':
                        start = idx
                        break
                if start is None:
                    continue
                rows = _tiered_table(art_lines, start)
                if not rows:
                    continue
                by_id = {e['id']: e for e in series}
                if yr in by_id:
                    by_id[yr]['parties'] = [to_party(r) for r in rows]
                    by_id[yr]['totalSeats'] = 349
                    by_id[yr]['seatTotalSource'] = 'infobox'
                    by_id[yr]['tableSeats'] = sum(
                        p['seats'] for p in by_id[yr]['parties']
                        if p.get('seats') is not None)
        if cc == 'ro' and kind == 'leg':
            # "leg-large" (above) already fixes which TABLE each bicameral
            # year reads, but the infobox's own "N seats" line still names
            # whichever chamber the article's infobox happens to describe
            # first, and for 1992, 1996 and every parliamentary article from
            # 2008 that is again the Senate: 2024's infobox gives 134 (the
            # Senate) while the now-correctly-chosen Chamber of Deputies
            # table sums to 331. Confirmed against ro.txt for all seven:
            # 341 (1992), 343 (1996), 334 (2008), 412 (2012), 329 (2016),
            # 330 (2020), 331 (2024) match the Chamber's own printed Total
            # row in every case where that row parsed cleanly, and the
            # party rows' own seat sum where it did not. Restore the
            # Chamber's true size rather than showing the Senate's.
            correct_total = {'1992': 341, '1996': 343, '2008': 334,
                              '2012': 412, '2016': 329, '2020': 330, '2024': 331}
            for e in series:
                if e['id'] in correct_total:
                    e['totalSeats'] = correct_total[e['id']]
                    e['seatTotalSource'] = 'sum'
            # 1918's lead sentence gives the date as "between 19 and 29 May
            # 1918 (19, 21 and 29 May for the Chamber of Deputies and 23, 25
            # and 27 May for the Senate)." lead_date()'s capture stops at the
            # first [.,;], which lands on the comma inside the parenthetical
            # ("19,"), truncating the stored date to "19 and 29 May 1918
            # (19". Confirmed against ro.txt line 8501. Restore the article's
            # own full-sentence date rather than widening the shared
            # lead-date regex for one hub's parenthetical aside.
            for e in series:
                if e['id'] == '1918':
                    e['date'] = ('19 and 29 May 1918 (19, 21 and 29 May for the '
                                  'Chamber of Deputies and 23, 25 and 27 May for '
                                  'the Senate)')
        if cc == 'th' and kind == 'leg':
            # 1933 is the first article in the series, so its nav line has no
            # "<- previous" arrow ("15 November 1933\t1937 ->" rather than the
            # "<- prev\tdate\tnext ->" three-cell shape NAV_RE expects), and
            # with no date anywhere else on the page the shared infobox
            # scanner falls back to the bare year from the title. Restore the
            # full date from the nav line itself (th.txt line 8157).
            for e in series:
                if e['id'] == '1933':
                    e['date'] = '15 November 1933'
            # 1933-1957's results tables list the government's own appointed
            # bloc as if it were a party row ("Royal appointees", "Appointed
            # members"), which is how it is printed in the source, but it is
            # not a party and its seat count is often the largest single row
            # in an appointed-heavy year (87 of 186 in 1948, 121-123 of
            # 281-283 in 1957): left in, the shared "largest row" logic that
            # drives every hub's one-line summary reports it as the winning
            # PARTY ("Royal appointees finished first with 87 of 186 seats"),
            # which misstates what the row is. The appointed share is already
            # stated in this era's caveat; drop the row from the party list
            # here rather than let it stand in as a party in the chronology
            # and the charts.
            for e in series:
                e['parties'] = [p for p in e['parties']
                                 if p['name'] not in ('Royal appointees', 'Appointed members')]
        if cc == 've' and kind == 'leg':
            # 2025's infobox states the National Assembly's size ("All 285
            # seats") but never a turnout figure; the CNE's 42.66% turnout
            # is stated only in the article's prose ("The National Electoral
            # Council (CNE) reported that turnout in the election was at
            # 42.66%", ve.txt line 74), which the shared infobox/turnout
            # scanner does not read. Filled in from that sentence.
            for e in series:
                if e['id'] == '2025' and e['turnout'] is None:
                    e['turnout'] = 42.66
        if cc == 've' and kind == 'leg':
            # 1947's Congress table stacks "Party | Votes | % | Seats" over a
            # two-cell "Chamber | Senate" sub-header (ve.txt line 5127+53),
            # the same shape 1958-1988 use, but here the shared flat table
            # reader's header scan (which sees "Votes", "%" and "Seats" named
            # in the header line and reports the table as already having
            # votes+seats) short-circuits best_table() before it ever tries
            # the tiered reader that parses this shape correctly elsewhere,
            # and the flat reader's own row extraction then drops the % and
            # Seats cells entirely (name and votes only, seats always None).
            # Read the Chamber column directly: cells are name/votes/%/
            # chamber-seats/senate-seats, and the article's own lead sentence
            # states "83 of the 110 seats in the Chamber of Deputies and 38
            # of the 46 seats in the Senate", confirming AD's 83 (index 3,
            # not the Senate's 38 at index 4) and a 110-seat Chamber.
            from build_wikidump_hub import to_party
            for title, art_lines in articles(cfg['path']):
                if title != '1947 Venezuelan general election':
                    continue
                start = None
                for idx, l in enumerate(art_lines):
                    if l == 'Party\tVotes\t%\tSeats':
                        start = idx
                        break
                if start is None or art_lines[start + 1] != 'Chamber\tSenate':
                    break
                rows = []
                for l in art_lines[start + 2:]:
                    cells = l.split('\t')
                    if cells[0] == 'Total' or len(cells) != 5:
                        break
                    rows.append({'name': cells[0], 'votes': cells[1],
                                 'share': cells[2], 'seats': cells[3]})
                if not rows:
                    break
                by_id = {e['id']: e for e in series}
                if '1947' in by_id:
                    by_id['1947']['parties'] = [to_party(r) for r in rows]
                    by_id['1947']['totalSeats'] = 110
                    by_id['1947']['seatTotalSource'] = 'infobox'
                    by_id['1947']['tableSeats'] = sum(
                        p['seats'] for p in by_id['1947']['parties']
                        if p.get('seats') is not None)
                break
        if cc == 've' and kind == 'leg':
            # 2000, 2005 and 2010's National Assembly articles each also
            # carry unrelated tables that share the generic reader's "Party |
            # Votes/Vote% | ... | Seats" shape: 2000 prints the same-day
            # Andean and Latin American Parliament results (2000's own 12-row
            # National Assembly table is stacked "Party-list | Constituency |
            # Total seats" and never wins against those flat ones); 2005's
            # National Assembly table is itself a "Party-list | Constituency
            # | Total seats" stack with ~130 rows of micro-parties down to
            # single votes; 2010's article carries an unrelated Latin
            # American Parliament table further down (ve.txt line 8115+477).
            # With no per-title preference the reader lands on whichever of
            # these outranks the real National Assembly table by the generic
            # scoring, giving the wrong body's seats (2000: the 5-seat Andean
            # Parliament; 2010: the 12-seat Latin American Parliament) or
            # only a handful of the National Assembly's own rows correctly
            # cross-tabulated (2005). All three articles carry their own
            # compact "Party\tLeader\tVote %\tSeats[\t+/-]" results box
            # ("This lists parties that won seats. See the complete results
            # below.") that sums to the infobox's own seat total in every
            # case (2000: 165; 2005: 167, "MVR and allies" as printed, the
            # source's own grouping for the boycotted contest; 2010: PSUV 98,
            # MUD 65, PPT 2, all 165). Read that box directly.
            from build_wikidump_hub import to_party
            VE_LEG_COMPACT = {'2000 Venezuelan general election': ('2000', 165),
                               '2005 Venezuelan parliamentary election': ('2005', 167),
                               '2010 Venezuelan parliamentary election': ('2010', 165)}
            for title, art_lines in articles(cfg['path']):
                if title not in VE_LEG_COMPACT:
                    continue
                yr, total = VE_LEG_COMPACT[title]
                start = None
                for idx, l in enumerate(art_lines):
                    if l.startswith('Party\tLeader\tVote %\tSeats'):
                        start = idx
                        break
                if start is None:
                    continue
                rows = []
                for l in art_lines[start + 1:]:
                    cells = l.split('\t')
                    if len(cells) not in (4, 5):
                        break
                    rows.append({'name': cells[0] or None, 'leader': cells[1],
                                 'share': cells[2], 'seats': cells[3]})
                if not rows:
                    continue
                by_id = {e['id']: e for e in series}
                if yr in by_id:
                    by_id[yr]['parties'] = [to_party(r) for r in rows]
                    by_id[yr]['totalSeats'] = total
                    by_id[yr]['tableSeats'] = sum(
                        p['seats'] for p in by_id[yr]['parties']
                        if p.get('seats') is not None)
                    by_id[yr]['seatTotalSource'] = 'infobox'
        if cc == 've' and kind == 'pres':
            # 2024's article carries two rival "Candidate\tParty or
            # alliance\tVotes\t%" tables under separate headings, "Results
            # announced by the National Electoral Council (CNE)" (Maduro
            # 51.95%, González 43.18%, the only figures the government ever
            # released) and "Results announced by the Democratic Unitary
            # Platform (PUD)" (González 67.05%, Maduro 30.49%, built from the
            # opposition's published tally-sheet scans). In BOTH tables,
            # Maduro's and González's own rows carry six cells, not four
            # (name, alliance, blank, party, votes, share, e.g. "Nicolás
            # Maduro\tGreat Patriotic Pole\t\tPSUV\t6,408,844\t51.95") while
            # the eight minor candidates below them use the plain four-cell
            # shape the header promises. The generic reader cannot parse the
            # mixed row width and drops Maduro and González from the
            # contest's leading two rows entirely, leaving only the minor
            # candidates as "the results". Read the CNE table (the officially
            # declared result, matching the infobox's "Elected President:
            # Nicolás Maduro (Disputed)") and record the dispute described in
            # the dump's own reporting: the CNE never published tally sheets
            # or precinct-level data, while the opposition's published tally
            # sheets, covering the large majority of polling stations,
            # showed González ahead.
            from build_wikidump_hub import to_party
            for title, art_lines in articles(cfg['path']):
                if title != '2024 Venezuelan presidential election':
                    continue
                start = None
                for idx, l in enumerate(art_lines):
                    if l == 'Candidate\tParty or alliance\tVotes\t%':
                        start = idx
                        break
                if start is None:
                    break
                rows = []
                for l in art_lines[start + 1:]:
                    cells = l.split('\t')
                    if cells[0] == 'Total':
                        break
                    if len(cells) == 6:
                        rows.append({'name': cells[0], 'party': cells[3],
                                     'votes': cells[4], 'share': cells[5]})
                    elif len(cells) == 4:
                        rows.append({'name': cells[0], 'party': cells[1],
                                     'votes': cells[2], 'share': cells[3]})
                    else:
                        break
                if not rows:
                    break
                by_id = {e['id']: e for e in series}
                if '2024' in by_id:
                    by_id['2024']['parties'] = [to_party(r) for r in rows]
                    by_id['2024']['caveat'] = (
                        'The CNE declared Maduro the winner but never published '
                        'tally sheets or precinct-level results; the opposition '
                        'published tally sheets covering most polling stations '
                        'that showed Gonzalez ahead.')
                break
        if cc == 've' and kind == 'pres':
            # 2012's article carries the clean six-candidate "Results" table
            # (Candidate/Party/Votes/%, Chávez and Capriles's own totals) and,
            # right after it, a "By party" breakdown that re-lists each
            # candidate's total split out by each allied party within their
            # coalition, with the candidate's own row splitting across more
            # cells than the header ("Hugo Chávez\tGreat Patriotic
            # Pole\t\tUnited Socialist Party of Venezuela\t6,386,699\t42.94").
            # "pres" prefer takes the LONGEST table with votes and share
            # columns to skip past primary-result tables (Chile 1993), but
            # here that instead grabs the 34-row breakdown over the 6-row
            # Results table, and its ragged rows read a coalition member's
            # name into the candidate slot with the WRONG numbers (Chávez and
            # Capriles's own rows never appear at all). Confirmed against
            # ve.txt line 8104: the plain Results table gives Chávez
            # 8,191,132 (55.07%) and Capriles 6,591,304 (44.32%), matching
            # the infobox and the article's own lead sentence.
            from build_wikidump_hub import to_party
            for title, art_lines in articles(cfg['path']):
                if title != '2012 Venezuelan presidential election':
                    continue
                start = None
                for idx, l in enumerate(art_lines):
                    if l == 'Candidate\tParty\tVotes\t%':
                        start = idx
                        break
                if start is None:
                    break
                rows = []
                for l in art_lines[start + 1:]:
                    cells = l.split('\t')
                    if cells[0] == 'Total' or len(cells) != 4:
                        break
                    rows.append({'name': cells[0], 'party': cells[1],
                                 'votes': cells[2], 'share': cells[3]})
                if not rows:
                    break
                by_id = {e['id']: e for e in series}
                if '2012' in by_id:
                    by_id['2012']['parties'] = [to_party(r) for r in rows]
                break
        if cc == 've' and kind == 'pres':
            # 2000's article is a combined general-election page whose top
            # infobox states the legislative election's own size ("All 165
            # seats in the National Assembly / 83 seats needed for a
            # majority") ahead of the President section; the shared infobox
            # scanner has no notion of which section it is in, so that
            # National Assembly figure lands on the presidential row too.
            # Confirmed against ve.txt: the presidential table's own three
            # rows (Chávez, Arias Cárdenas, Fermín) are otherwise correct,
            # a candidate contest has no seats to report at all.
            for e in series:
                if e['id'] == '2000':
                    e['totalSeats'] = None
                    e['tableSeats'] = None
                    e['seatTotalSource'] = None
                    e['majoritySeats'] = None
        key = '%s-%s' % (cc, 'presidential' if kind == 'pres' else 'legislative')
        out['series'][key] = series
        matched = [t for t in titles if t and want(t)]
        withtable = sum(1 for e in series if e['parties'])
        print('%-16s %3d articles matched, %3d contests, %3d with a result table' % (key, len(matched), len(series), withtable))
    unmatched = sorted({t for t in titles if t and not any(cfg.get(k) and cfg[k](t) for k in ('leg', 'pres'))})
    if unmatched:
        print('   %s unmatched: %s' % (cc, '; '.join(unmatched)[:400]))

json.dump(out, open(H+'wave5-drafts.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('wrote wave5-drafts.json')
