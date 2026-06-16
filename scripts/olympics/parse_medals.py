#!/usr/bin/env python3
"""Parse Olympedia medal-winner dumps into a normalized long table.
One row per medalist (ties expanded).

A CLEAN event is a single physical line with exactly 7 tab-cells:
  Event, GoldName, GoldNOC, SilverName, SilverNOC, BronzeName, BronzeNOC
('—' marks an unawarded medal). Parsed POSITIONALLY -> robust to team names
that are themselves NOC codes (e.g. 'ROC').

A TIE wraps across physical lines; line 1 then has FEWER than 7 cells and the
flattened token stream carries, per medal cell, all names then all NOCs. Those
rows accumulate continuation lines (each <=1 tab) until a structural parse
balances exactly.
"""
import json, re, sys

DASH = "—"
HEADER_RE = re.compile(r"^Medal winners (.+?) ((?:18|19|20)\d\d)$")

def _dedup(medals):
    """Drop identical (medal,name,noc) within one event (Olympedia lists a sole
    winner twice in a few early-Games rows); a real tie has distinct athletes."""
    seen=set(); out=[]
    for m in medals:
        if m in seen: continue
        seen.add(m); out.append(m)
    return out
BOILER = ("Did you know","Login |","© OlyMADMen","Olympedia","Athletes","Countries",
          "Games","Sports","IOC","Statistics","Feedback","Athlete search")

def is_noc(tok, noc_set):
    return tok in noc_set or bool(re.fullmatch(r"[A-Z]{3}", tok))

def parse_positional(t):
    out=[]
    for medal,(n,c) in zip(("Gold","Silver","Bronze"),[(t[0],t[1]),(t[2],t[3]),(t[4],t[5])]):
        if n==DASH: continue
        out.append((medal,n,c))
    return out

def parse_heuristic(tokens, noc_set, strict=False):
    out=[]; i=0
    for medal in ("Gold","Silver","Bronze"):
        if i>=len(tokens):
            return None if strict else (_ for _ in ()).throw(StopIteration) if False else out
        if tokens[i]==DASH:
            i+=1
            if i<len(tokens) and tokens[i]==DASH: i+=1
            elif strict: return None
            continue
        names=[]
        while i<len(tokens) and not is_noc(tokens[i],noc_set) and tokens[i]!=DASH:
            names.append(tokens[i]); i+=1
        if not names:
            if strict: return None
            break
        k=len(names); nocs=[]
        while i<len(tokens) and len(nocs)<k and is_noc(tokens[i],noc_set):
            nocs.append(tokens[i]); i+=1
        if len(nocs)!=k:
            if strict: return None
            while len(nocs)<k: nocs.append("")
        for n,c in zip(names,nocs): out.append((medal,n,c))
    if strict and i!=len(tokens): return None
    return out

def heuristic_balanced(tokens, noc_set):
    if len(tokens)<6: return False
    try: return parse_heuristic(tokens,noc_set,strict=True) is not None
    except Exception: return False

def split_block_into_events(content, noc_set):
    cur_sport=None; buf=[]; cur_event=None; results=[]
    def flush():
        nonlocal buf,cur_event
        if cur_event is not None:
            medals = parse_heuristic(buf,noc_set,strict=False) or []
            results.append((cur_sport,cur_event,_dedup(medals)))
        buf=[]; cur_event=None
    def start_event(toks):
        nonlocal buf,cur_event
        if len(toks)==7:                      # clean single-line event
            results.append((cur_sport,toks[0],_dedup(parse_positional(toks[1:]))))
            cur_event=None; buf=[]
        else:                                 # tie wrap-start
            cur_event=toks[0]; buf=toks[1:]
    for raw in content:
        line=raw.rstrip("\n"); s=line.strip()
        if s=="" or any(s.startswith(b) for b in BOILER): break
        toks=[t.strip() for t in line.split("\t")]
        if cur_event is not None and not heuristic_balanced(buf,noc_set):
            buf.extend(toks)             # accumulate tie continuation until it balances
            continue
        # current event complete -> classify line
        if len(toks)==1:
            t=toks[0]
            if t==DASH or is_noc(t,noc_set):
                if cur_event is not None: buf.extend(toks)
                continue
            flush(); cur_sport=t; continue
        flush(); start_event(toks)
    flush()
    return results

def build_noc_set(text):
    s=set()
    for line in text.split("\n"):
        for tok in line.split("\t"):
            tok=tok.strip()
            if re.fullmatch(r"[A-Z]{3}",tok): s.add(tok)
    return s

def parse_file(path, season):
    text=open(path,encoding="utf-8").read().replace("\r","")
    lines=text.split("\n"); noc_set=build_noc_set(text)
    starts=[]
    for idx,l in enumerate(lines):
        m=HEADER_RE.match(l.strip())
        if m: starts.append((idx,m.group(1),int(m.group(2))))
    rows=[]
    for bi,(idx,city,year) in enumerate(starts):
        end=starts[bi+1][0] if bi+1<len(starts) else len(lines)
        block=lines[idx+1:end]; content=[]; started=False
        for l in block:
            if not started:
                if l.strip().startswith("Sport/Event"): started=True
                continue
            content.append(l)
        for sport,event,medals in split_block_into_events(content,noc_set):
            for medal,name,noc in medals:
                rows.append({"year":year,"season":season,"city":city,"sport":sport,
                             "event":event,"medal":medal,"name":name,"noc":noc})
    return rows,noc_set

if __name__=="__main__":
    sr,_=parse_file(sys.argv[1],"Summer")
    wr,_=parse_file(sys.argv[2],"Winter")
    json.dump(sr+wr,open(sys.argv[3],"w"),ensure_ascii=False)
    print("summer rows:",len(sr),"winter rows:",len(wr))
