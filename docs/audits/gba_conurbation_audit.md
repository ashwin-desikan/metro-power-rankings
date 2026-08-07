> **RE-VERIFIED 2026-08-07. Every finding still stands, 90 days on.** shenzhen, foshan, dongguan, zhuhai, zhongshan, jiangmen and zhaoqing (~53M people) are still absent from `public/data/metros.json`, and `public/data/conurbations.csv` still has no Pearl River Delta row. Meanwhile `lib/badges.ts:1189` ships `The top of the list is Pearl River Delta at 188.5` to the public /badges/conurbations page for a cluster the data does not contain. BLOCKED ON ASHWIN: the MetroAreas.xlsx Team List addition. Everything downstream is mechanical. Minor drift in the figures below: guangzhou rank 11 -> 10; c001 score 98.3 -> 102.1; hong-kong cluster id c005 -> c003, score 92.2 -> 93.4.

# Greater Bay Area conurbation audit

Audit date: 2026-05-09. Tracks the gap between BACKLOG's "Pearl River Delta / Greater Bay Area conurbation audit" entry and what the data actually shows.

## TL;DR

The GBA is **not unified** in the conurbations layer. More fundamentally, **seven of the eleven metros that constitute the GBA are not in the rankings corpus at all**. The `lib/badges.ts` Tier A description copy claims "Pearl River Delta" is one of the heaviest conurbations on Earth; the data does not currently reflect this.

The fix is upstream of code: it requires adding the missing metros to `MetroAreas.xlsx` Team List sheet. Once they land, the conurbations clustering pass will pick them up automatically given the geographic proximity.

## What is in the corpus today

From `public/data/conurbations.csv` and `public/data/metros.json`:

| Slug | In ranked corpus | Conurbation cluster | Notes |
|---|---|---|---|
| guangzhou | Yes (rank 11) | c001 (with qingyuan), 98.3, Tier B | Two-member cluster |
| hong-kong | Yes (rank 18) | c005 (with macau), 92.2, Tier B | Two-member cluster |
| macau | Yes (cluster member) | c005 | Has detail file |
| huizhou | Yes (in details) | none | Standalone |
| qingyuan | Yes (in details) | c001 | Cluster member |

## What is missing

These GBA metros are absent from `public/data/metros.json` and have no detail files:

| Slug expected | City | 2024 metro pop (approx) | Why it matters |
|---|---|---|---|
| shenzhen | Shenzhen | ~17.5M | The largest single omission. Tech megacity, the Hang Seng tech anchor, BYD/Tencent/Huawei. Should plausibly rank top-30 globally on its own. |
| foshan | Foshan | ~9.6M | Twin to Guangzhou, manufacturing heart of the PRD |
| dongguan | Dongguan | ~10.5M | Twin to Shenzhen, electronics manufacturing |
| zhuhai | Zhuhai | ~2.5M | Bridges to Macau via the HKZM bridge |
| zhongshan | Zhongshan | ~4.4M | Western PRD, integrated labor market with Foshan/Guangzhou |
| jiangmen | Jiangmen | ~4.8M | Western PRD |
| zhaoqing | Zhaoqing | ~4.0M | Northwestern PRD anchor |

Total population missing from the corpus in the GBA region: approximately 53 million.

## Why the auto-cluster is small

The conurbations builder (`scripts/generate-distance-badges.py`, output to `public/data/conurbations.csv`) groups metros that satisfy a pairwise distance threshold. Currently:

1. Guangzhou and Qingyuan are within threshold → cluster c001.
2. Hong Kong and Macau are within threshold → cluster c005.
3. Guangzhou and Hong Kong are roughly 110-130 km apart by surface, which exceeds the cluster's pair-distance rule given the other anchors available. With Shenzhen present (rank-comparable, sitting between Guangzhou and Hong Kong), the cluster bridges naturally.

In other words, the gap is not a clustering bug. The clustering is doing what the data tells it. The data is incomplete.

## Why this matters editorially

The Tier A description in `lib/badges.ts` line 1068 lists "Pearl River Delta" as one of the gravitationally heaviest conurbations on Earth, alongside New York, London, Jing-Jin-Ji, Paris, Tokyo, San Francisco-San Jose, Los Angeles, Seoul, Shanghai, Boston-Providence, Randstad, Toronto. The actual `conurbations.csv` Tier A roster (clusters with score 100+) shows Brussels, Boston, and Toronto as the top three by cluster_score_sum; PRD does not appear at all. A reader who reads the description and then opens `/badges/conurbations` will see the discrepancy immediately.

This audit applies analogously to **Jing-Jin-Ji** (Beijing-Tianjin-Hebei) and **Yangtze River Delta** (Shanghai-Suzhou-Hangzhou-Nanjing) which are similarly under-represented in the corpus. Worth checking those next.

## Recommended sequence

1. **User action (workbook edit, blocks everything else):** add the seven missing GBA metros to `MetroAreas.xlsx` Team List sheet with their dimension data: shenzhen, foshan, dongguan, zhuhai, zhongshan, jiangmen, zhaoqing. The Wikidata QIDs file (`TeamQIDs_MLB_NBA_NHL.xlsx`) does not cover these; metro-level QIDs would need to be added separately if any team data lands. Shenzhen is the highest priority by far given its size.
2. Re-run the metro ETL and conurbations build to regenerate `public/data/conurbations.csv`.
3. Verify the resulting cluster: at minimum {guangzhou, shenzhen, hong-kong, macau, foshan, dongguan, huizhou, zhuhai, zhongshan, jiangmen, zhaoqing, qingyuan} should unify into a single Tier A cluster on cluster_score_sum, with diameter likely 130-180 km. If it does not, then an editorial override is the right next step.
4. If the auto-cluster still fragments (likely scenario: HK/Macau remain a separate small cluster because of the cross-strait distance plus political-tag handling), apply the editorial override here. The override mechanism is to add a manual row group to `conurbations.csv` post-build with a shared `cluster_id` and a name "Greater Bay Area" or similar. Document the override on the methodology page under "Declared editorial decisions".
5. Update the editorial caption to surface the cross-jurisdictional structure (PRC mainland + Hong Kong SAR + Macau SAR), since that is the structurally interesting fact about the region rather than the population count alone.
6. Re-check after each conurbations rebuild and after each Overture quarterly release.

## Why this audit cannot be applied today

The user owns `MetroAreas.xlsx`. Any attempt to inject Shenzhen/Foshan/Dongguan/Zhuhai etc. into the rankings corpus from the code side would be fabrication, since the dimension data (market cap, universities, transit, airport scores, sports teams, cultural assets, GaWC class) does not yet exist in the workbook. The honest outcome of this audit is: gap documented, fix sequenced, owner identified.

## Adjacent audits worth running

- **Yangtze River Delta**: Shanghai is in the corpus. Suzhou, Hangzhou, Nanjing, Wuxi, Ningbo, Hefei status not fully audited. Nanjing and Hefei are present per `conurbations.csv` (c017, c048). Shanghai's standalone vs. clustered position should be checked.
- **Jing-Jin-Ji**: Beijing in corpus, Tianjin + Hebei satellites status not audited.
- **Hangzhou Bay megaregion** (Hangzhou, Ningbo, Shaoxing): Ningbo is in the corpus (c051), Hangzhou status not audited.

These three deserve their own audit notes once GBA is resolved, because the Chinese megacity coverage gap appears to be systematic, not isolated to the PRD.
