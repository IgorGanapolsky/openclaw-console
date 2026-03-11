# PR Management Process

## Flow
1. Feature branch created from `develop`
2. PR opened against `develop`
3. CI runs: architecture lint, skills tests, builds
4. Claude review (AI) + human review
5. Merge to `develop`
6. Release branch from `develop` to `main`

## Labels
- `pr-state:draft` - PR is in draft
- `pr-state:ci_running` - CI checks running
- `pr-state:ci_green` - All checks pass
- `pr-state:blocked` - One or more checks failing
