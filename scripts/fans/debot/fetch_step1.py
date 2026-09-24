#!/usr/bin/env python3
"""Step 1 fetch: per-article monthly pageviews (user + automated) for the 40-team
sample, plus per-language aggregate user totals. Writes raw JSON under
data/fans/debot/raw/. Only writes new files; does not touch anything else."""
import json
import os
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

UA = "CoN-fan-index/1.0 (ashwind@gmail.com)"
START = "2023010100"
END = "2026083100"

def fetch(url, max_retries=1):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    attempt = 0
    while True:
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
                return json.loads(data)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {"items": [], "_status": 404}
            if e.code == 429 and attempt < max_retries:
                backoff = 5 + attempt * 10
                print(f"429 on {url}, backing off {backoff}s (attempt {attempt+1})", flush=True)
                time.sleep(backoff)
                attempt += 1
                continue
            raise
        except urllib.error.URLError as e:
            if attempt < max_retries:
                print(f"URLError {e} on {url}, retrying once", flush=True)
                time.sleep(5)
                attempt += 1
                continue
            raise

def article_url(lang, title, agent):
    t = urllib.parse.quote(title.replace(" ", "_"), safe="")
    return (f"https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/"
            f"{lang}.wikipedia/all-access/{agent}/{t}/monthly/{START}/{END}")

def aggregate_url(lang):
    return (f"https://wikimedia.org/api/rest_v1/metrics/pageviews/aggregate/"
            f"{lang}.wikipedia/all-access/user/monthly/{START}/{END}")

def sleep_jitter():
    time.sleep(random.uniform(0.2, 0.5))

def main():
    plan_path = sys.argv[1]
    out_dir = sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    sample = json.load(open(plan_path, encoding="utf-8"))

    n_requests = 0
    failures = []
    consecutive_429 = 0

    for team in sample:
        team_slug = team["qid"]
        for lg in team["langs"]:
            lang = lg["lang"]
            title = lg["title"]
            for agent in ("user", "automated"):
                fname = f"article_{team_slug}_{lang}_{agent}.json"
                fpath = os.path.join(out_dir, fname)
                if os.path.exists(fpath):
                    continue
                url = article_url(lang, title, agent)
                try:
                    data = fetch(url)
                    consecutive_429 = 0
                except Exception as e:
                    print(f"FAILED {team['team']} {lang} {agent}: {e}", flush=True)
                    failures.append({"team": team["team"], "qid": team_slug, "lang": lang,
                                      "agent": agent, "error": str(e)})
                    if "429" in str(e):
                        consecutive_429 += 1
                        if consecutive_429 >= 3:
                            print("STOP: repeated 429s after backoff, aborting run", flush=True)
                            json.dump(failures, open(os.path.join(out_dir, "_failures.json"), "w"), indent=2)
                            sys.exit(2)
                    sleep_jitter()
                    n_requests += 1
                    continue
                data["_meta"] = {"team": team["team"], "qid": team_slug, "lang": lang,
                                  "title": title, "agent": agent}
                with open(fpath, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False)
                n_requests += 1
                if n_requests % 25 == 0:
                    print(f"{n_requests} requests done...", flush=True)
                sleep_jitter()

    distinct_langs = sorted({lg["lang"] for team in sample for lg in team["langs"]})
    for lang in distinct_langs:
        fname = f"aggregate_{lang}_user.json"
        fpath = os.path.join(out_dir, fname)
        if os.path.exists(fpath):
            continue
        url = aggregate_url(lang)
        try:
            data = fetch(url)
        except Exception as e:
            print(f"FAILED aggregate {lang}: {e}", flush=True)
            failures.append({"lang": lang, "agent": "aggregate_user", "error": str(e)})
            sleep_jitter()
            n_requests += 1
            continue
        data["_meta"] = {"lang": lang}
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        n_requests += 1
        sleep_jitter()

    print(f"DONE. total requests attempted: {n_requests}, failures: {len(failures)}")
    if failures:
        json.dump(failures, open(os.path.join(out_dir, "_failures.json"), "w"), indent=2)

if __name__ == "__main__":
    main()
