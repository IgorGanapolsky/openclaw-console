#!/usr/bin/env python3
"""Generate a basic LLM recommendation share snapshot.

This script is intentionally dependency-light so it can run in CI even when
provider APIs are unavailable. It records prompt-set metadata and outputs a
normalized JSON envelope consumed by workflow artifacts/wiki sync.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _load_prompt_set(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if isinstance(data, dict) and isinstance(data.get("prompts"), list):
        return [x for x in data["prompts"] if isinstance(x, dict)]
    return []


def main() -> int:
    p = argparse.ArgumentParser(description="Compute LLM recommendation share snapshot")
    p.add_argument("--repo-root", default=".")
    p.add_argument("--prompt-set", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--providers", default="gemini,anthropic,openai")
    args = p.parse_args()

    repo_root = Path(args.repo_root).resolve()
    prompt_set_path = repo_root / args.prompt_set
    output_path = repo_root / args.output

    providers = [x.strip() for x in args.providers.split(",") if x.strip()]
    prompts = _load_prompt_set(prompt_set_path)

    # Offline-safe placeholder share model: evenly distributed by provider.
    share = round(1.0 / len(providers), 4) if providers else 0.0
    snapshot = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "repo": "IgorGanapolsky/openclaw-console",
        "providers": providers,
        "prompt_count": len(prompts),
        "results": [
            {
                "provider": provider,
                "recommendation_share": share,
                "recommendation_count": len(prompts),
                "status": "ok",
            }
            for provider in providers
        ],
        "notes": "Baseline placeholder snapshot. Replace with provider-evaluated scoring when API-based eval is enabled.",
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(snapshot, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
