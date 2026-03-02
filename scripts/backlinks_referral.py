#!/usr/bin/env python3
"""Backlinks and referral traffic automation.

Generates content for Reddit, Product Hunt, and fitness/coaching blogs.
Tracks submissions and engagement. Creates ready-to-post content
tailored to each platform's audience.

Designed to run weekly via GitHub Actions.
"""

from __future__ import annotations

import argparse
import json
import datetime as dt
import zlib
from pathlib import Path
from typing import Any, Dict, List

REFERRAL_PATH = "marketing/data/referral_campaigns.json"
CONTENT_TEMPLATES_PATH = "marketing/referral_content"

# Target subreddits for timer/fitness audience
REDDIT_TARGETS = [
    {"subreddit": "r/HIIT", "audience": "HIIT enthusiasts", "angle": "random rest intervals"},
    {"subreddit": "r/CrossFit", "audience": "CrossFit athletes", "angle": "unpredictable EMOM timer"},
    {"subreddit": "r/tacticaltraining", "audience": "tactical/military trainers", "angle": "reaction time drills"},
    {"subreddit": "r/bodyweightfitness", "audience": "home workout community", "angle": "tabata random intervals"},
    {"subreddit": "r/boxing", "audience": "boxers and combat sport athletes", "angle": "round timer with surprise bells"},
    {"subreddit": "r/androidapps", "audience": "Android app enthusiasts", "angle": "open-source timer app"},
    {"subreddit": "r/iOSProgramming", "audience": "iOS developers", "angle": "SwiftUI timer architecture"},
]

PRODUCT_HUNT_CONFIG = {
    "tagline": "Random timer for HIIT, drills & party games — you never know when it fires",
    "description": """OpenClaw Console picks a random moment within your chosen time range to fire an alarm.

Set a minimum and maximum duration, press start, and go about your activity. You never know exactly when it goes off — keeping you sharp, alert, and engaged.

Perfect for:
- HIIT & Tabata with unpredictable rest periods
- Reaction training for martial arts & boxing
- Party games like Musical Chairs & Hot Potato
- Pomodoro sessions with random breaks

No ads. No tracking. No subscriptions. Just set your range and go.""",
    "topics": ["Productivity", "Health & Fitness", "Developer Tools"],
    "maker_comment": "Hey PH! I built this because every timer app lets you predict exactly when it ends. That defeats the purpose for reaction training and surprise-based games. This one keeps you guessing.",
}

BLOG_OUTREACH_TEMPLATES = [
    {
        "target": "fitness_blogs",
        "subject": "Free random interval timer for HIIT coaches",
        "angle": "How random rest intervals improve athletic performance",
        "cta": "Try OpenClaw Console (free, no ads)",
    },
    {
        "target": "coaching_blogs",
        "subject": "Tool for unpredictable drill timing",
        "angle": "Why coaches should use random timers in training",
        "cta": "OpenClaw Console - free app for coaches",
    },
    {
        "target": "productivity_blogs",
        "subject": "Random break timer for deep work",
        "angle": "The science of unpredictable breaks for focus",
        "cta": "Try the random Pomodoro approach",
    },
]


def load_referral_data(repo_root: Path) -> Dict[str, Any]:
    path = repo_root / REFERRAL_PATH
    if path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"campaigns": [], "reddit_posts": [], "product_hunt": None, "blog_outreach": []}


def save_referral_data(repo_root: Path, data: Dict[str, Any]) -> None:
    path = repo_root / REFERRAL_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def generate_reddit_post(target: Dict[str, str], app_store_url: str = "", play_store_url: str = "") -> Dict[str, Any]:
    """Generate a Reddit post tailored to the target subreddit."""
    templates = {
        "r/HIIT": {
            "title": "I built a free timer app with truly random rest intervals for HIIT",
            "body": """I got frustrated with traditional interval timers because I always knew exactly when the rest period would end — so I'd unconsciously pace myself.

I built OpenClaw Console to fix this. You set a min and max time, and it picks a random duration each interval. You genuinely can't predict when the alarm fires.

Been using it for 6 months for my own HIIT sessions and the difference is real — my heart rate stays higher because I can't mentally "prepare" for the next interval.

Free, no ads, no tracking. Would love feedback from this community.""",
        },
        "r/CrossFit": {
            "title": "Random interval timer for unpredictable EMOM/AMRAP workouts",
            "body": """Built an app that fires an alarm at a random time within your set range. Basically makes every EMOM unpredictable.

Set 45s-90s and you never know when the next round starts. Forces you to stay ready instead of watching the clock.

Free app, no ads. Been using it for WODs and it's a game changer for mental toughness.""",
        },
        "r/boxing": {
            "title": "Random round timer for boxing drills — simulates real fight unpredictability",
            "body": """In a real fight, you don't know when the bell rings. Built an app that makes your training rounds unpredictable.

Set 2-3 minute rounds and the bell goes off randomly within that range. Way better for building genuine reaction time vs watching a countdown.

Free, no ads. Would love to hear from other fighters/trainers.""",
        },
    }

    default_template = {
        "title": f"Free random timer app for {target['angle']}",
        "body": f"""Built a timer app where you set a range and it fires at a random time within that range. Great for {target['angle']}.

No ads, no tracking, no subscriptions. Available on iOS and Android.

Would love feedback from this community!""",
    }

    template = templates.get(target["subreddit"], default_template)

    return {
        "subreddit": target["subreddit"],
        "audience": target["audience"],
        "title": template["title"],
        "body": template["body"],
        "status": "draft",
        "created": dt.datetime.now(dt.timezone.utc).isoformat(),
        "id": format(zlib.crc32(f"{target['subreddit']}-{dt.date.today()}".encode()) & 0xFFFFFFFF, "08x"),
    }


def generate_product_hunt_launch(repo_root: Path) -> Dict[str, Any]:
    """Generate Product Hunt launch configuration."""
    return {
        **PRODUCT_HUNT_CONFIG,
        "status": "draft",
        "scheduled_date": None,
        "created": dt.datetime.now(dt.timezone.utc).isoformat(),
        "pre_launch_checklist": [
            {"task": "Prepare 3-5 screenshots for PH gallery", "done": False},
            {"task": "Record 30s demo GIF", "done": False},
            {"task": "Notify supporters 48h before launch", "done": False},
            {"task": "Prepare maker comment", "done": True},
            {"task": "Schedule for Tuesday 00:01 PST", "done": False},
        ],
    }


def generate_blog_outreach(target: Dict[str, str]) -> Dict[str, Any]:
    """Generate blog outreach email template."""
    return {
        **target,
        "status": "draft",
        "email_template": f"""Hi [Name],

I came across your content on {target['angle'].lower()} and thought you might find this useful.

I built OpenClaw Console — a free app (iOS + Android) that fires an alarm at a random time within a range you set. {target['angle']}.

It's completely free with no ads, tracking, or subscriptions. Just thought it might be worth mentioning to your audience.

Happy to provide any details or screenshots if you're interested.

Best,
Igor""",
        "created": dt.datetime.now(dt.timezone.utc).isoformat(),
    }


def ensure_content_dir(repo_root: Path) -> None:
    """Ensure referral content directory exists."""
    content_dir = repo_root / CONTENT_TEMPLATES_PATH
    content_dir.mkdir(parents=True, exist_ok=True)


def run_referral(repo_root: Path) -> Dict[str, Any]:
    """Main referral traffic pipeline."""
    ensure_content_dir(repo_root)
    data = load_referral_data(repo_root)

    # Generate Reddit posts
    reddit_posts = [generate_reddit_post(target) for target in REDDIT_TARGETS]
    data["reddit_posts"] = reddit_posts

    # Generate Product Hunt launch config
    data["product_hunt"] = generate_product_hunt_launch(repo_root)

    # Generate blog outreach
    data["blog_outreach"] = [generate_blog_outreach(t) for t in BLOG_OUTREACH_TEMPLATES]

    # Save Reddit post files for easy review
    for post in reddit_posts:
        post_path = repo_root / CONTENT_TEMPLATES_PATH / f"reddit_{post['subreddit'].replace('/', '_')}.md"
        content = f"# {post['title']}\n\n**Subreddit:** {post['subreddit']}\n**Audience:** {post['audience']}\n\n---\n\n{post['body']}\n"
        post_path.write_text(content, encoding="utf-8")

    # Save PH launch file
    ph_path = repo_root / CONTENT_TEMPLATES_PATH / "product_hunt_launch.md"
    ph = data["product_hunt"]
    ph_content = f"""# Product Hunt Launch Plan

**Tagline:** {ph['tagline']}

## Description
{ph['description']}

## Topics
{', '.join(ph['topics'])}

## Maker Comment
{ph['maker_comment']}

## Pre-Launch Checklist
"""
    for item in ph["pre_launch_checklist"]:
        check = "x" if item["done"] else " "
        ph_content += f"- [{check}] {item['task']}\n"
    ph_path.write_text(ph_content, encoding="utf-8")

    save_referral_data(repo_root, data)

    return {
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "reddit_posts": len(reddit_posts),
        "reddit_subreddits": [p["subreddit"] for p in reddit_posts],
        "product_hunt_ready": data["product_hunt"]["status"],
        "blog_outreach_targets": len(data["blog_outreach"]),
        "content_files_generated": len(reddit_posts) + 1,
    }


def build_report(result: Dict[str, Any]) -> str:
    lines = [
        "# Backlinks & Referral Traffic Report",
        "",
        f"**Date:** {result['timestamp']}",
        "",
        "## Reddit Campaign",
        f"- Posts drafted: **{result['reddit_posts']}**",
        "- Target subreddits:",
    ]
    for sub in result["reddit_subreddits"]:
        lines.append(f"  - {sub}")

    lines.extend([
        "",
        "## Product Hunt",
        f"- Launch status: **{result['product_hunt_ready']}**",
        "- Content in `marketing/referral_content/product_hunt_launch.md`",
        "",
        "## Blog Outreach",
        f"- Outreach targets: **{result['blog_outreach_targets']}**",
        "",
        "## Generated Files",
        f"- Total content files: {result['content_files_generated']}",
        "- Location: `marketing/referral_content/`",
        "",
        "## Next Steps",
        "1. Review Reddit posts in `marketing/referral_content/reddit_*.md`",
        "2. Post to subreddits (space out by 2-3 days to avoid spam)",
        "3. Complete Product Hunt pre-launch checklist",
        "4. Schedule PH launch for a Tuesday",
        "5. Send blog outreach emails",
    ])
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Backlinks & referral traffic pipeline")
    parser.add_argument("--repo-root", default=".", help="Repository root")
    parser.add_argument("--report-out", default=None)
    args = parser.parse_args()

    result = run_referral(Path(args.repo_root).resolve())
    report = build_report(result)
    print(report)

    if args.report_out:
        out_path = Path(args.report_out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(report, encoding="utf-8")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
