# OpenClaw Console - Quick Start Guide

Welcome to OpenClaw Console! This mobile app lets you monitor and control your OpenClaw agents, approve dangerous actions with biometric security, and get instant notifications about your infrastructure.

## 🚀 Quick Setup (5 minutes)

### Step 1: Install OpenClaw on Your Computer

First, install OpenClaw on the machine where you want to run agents:

**macOS/Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/openclaw/install/main/install.sh | bash
```

**Windows (PowerShell as Administrator):**
```powershell
iwr -useb https://raw.githubusercontent.com/openclaw/install/main/install.ps1 | iex
```

### Step 2: Start the Skills Gateway

Run this command on your computer to start the OpenClaw Skills Gateway with mobile console support:

```bash
openclaw gateway start --mobile-console
```

This will:
- ✅ Start the gateway on `http://localhost:18789`
- ✅ Generate a QR code for easy mobile pairing
- ✅ Enable biometric approval requests
- ✅ Set up secure WebSocket connections

### Step 3: Connect Your Mobile App

1. **Open OpenClaw Console** on your mobile device
2. **Tap "Get Started"** on the welcome screen  
3. **Scan the QR code** displayed in your terminal
4. **Allow biometric authentication** when prompted
5. **Start approving agent actions** securely from your phone!

## 📱 Alternative Connection Methods

### Manual Connection
If QR code scanning isn't working:

1. Note your computer's IP address: `ifconfig` (Mac/Linux) or `ipconfig` (Windows)
2. In the app, tap "Enter Gateway URL Manually"
3. Enter: `http://YOUR_IP:18789` (e.g., `http://192.168.1.100:18789`)
4. Tap "Connect"

### Network Discovery
The app can automatically find OpenClaw gateways on your local network:
1. Ensure your phone and computer are on the same WiFi network
2. Tap "Search Local Network" in the connection screen
3. Select your gateway from the discovered list

## 🛡️ What You Can Do

### Agent Monitoring
- **Real-time status** of all your OpenClaw agents
- **Resource usage** metrics and performance data
- **Task queues** and execution history
- **Error logs** with filtering and search

### Biometric Approvals
- **Dangerous actions** require your biometric approval (Face ID/Touch ID/Fingerprint)
- **CI/CD deployments** to production environments
- **Database operations** and data migrations  
- **Infrastructure changes** and scaling operations
- **API key rotations** and security updates

### Instant Notifications
- **Agent failures** and error conditions
- **Deployment completions** and rollback requests
- **Security incidents** requiring immediate attention
- **Custom alerts** from your monitoring systems

### Mobile-Optimized Dashboard
- **Quick actions** for common operations
- **Approval history** with audit trail
- **System health** overview at a glance
- **Dark mode** support for night operations

## 🔧 Advanced Configuration

### Custom Gateway Port
```bash
openclaw gateway start --port 8080 --mobile-console
```

### HTTPS/TLS Setup
```bash
openclaw gateway start --tls --cert-file cert.pem --key-file key.pem --mobile-console
```

### Multiple Agent Environments
```bash
# Production gateway
openclaw gateway start --env production --port 18789 --mobile-console

# Staging gateway  
openclaw gateway start --env staging --port 18790 --mobile-console
```

## 📊 Business Intelligence

### Daily Active Approvers (DAA)
Track your usage with the North Star Metric:
- **Goal**: Growing user base approving agent actions daily
- **Target**: Self-hosting professionals and DevOps teams
- **Revenue Goal**: $100/day through $10-20/month Pro subscriptions

### Analytics Integration
- **PostHog**: User behavior and feature usage tracking
- **RevenueCat**: Subscription management and revenue tracking
- **Crashlytics**: Error monitoring and crash reporting

## 🆘 Troubleshooting

### Connection Issues
**Problem**: Can't connect to gateway
**Solution**: 
- Ensure both devices are on the same WiFi network
- Check firewall settings (allow port 18789)
- Verify gateway is running: `curl http://localhost:18789/health`

**Problem**: QR code not scanning
**Solution**:
- Check camera permissions in phone settings
- Use manual URL entry instead
- Increase terminal font size for clearer QR code

### Authentication Issues  
**Problem**: Biometric authentication not working
**Solution**:
- Enable Face ID/Touch ID/Fingerprint in device settings
- Grant app permission to use biometric authentication
- Fallback to device passcode if biometrics fail

### Gateway Not Starting
**Problem**: Port already in use
**Solution**:
```bash
# Find process using port 18789
lsof -i :18789

# Kill the process (replace PID)
kill -9 <PID>

# Or use a different port
openclaw gateway start --port 18790 --mobile-console
```

## 📖 Documentation Links

- **OpenClaw Main Documentation**: https://docs.openclaw.com
- **API Reference**: https://api.openclaw.com
- **GitHub Repository**: https://github.com/openclaw/console
- **Community Discord**: https://discord.gg/openclaw

## 🎯 Next Steps

1. **Set up your first agent** using the desktop OpenClaw CLI
2. **Configure approval workflows** for your critical operations  
3. **Enable notifications** for your team's mobile devices
4. **Explore advanced features** like custom skills and integrations

---

**Questions?** Open an issue on GitHub or join our Discord community for real-time help!

**Pro Tip**: Enable notifications and keep the app running in the background for instant approval requests, even when you're away from your computer.