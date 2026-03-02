#!/usr/bin/env python3
"""Inject live data from marketing/data/ JSON files into wiki templates.

Reads the static wiki templates from wiki/, injects live metrics from
marketing/data/ JSON files into the Daily Metrics Dashboard and
Paid Acquisition pages. Git
operations (clone wiki repo, commit, push) are handled by the GitHub
Actions workflow YAML, not this script.

Designed to run daily via GitHub Actions.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import re
from pathlib import Path
from typing import Any, Dict, Optional


def load_json(path: Path) -> Optional[Dict[str, Any]]:
    """Load a JSON file, returning None if missing or invalid."""
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def load_jsonl(path: Path) -> list:
    """Load a JSONL file, returning empty list if missing."""
    if not path.exists():
        return []
    entries = []
    for line in path.read_text(encoding="utf-8").strip().splitlines():
        line = line.strip()
        if line:
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return entries


def _fmt(val: Any, suffix: str = "") -> str:
    """Format a value for display, returning '—' for None/0/empty."""
    if val is None or val == 0 or val == "":
        return "—"
    if isinstance(val, float):
        return f"{val:.1%}"
    return f"{val}{suffix}"


def _fmt_num(val: Any) -> str:
    if val is None or val == 0:
        return "—"
    if isinstance(val, int):
        return f"{val:,}"
    return str(val)


def _fmt_num_allow_zero(val: Any) -> str:
    if val is None:
        return "—"
    if isinstance(val, int):
        return f"{val:,}"
    return str(val)


def _extract_budget_allocation(pc: Optional[Dict[str, Any]]) -> Dict[str, float]:
    if not pc:
        return {}
    raw_alloc = pc.get("budget_allocation", {})
    alloc: Dict[str, float] = {}
    for key, value in raw_alloc.items():
        if isinstance(value, dict):
            amount = value.get("daily_budget_usd", 0)
        else:
            amount = value
        try:
            alloc[key] = float(amount or 0)
        except (TypeError, ValueError):
            alloc[key] = 0.0
    return alloc


def _mermaid_budget_pie(pc: Optional[Dict[str, Any]]) -> str:
    """Generate a Mermaid pie chart for budget allocation."""
    alloc = _extract_budget_allocation(pc)
    if not alloc or all(v == 0 for v in alloc.values()):
        return ""
    slices = "\n".join(
        f'    "{k.replace("_", " ").title()}" : {v}'
        for k, v in alloc.items()
        if v > 0
    )
    return f'```mermaid\npie title Daily Ad Budget Allocation ($)\n{slices}\n```'


def _mermaid_keywords_bar(pc: Optional[Dict[str, Any]]) -> str:
    """Generate a Mermaid bar chart for keywords per ad group."""
    if not pc:
        return ""
    campaigns = pc.get("campaigns", [])
    groups: list[tuple[str, int]] = []
    for c in campaigns:
        ad_groups = c.get("ad_groups", [])
        if isinstance(ad_groups, list):
            for ag in ad_groups:
                name = ag.get("name", "Unknown")
                keywords = ag.get("keywords", [])
                count = len(keywords) if isinstance(keywords, list) else 0
                if count > 0:
                    groups.append((name, count))
        # Google UAC keyword themes
        themes = c.get("targeting", {}).get("keyword_themes", [])
        if isinstance(themes, list) and themes:
            groups.append(("UAC Themes", len(themes)))
        elif isinstance(themes, int) and themes > 0:
            groups.append(("UAC Themes", themes))
    if not groups:
        return ""
    cats = " , ".join(f'"{g[0]}"' for g in groups)
    vals = " , ".join(str(g[1]) for g in groups)
    return (
        f"```mermaid\n"
        f"xychart-beta\n"
        f'    title "Keywords by Ad Group"\n'
        f"    x-axis [{cats}]\n"
        f'    y-axis "Count" 0 --> {max(g[1] for g in groups) + 5}\n'
        f'    bar [{vals}]\n'
        f"```"
    )


def _mermaid_referral_bar(ref: Optional[Dict[str, Any]]) -> str:
    """Generate a Mermaid bar chart for referral channels."""
    if not ref:
        return ""
    channels = {
        "Reddit": len(ref.get("reddit_posts", [])),
        "Product Hunt": 1 if ref.get("product_hunt") else 0,
        "Blog Outreach": len(ref.get("blog_outreach", [])),
    }
    if all(v == 0 for v in channels.values()):
        return ""
    cats = " , ".join(f'"{k}"' for k in channels)
    vals = " , ".join(str(v) for v in channels.values())
    return (
        f"```mermaid\n"
        f"xychart-beta\n"
        f'    title "Referral Content Pieces"\n'
        f"    x-axis [{cats}]\n"
        f'    y-axis "Items" 0 --> {max(channels.values()) + 2}\n'
        f'    bar [{vals}]\n'
        f"```"
    )


def _mermaid_downloads_trend(dl: Optional[Dict[str, Any]]) -> str:
    """Generate a Mermaid line chart for download snapshots over time."""
    if not dl:
        return ""
    snapshots = dl.get("snapshots", [])
    if len(snapshots) < 2:
        return ""  # Need at least 2 points for a trend line
    # Take last 14 snapshots
    recent = snapshots[-14:]
    dates = []
    ios_vals = []
    android_vals = []
    for s in recent:
        ts = s.get("timestamp", "")[:10]
        dates.append(f'"{ts}"')
        ios_vals.append(str(s.get("ios_downloads_30d", 0)))
        android_vals.append(str(s.get("android_downloads_30d", 0)))
    return (
        f"```mermaid\n"
        f"xychart-beta\n"
        f'    title "Downloads (30d rolling)"\n'
        f"    x-axis [{' , '.join(dates)}]\n"
        f'    y-axis "Downloads"\n'
        f'    line [{" , ".join(ios_vals)}]\n'
        f'    line [{" , ".join(android_vals)}]\n'
        f"```"
    )

def _mermaid_wqtu_trend(ns: Optional[Dict[str, Any]]) -> str:
    """Generate a Mermaid line chart for WQTU snapshots over time."""
    if not ns:
        return ""
    snapshots = ns.get("snapshots", [])
    if len(snapshots) < 2:
        return ""
    recent = snapshots[-14:]
    dates = []
    wqtu_vals = []
    for s in recent:
        ts = str(s.get("timestamp", ""))[:10]
        dates.append(f'"{ts}"')
        wqtu_vals.append(str(s.get("wqtu_7d", 0)))
    return (
        f"```mermaid\n"
        f"xychart-beta\n"
        f'    title "WQTU (7d)"\n'
        f"    x-axis [{' , '.join(dates)}]\n"
        f'    y-axis "Users"\n'
        f'    line [{" , ".join(wqtu_vals)}]\n'
        f"```"
    )


def _mermaid_paid_source_bar(ns: Optional[Dict[str, Any]]) -> str:
    """Generate a Mermaid bar chart for paid-attributed users by source."""
    if not ns:
        return ""
    paid = ns.get("paid", {})
    rows = paid.get("paid_events_by_source_30d", [])
    if not isinstance(rows, list) or not rows:
        return ""
    labels: list[str] = []
    users: list[int] = []
    for row in rows:
        source = str(row.get("source", "(unknown)"))
        count = int(row.get("users", 0) or 0)
        labels.append(f'"{source}"')
        users.append(count)
    ymax = max(users) + 1 if users else 1
    return (
        "```mermaid\n"
        "xychart-beta\n"
        '    title "Paid Attributed Users by Source (30d)"\n'
        f"    x-axis [{' , '.join(labels)}]\n"
        f'    y-axis "Users" 0 --> {ymax}\n'
        f"    bar [{' , '.join(str(v) for v in users)}]\n"
        "```"
    )


def _mermaid_north_star_vs_targets(ns: Optional[Dict[str, Any]]) -> str:
    """Generate a bar chart for current WQTU vs checkpoint/quarter targets."""
    if not ns:
        return ""
    nsm = ns.get("north_star", {})
    targets = nsm.get("targets", {})
    wqtu = int(nsm.get("wqtu_7d", 0) or 0)
    checkpoint = int(targets.get("checkpoint_2026_03_31", 0) or 0)
    quarter = int(targets.get("quarter_2026_06_30", 0) or 0)
    ymax = max(wqtu, checkpoint, quarter, 1) + 2
    return (
        "```mermaid\n"
        "xychart-beta\n"
        '    title "North Star Progress (WQTU)"\n'
        '    x-axis ["WQTU 7d" , "Checkpoint Target" , "Quarter Target"]\n'
        f'    y-axis "Users" 0 --> {ymax}\n'
        f"    bar [{wqtu} , {checkpoint} , {quarter}]\n"
        "```"
    )


def _mermaid_apple_ads_trend(apple: Optional[Dict[str, Any]], field: str, title: str, y_label: str) -> str:
    if not apple:
        return ""
    snapshots = apple.get("snapshots", [])
    if not isinstance(snapshots, list) or len(snapshots) < 2:
        return ""
    recent = snapshots[-14:]
    labels: list[str] = []
    values: list[str] = []
    for row in recent:
        ts = str(row.get("timestamp", ""))
        labels.append(f'"{ts[5:16]}"')
        values.append(str(row.get(field, 0)))
    ymax = max([float(v) for v in values] + [1.0]) * 1.2
    return (
        "```mermaid\n"
        "xychart-beta\n"
        f'    title "{title}"\n'
        f"    x-axis [{' , '.join(labels)}]\n"
        f'    y-axis "{y_label}" 0 --> {int(ymax) if ymax >= 1 else 1}\n'
        f"    line [{' , '.join(values)}]\n"
        "```"
    )


def _dynamic_budget_block(pc: Optional[Dict[str, Any]]) -> str:
    if not pc:
        return "_No paid campaign configuration available._"
    alloc = _extract_budget_allocation(pc)
    total = sum(v for v in alloc.values() if isinstance(v, (int, float)))
    rows = ["| Platform | Daily Budget | Share |", "|----------|:-----------:|:-----:|"]
    for platform, amount in alloc.items():
        share = (amount / total) if total > 0 else 0
        rows.append(f"| {platform} | ${amount:.2f} | {share:.0%} |")
    rows.append(f"| **Total** | **${total:.2f}/day** | 100% |")

    budget_cfg = pc.get("budget_config", {})
    target_cpa = _to_float(budget_cfg.get("target_cpa_usd"))
    max_cpt = _to_float(budget_cfg.get("max_cpt_usd"))
    return "\n".join(rows) + f"\n\n**Target CPA:** ${target_cpa:.2f} | **Max CPT (Apple):** ${max_cpt:.2f}"


def _to_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _dynamic_campaign_status_block(pc: Optional[Dict[str, Any]], apple: Optional[Dict[str, Any]]) -> str:
    campaigns = pc.get("campaigns", []) if pc else []
    rows = [
        "| Platform | Config Status | Live Status | Daily Budget |",
        "|----------|---------------|-------------|-------------:|",
    ]
    apple_live = {}
    if apple:
        apple_campaigns = apple.get("campaigns", [])
        if isinstance(apple_campaigns, list) and apple_campaigns:
            apple_live = apple_campaigns[0]
    for campaign in campaigns:
        platform = str(campaign.get("platform", "unknown"))
        status = str(campaign.get("status", "unknown"))
        budget = _to_float(campaign.get("daily_budget_usd"))
        live_status = "—"
        if platform == "apple_search_ads":
            live_status = str(apple_live.get("serving_status") or apple_live.get("status") or "—")
        rows.append(f"| {platform} | {status} | {live_status} | ${budget:.2f} |")
    if len(rows) == 2:
        rows.append("| (none) | — | — | $0.00 |")
    return "\n".join(rows)


def inject_dashboard_data(dashboard: str, data_dir: Path) -> str:
    """Replace placeholder sections in the dashboard with live data."""
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    dashboard = dashboard.replace("<!-- TIMESTAMP -->", now)
    # Keep the footer timestamp current even when legacy templates contain
    # a literal date string instead of the TIMESTAMP marker.
    dashboard = re.sub(
        r"_Dashboard generated at: `[^`]+`\. Data refreshed daily by \[`wiki-sync\.yml`\]\([^)]*\)\._",
        f"_Dashboard generated at: `{now}`. Data refreshed daily by [`wiki-sync.yml`](https://github.com/IgorGanapolsky/openclaw-console/actions/workflows/wiki-sync.yml)._",
        dashboard,
    )

    # --- Downloads & Active Users ---
    dl = load_json(data_dir / "store_downloads.json")
    if dl:
        ios = dl.get("ios", {})
        android = dl.get("android", {})
        combined = dl.get("combined", {})
        users = dl.get("active_users", {})
        ios_30 = _fmt_num(ios.get("downloads_30d"))
        and_30 = _fmt_num(android.get("downloads_30d"))
        comb_30 = _fmt_num(combined.get("downloads_30d"))
        and_active = _fmt_num(android.get("active_installs"))
        downloads_block = (
            "| Metric | iOS | Android | Combined |\n"
            "|--------|:---:|:-------:|:--------:|\n"
            f"| Downloads (30d) | {ios_30} | {and_30} | {comb_30} |\n"
            f"| Active Installs | — | {and_active} | — |\n\n"
            "| Active Users | Count |\n"
            "|-------------|:-----:|\n"
            f"| DAU | {_fmt_num(users.get('dau'))} |\n"
            f"| WAU | {_fmt_num(users.get('wau'))} |\n"
            f"| MAU | {_fmt_num(users.get('mau'))} |"
        )
        dashboard = re.sub(
            r"<!-- DOWNLOADS_START -->.*?<!-- DOWNLOADS_END -->",
            f"<!-- DOWNLOADS_START -->\n{downloads_block}\n<!-- DOWNLOADS_END -->",
            dashboard,
            flags=re.DOTALL,
        )

    # --- North Star ---
    ns = load_json(data_dir / "north_star.json")
    if ns:
        nsm = ns.get("north_star", {})
        paid = ns.get("paid", {})
        targets = nsm.get("targets", {})
        north_star_block = (
            "| Metric | Value |\n"
            "|--------|-------|\n"
            f"| WQTU (7d) | {_fmt_num_allow_zero(nsm.get('wqtu_7d'))} |\n"
            f"| Timer Completed (7d) | {_fmt_num_allow_zero(nsm.get('timer_completed_7d'))} |\n"
            f"| Completed Users (7d) | {_fmt_num_allow_zero(nsm.get('completed_users_7d'))} |\n"
            f"| Sessions/Completed User (7d) | {nsm.get('sessions_per_completed_user_7d', 0.0)} |\n"
            f"| Checkpoint Target (2026-03-31) | {_fmt_num_allow_zero(targets.get('checkpoint_2026_03_31'))} |\n"
            f"| Quarter Target (2026-06-30) | {_fmt_num_allow_zero(targets.get('quarter_2026_06_30'))} |\n"
            f"| Paid Attributed Users (30d) | {_fmt_num_allow_zero(paid.get('paid_distinct_users_30d'))} |\n"
            f"| Active Campaign Count | {_fmt_num_allow_zero(paid.get('active_campaign_count'))} |\n"
            f"| Guardrail Violated | {'YES' if paid.get('guardrail_violated') else 'NO'} |"
        )
        dashboard = re.sub(
            r"<!-- NORTH_STAR_START -->.*?<!-- NORTH_STAR_END -->",
            f"<!-- NORTH_STAR_START -->\n{north_star_block}\n<!-- NORTH_STAR_END -->",
            dashboard,
            flags=re.DOTALL,
        )

    # --- Review Velocity ---
    rv = load_json(data_dir / "review_velocity.json")
    if rv:
        snapshots = rv.get("snapshots", [])
        latest = snapshots[-1] if snapshots else {}
        velocity = rv.get("latest_velocity", {})
        config = rv.get("review_prompt_config", {})

        reviews_block = (
            f"| Platform | Total Reviews | Avg Rating | 7-day Velocity |\n"
            f"|----------|:------------:|:----------:|:--------------:|\n"
            f"| iOS | {_fmt_num(latest.get('ios_total'))} | {_fmt_num(latest.get('ios_rating'))} "
            f"| {_fmt_num(velocity.get('ios_velocity'))} reviews/day |\n"
            f"| Android | {_fmt_num(latest.get('android_total'))} | {_fmt_num(latest.get('android_rating'))} "
            f"| {_fmt_num(velocity.get('android_velocity'))} reviews/day |\n\n"
            f"**Prompt Config:** Show after {config.get('completions_before_prompt', '—')} completions, "
            f"{config.get('min_days_between_prompts', '—')} days between prompts"
        )
        dashboard = re.sub(
            r"<!-- REVIEWS_START -->.*?<!-- REVIEWS_END -->",
            f"<!-- REVIEWS_START -->\n{reviews_block}\n<!-- REVIEWS_END -->",
            dashboard,
            flags=re.DOTALL,
        )

    # --- CRO Experiments ---
    cro = load_json(data_dir / "cro_experiments.json")
    if cro:
        # Support both {"experiments": [...]} and bare list formats
        experiments = cro.get("experiments", cro) if isinstance(cro, dict) else cro
        if not isinstance(experiments, list):
            experiments = []
        rows = []
        for exp in experiments:
            rows.append(
                f"| {exp.get('type', '—')} | {exp.get('platform', '—')} "
                f"| {exp.get('status', '—')} | {exp.get('duration_days', '—')} days |"
            )
        cro_block = (
            "| Experiment | Platform | Status | Duration |\n"
            "|-----------|----------|--------|----------|\n"
            + "\n".join(rows)
        )
        dashboard = re.sub(
            r"<!-- CRO_START -->.*?<!-- CRO_END -->",
            f"<!-- CRO_START -->\n{cro_block}\n<!-- CRO_END -->",
            dashboard,
            flags=re.DOTALL,
        )

    # --- Paid Campaigns ---
    pc = load_json(data_dir / "paid_campaigns.json")
    if pc:
        campaigns = pc.get("campaigns", [])
        alloc = pc.get("budget_allocation", {})
        campaign_rows = []
        total_kw = 0
        for c in campaigns:
            platform = c.get("platform", "—")
            alloc_val = alloc.get(platform, 0)
            budget = alloc_val.get("daily_budget_usd", 0) if isinstance(alloc_val, dict) else (alloc_val if isinstance(alloc_val, (int, float)) else 0)
            status = c.get("status", "draft")
            kw_count = 0
            ad_groups = c.get("ad_groups", [])
            if isinstance(ad_groups, list):
                for ag in ad_groups:
                    keywords = ag.get("keywords", [])
                    if isinstance(keywords, list):
                        kw_count += len(keywords)

            if not kw_count:
                themes = c.get("targeting", {}).get("keyword_themes", [])
                if isinstance(themes, list):
                    kw_count = len(themes)
                elif isinstance(themes, int):
                    kw_count = themes
            total_kw += kw_count
            campaign_rows.append(f"| {platform} | ${budget:.2f} | {status} | {kw_count} |")
        total_budget = sum(
            v.get("daily_budget_usd", 0) if isinstance(v, dict) else (v if isinstance(v, (int, float)) else 0)
            for v in alloc.values()
        )
        campaign_rows.append(f"| **Total** | **${total_budget:.2f}** | — | {total_kw} |")
        campaigns_block = (
            "| Platform | Daily Budget | Status | Keywords |\n"
            "|----------|:-----------:|--------|:--------:|\n"
            + "\n".join(campaign_rows)
        )
        dashboard = re.sub(
            r"<!-- CAMPAIGNS_START -->.*?<!-- CAMPAIGNS_END -->",
            f"<!-- CAMPAIGNS_START -->\n{campaigns_block}\n<!-- CAMPAIGNS_END -->",
            dashboard,
            flags=re.DOTALL,
        )

    # --- Content Pipeline ---
    posts = load_jsonl(data_dir / "posts.jsonl")
    if posts:
        latest_post = posts[-1]
        content_block = (
            f"| Metric | Value |\n"
            f"|--------|-------|\n"
            f"| Total Posts Published | {len(posts)} |\n"
            f"| Latest Post | {latest_post.get('title', '—')} |\n"
            f"| Published At | {latest_post.get('timestamp', '—')} |"
        )
        dashboard = re.sub(
            r"<!-- CONTENT_START -->.*?<!-- CONTENT_END -->",
            f"<!-- CONTENT_START -->\n{content_block}\n<!-- CONTENT_END -->",
            dashboard,
            flags=re.DOTALL,
        )

    # --- Referral Campaigns ---
    ref = load_json(data_dir / "referral_campaigns.json")
    if ref:
        reddit_count = len(ref.get("reddit_posts", []))
        ph_count = 1 if ref.get("product_hunt") else 0
        blog_count = len(ref.get("blog_outreach", []))
        reddit_status = ref["reddit_posts"][0].get("status", "draft") if ref.get("reddit_posts") else "—"
        ph_status = ref.get("product_hunt", {}).get("status", "—")
        blog_status = ref["blog_outreach"][0].get("status", "draft") if ref.get("blog_outreach") else "—"
        referral_block = (
            "| Channel | Items | Status |\n"
            "|---------|:-----:|--------|\n"
            f"| Reddit Posts | {reddit_count} | {reddit_status} |\n"
            f"| Product Hunt | {ph_count} | {ph_status} |\n"
            f"| Blog Outreach | {blog_count} | {blog_status} |"
        )
        dashboard = re.sub(
            r"<!-- REFERRAL_START -->.*?<!-- REFERRAL_END -->",
            f"<!-- REFERRAL_START -->\n{referral_block}\n<!-- REFERRAL_END -->",
            dashboard,
            flags=re.DOTALL,
        )

    # --- Attribution (from markdown report if available) ---
    report_path = data_dir / "attribution-report.md"
    if report_path.exists():
        report = report_path.read_text(encoding="utf-8")
        dashboard = re.sub(
            r"<!-- ATTRIBUTION_START -->.*?<!-- ATTRIBUTION_END -->",
            f"<!-- ATTRIBUTION_START -->\n{report}\n<!-- ATTRIBUTION_END -->",
            dashboard,
            flags=re.DOTALL,
        )

    # --- Funnel (from content_feedback.json) ---
    cf = load_json(data_dir / "content_feedback.json")
    if cf:
        funnel = cf.get("onboarding_funnel", {})
        fo = funnel.get("first_open", 0)
        fc = funnel.get("first_timer_configured", 0)
        ft = funnel.get("first_timer_completed", 0)
        oc_rate = funnel.get("open_to_configured_rate", 0)
        ot_rate = funnel.get("open_to_completed_rate", 0)
        funnel_block = (
            "| Step | Users | Conversion |\n"
            "|------|:-----:|:----------:|\n"
            f"| First Open | {_fmt_num(fo)} | — |\n"
            f"| First Timer Configured | {_fmt_num(fc)} | {_fmt(oc_rate)} of opens |\n"
            f"| First Timer Completed | {_fmt_num(ft)} | {_fmt(ot_rate)} of opens |"
        )
        dashboard = re.sub(
            r"<!-- FUNNEL_START -->.*?<!-- FUNNEL_END -->",
            f"<!-- FUNNEL_START -->\n{funnel_block}\n<!-- FUNNEL_END -->",
            dashboard,
            flags=re.DOTALL,
        )

    # --- ASO Keywords ---
    ios_kw_path = Path("ios/OpenClawConsole/fastlane/metadata/en-US/keywords.txt")
    if ios_kw_path.exists():
        keywords = ios_kw_path.read_text(encoding="utf-8").strip()
    else:
        keywords = "—"

    rotation_hist = load_json(Path("marketing/keywords/rotation_history.json"))
    last_rotation = "—"
    performing = "—"
    replaced = "—"
    if rotation_hist and isinstance(rotation_hist, list) and rotation_hist:
        last = rotation_hist[-1]
        last_rotation = last.get("timestamp", "—")
        performing = str(last.get("performing_count", "—"))
        replaced = str(last.get("replaced_count", "—"))

    aso_block = (
        f"**iOS (current):** `{keywords}`\n\n"
        f"**Last rotation:** {last_rotation}\n"
        f"**Performing:** {performing} | **Replaced:** {replaced}"
    )
    dashboard = re.sub(
        r"<!-- ASO_START -->.*?<!-- ASO_END -->",
        f"<!-- ASO_START -->\n{aso_block}\n<!-- ASO_END -->",
        dashboard,
        flags=re.DOTALL,
    )

    # --- Charts ---
    charts: list[str] = []
    dl_data = load_json(data_dir / "store_downloads.json")
    dl_trend = _mermaid_downloads_trend(dl_data)
    if dl_trend:
        charts.append(dl_trend)

    ns_data = load_json(data_dir / "north_star.json")
    wqtu_trend = _mermaid_wqtu_trend(ns_data)
    if wqtu_trend:
        charts.append(wqtu_trend)

    pc_data = load_json(data_dir / "paid_campaigns.json")
    budget_pie = _mermaid_budget_pie(pc_data)
    if budget_pie:
        charts.append(budget_pie)

    kw_bar = _mermaid_keywords_bar(pc_data)
    if kw_bar:
        charts.append(kw_bar)

    ref_data = load_json(data_dir / "referral_campaigns.json")
    ref_bar = _mermaid_referral_bar(ref_data)
    if ref_bar:
        charts.append(ref_bar)

    charts_block = "\n\n".join(charts) if charts else "_No chart data available yet._"
    dashboard = re.sub(
        r"<!-- CHARTS_START -->.*?<!-- CHARTS_END -->",
        f"<!-- CHARTS_START -->\n{charts_block}\n<!-- CHARTS_END -->",
        dashboard,
        flags=re.DOTALL,
    )

    return dashboard


def inject_paid_acquisition_data(page: str, data_dir: Path) -> str:
    """Inject live paid-acquisition metrics + charts into wiki page markers."""
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    ns = load_json(data_dir / "north_star.json") or {}
    pc = load_json(data_dir / "paid_campaigns.json") or {}
    dl = load_json(data_dir / "store_downloads.json") or {}
    cf = load_json(data_dir / "content_feedback.json") or {}
    live = load_json(data_dir / "live_growth_snapshot.json") or {}
    apple = load_json(data_dir / "apple_ads_live_metrics.json") or {}

    nsm = ns.get("north_star", {})
    paid = ns.get("paid", {})
    funnel = cf.get("onboarding_funnel", {})
    targets = nsm.get("targets", {})
    budget_alloc = _extract_budget_allocation(pc)
    total_budget = sum(v for v in budget_alloc.values() if isinstance(v, (int, float)))

    apple_metrics = apple.get("metrics_30d", {}) if isinstance(apple, dict) else {}
    if apple.get("status") == "ok":
        apple_finding = str(
            apple.get("finding")
            or f"API reports {apple.get('campaign_count', 0)} campaign(s) for adamId {apple.get('adam_id', '—')}."
        )
    else:
        apple_finding = (
            str(apple.get("finding", "")).strip()
            or live.get("apple_ads_live_check", {}).get("finding")
            or live.get("paid_ads", {}).get("live_status_reason")
            or "No live Apple Ads check available"
        )

    downloads_30d = dl.get("combined", {}).get("downloads_30d")
    kpi_block = (
        "| Metric | Value |\n"
        "|--------|-------|\n"
        f"| Snapshot (UTC) | `{now}` |\n"
        f"| Paid Attributed Users (30d) | {_fmt_num_allow_zero(paid.get('paid_distinct_users_30d'))} |\n"
        f"| Paid Events (30d) | {_fmt_num_allow_zero(sum(int(r.get('events', 0) or 0) for r in paid.get('paid_events_by_source_30d', [])))} |\n"
        f"| Active Campaign Count (tracked) | {_fmt_num_allow_zero(paid.get('active_campaign_count'))} |\n"
        f"| Daily Budget Configured | ${total_budget:.2f} |\n"
        f"| Blended CPI Target | $3.00 |\n"
        f"| Open -> Completed Rate (30d) | {_fmt(funnel.get('open_to_completed_rate', 0))} |\n"
        f"| WQTU (7d) | {_fmt_num_allow_zero(nsm.get('wqtu_7d'))} |\n"
        f"| WQTU Checkpoint Target (2026-03-31) | {_fmt_num_allow_zero(targets.get('checkpoint_2026_03_31'))} |\n"
        f"| WQTU Quarter Target (2026-06-30) | {_fmt_num_allow_zero(targets.get('quarter_2026_06_30'))} |\n"
        f"| Downloads (30d) | {_fmt_num_allow_zero(downloads_30d)} |\n"
        f"| Apple Ads Campaigns (API) | {_fmt_num_allow_zero(apple.get('campaign_count', 0))} |\n"
        f"| Apple Ads Active Campaigns (API) | {_fmt_num_allow_zero(apple.get('active_campaign_count', 0))} |\n"
        f"| Apple Ads Impressions (30d) | {_fmt_num_allow_zero(apple_metrics.get('impressions', 0))} |\n"
        f"| Apple Ads Clicks/Taps (30d) | {_fmt_num_allow_zero(apple_metrics.get('taps', 0))} |\n"
        f"| Apple Ads Spend (30d) | ${_to_float(apple_metrics.get('spend_usd')):.2f} |\n"
        f"| Apple Ads Installs (30d) | {_fmt_num_allow_zero(apple_metrics.get('installs', 0))} |\n"
        f"| Apple Ads Live Finding | {apple_finding} |\n"
        f"| Guardrail Violated | {'YES' if paid.get('guardrail_violated') else 'NO'} |"
    )

    paid_rows = paid.get("paid_events_by_source_30d", [])
    if isinstance(paid_rows, list) and paid_rows:
        source_rows = [
            f"| {row.get('source', '(unknown)')} | {int(row.get('events', 0) or 0)} | {int(row.get('users', 0) or 0)} |"
            for row in paid_rows
        ]
        source_block = (
            "| Source | Events (30d) | Users (30d) |\n"
            "|--------|:------------:|:-----------:|\n"
            + "\n".join(source_rows)
        )
    else:
        source_block = (
            "| Source | Events (30d) | Users (30d) |\n"
            "|--------|:------------:|:-----------:|\n"
            "| (none) | 0 | 0 |"
        )

    charts: list[str] = []
    budget_pie = _mermaid_budget_pie(pc)
    if budget_pie:
        charts.append(budget_pie)
    source_bar = _mermaid_paid_source_bar(ns)
    if source_bar:
        charts.append(source_bar)
    north_star_bar = _mermaid_north_star_vs_targets(ns)
    if north_star_bar:
        charts.append(north_star_bar)
    apple_taps_trend = _mermaid_apple_ads_trend(
        apple,
        field="taps",
        title="Apple Ads Taps (30d snapshot trend)",
        y_label="Taps",
    )
    if apple_taps_trend:
        charts.append(apple_taps_trend)
    apple_spend_trend = _mermaid_apple_ads_trend(
        apple,
        field="spend_usd",
        title="Apple Ads Spend USD (30d snapshot trend)",
        y_label="USD",
    )
    if apple_spend_trend:
        charts.append(apple_spend_trend)
    charts_block = "\n\n".join(charts) if charts else "_No paid chart data available yet._"

    budget_block = _dynamic_budget_block(pc)
    campaign_status_block = _dynamic_campaign_status_block(pc, apple)

    page = re.sub(
        r"<!-- LIVE_PAID_START -->.*?<!-- LIVE_PAID_END -->",
        f"<!-- LIVE_PAID_START -->\n{kpi_block}\n<!-- LIVE_PAID_END -->",
        page,
        flags=re.DOTALL,
    )
    page = re.sub(
        r"<!-- LIVE_PAID_SOURCES_START -->.*?<!-- LIVE_PAID_SOURCES_END -->",
        f"<!-- LIVE_PAID_SOURCES_START -->\n{source_block}\n<!-- LIVE_PAID_SOURCES_END -->",
        page,
        flags=re.DOTALL,
    )
    page = re.sub(
        r"<!-- LIVE_PAID_CHARTS_START -->.*?<!-- LIVE_PAID_CHARTS_END -->",
        f"<!-- LIVE_PAID_CHARTS_START -->\n{charts_block}\n<!-- LIVE_PAID_CHARTS_END -->",
        page,
        flags=re.DOTALL,
    )
    page = re.sub(
        r"<!-- LIVE_PAID_BUDGET_START -->.*?<!-- LIVE_PAID_BUDGET_END -->",
        f"<!-- LIVE_PAID_BUDGET_START -->\n{budget_block}\n<!-- LIVE_PAID_BUDGET_END -->",
        page,
        flags=re.DOTALL,
    )
    page = re.sub(
        r"<!-- LIVE_CAMPAIGN_STATUS_START -->.*?<!-- LIVE_CAMPAIGN_STATUS_END -->",
        f"<!-- LIVE_CAMPAIGN_STATUS_START -->\n{campaign_status_block}\n<!-- LIVE_CAMPAIGN_STATUS_END -->",
        page,
        flags=re.DOTALL,
    )
    return page


def main() -> int:
    """Inject live data into wiki dashboard template.

    Git operations (clone wiki, push) are handled by the GitHub Actions
    workflow, not by this script, to avoid credential handling in Python.
    """
    repo_root = Path(os.getenv("GITHUB_WORKSPACE", ".")).resolve()
    wiki_dir = repo_root / "wiki"
    data_dir = repo_root / "marketing" / "data"

    if not wiki_dir.exists():
        print(f"[wiki-sync] Wiki directory not found: {wiki_dir}")
        return 1

    # Inject live data into dashboard
    dashboard_path = wiki_dir / "Daily-Metrics-Dashboard.md"
    if dashboard_path.exists():
        dashboard = dashboard_path.read_text(encoding="utf-8")
        updated = inject_dashboard_data(dashboard, data_dir)
        dashboard_path.write_text(updated, encoding="utf-8")
        print("[wiki-sync] Dashboard updated with live data")

    paid_path = wiki_dir / "Paid-Acquisition.md"
    if paid_path.exists():
        paid_page = paid_path.read_text(encoding="utf-8")
        paid_updated = inject_paid_acquisition_data(paid_page, data_dir)
        paid_path.write_text(paid_updated, encoding="utf-8")
        print("[wiki-sync] Paid Acquisition updated with live data")

    print(f"[wiki-sync] {len(list(wiki_dir.glob('*.md')))} wiki pages ready in {wiki_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
