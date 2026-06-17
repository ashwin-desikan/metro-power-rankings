#!/usr/bin/env python3
"""Build per-edition Olympic JSON for /teams/olympics/games/[slug].

Run from anywhere:
    python scripts/olympics/build_olympics_editions.py

Inputs (resolved relative to this file):
    sources/summeroly.txt, sources/winter_intercalated.txt  (Olympedia 'Medal winners')
    olympics.txt                                            (Olympedia 'Medals by country')
Outputs:
    ../../public/data/olympics/editions/<slug>.json
    ../../public/data/olympics/editions-index.json

Event-level medals reconcile exactly with the medals-by-country tables on every
edition and NOC (see Olympics_Source_of_Truth.xlsx). Lineage is NOT folded here:
each edition shows nations as they competed (Soviet Union, ROC, etc.).
"""
import json, os, re, sys, unicodedata
from collections import defaultdict, OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from parse_medals import parse_file  # validated tie-aware parser

DISPLAY={"United States":"United States","People's Republic of China":"China",
 "Republic of Korea":"South Korea","Democratic People's Republic of Korea":"North Korea",
 "Islamic Republic of Iran":"Iran","Kingdom of Saudi Arabia":"Saudi Arabia",
 "Republic of Moldova":"Moldova","United Republic of Tanzania":"Tanzania",
 "Syrian Arab Republic":"Syria","The Bahamas":"Bahamas","Cabo Verde":"Cape Verde",
 "Ivory Coast":"Côte d'Ivoire","Bosnia and Herzegovina":"Bosnia-Herzegovina",
 "Türkiye":"Turkey","Hong Kong, China":"Hong Kong","Russian Federation":"Russia",
 "Équipe Olympique des Réfugies":"Refugee Olympic Team"}
SEASON_ORDER={"Summer":0,"Intercalated":1,"Winter":2}
METRO={
 (1896,"Summer"):"Athens",(1900,"Summer"):"Paris",(1904,"Summer"):"St. Louis",
 (1908,"Summer"):"London",(1912,"Summer"):"Stockholm",(1920,"Summer"):"Antwerp",
 (1924,"Summer"):"Paris",(1928,"Summer"):"Amsterdam",(1932,"Summer"):"Los Angeles",
 (1936,"Summer"):"Berlin",(1948,"Summer"):"London",(1952,"Summer"):"Helsinki",
 (1956,"Summer"):"Melbourne",(1960,"Summer"):"Rome",(1964,"Summer"):"Tokyo",
 (1968,"Summer"):"Mexico City",(1972,"Summer"):"Munich",(1976,"Summer"):"Montreal",
 (1980,"Summer"):"Moscow",(1984,"Summer"):"Los Angeles",(1988,"Summer"):"Seoul",
 (1992,"Summer"):"Barcelona",(1996,"Summer"):"Atlanta",(2000,"Summer"):"Sydney",
 (2004,"Summer"):"Athens",(2008,"Summer"):"Beijing",(2012,"Summer"):"London",
 (2016,"Summer"):"Rio de Janeiro",(2020,"Summer"):"Tokyo",(2024,"Summer"):"Paris",
 (1906,"Intercalated"):"Athens",
 (1924,"Winter"):"Chamonix",(1928,"Winter"):"St. Moritz",(1932,"Winter"):"Lake Placid",
 (1936,"Winter"):"Munich",(1948,"Winter"):"St. Moritz",(1952,"Winter"):"Oslo",
 (1956,"Winter"):"Belluno",(1960,"Winter"):"Sacramento",(1964,"Winter"):"Innsbruck",
 (1968,"Winter"):"Grenoble",(1972,"Winter"):"Sapporo",(1976,"Winter"):"Innsbruck",
 (1980,"Winter"):"Lake Placid",(1984,"Winter"):"Sarajevo",(1988,"Winter"):"Calgary",
 (1992,"Winter"):"Albertville",(1994,"Winter"):"Lillehammer",(1998,"Winter"):"Nagano",
 (2002,"Winter"):"Salt Lake City-Provo",(2006,"Winter"):"Turin",(2010,"Winter"):"Vancouver",
 (2014,"Winter"):"Sochi",(2018,"Winter"):"Pyeongchang",(2022,"Winter"):"Beijing",
 (2026,"Winter"):"Milan"}
HOSTCITY={
 (1956,"Summer"):"Melbourne / Stockholm",(1936,"Winter"):"Garmisch-Partenkirchen",
 (1956,"Winter"):"Cortina d'Ampezzo",(1960,"Winter"):"Squaw Valley",
 (2026,"Winter"):"Milan-Cortina d'Ampezzo",(2002,"Winter"):"Salt Lake City",
 (1906,"Intercalated"):"Athens"}
CITY_RENAME={"Athina":"Athens","Antwerpen":"Antwerp","Ciudad de México":"Mexico City",
 "Moskva":"Moscow","München":"Munich","Montréal":"Montreal","Roma":"Rome","Torino":"Turin",
 "Sankt Moritz":"St. Moritz","PyeongChang":"Pyeongchang","Milano-Cortina d'Ampezzo":"Milan-Cortina d'Ampezzo"}

def slugify(name):
    s=unicodedata.normalize("NFKD",name).encode("ascii","ignore").decode()
    return re.sub(r"[^a-zA-Z0-9]+","-",s).strip("-").lower()
def edition_slug(year,season): return "%s-%d"%(season.lower(),year)
def norm_season(r):
    if r["year"]==1906: return "Intercalated"
    if r["city"]=="Stockholm" and r["year"]==1956: return "Summer"
    return r["season"]

def main():
    summer=os.path.join(HERE,"sources","summeroly.txt")
    winter=os.path.join(HERE,"sources","winter_intercalated.txt")
    country_txt=os.path.join(HERE,"olympics.txt")
    out_dir=os.path.normpath(os.path.join(HERE,"..","..","public","data","olympics"))
    sr,_=parse_file(summer,"Summer"); wr,_=parse_file(winter,"Winter")
    rows=sr+wr
    for r in rows: r["season"]=norm_season(r)
    lines=open(country_txt,encoding="utf-8").read().splitlines()
    country=defaultdict(lambda: OrderedDict()); cur=None; year=None; season=None
    for l in lines:
        s=l.strip()
        if re.fullmatch(r"(18|19|20)\d\d",s): year=int(s)
        elif s in ("Summer","Winter") and year: season=s
        elif s.startswith("NOC\t"):
            sn="Intercalated" if year==1906 else season; cur=(year,sn)
        elif cur is not None:
            c=l.split("\t")
            if len(c)==6 and c[2].strip().isdigit():
                noc=c[1].strip(); nm=c[0].strip()
                e=country[cur].setdefault(noc,[nm,0,0,0])
                e[1]+=int(c[2]);e[2]+=int(c[3]);e[3]+=int(c[4])
            elif s=="" or "Did you know" in s: cur=None
    NOCNAME={}
    for ed in country.values():
        for noc,(nm,g,s,b) in ed.items(): NOCNAME.setdefault(noc,DISPLAY.get(nm,nm))
    cname=lambda noc: NOCNAME.get(noc,noc)
    # Per-sport nation medal table: count medals by NOC within each sport, with
    # no athlete names (readers browse by year and sport; we don't reproduce the
    # full named-medalist database). Event-level medals reconcile to the
    # medals-by-country totals, so per-sport counts sum to each nation's total.
    MEDAL_IDX={"Gold":0,"Silver":1,"Bronze":2}
    detail=defaultdict(lambda: OrderedDict())
    for r in rows:
        ed=(r["year"],r["season"])
        sp=detail[ed].setdefault(r["sport"],{"events":set(),"nocs":OrderedDict()})
        sp["events"].add(r["event"])
        mi=MEDAL_IDX.get(r["medal"])
        if mi is None: continue
        sp["nocs"].setdefault(r["noc"],[0,0,0])[mi]+=1
    os.makedirs(os.path.join(out_dir,"editions"),exist_ok=True)
    index=[]
    for ed in sorted(country.keys(),key=lambda k:(k[0],SEASON_ORDER.get(k[1],9))):
        yr,sn=ed; tbl=country[ed]
        ranked=sorted(tbl.items(),key=lambda kv:(-kv[1][1],-kv[1][2],-kv[1][3]))
        table=[{"rank":i+1,"noc":noc,"name":cname(noc),"g":v[1],"s":v[2],"b":v[3],
                "total":v[1]+v[2]+v[3]} for i,(noc,v) in enumerate(ranked)]
        sports=[]
        for sp,info in detail.get(ed,{}).items():
            ranked=sorted(info["nocs"].items(),
                          key=lambda kv:(-kv[1][0],-kv[1][1],-kv[1][2],cname(kv[0])))
            sptable=[{"noc":noc,"name":cname(noc),"g":c[0],"s":c[1],"b":c[2],
                      "total":c[0]+c[1]+c[2]} for noc,c in ranked]
            sports.append({"sport":sp,"events":len(info["events"]),"table":sptable})
        city_raw=next((r["city"] for r in rows if (r["year"],r["season"])==ed),"")
        rec={"slug":edition_slug(yr,sn),"year":yr,"season":sn,
             "name":("%d Intercalated Games"%yr) if sn=="Intercalated" else "%d %s Olympics"%(yr,sn),
             "hostCity":HOSTCITY.get(ed,CITY_RENAME.get(city_raw,city_raw)),
             "hostMetro":METRO.get(ed,""),"hostMetroSlug":slugify(METRO.get(ed,"")),
             "nations":len(table),"events":sum(s["events"] for s in sports),
             "medalsTotal":sum(t["total"] for t in table),"table":table,"sports":sports}
        json.dump(rec,open(os.path.join(out_dir,"editions",rec["slug"]+".json"),"w",encoding="utf-8"),
                  ensure_ascii=False,separators=(",",":"))
        index.append({k:rec[k] for k in ("slug","year","season","name","hostCity",
                      "hostMetro","hostMetroSlug","nations","events","medalsTotal")})
    json.dump(index,open(os.path.join(out_dir,"editions-index.json"),"w",encoding="utf-8"),
              ensure_ascii=False,separators=(",",":"))
    print("wrote %d editions to %s"%(len(index),out_dir))

if __name__=="__main__":
    main()
