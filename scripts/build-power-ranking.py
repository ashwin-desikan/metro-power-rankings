#!/usr/bin/env python3
"""build-power-ranking.py - Top 100 most powerful people. PowerScore = jurisdiction
metro score x office-base x V-Dem regime factor (national execs) / discount (billionaires).
Reads the leader feeds + public/data/power-inputs.json (V-Dem, org heads, central banks).
Tunable weights in the W dict. Writes public/data/power-ranking.json.
Each entry carries `metro` (canonical metros.json display name) and `metroSlug`
(the /rankings/[slug] slug, so the column links). The associated metro is the
seat-of-government metro for office-holders, HQ metro for orgs/central banks, and
home-base metro for billionaires; where a seat is not a canonical metro it falls
back to the highest-scored metro of that state, then country.

Pure scoring/lookup helpers (regime, resolve_metro, compute_power_entry,
dedupe_and_rank, juris_href, memsum) take their data as explicit arguments so
they're unit-testable without the public/data/*.json feeds; see
scripts/tests/test_build_power_ranking.py. All file I/O and the pipeline
sequencing live in main(), which only runs under __main__."""
import json,time,re,datetime

def rj(p):
    for _ in range(15):
        try: return json.load(open(p,encoding="utf-8"))
        except Exception: time.sleep(0.4)
    raise RuntimeError("read "+p)

def _bare(s):
    return re.sub(r"^[⚠️\U0001f451\s]+","",s or "").strip()

# ---------------- TUNABLE WEIGHTS ----------------
W = dict(
  natl_min=0.50, natl_max=1.00,     # national exec: 0.5 (full democracy) -> 1.0 (autocrat)
  vp=0.10, speaker=0.08, sen_maj=0.07, house_min=0.02, sen_min=0.02,
  subnatl=0.55, party_sec=0.80, mayor=0.72,
  org=0.025, central_bank=0.16,
  billion_factor=0.45,               # power per $1B net worth (after discount)
  corp_factor=0.05,                  # power per $1B market cap (corporate/market power)
  finance_factor=0.02,               # power per $1B AUM / assets (finance)
  media_factor=0.22,                 # soft power: per million reach (media)
  sport_factor=0.05,                 # soft power: per million reach (sport governance)
  culture_factor=0.24,               # soft power: per million reach (culture)
  commissioner_factor=0.44,          # sport: per $1B aggregate league franchise value
  judiciary=0.09,                    # apex-court chief, scored on its country
)
GEO={"saudi-arabia":3.6,"russia":2.5,"iran":3.0,"north-korea":3.0,"israel":4.5,
     "ukraine":4.0,"qatar":2.5,"united-arab-emirates":1.6,"pakistan":1.6,"egypt":1.3,
     "india":1.5,"indonesia":1.4,"brazil":1.3,"mexico":1.2,"nigeria":1.6}
FLOOR={"north-korea":80}

# ---- Associated metro SLUG lookups (values are metros.json slugs) ----
CAPITAL_METRO_SLUG={
 "united-states":"washington-baltimore","china":"beijing","india":"delhi","russia":"moscow",
 "united-kingdom":"london","saudi-arabia":"riyadh","germany":"berlin","france":"paris",
 "italy":"rome","brazil":"brasilia","japan":"tokyo","mexico":"mexico-city","spain":"madrid",
 "canada":"ottawa","iran":"tehran","united-arab-emirates":"abu-dhabi","australia":"canberra",
 "israel":"jerusalem","indonesia":"jakarta","south-korea":"seoul","ukraine":"kyiv",
 "north-korea":"pyongyang","turkey":"ankara","netherlands":"amsterdam","poland":"warsaw",
 "argentina":"buenos-aires","egypt":"cairo","nigeria":"abuja","pakistan":"islamabad",
 "qatar":"doha","singapore":"singapore","vietnam":"hanoi","thailand":"bangkok",
 "philippines":"manila","malaysia":"kuala-lumpur","taiwan":"taipei","belgium":"brussels",
 "austria":"vienna","ireland":"dublin","portugal":"lisbon","greece":"athens",
 "denmark":"copenhagen","new-zealand":"wellington","chile":"santiago","colombia":"bogota",
 "south-africa":"pretoria","kuwait":"kuwait-city","bahrain":"manama","oman":"muscat",
 "jordan":"amman","vatican-city":"vatican-city",
}
STATE_METRO_SLUG={
 "california":"sacramento","texas":"austin","new-york":"new-york","florida":"miami",
 "illinois":"chicago","jiangsu":"nanjing","guangdong":"guangzhou","zhejiang":"hangzhou",
 "shandong":"jinan","sichuan":"chengdu","hubei":"wuhan","hunan":"changsha","beijing":"beijing",
 "shanghai":"shanghai","tianjin":"tianjin","chongqing":"chongqing",
}
ORG_METRO_SLUG={"UN":"new-york","EU":"brussels","NATO":"brussels","IMF":"washington-baltimore",
                "WORLD_BANK":"washington-baltimore","WTO":"geneva"}
CB_METRO_SLUG={"US":"washington-baltimore","UK":"london","JP":"tokyo","CN":"beijing","IN":"mumbai"}
BILLIONAIRE_METRO_SLUG={
 "Elon Musk":"austin","Larry Page":"san-francisco-san-jose","Sergey Brin":"san-francisco-san-jose",
 "Jeff Bezos":"seattle","Larry Ellison":"austin","Mark Zuckerberg":"san-francisco-san-jose",
 "Michael Dell":"austin","Jensen Huang":"san-francisco-san-jose","Steve Ballmer":"los-angeles",
 "Michael Bloomberg":"new-york","Bill Gates":"seattle","Bernard Arnault & family":"paris",
 "Carlos Slim Helu & family":"mexico-city","Changpeng Zhao":"dubai-sharjah","Mukesh Ambani":"mumbai",
 "Gautam Adani":"ahmedabad","Ma Huateng":"shenzhen","Jack Ma":"hangzhou",
}
CBW={"CN":0.18}
ORGW={"UN":0.020,"EU":0.130,"IMF":0.022,"WORLD_BANK":0.017,"WTO":0.012}
CBJ={"US":"united-states","UK":"united-kingdom","JP":"japan","CN":"china","IN":"india"}
SPORT_HREF={"FIFA":"/teams/national","IOC":"/teams/olympics","UEFA":"/teams/football"}
ORG_SET={"UN","EU","NATO","IMF","World Bank","WTO"}
# -------------------------------------------------


def regime(slug, vdem, weights=W):
    """National-exec regime multiplier: 0.5 (full democracy) -> 1.0 (autocrat),
    interpolated from the V-Dem liberal-democracy score (missing -> 0.5)."""
    ld = vdem.get(slug, 0.5)
    return weights["natl_max"] - (weights["natl_max"] - weights["natl_min"]) * ld


def resolve_metro(slug_guess, mrows, mslugs, mnameof, country_slug=None, state_slug=None, text_fallback=""):
    """Return (display_name, canonical_slug). Canonical slug empty if unresolved.
    Falls back to the highest-scored metro sharing the given state, then country."""
    if slug_guess and slug_guess in mslugs:
        return mnameof[slug_guess], slug_guess
    for field, val in (("stateSlug", state_slug), ("countrySlug", country_slug)):
        if val:
            rows = [m for m in mrows if m.get(field) == val]
            if rows:
                r = max(rows, key=lambda x: (x.get("score") or 0))
                return r.get("name"), r["slug"]
    return text_fallback, ""


def compute_power_entry(name, role, cat, jur, jscore, weight, metro="", metro_slug=""):
    """Build one ranking row, or None if jscore or weight is falsy (excluded)."""
    if not (jscore and weight):
        return None
    return dict(name=name, role=role, category=cat, jurisdiction=jur,
        metro=metro, metroSlug=metro_slug, jscore=round(jscore, 1), weight=round(weight, 3), power=round(jscore * weight, 1))


def dedupe_and_rank(entries, limit=100):
    """Sort by power desc, drop repeat entries for the same bare (marker-
    stripped, case-insensitive) name keeping the first (highest-power) one,
    and cap at `limit`."""
    ranked = sorted(entries, key=lambda x: -x["power"])
    seen = set(); top = []
    for e in ranked:
        bare = _bare(e["name"]).lower()
        if bare in seen: continue
        seen.add(bare); top.append(e)
        if len(top) >= limit: break
    return top


def memsum(org, corgs, cscore):
    return sum(cscore.get(s, 0) for s, o in corgs.items() if o.get(org) == "Member")


def juris_href(e, country_name2slug, state_name2slug, cname, jhref_override):
    """Resolve the /countries, /states, /rankings, /orgs, or /teams link a
    ranking row's jurisdiction should point to, or '' if none applies."""
    cat = e["category"]; jur = e.get("jurisdiction") or ""
    if e["name"] in jhref_override: return jhref_override[e["name"]]
    if cat in ("National", "US federal", "Judiciary", "Billionaire", "Central bank", "Crown"):
        sl = country_name2slug.get(jur); return f"/countries/{sl}" if sl else ""
    if cat == "Faith":
        return "/countries/vatican-city" if jur == "Holy See" and "vatican-city" in cname else ""
    if cat == "Sub-national":
        sl = state_name2slug.get(jur); return f"/states/{sl}" if sl else ""
    if cat == "Mayor":
        return ("/rankings/" + e["metroSlug"]) if e.get("metroSlug") else ""
    if cat == "Org":
        return "/orgs" if jur in ORG_SET else ""
    if cat == "Sport":
        return SPORT_HREF.get(jur, "")
    return ""


def main():
    inp=rj("public/data/power-inputs.json")
    vdem=inp["vdem"]; ORGH=inp["orgs"]; CB=inp["central_banks"]
    cj=rj("public/data/countries.json"); crows=cj if isinstance(cj,list) else cj.get("countries") or list(cj.values())[0]
    cscore={r["slug"]:(r.get("scoreTotal") or 0.0) for r in crows if isinstance(r,dict)}
    cname={r["slug"]:r.get("name") for r in crows if isinstance(r,dict)}
    current=rj("public/data/leaders/_current.json")
    sscore={k:v["score"] for k,v in rj("public/data/state-metro-scores.json").items()}
    sleaders=rj("public/data/state-leaders.json")
    govs=rj("public/data/governors.json")["states"]
    sname={s["slug"]:s["name"] for s in rj("public/data/states.json")}
    mayors=rj("public/data/mayors.json")
    mrows=rj("public/data/metros.json"); mrows=mrows if isinstance(mrows,list) else mrows.get("metros",mrows)
    mscore={m["slug"]:(m.get("score") or 0.0) for m in mrows}
    mslugs={m["slug"] for m in mrows}
    mnameof={m["slug"]:m.get("name") for m in mrows}

    def rmetro(slug_guess, country_slug=None, state_slug=None, text_fallback=""):
        return resolve_metro(slug_guess, mrows, mslugs, mnameof, country_slug, state_slug, text_fallback)

    E=[]
    def add(name,role,cat,jur,jscore,weight,metro="",metro_slug=""):
        e=compute_power_entry(name,role,cat,jur,jscore,weight,metro,metro_slug)
        if e: E.append(e)

    for slug,ld in current.items():
        cs=max(cscore.get(slug,0), FLOOR.get(slug,0))
        if not cs: continue
        mn,msl=rmetro(CAPITAL_METRO_SLUG.get(slug), country_slug=slug, text_fallback=cname.get(slug,slug))
        ov=inp.get("monarch_overrides",{}).get(slug)
        _nm=ov["name"] if ov else ld["name"]
        _rl=ov["role"] if ov else ld.get("role","")
        add(_nm, f'{_rl}, {cname.get(slug,slug)}',"National",cname.get(slug,slug),cs,regime(slug,vdem)*GEO.get(slug,1.0),metro=mn,metro_slug=msl)

    US=cscore["united-states"]
    ex=cong=rj("public/data/us-congress.json")
    usmn,usmsl=rmetro("washington-baltimore")
    ex=cong["executive"]
    add(ex["vicePresident"]["name"],"US Vice President","US federal","United States",US,W["vp"],metro=usmn,metro_slug=usmsl)
    for l in cong["house"]["leadership"]:
        if "Speaker" in l["office"]: add(l["name"],"Speaker of the House","US federal","United States",US,W["speaker"],metro=usmn,metro_slug=usmsl)
        elif l["office"]=="Minority Leader": add(l["name"],"House Minority Leader","US federal","United States",US,W["house_min"],metro=usmn,metro_slug=usmsl)
    add("John Thune","Senate Majority Leader","US federal","United States",US,W["sen_maj"],metro=usmn,metro_slug=usmsl)
    add("Chuck Schumer","Senate Minority Leader","US federal","United States",US,W["sen_min"],metro=usmn,metro_slug=usmsl)

    for slug,sc in sscore.items():
        mn,msl=rmetro(STATE_METRO_SLUG.get(slug), state_slug=slug, text_fallback=sname.get(slug,slug))
        if slug in sleaders:
            l=sleaders[slug]; base=W["party_sec"] if "Party Secretary" in l.get("title","") else W["subnatl"]
            add(l["name"], f'{l.get("title","")}, {sname.get(slug,slug)}',"Sub-national",sname.get(slug,slug),sc,base,metro=mn,metro_slug=msl)
        elif slug in govs:
            g=govs[slug]; add(g["name"], f'Governor, {sname.get(slug,slug)}',"Sub-national",sname.get(slug,slug),sc,W["subnatl"],metro=mn,metro_slug=msl)

    for ms,m in mayors.items():
        mn,msl=rmetro(ms, text_fallback=m.get("city",ms))
        add(m["mayor"], f'Mayor of {m.get("city",ms)}',"Mayor",m.get("city",ms),mscore.get(ms,0),W["mayor"],metro=mn,metro_slug=msl)

    corgs=rj("public/data/country-orgs.json")
    world=sum(cscore.values()); eu=memsum("EU",corgs,cscore)
    orgL=rj("public/data/org-leaders.json")
    for org in ("NATO","UN","EU"):
        c=orgL[org]["current"]; mn,msl=rmetro(ORG_METRO_SLUG.get(org)); add(c["name"], f'{org} {c["role"]}',"Org",org,memsum(org,corgs,cscore),ORGW.get(org,W["org"]),metro=mn,metro_slug=msl)
    for k,role in (("IMF","IMF Managing Director"),("WORLD_BANK","World Bank President"),("WTO","WTO Director-General")):
        mn,msl=rmetro(ORG_METRO_SLUG.get(k)); j="World Bank" if k=="WORLD_BANK" else k
        add(ORGH[k]["name"],role,"Org",j,world,ORGW[k],metro=mn,metro_slug=msl)
    mn,msl=rmetro("frankfurt")
    add(ORGH["ECB"]["name"],"ECB President","Central bank","Eurozone",eu,W["central_bank"],metro=mn,metro_slug=msl)
    for k,info in CB.items():
        mn,msl=rmetro(CB_METRO_SLUG.get(k), country_slug=CBJ[k]); add(info["name"],info["title"],"Central bank",cname.get(CBJ[k]),cscore.get(CBJ[k],0),CBW.get(k,W["central_bank"]),metro=mn,metro_slug=msl)

    bz=rj("public/data/billionaires.json")["billionaires"]
    for b in bz[:60]:
        nb=(b.get("networth") or 0)/1000.0
        mn,msl=rmetro(BILLIONAIRE_METRO_SLUG.get(_bare(b["name"])), text_fallback=b.get("countryName"))
        E.append(dict(name=b["name"],role=f'Billionaire ({", ".join(b.get("industries") or [])})',category="Billionaire",
            jurisdiction=b.get("countryName"),metro=mn,metroSlug=msl,jscore=round(nb,1),weight=W["billion_factor"],power=round(nb*W["billion_factor"],1)))

    # corporate / market power - reuses the weekly MktCap_Data feed via corporate-power.json.
    # Founder-CEOs dedupe against their billionaire entry (highest score wins).
    try:
        corp=rj("public/data/corporate-power.json")
    except Exception:
        corp=[]
    for c in corp:
        vb=c.get("valuationB") or 0
        add(c["name"], c.get("role",""),"Corporate",c.get("company",""),vb,W["corp_factor"],metro=c.get("metro",""),metro_slug=c.get("metroSlug",""))

    # finance - capital allocators scored by AUM / total assets (curated quarterly
    # block in power-inputs.json; no clean free AUM API). Bankers who also appear in
    # the corporate market-cap feed dedupe by name (highest score wins).
    for k,info in inp.get("finance",{}).items():
        ab=info.get("aumB") or 0
        mn,msl=rmetro(info.get("metro_slug"))
        add(info["name"], f'{info.get("firm","")} ({info.get("metric","AUM")})',"Finance",info.get("firm",""),ab,W["finance_factor"],metro=mn,metro_slug=msl)

    # judiciary - apex-court chiefs, scored on their country like US federal roles.
    for k,info in inp.get("judiciary",{}).items():
        csl=info.get("country_slug")
        mn,msl=rmetro(info.get("metro_slug"), country_slug=csl)
        add(info["name"],info.get("title",""),"Judiciary",cname.get(csl,csl),cscore.get(csl,0),W["judiciary"],metro=mn,metro_slug=msl)

    JHREF_OVERRIDE={}
    # soft power - media, sport governance, culture - scored on estimated global
    # reach (millions of people) rather than a jurisdiction. Deliberately softer /
    # more contestable; curated blocks in power-inputs.json.
    for blk,cat,fac in (("media","Media","media_factor"),("sport_governance","Sport","sport_factor"),("culture","Culture","culture_factor")):
        for k,info in inp.get(blk,{}).items():
            reach=info.get("reach") or 0
            if info.get("jhref"): JHREF_OVERRIDE[info["name"]]=info["jhref"]
            mn,msl=rmetro(info.get("metro_slug"), text_fallback=info.get("hq",""))
            add(info["name"],info.get("role",cat),cat,info.get("org",cat),reach,W[fac],metro=mn,metro_slug=msl)

    # league commissioners - scored on the aggregate franchise value of their league
    # (from the tracked valuations feed). Folded into the Sport category.
    try:
        _val=rj("public/data/valuations/valuations.json"); _vrows=_val.get("rows",_val) if isinstance(_val,dict) else _val
    except Exception:
        _vrows=[]
    _byteam={}
    for r in _vrows:
        kk=(r.get("league"),r.get("team")); yr=r.get("year") or 0
        try: vv=float(r.get("value_m") or 0)
        except Exception: vv=0.0
        if kk not in _byteam or yr>_byteam[kk][0]: _byteam[kk]=(yr,vv)
    _league_agg={}
    for (lg,tm),(yr,vv) in _byteam.items(): _league_agg[lg]=_league_agg.get(lg,0)+vv
    for k,info in inp.get("commissioners",{}).items():
        aggB=_league_agg.get(info.get("league_key"),0)/1000.0
        mn,msl=rmetro(info.get("metro_slug"))
        if info.get("jhref"): JHREF_OVERRIDE[info["name"]]=info["jhref"]
        add(info["name"], f'Commissioner, {info.get("display",info.get("league_key"))}',"Sport",info.get("display",info.get("league_key")),aggB,W["commissioner_factor"],metro=mn,metro_slug=msl)

    for k,info in inp.get("crown",{}).items():
        mn,msl=rmetro(info.get("metro_slug"), text_fallback=info.get("country",""))
        add(info["name"],info.get("role","Sovereign"),"Crown",info.get("country",""),info.get("value",0) or 0,1.0,metro=mn,metro_slug=msl)

    for k,info in inp.get("faith",{}).items():
        mn,msl=rmetro(info.get("metro_slug"), text_fallback=info.get("seat",""))
        add(info["name"],info.get("role",""),"Faith",info.get("jurisdiction",""),info.get("value",0) or 0,1.0,metro=mn or info.get("seat",""),metro_slug=msl)

    top=dedupe_and_rank(E, limit=100)
    country_name2slug={v:k for k,v in cname.items()}
    state_name2slug={v:k for k,v in sname.items()}
    for e in top:
        e["jurisdictionHref"]=juris_href(e, country_name2slug, state_name2slug, cname, JHREF_OVERRIDE)
        e["transition"]=inp.get("transitions",{}).get(_bare(e["name"]),"")
    json.dump({"weights":W,"asOf":datetime.date.today().isoformat(),"ranking":top}, open("public/data/power-ranking.json","w",encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"{'#':>3} {'POWER':>7}  {'METRO':22} {'SLUG':22} NAME")
    for i,e in enumerate(top,1):
        print(f"{i:>3} {e['power']:>7.0f}  {str(e.get('metro','')):22} {str(e.get('metroSlug','')):22} {e['name']}")


if __name__=="__main__":
    main()
