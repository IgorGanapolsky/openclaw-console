# PostHog Analytics

OpenClaw Console uses PostHog for server-side product analytics and North Star read-back.

## Environment

Use separate keys for capture and query:

- `POSTHOG_PROJECT_API_KEY` or `POSTHOG_PROJECT_TOKEN`: project token used by the gateway to capture events.
- `POSTHOG_API_KEY`: supported as the legacy project-token name for capture only.
- `POSTHOG_PERSONAL_API_KEY`: personal API key used by `scripts/north_star_guardrail.py` to query HogQL.
- `POSTHOG_PROJECT_ID`: numeric PostHog project ID used by HogQL queries.
- `POSTHOG_HOST`: optional host override. Defaults to `https://us.i.posthog.com`.
- `POSTHOG_SEND_RAW_EMAIL`: optional. Set to `true` only if raw email capture is explicitly allowed.

Do not use `POSTHOG_PERSONAL_API_KEY` for event capture. Do not use the project token for HogQL queries. Prefer `POSTHOG_PROJECT_API_KEY` for new configuration so capture tokens are not confused with personal API keys.

## Captured Events

Gateway analytics captures conversion and lifecycle events from `openclaw-skills/src/analytics/events.ts`.

Key events:

- `app_install`
- `account_created`
- `first_approval`
- `approval_completed`
- `subscription_started`
- `subscription_cancelled`
- `feature_used`
- `integration_connected`
- `error_encountered`

`first_approval` and `approval_completed` both count toward Daily Active Approvers.

## Privacy

PostHog person properties are sent through `$set`. Raw email is stripped by default, even if callers pass `email`. Set `POSTHOG_SEND_RAW_EMAIL=true` only when the privacy policy and product settings explicitly allow raw email analytics.

## Read-Back

The gateway exposes a secret-safe status endpoint:

```bash
GET /api/analytics/status
```

It reports whether local analytics, Firebase, and PostHog are configured without returning tokens.

The North Star guardrail queries PostHog with HogQL:

```bash
python3 scripts/north_star_guardrail.py --require-posthog
```
