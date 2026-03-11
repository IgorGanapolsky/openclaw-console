#!/bin/bash
# Secure VPS Setup for OpenClaw ($2.50/mo target)
set -e
echo "🛡️ Securing VPS..."
export DEBIAN_FRONTEND=noninteractive
apt-get update && apt-get upgrade -y
apt-get install -y ufw docker.io docker-compose fail2ban
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
systemctl enable docker
echo "✅ VPS secured with Firewall and Docker. Ready for OpenClaw deployment."
