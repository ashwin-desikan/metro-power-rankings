import json, collections, datetime
from bisect import bisect_left

def md(s): return datetime.date(*map(int,s.split('-')))
def may0(t):  # most recent May 1 <= t
    return datetime.date(t.year if (t.month,t.day)>=(5,1) else t.year-1,5,1)
def shift(d,months):
    y,m = d.year, d.month+months
    while m<1: m+=12; y-=1
    while m>12: m-=12; y+=1
    return datetime.date(y,m,1)

class Ledger:
    def __init__(self): self.e=[]  # (date, pts, n)
    def rating(self,t):
        m0=may0(t); lo50=shift(m0,-36); lo100=shift(m0,-12)
        P=N=0.0
        for d,p,n in self.e:
            if d>t: break
            if d>=lo100: P+=p; N+=n
            elif d>=lo50: P+=p*0.5; N+=n*0.5
        return (P/N if N>0 else None), N

def run(matches, series_mode):
    """matches: sorted list of dicts(date,t1,t2,winner,result). Returns ledgers + snapshot fn."""
    L=collections.defaultdict(Ledger)
    def get(team,t):
        r,n=L[team].rating(t); return (100.0 if r is None else r), n
    def pts(rA,rB,sA,sB,total):
        # sA,sB series/match points; total = n increments
        if abs(rA-rB)<40:
            pA=sA*(rB+50)+sB*(rB-50); pB=sB*(rA+50)+sA*(rA-50)
        else:
            if rA>rB:
                pA=sA*(rA+10)+sB*(rA-90); pB=sB*(rB+90)+sA*(rB-10)
            else:
                pA=sA*(rA+90)+sB*(rA-10); pB=sB*(rB+10)+sA*(rB-90)
        return pA,pB
    if series_mode:
        for s in matches:  # here each item is a series
            t0=s['start']; A,B=s['A'],s['B']
            rA,_=get(A,t0); rB,_=get(B,t0)
            wA,wB,dr = s['wA'],s['wB'],s['dr']
            sA=wA+0.5*dr; sB=wB+0.5*dr
            sA+= 1 if wA>wB else (0.5 if wA==wB else 0)
            sB+= 1 if wB>wA else (0.5 if wA==wB else 0)
            n=s['n']+1
            pA,pB=pts(rA,rB,sA,sB,n)
            L[A].e.append((s['end'],pA,n)); L[B].e.append((s['end'],pB,n))
    else:
        for m in matches:
            t=m['date']; A,B=m['t1'],m['t2']
            rA,_=get(A,t); rB,_=get(B,t)
            if m['winner']==A: sA,sB=1,0
            elif m['winner']==B: sA,sB=0,1
            else: sA,sB=0.5,0.5  # tie (no-results pre-filtered)
            pA,pB=pts(rA,rB,sA,sB,1)
            L[A].e.append((t,pA,1)); L[B].e.append((t,pB,1))
    return L

def month_ends(y0,m0,y1,m1):
    y,m=y0,m0
    while (y,m)<=(y1,m1):
        ny,nm=(y,m+1) if m<12 else (y+1,1)
        yield datetime.date(ny,nm,1)-datetime.timedelta(days=1)
        y,m=ny,nm

def snapshots(L,y0,m0,y1,m1,min_n=8):
    out=[]
    for me in month_ends(y0,m0,y1,m1):
        row={}
        for team,led in L.items():
            r,n=led.rating(me)
            if r is not None and n>=min_n: row[team]=(round(r,1),round(n,1))
        out.append((me.isoformat(),row))
    return out
