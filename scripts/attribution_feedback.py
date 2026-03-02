#!/usr/bin/env python3
"""Attribution feedback loop.

Queries PostHog for install attribution data (UTM params, onboarding funnel),
and feeds results back into:
  1. ASO keyword rotation (real install data replaces simulated rankings)
  2. Content pipeline (engagement→topic selection)
  3. Campaign performance reports

Designed to run weekly via GitHub Actions after the growth workflows.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

QUERY_ERRORS: List[str] = []
LIVE_EVENTS_PREDICATE = """
(
  (
    lower(coalesce(properties.environment, '')) IN ('production', 'live')
    OR lower(coalesce(properties.build_audience, '')) = 'live'
  )
  AND lower(coalesce(properties.build_type, 'release')) != 'debug'
  AND lower(coalesce(properties.runtime_target, 'device')) NOT IN ('simulator', 'emulator')
)
"""


def _requests_module():
    try:
        import requests
        return requests
    except ImportError:
        return None


def posthog_query(query: str, api_key: str, project_id: str) -> Optional[Dict[str, Any]]:
    """Execute a PostHog HogQL query via the API."""
    requests = _requests_module()
    if requests is None:
        return None

    try:
        response = requests.post(
            f"https://us.posthog.com/api/projects/{project_id}/query/",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={"query": {"kind": "HogQLQuery", "query": query}},
            timeout=30,
        )
    except requests.RequestException as exc:
        msg = f"request_error: {exc}"
        QUERY_ERRORS.append(msg)
        print(f"[Attribution] PostHog query request error: {exc}")
        return None

    if response.status_code >= 300:
        msg = f"http_{response.status_code}"
        QUERY_ERRORS.append(msg)
        print(f"[Attribution] PostHog query failed: {response.status_code}")
        return None
    try:
        return response.json()
    except Exception as exc:
        msg = f"invalid_json: {exc}"
        QUERY_ERRORS.append(msg)
        print(f"[Attribution] PostHog returned non-JSON payload: {exc}")
        return None


def query_scalar(query: str, api_key: str, project_id: str) -> int:
    """Return first scalar result for a HogQL query, defaulting to 0."""
    result = posthog_query(query, api_key, project_id)
    if not result or "results" not in result or not result["results"]:
        return 0
    row = result["results"][0]
    if not row:
        return 0
    try:
        return int(row[0] or 0)
    except (TypeError, ValueError):
        return 0


def fetch_utm_attribution(api_key: str, project_id: str, days: int = 30) -> List[Dict[str, Any]]:
    """Fetch UTM attribution data from PostHog deep_link_opened events."""
    query = f"""
    SELECT
        properties.utm_source AS source,
        properties.utm_medium AS medium,
        properties.utm_campaign AS campaign,
        properties.utm_content AS content,
        count() AS installs,
        count(DISTINCT person_id) AS unique_users
    FROM events
    WHERE event = 'deep_link_opened'
      AND timestamp > now() - interval {days} day
      AND {LIVE_EVENTS_PREDICATE}
    GROUP BY source, medium, campaign, content
    ORDER BY installs DESC
    LIMIT 100
    """
    result = posthog_query(query, api_key, project_id)
    if not result or "results" not in result or not result["results"]:
        # Fallback: capture any events carrying UTM params when deep_link_opened is absent.
        fallback_query = f"""
        SELECT
            properties.utm_source AS source,
            properties.utm_medium AS medium,
            properties.utm_campaign AS campaign,
            properties.utm_content AS content,
            count() AS installs,
            count(DISTINCT person_id) AS unique_users
        FROM events
        WHERE properties.utm_source IS NOT NULL
          AND timestamp > now() - interval {days} day
          AND {LIVE_EVENTS_PREDICATE}
        GROUP BY source, medium, campaign, content
        ORDER BY installs DESC
        LIMIT 100
        """
        result = posthog_query(fallback_query, api_key, project_id)
    if not result or "results" not in result:
        return []

    columns = result.get("columns", ["source", "medium", "campaign", "content", "installs", "unique_users"])
    rows = []
    for row in result["results"]:
        entry = dict(zip(columns, row))
        rows.append(entry)
    return rows


def fetch_onboarding_funnel(api_key: str, project_id: str, days: int = 30) -> Dict[str, Any]:
    """Fetch onboarding funnel metrics from PostHog."""
    funnel = {}

    # Preferred lifecycle events.
    first_open = query_scalar(
        f"""
        SELECT count(DISTINCT person_id)
        FROM events
        WHERE event = 'first_open'
          AND timestamp > now() - interval {days} day
          AND {LIVE_EVENTS_PREDICATE}
        """,
        api_key,
        project_id,
    )
    first_configured = query_scalar(
        f"""
        SELECT count(DISTINCT person_id)
        FROM events
        WHERE event = 'first_timer_configured'
          AND timestamp > now() - interval {days} day
          AND {LIVE_EVENTS_PREDICATE}
        """,
        api_key,
        project_id,
    )
    first_completed = query_scalar(
        f"""
        SELECT count(DISTINCT person_id)
        FROM events
        WHERE event = 'first_timer_completed'
          AND timestamp > now() - interval {days} day
          AND {LIVE_EVENTS_PREDICATE}
        """,
        api_key,
        project_id,
    )

    # Fallback to currently observed production events if lifecycle aliases are absent.
    if first_open == 0:
        first_open = query_scalar(
            f"""
            SELECT count(DISTINCT person_id)
            FROM events
            WHERE event IN ('Application Opened', 'Application Installed')
              AND timestamp > now() - interval {days} day
              AND {LIVE_EVENTS_PREDICATE}
            """,
            api_key,
            project_id,
        )
    if first_configured == 0:
        first_configured = query_scalar(
            f"""
            SELECT count(DISTINCT person_id)
            FROM events
            WHERE event IN ('timer_started', 'settings_changed')
              AND timestamp > now() - interval {days} day
              AND {LIVE_EVENTS_PREDICATE}
            """,
            api_key,
            project_id,
        )
    if first_completed == 0:
        first_completed = query_scalar(
            f"""
            SELECT count(DISTINCT person_id)
            FROM events
            WHERE event = 'timer_completed'
              AND timestamp > now() - interval {days} day
              AND {LIVE_EVENTS_PREDICATE}
            """,
            api_key,
            project_id,
        )

    funnel["first_open"] = first_open
    funnel["first_timer_configured"] = first_configured
    funnel["first_timer_completed"] = first_completed

    # Compute conversion rates
    first_open = funnel.get("first_open", 0)
    first_configured = funnel.get("first_timer_configured", 0)
    first_completed = funnel.get("first_timer_completed", 0)

    return {
        "first_open": first_open,
        "first_timer_configured": first_configured,
        "first_timer_completed": first_completed,
        "open_to_configured_rate": round(first_configured / first_open, 4) if first_open > 0 else 0,
        "configured_to_completed_rate": round(first_completed / first_configured, 4) if first_configured > 0 else 0,
        "open_to_completed_rate": round(first_completed / first_open, 4) if first_open > 0 else 0,
        "window_days": days,
    }


def fetch_campaign_installs(api_key: str, project_id: str, days: int = 30) -> List[Dict[str, Any]]:
    """Fetch installs per campaign with retention proxy (timer_completed within 7 days)."""
    query = f"""
    SELECT
        properties.utm_campaign AS campaign,
        properties.utm_source AS source,
        count(DISTINCT person_id) AS attributed_users,
        countIf(person_id IN (
            SELECT DISTINCT person_id FROM events
            WHERE event IN ('first_timer_completed', 'timer_completed')
              AND timestamp > now() - interval {days} day
              AND {LIVE_EVENTS_PREDICATE}
        )) AS activated_users
    FROM events
    WHERE event = 'deep_link_opened'
      AND timestamp > now() - interval {days} day
      AND {LIVE_EVENTS_PREDICATE}
      AND properties.utm_campaign IS NOT NULL
    GROUP BY campaign, source
    ORDER BY attributed_users DESC
    LIMIT 50
    """
    result = posthog_query(query, api_key, project_id)
    if not result or "results" not in result or not result["results"]:
        # Fallback: use any events with utm_campaign populated.
        fallback_query = f"""
        SELECT
            properties.utm_campaign AS campaign,
            properties.utm_source AS source,
            count(DISTINCT person_id) AS attributed_users,
            countIf(person_id IN (
                SELECT DISTINCT person_id FROM events
                WHERE event IN ('first_timer_completed', 'timer_completed')
                  AND timestamp > now() - interval {days} day
                  AND {LIVE_EVENTS_PREDICATE}
            )) AS activated_users
        FROM events
        WHERE properties.utm_campaign IS NOT NULL
          AND timestamp > now() - interval {days} day
          AND {LIVE_EVENTS_PREDICATE}
        GROUP BY campaign, source
        ORDER BY attributed_users DESC
        LIMIT 50
        """
        result = posthog_query(fallback_query, api_key, project_id)
    if not result or "results" not in result:
        return []

    columns = result.get("columns", ["campaign", "source", "attributed_users", "activated_users"])
    rows = []
    for row in result["results"]:
        entry = dict(zip(columns, row))
        attributed = entry.get("attributed_users", 0) or 0
        activated = entry.get("activated_users", 0) or 0
        entry["activation_rate"] = round(activated / attributed, 4) if attributed > 0 else 0
        rows.append(entry)
    return rows


def build_keyword_performance(
    attribution: List[Dict[str, Any]],
    campaign_installs: List[Dict[str, Any]],
) -> Dict[str, int]:
    """Map campaign names back to keyword performance scores.

    Convention: daily_blog campaigns include keyword in the campaign name
    e.g. utm_campaign=daily_blog_20260215 with utm_content=keyword_slug
    """
    keyword_scores: Dict[str, int] = {}
    for row in attribution:
        content = str(row.get("content") or "").strip()
        if not content:
            continue
        installs = int(row.get("installs") or 0)
        keyword_scores[content] = keyword_scores.get(content, 0) + installs

    for row in campaign_installs:
        campaign = str(row.get("campaign") or "").strip()
        if "daily_blog" in campaign:
            score = int(row.get("activated_users") or 0)
            keyword_scores[campaign] = keyword_scores.get(campaign, 0) + score

    return keyword_scores


def write_aso_feedback(
    repo_root: Path,
    keyword_performance: Dict[str, int],
) -> Path:
    """Write keyword performance data for the ASO rotation script to consume."""
    feedback_path = repo_root / "marketing" / "keywords" / "posthog_feedback.json"
    feedback_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "keyword_installs": keyword_performance,
    }
    feedback_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return feedback_path


def write_content_feedback(
    repo_root: Path,
    campaign_installs: List[Dict[str, Any]],
    funnel: Dict[str, Any],
) -> Path:
    """Write content performance data for the content pipeline to consume."""
    feedback_path = repo_root / "marketing" / "data" / "content_feedback.json"
    feedback_path.parent.mkdir(parents=True, exist_ok=True)

    # Rank campaigns by activation rate to inform topic selection
    top_campaigns = sorted(
        campaign_installs,
        key=lambda r: -(r.get("activation_rate") or 0),
    )[:20]

    payload = {
        "generated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "onboarding_funnel": funnel,
        "top_campaigns_by_activation": top_campaigns,
    }
    feedback_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return feedback_path


def build_report(
    attribution: List[Dict[str, Any]],
    funnel: Dict[str, Any],
    campaign_installs: List[Dict[str, Any]],
    keyword_performance: Dict[str, int],
) -> str:
    """Build a markdown report of attribution data."""
    lines = [
        "# Attribution Feedback Report",
        "",
        f"**Generated:** {dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()}",
        "",
        "## Onboarding Funnel",
        f"- First Open: **{funnel.get('first_open', 0)}**",
        f"- First Timer Configured: **{funnel.get('first_timer_configured', 0)}** "
        f"({funnel.get('open_to_configured_rate', 0):.1%} of opens)",
        f"- First Timer Completed: **{funnel.get('first_timer_completed', 0)}** "
        f"({funnel.get('open_to_completed_rate', 0):.1%} of opens)",
        "",
        "## UTM Attribution (Top Sources)",
        "| Source | Medium | Campaign | Installs | Unique Users |",
        "|--------|--------|----------|----------|-------------|",
    ]
    for row in attribution[:15]:
        lines.append(
            f"| {row.get('source', '-')} | {row.get('medium', '-')} | "
            f"{row.get('campaign', '-')} | {row.get('installs', 0)} | {row.get('unique_users', 0)} |"
        )

    lines.extend([
        "",
        "## Campaign Performance",
        "| Campaign | Source | Attributed | Activated | Rate |",
        "|----------|--------|-----------|-----------|------|",
    ])
    for row in campaign_installs[:15]:
        lines.append(
            f"| {row.get('campaign', '-')} | {row.get('source', '-')} | "
            f"{row.get('attributed_users', 0)} | {row.get('activated_users', 0)} | "
            f"{row.get('activation_rate', 0):.1%} |"
        )

    if keyword_performance:
        lines.extend([
            "",
            "## Keyword Performance (by installs)",
            "| Keyword/Content | Installs |",
            "|-----------------|----------|",
        ])
        for kw, count in sorted(keyword_performance.items(), key=lambda x: -x[1])[:20]:
            lines.append(f"| {kw} | {count} |")

    if QUERY_ERRORS:
        lines.extend([
            "",
            "## Query Diagnostics",
            f"- Query errors observed: **{len(QUERY_ERRORS)}**",
            f"- Last error: `{QUERY_ERRORS[-1]}`",
        ])

    return "\n".join(lines) + "\n"


def run(
    repo_root: Path,
    days: int = 30,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """Main attribution feedback pipeline."""
    QUERY_ERRORS.clear()

    api_key = (
        os.getenv("POSTHOG_PERSONAL_API_KEY", "").strip()
        or os.getenv("POSTHOG_API_KEY", "").strip()
        or os.getenv("posthog_api_key", "").strip()
    )
    project_id = os.getenv("POSTHOG_PROJECT_ID", "").strip()
    report_path = repo_root / "marketing" / "data" / "attribution-report.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)

    if not api_key or not project_id:
        # Generate empty feedback files so downstream scripts don't break
        empty_kw: Dict[str, int] = {}
        write_aso_feedback(repo_root, empty_kw)
        write_content_feedback(repo_root, [], {"window_days": days})
        report_path.write_text(
            "# Attribution Feedback Report\n\nNo PostHog query data available: missing API key and/or project id.\n",
            encoding="utf-8",
        )
        return {
            "status": "skipped",
            "reason": "missing POSTHOG_PERSONAL_API_KEY/POSTHOG_API_KEY or POSTHOG_PROJECT_ID",
            "report": str(report_path),
        }

    attribution = fetch_utm_attribution(api_key, project_id, days)
    funnel = fetch_onboarding_funnel(api_key, project_id, days)
    campaign_installs = fetch_campaign_installs(api_key, project_id, days)
    keyword_performance = build_keyword_performance(attribution, campaign_installs)

    if not dry_run:
        aso_path = write_aso_feedback(repo_root, keyword_performance)
        content_path = write_content_feedback(repo_root, campaign_installs, funnel)
    else:
        aso_path = Path("(dry-run)")
        content_path = Path("(dry-run)")

    report = build_report(attribution, funnel, campaign_installs, keyword_performance)

    report_path.write_text(report, encoding="utf-8")

    # Write to GitHub Actions step summary if available
    summary_file = os.getenv("GITHUB_STEP_SUMMARY", "").strip()
    if summary_file:
        with Path(summary_file).open("a", encoding="utf-8") as handle:
            handle.write(report)

    return {
        "status": "ok" if not QUERY_ERRORS else "degraded",
        "attribution_rows": len(attribution),
        "funnel": funnel,
        "campaign_rows": len(campaign_installs),
        "keyword_scores": len(keyword_performance),
        "aso_feedback": str(aso_path),
        "content_feedback": str(content_path),
        "report": str(report_path),
        "query_errors_count": len(QUERY_ERRORS),
        "last_query_error": QUERY_ERRORS[-1] if QUERY_ERRORS else "",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Attribution feedback loop")
    parser.add_argument("--repo-root", default=".", help="Repository root path")
    parser.add_argument("--days", type=int, default=30, help="Lookback window in days")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing feedback files")
    args = parser.parse_args()

    result = run(Path(args.repo_root).resolve(), args.days, args.dry_run)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
