# Forecast resources — evaluated GitHub repositories

All repos Ashwin has shared for the forecast layer, with licence and verdict.
Keep this list current as new sources are evaluated. (Evaluations 2026-07-22.)

## Round 1 (US/UK forecast build)

| Repo | Licence | Verdict / use |
|---|---|---|
| [fivethirtyeight/data](https://github.com/fivethirtyeight/data) | CC BY 4.0 | Historical calibration + attribution only. Frozen post-Mar-2025 (site closed); raw-polls archive informs our error scales. |
| [jason-chao/uk-elections](https://github.com/jason-chao/uk-elections) | — | Method survey for UK election data handling; nothing ingested. |
| [nnoble13/UK_election](https://github.com/nnoble13/UK_election) | NO LICENCE | Do not reuse code or data. Reference reading only. |
| [fahadamjad009/election-polling-aggregator](https://github.com/fahadamjad009/election-polling-aggregator) | MIT | Validates our simple weighted-average method (1.31pt MAE, 87.5% winners on 22 holdout elections). Cited in HowItWorks. |

## Round 2 (BR/IL/NZ/FR extension)

| Repo | Licence | Verdict / use |
|---|---|---|
| [erikgahner/PolData](https://github.com/erikgahner/PolData) | CC0 | Superb catalog of political-science datasets (party positions, elections). Nothing ingested yet; first stop for a future party-metadata layer. |
| [ellisp/nz-election-forecast](https://github.com/ellisp/nz-election-forecast) | GPL | Methodology reference ONLY (GPL — no code reuse). Validated our Sainte-Laguë + threshold + electorate-waiver approach for NZ. |
| [benckx/voxpol.fr](https://github.com/benckx/voxpol.fr) | GPL | Validates the Wikipedia-as-polling-source pattern we use. No code reuse. |
| [carlosduplar/eleicoes-2026-monitor](https://github.com/carlosduplar/eleicoes-2026-monitor) | MIT | Brazil 2026 watch via news APIs; we scrape Wikipedia's polling tables directly instead. Worth re-checking near the election. |
| [danielrosehill/AI-Geopol-Projects](https://github.com/danielrosehill/AI-Geopol-Projects) | — | Curated link index; context only. |
| [danielrosehill/Israel-Open-Data-Resources](https://github.com/danielrosehill/Israel-Open-Data-Resources) | — | Curated index of Israeli open-data sources; useful if we outgrow Wikipedia's Knesset seat polls. |

## Live pipeline sources (not repos)

- Wikipedia polling/ratings tables (CC BY-SA 4.0) — UK, US House aggregators,
  US Senate ratings, NZ, IL, BR, FR. Scraped by scripts/forecast/fetch_data.py.
- House of Commons Library CBP-10009 GE2024 constituency results (Open
  Parliament Licence) — the UK seat-simulation base.
