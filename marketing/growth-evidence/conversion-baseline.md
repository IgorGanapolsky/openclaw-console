# Conversion Baseline — 2026-04-14

## North Star: Daily Active Approvers (DAA)

Baseline: TBD (pre-launch)
Target: 10 DAA within 30 days of launch

## Funnel Stages

| Stage | Metric | Baseline | Target |
|-------|--------|----------|--------|
| Awareness | App Store impressions/week | 0 | 1,000 |
| Discovery | Store page views/week | 0 | 200 |
| Install | Downloads/week | 0 | 50 |
| Activation | Gateway connected (day 1) | 0% | 40% |
| Engagement | Task viewed (day 7) | 0% | 25% |
| Revenue | Pro subscription (day 30) | 0% | 5% |
| Retention | DAA (day 30) | 0 | 10 |

## Revenue Model

- Free: Up to 3 agents, basic monitoring
- Pro ($15/month): Unlimited agents, advanced approvals, priority notifications
- Target: $100/day after-tax = ~7 Pro subscribers

## Key Assumptions

1. SEJ article drives initial organic search traffic for "OpenClaw"
2. DevOps/SRE audience has high willingness-to-pay for operational tools
3. Biometric approval is the killer feature differentiating from Slack bots
4. Self-hosted positioning resonates with privacy-conscious operators

## Measurement Plan

- App Store Connect: impressions, page views, downloads, conversion rate
- Play Console: store listing visitors, installers, conversion rate
- PostHog (in-app): gateway_connected, task_viewed, approval_completed
- RevenueCat: trial starts, conversions, MRR, churn
