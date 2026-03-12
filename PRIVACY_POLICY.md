# Privacy Policy for OpenClaw Console

**Last updated:** March 6, 2026

## Overview

OpenClaw Console ("the App") is a professional mobile application for DevOps professionals to securely manage AI agents and approve infrastructure operations. This policy explains how we handle your data in relation to app functionality, subscription billing, and optional analytics.

## Data We Collect

### Subscription and Billing Data (RevenueCat)
When you subscribe to Pro features, we collect and process:
- Email address for account management and receipts
- Subscription status and billing history
- Payment method information (processed securely by app stores)
- Device identifiers for subscription validation
- Country/region for pricing and tax compliance

### Optional Analytics Data (Firebase)
With your explicit consent, we collect anonymized usage data to improve the app:
- Feature usage patterns (which screens visited, buttons tapped)
- Performance metrics (app startup time, crash reports)
- Conversion funnel data (trial start, upgrade events)
- Device information (OS version, device type, language)
- No personal identifiers or sensitive operational data

### Biometric and Security Data
- **Biometric templates**: Stored exclusively on your device using iOS Keychain/Android Keystore
- **Authentication tokens**: Stored locally in secure platform storage
- **Approval decisions**: Stored on your self-hosted OpenClaw gateway only
- We never access or store biometric data on our servers

## Data We Do NOT Collect

- DevOps operational data, agent configurations, or approval content
- Personal information beyond what's required for billing
- Location data or device tracking
- Social media profiles or contact lists
- Detailed infrastructure information or security credentials

## Data Storage and Processing

### Local Device Storage
- Gateway connection tokens: iOS Keychain / Android Keystore (encrypted)
- Biometric authentication: Device-native secure storage only
- App preferences: Standard platform storage (non-sensitive data)

### Third-Party Services
- **RevenueCat**: Subscription management and cross-platform billing
- **Firebase Analytics**: Optional, anonymized usage analytics (opt-in only)
- **App Store/Google Play**: Payment processing and subscription validation
- No data is shared with advertising networks or data brokers

### Your Self-Hosted Infrastructure
- Agent data, approval workflows, and operational information remain exclusively on your OpenClaw gateway
- Network communication uses TLS encryption (HTTPS/WSS)
- We recommend VPN deployment (Tailscale, WireGuard) for additional security

## Data Retention

### Subscription Data
- Retained for the duration of your subscription plus applicable legal retention periods
- Billing history maintained for tax compliance and dispute resolution
- Account deletion available upon request (subject to legal requirements)

### Analytics Data
- Aggregated and anonymized data retained for product improvement
- Individual usage patterns automatically deleted after 14 months
- Opt-out available at any time through app settings

### Device Security Data
- Biometric templates never leave your device
- Authentication tokens can be revoked and regenerated at any time
- Local app data cleared when you uninstall the application

## Your Rights and Controls

### Subscription Management
- View and modify subscription through App Store/Google Play
- Export billing history and receipts upon request
- Cancel subscription at any time with immediate effect on renewal

### Analytics Opt-Out
- Disable analytics collection through in-app privacy settings
- Previously collected anonymized data cannot be individually deleted
- Future data collection immediately stops upon opt-out

### Data Access and Deletion
- Request account data export through app support
- Delete local account data by uninstalling the app
- Request subscription data deletion (subject to legal retention requirements)

## Legal Basis for Processing (GDPR)

### For EEA/UK Users
- **Subscription billing**: Contractual necessity for service delivery
- **Analytics**: Legitimate interest in product improvement (with opt-out)
- **Security features**: Vital interests and security of service

### Data Controller
OpenClaw Console development team acts as data controller for subscription and analytics data. You remain the controller of all operational data on your self-hosted infrastructure.

## International Data Transfers

- Subscription data processed by RevenueCat (US-based, Privacy Shield certified)
- Analytics data processed by Google Firebase (global, GDPR-compliant)
- All transfers protected by appropriate safeguards and encryption

## Security Measures

### Technical Safeguards
- TLS 1.3 encryption for all network communications
- Platform-native secure storage for sensitive data
- Regular security updates and vulnerability assessments
- No permanent storage of user credentials on our servers

### Organizational Safeguards
- Access to user data limited to essential personnel only
- Regular privacy and security training for development team
- Incident response plan for potential data breaches
- Annual third-party security audits

## Children's Privacy

OpenClaw Console is designed for professional DevOps use and not intended for children under 13. We do not knowingly collect information from children under 13. If we learn we have collected such information, we will delete it immediately.

## Changes to This Policy

We may update this privacy policy to reflect changes in our practices, technology, legal requirements, or other factors. We will:
- Post updates to this document with a revised "Last updated" date
- Notify users of material changes through in-app notifications
- Provide reasonable notice before changes affecting data processing take effect

## Contact and Data Protection

### Privacy Questions
For questions about this privacy policy or data practices:
- Email: privacy@openclaw.dev
- GitHub Issues: https://github.com/IgorGanapolsky/openclaw-console/issues
- Response time: 48 hours for privacy inquiries

### Data Protection Officer
For GDPR-related inquiries (EEA/UK users):
- Email: dpo@openclaw.dev
- Subject line: "Data Protection Inquiry"
- We will respond within 30 days as required by law

### Supervisory Authority
EEA/UK users have the right to lodge complaints with your local data protection authority if you believe we have not adequately addressed your privacy concerns.
