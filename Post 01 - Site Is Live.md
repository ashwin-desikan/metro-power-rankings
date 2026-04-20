# The Global Metro Power Rankings Site Is Live

*Following up on the first post: the full dataset is now browsable. 4,200+ metros, 237 countries, 16 dimensions, 70,000+ individually verified parameters. Three years of hand-curation, now searchable.*

---

## A Short Note

When I published the first Metro Power Rankings piece, the full dataset lived in a 22 MB spreadsheet on my laptop. That was fine for the essay. It was not fine for the feedback I started getting, which was almost all of the same shape: *can I see the number for my city, and what is actually driving it?*

So I built a site.

**[metro-power-rankings.vercel.app](https://metro-power-rankings.vercel.app/)**

It is live today, and it is what a ranking dataset should be: browsable, hyperlinked, and honest about its inputs.

## What Is Actually In There

If you read the first post, you already know the headline. 4,200+ metros. 237 countries. 16 dimensions. 70,000+ individually verified parameters. Three years of hand-curation. No scraping. No AI-generated data dumps. Every museum, every transit system, every stock exchange was individually verified and mapped to a specific metro through a municipality-level geographic hierarchy.

With the site launch, each metro now has its own profile page with a dimension-by-dimension breakdown, peer comparisons, and a side-by-side comparison view. You can filter the rankings by continent, region, country, state, or sub-country, and search by any city, metro, or administrative unit. Everything is shareable.

## Five Things the Data Surfaces the Moment You Start Exploring

**The United States has 26 of the top 100 global metros.** China has 12. Germany has 6. No other country has more than four. That kind of concentration is structural, not political. It reflects the breadth of American institutional infrastructure across dimensions the score actually measures.

**Population is not the story.** Several metros with over 20 million residents fail to crack the global top 50. A number of European cities with fewer than 3 million residents sit comfortably inside the top 100. The index rewards depth across dimensions, not sheer size. Geneva, Basel, and Edinburgh are on the winners' side of that asymmetry. Lagos, Karachi, and Kinshasa are on the other.

**The top is tighter than the headlines suggest.** Below the two or three clear leaders, scores cluster. Whole tiers of cities trade places on modest moves in any single dimension. This is part of why intuitive rankings of who beats whom so often go wrong. One new top-ranked university or one Michelin-starred restaurant can move a metro four or five places.

**Regional leaders are rarely the cities people guess first.** Johannesburg leads Africa, with Lagos far behind despite being the continent's largest metro by population. Singapore leads ASEAN. São Paulo leads South America, not Rio. These are the kind of outcomes that only surface when the measurement is consistent across dimensions, not cherry-picked.

**Fame does not equal power.** Several globally recognizable names routinely cited as hubs of tech, finance, or culture sit well outside the top 100 when measured across all dimensions. The rankings separate brand from substance. If the headlines call a city a "hub," the data lets you check.

## What You Can Do on the Site

- **See the Top 25 and Top 100** the way the first article presented them, but now every metro is a clickable link into its own profile.
- **Open a profile** and see the composite score broken into the components that produced it: universities, market cap, sports leagues, cultural assets, transit, skyscrapers, luxury hospitality, and the rest of the 16 dimensions.
- **Browse by region**: continental splits, European sub-regions, US regional views. So the conversation is not only New York versus London.
- **Compare two metros side by side** on every dimension. This is the view I use most.
- **Share anything.** Every profile, every filtered view, every comparison has its own URL.

## Who Might Find This Useful

Sports leagues and franchises evaluating expansion or relocation markets. City strategists benchmarking against true global peers, not just the default Mercer or Kearney top 30. Journalists and researchers who want a broader baseline than any existing index provides. And anyone else who likes arguing about cities and random rankings.

## What It Is Not

Not a product with accounts, saved lists, or social features. It is a public reference for a private dataset. Think reference atlas, not app. If the typography is spare and the UI is unornamented, that is by design: the point is the data.

## Why a Site, Not a PDF

A ranking that cannot be inspected at the row level is not a ranking. It is an opinion with numbers attached. Putting this online means anyone can check whether São Paulo's 62.5 is actually driven by its cultural assets or its market cap, whether Lagos really scores below Edinburgh, whether Geneva's per-capita ratio is a rounding artifact or a real structural signal. The answers are all on the profile pages.

This also forces methodological discipline on me. When the components are visible, I cannot quietly revise a score without explaining why. That accountability is the point.

## v0 Honesty

This is still a v0 prototype. A lot of the qualitative scoring is subjective. Meaning, chosen by me. I have tried to be consistent and transparent about the weights, but consistency is not the same as correctness. A methodology page is coming soon to consolidate the logic in one place, with the weights, the "why these 16 dimensions" question, and the caveats laid out together.

## What Is Coming Next

More long-form pieces using the dataset. The next essay is on global neighborhoods: which cities still have dense, historic, walkable, genuinely elite residential quarters in the Marylebone mold, and which do not. That one drops next.

## One Request

If you spend any time on the site, tell me three things: which rankings surprised you, which ones you would push back on, and which dimensions are missing. The interesting corrections are structural, not cosmetic. A category I did not weight. A city I undercounted. A tier of museum or transit system that belongs in the scoring and is not there.

Thanks for reading. The site is the infrastructure. The next essays are the reason it exists.

---

*[metro-power-rankings.vercel.app](https://metro-power-rankings.vercel.app/) — data current as of April 2026. 4,200+ metros, 237 countries, 16-dimension composite score. CC-BY on the composite score.*
