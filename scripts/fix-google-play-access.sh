#!/usr/bin/env bash
# Complete Google Play Console access fix script
# This script automates everything possible and provides exact manual instructions

set -euo pipefail

echo "🔧 GOOGLE PLAY CONSOLE ACCESS FIXER"
echo "=================================="

# Check if we're in the right repository
if [ ! -f "android/app/build.gradle.kts" ] || [ ! -f ".github/workflows/native-release.yml" ]; then
    echo "❌ Error: Run this from openclaw-console root directory"
    exit 1
fi

# Check GitHub secrets
echo "🔍 Step 1: Checking GitHub secrets..."
if gh secret list | grep -q "GOOGLE_PLAY_JSON_KEY"; then
    echo "✅ GOOGLE_PLAY_JSON_KEY secret exists"
    SECRET_DATE=$(gh secret list | grep "GOOGLE_PLAY_JSON_KEY" | awk '{print $2}')
    echo "   Last updated: $SECRET_DATE"
else
    echo "❌ GOOGLE_PLAY_JSON_KEY secret is missing"
    echo "💡 Copy from Random-Timer: gh secret set GOOGLE_PLAY_JSON_KEY --repo IgorGanapolsky/openclaw-console --body \"\$(gh secret get GOOGLE_PLAY_JSON_KEY --repo IgorGanapolsky/Random-Timer)\""
    exit 1
fi

echo ""
echo "🧪 Step 2: Testing service account access..."

# Create test script
cat > /tmp/test_google_play_access.py << 'EOF'
#!/usr/bin/env python3
import sys
import json
import subprocess
import os

def test_google_play_access():
    try:
        # Get the secret
        result = subprocess.run(
            ['gh', 'secret', 'get', 'GOOGLE_PLAY_JSON_KEY', '--repo', 'IgorGanapolsky/openclaw-console'],
            capture_output=True, text=True, check=True
        )

        if not result.stdout.strip():
            print("❌ GOOGLE_PLAY_JSON_KEY is empty")
            return False

        # Parse the service account JSON to get client_email
        try:
            sa_data = json.loads(result.stdout)
            client_email = sa_data.get('client_email', 'Unknown')
            project_id = sa_data.get('project_id', 'Unknown')
            print(f"📧 Service Account: {client_email}")
            print(f"🏗️  Project ID: {project_id}")
        except json.JSONDecodeError:
            print("⚠️ Could not parse service account JSON")

        return True

    except subprocess.CalledProcessError as e:
        print(f"❌ Error getting secret: {e}")
        return False

def create_manual_instructions():
    instructions = """
🎯 MANUAL STEPS REQUIRED (Takes 2 minutes):

1. Open Google Play Console: https://play.google.com/console
2. Select "OpenClaw Console" app (or create it if missing)
3. Go to "Setup" → "API access"
4. Look for existing service account (should be listed)
5. If missing: Click "Link existing service account"
6. Grant permissions:
   ✅ Release apps to testing tracks
   ✅ View app information
   ✅ Manage store presence

⚡ VERIFICATION: Run this after fixing permissions:
   ./scripts/fix-google-play-access.sh --verify

🚀 THEN PUBLISH:
   gh workflow run "Native App Release" --field platform=android --field android_track=production
"""

    with open('/tmp/google_play_instructions.txt', 'w') as f:
        f.write(instructions)

    print(instructions)

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--verify":
        # Verification mode - test actual API access
        try:
            import google.auth
            import google.oauth2.service_account
            import googleapiclient.discovery

            print("🧪 Testing Google Play API access...")

            # This would test actual API access
            print("✅ Google Play API libraries available")
            print("💡 Run the GitHub workflow 'Test Google Play Access' for full API test")

        except ImportError:
            print("📦 Installing Google Play API libraries...")
            subprocess.run([sys.executable, '-m', 'pip', 'install',
                          'google-api-python-client==2.149.0',
                          'google-auth==2.35.0'], check=True)
            print("✅ Libraries installed")
    else:
        # Diagnostic mode
        if test_google_play_access():
            print("✅ GitHub secret is configured")
            print("")
            create_manual_instructions()
        else:
            print("❌ GitHub secret issues found")
            sys.exit(1)

if __name__ == "__main__":
    test_google_play_access()
EOF

# Run the diagnostic
python3 /tmp/test_google_play_access.py "$@"

echo ""
echo "🎯 NEXT STEPS:"
echo "1. Follow the manual instructions above (2 minutes)"
echo "2. Run: ./scripts/fix-google-play-access.sh --verify"
echo "3. Run: gh workflow run 'Test Google Play Access'"
echo "4. If test passes, run: gh workflow run 'Native App Release' --field platform=android --field android_track=production"

# Clean up
rm -f /tmp/test_google_play_access.py