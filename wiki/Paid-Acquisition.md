# Paid Acquisition

Campaign configurations and live paid performance for Apple Search Ads and Google Universal App Campaigns.

> Auto-updated by `scripts/wiki_sync.py` from `marketing/data/*.json`.

## Live Paid Snapshot

<!-- LIVE_PAID_START -->
| Metric | Value |
|--------|-------|
| Snapshot (UTC) | `2026-02-24T17:38:32+00:00` |
| Paid Attributed Users (30d) | 0 |
| Paid Events (30d) | 0 |
| Active Campaign Count (tracked) | 1 |
| Daily Budget Configured | $30.00 |
| Blended CPI Target | $3.00 |
| Open -> Completed Rate (30d) | 24.2% |
| WQTU (7d) | 0 |
| WQTU Checkpoint Target (2026-03-31) | 8 |
| WQTU Quarter Target (2026-06-30) | 25 |
| Downloads (30d) | 0 |
| Apple Ads Campaigns (API) | 1 |
| Apple Ads Active Campaigns (API) | 1 |
| Apple Ads Impressions (30d) | 0 |
| Apple Ads Clicks/Taps (30d) | 0 |
| Apple Ads Spend (30d) | $0.00 |
| Apple Ads Installs (30d) | 0 |
| Apple Ads Live Finding | API reports 1 campaign(s), 1 active; 30d taps 0, spend $0.00, installs 0. |
| Guardrail Violated | YES |
<!-- LIVE_PAID_END -->

## Paid Attribution Sources (30d)

<!-- LIVE_PAID_SOURCES_START -->
| Source | Events (30d) | Users (30d) |
|--------|:------------:|:-----------:|
| (none) | 0 | 0 |
<!-- LIVE_PAID_SOURCES_END -->

## Paid Charts

<!-- LIVE_PAID_CHARTS_START -->
```mermaid
pie title Daily Ad Budget Allocation ($)
    "Apple Search Ads" : 10.0
    "Google Uac" : 10.0
    "Reddit Ads" : 10.0
```

```mermaid
xychart-beta
    title "North Star Progress (WQTU)"
    x-axis ["WQTU 7d" , "Checkpoint Target" , "Quarter Target"]
    y-axis "Users" 0 --> 27
    bar [0 , 8 , 25]
```

```mermaid
xychart-beta
    title "Apple Ads Taps (30d snapshot trend)"
    x-axis ["02-24T17:36" , "02-24T17:38"]
    y-axis "Taps" 0 --> 1
    line [0 , 0]
```

```mermaid
xychart-beta
    title "Apple Ads Spend USD (30d snapshot trend)"
    x-axis ["02-24T17:36" , "02-24T17:38"]
    y-axis "USD" 0 --> 1
    line [0.0 , 0.0]
```
<!-- LIVE_PAID_CHARTS_END -->

## Budget Allocation

<!-- LIVE_PAID_BUDGET_START -->
| Platform | Daily Budget | Share |
|----------|:-----------:|:-----:|
| apple_search_ads | $10.00 | 33% |
| google_uac | $10.00 | 33% |
| reddit_ads | $10.00 | 33% |
| **Total** | **$30.00/day** | 100% |

**Target CPA:** $3.00 | **Max CPT (Apple):** $1.75
<!-- LIVE_PAID_BUDGET_END -->

## Apple Search Ads — 3 Ad Groups

### Exact Match (High-Intent)
Top 15 keywords with BID ≥ 60. Examples:
- `reaction timer app`, `random interval timer`, `tactical timer`, `hiit random timer`

### Search Match (Discovery)
Top 20 keywords with BID 40–60. Broad match for keyword discovery.

### Competitor/Brand
Top 10 commercial + tool intent keywords targeting competitor searches.

**Negative keywords:** `egg timer`, `kitchen timer`, `countdown timer free`, `clock`, `stopwatch`

## Google UAC

**Headlines:**
- Random Tactical Timer
- Unpredictable HIIT & Reaction Drills
- Train with Random Intervals

**Descriptions:**
- Set a random countdown. Train reaction time, run boxing drills, or play party games.
- The timer app that keeps you on edge. Random intervals for HIIT, martial arts, and more.

**Targeting:** US, GB, CA, AU, DE | **Optimization goal:** Installs

## Campaign Status

<!-- LIVE_CAMPAIGN_STATUS_START -->
| Platform | Config Status | Live Status | Daily Budget |
|----------|---------------|-------------|-------------:|
| apple_search_ads | active | RUNNING | $10.00 |
| google_uac | ready_to_launch | — | $10.00 |
| reddit_ads | ready_to_launch | — | $10.00 |
<!-- LIVE_CAMPAIGN_STATUS_END -->

## Source Files

- `scripts/paid_acquisition_seed.py` — Campaign config generation
- `marketing/data/paid_campaigns.json` — Campaign data
- `.github/workflows/weekly-paid-acquisition.yml` — Thursday 12:00 UTC
