# Repository Automation

This repository uses AI-powered automation to streamline development workflows and maintain high code quality.

## Key Features

### 1. Pull Request Management

- Automatic code review with CodeRabbit AI
- Status tracking and dependency management
- Smart merge queue optimization
- Auto-merge for safe dependency updates

### 2. Issue Management

- AI-powered issue triage
- Automatic labeling and classification
- SLA monitoring and escalation
- Project board synchronization

### 3. Code Quality

- Automated security scanning
- Performance analysis
- Type safety checks
- CodeRabbit AI suggestions

## Workflows

### PR Automation (`pr-automation.yml`)

- Runs every 10 minutes
- Manages PR statuses and dependencies
- Updates status board
- Handles merge queue

### Issue Management (`issues-automation.yml`)

- Smart issue triage with AI
- Project board synchronization
- SLA monitoring
- Status updates

## Configuration

All automation settings are defined in `.github/project.yml`:

- Issue labels and priorities
- SLA configurations
- Project board settings
- Automation rules

## Usage

### For Developers

1. Create PRs as normal
2. CodeRabbit will automatically review
3. Address any AI suggestions
4. PR will be auto-merged when ready

### For Issues

1. Create detailed issue descriptions
2. System will auto-label and triage
3. SLA monitoring is automatic
4. Project board stays in sync

## Monitoring

Monitor automation health:

1. Check status board issue
2. Review SLA notifications
3. Monitor PR statuses
