#!/usr/bin/env python3
"""Autonomous store assets generation pipeline for June 2026.

Uses the Gemini API to generate stellar, highly professional title, short_description, 
and full_description for the OpenClaw Console app, with a robust fallback system.
"""

from __future__ import annotations

import os
import sys
import json
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ANDROID_METADATA_DIR = ROOT / "android/fastlane/metadata/android/en-US"
IOS_METADATA_DIR = ROOT / "ios/OpenClawConsole/fastlane/metadata/en-US"

def parse_gemini_response(response_text: str) -> dict[str, str] | None:
    try:
        data = json.loads(response_text)
        content = data["candidates"][0]["content"]["parts"][0]["text"]
        
        # We requested JSON output. Let's try to extract JSON from the response text
        # in case the model added markdown blocks or extra wrapper text.
        json_start = content.find("{")
        json_end = content.rfind("}") + 1
        if json_start >= 0 and json_end > json_start:
            json_str = content[json_start:json_end]
            payload = json.loads(json_str)
            if "title" in payload and "short_description" in payload and "full_description" in payload:
                return {
                    "title": payload["title"].strip(),
                    "short_description": payload["short_description"].strip(),
                    "full_description": payload["full_description"].strip()
                }
    except Exception as exc:
        print(f"Error parsing Gemini response: {exc}", file=sys.stderr)
    return None

def generate_with_gemini(api_key: str) -> dict[str, str] | None:
    print("Generating store assets using Gemini API...")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    
    prompt = """
    You are a professional App Store and Google Play listing optimizer.
    Generate a stellar, high-converting product listing for 'OpenClaw Console'.
    
    Product details:
    - OpenClaw Console is a mobile app (iOS and Android) for DevOps professionals, SREs, and indie hackers.
    - Key features: Biometric-verified approval workflows for critical infrastructure operations (e.g. database migrations, deploys), AI agent management, complete self-hosted privacy, zero-dependency.
    - Pricing: Free tier (up to 3 agents), Pro tier ($15-20/month per user for unlimited agents).
    - Current month: June 2026. Make the descriptions fresh, state-of-the-art, and aligned with modern DevOps practices.
    
    You MUST output a valid JSON object with exactly the following three keys:
    1. "title": A catchy title for the app (max 30 characters).
    2. "short_description": A brief, punchy summary of the app (max 80 characters).
    3. "full_description": A detailed, beautiful description (max 4000 characters) including core features, target audience, pricing, and a strong call-to-action. Use bullet points and professional formatting.
    
    Output ONLY the JSON object. Do not include markdown code block syntax.
    """
    
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt}
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            body = response.read().decode("utf-8")
            return parse_gemini_response(body)
    except urllib.error.URLError as exc:
        print(f"Gemini API request failed: {exc}", file=sys.stderr)
        return None

def get_fallback_assets() -> dict[str, str]:
    print("Using high-quality pre-designed store assets fallback...")
    
    title = "OpenClaw Work Console"
    
    short_desc = "Biometric-verified DevOps & infrastructure approval workflows in your pocket."
    
    full_desc = """Professional Mobile Control Plane for DevOps and Infrastructure Management

OpenClaw Console is the definitive mobile app for DevOps professionals, platform engineers, and system administrators who need secure, biometric-verified approval workflows for critical infrastructure operations.

🔐 BIOMETRIC SECURITY FOR DANGEROUS OPERATIONS
• Face ID and Touch ID authentication for all approvals
• Prevent accidental production deployments and database modifications
• Secure approval workflows that eliminate costly mistakes
• Professional-grade security for self-hosting teams

🤖 INTELLIGENT AGENT MANAGEMENT
• Manage multiple OpenClaw AI agents from your phone
• Agent-specific approval workflows tailored to your infrastructure
• Real-time status updates and operation monitoring
• Seamless switching between development, staging, and production environments

⚡ SELF-HOSTED PRIVACY AND CONTROL
• Complete data sovereignty - your operations never leave your infrastructure
• No corporate surveillance or third-party data sharing
• Works with your existing self-hosted OpenClaw deployment
• Zero dependency on social messaging apps like Slack or Telegram

🚀 PROFESSIONAL DEVOPS WORKFLOWS
• Approve database migrations with confidence
• Secure CI/CD pipeline approvals on-the-go
• Infrastructure changes with proper authorization trails
• Emergency incident response from anywhere

✨ DESIGNED FOR PROFESSIONALS
• Clean, distraction-free interface focused on critical approvals
• Comprehensive audit trails for compliance requirements
• Push notifications only for operations requiring your approval
• Native Android app optimized for speed and reliability

WHO IT'S FOR:
• DevOps engineers managing personal or small team infrastructure
• Platform engineers building internal developer tools
• SREs responsible for critical system reliability
• Self-hosting enthusiasts who value privacy and security
• Teams transitioning from enterprise tools to self-hosted solutions

COMPETITIVE ADVANTAGES:
• More secure than Slack bots and chat-based approval systems
• More affordable than enterprise tools like PagerDuty ($21+/user/month)
• More focused than general monitoring apps that lack approval workflows
• More professional than consumer messaging apps with custom bots

WHY CHOOSE OPENCLAW CONSOLE:
Unlike generic notification tools or expensive enterprise solutions, OpenClaw Console is purpose-built for the modern DevOps professional who needs secure mobile access to critical infrastructure decisions. With biometric authentication, self-hosted deployment, and agent-specific workflows, it delivers enterprise-grade security at a fraction of the cost.

Perfect for teams of 1-50 who want professional approval workflows without enterprise complexity or vendor lock-in.

Get started with our free tier supporting up to 3 agents, then upgrade to Pro for unlimited agents and advanced features at just $15-20/month per user.

Your infrastructure decisions deserve professional tools. Your security requirements demand biometric verification. Your privacy needs self-hosted control.

Download OpenClaw Console today and transform your pocket into a secure DevOps control plane."""
    
    return {
        "title": title,
        "short_description": short_desc,
        "full_description": full_desc
    }

def main() -> int:
    # 1. Sync launcher icons
    print("Syncing iOS/Android app launcher icons...")
    import subprocess
    try:
        subprocess.run([sys.executable, str(ROOT / "scripts/sync_app_icons.py")], check=True)
    except subprocess.CalledProcessError as exc:
        print(f"Failed to sync app icons: {exc}", file=sys.stderr)
        return 1

    # 2. Get assets
    api_key = os.environ.get("GEMINI_API_KEY")
    assets = None
    if api_key:
        assets = generate_with_gemini(api_key)
    
    if not assets:
        assets = get_fallback_assets()
        
    # Enforce exact app name parity with iOS to satisfy release contract
    assets["title"] = "OpenClaw Work Console"
        
    # Enforce lengths limits
    if len(assets["short_description"]) > 80:
        print(f"Warning: Generated short_description too long ({len(assets['short_description'])} chars). Truncating to 80 chars.")
        assets["short_description"] = assets["short_description"][:80]

    # 3. Write metadata files
    ANDROID_METADATA_DIR.mkdir(parents=True, exist_ok=True)
    (ANDROID_METADATA_DIR / "title.txt").write_text(assets["title"], encoding="utf-8")
    (ANDROID_METADATA_DIR / "short_description.txt").write_text(assets["short_description"], encoding="utf-8")
    (ANDROID_METADATA_DIR / "full_description.txt").write_text(assets["full_description"], encoding="utf-8")
    
    print("\nSuccessfully generated and saved Google Play Store metadata!")
    print(f"Title: {assets['title']}")
    print(f"Short Description: {assets['short_description']}")
    print(f"Full Description length: {len(assets['full_description'])} characters.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
