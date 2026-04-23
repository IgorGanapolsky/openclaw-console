#!/usr/bin/env python3
"""
Automated Apple Developer certificate cleanup via App Store Connect API
"""

import os
import requests
import jwt
import time
from datetime import datetime, timedelta, timezone

def create_jwt_token():
    """Create JWT token for App Store Connect API"""
    # Use environment variables for credentials
    key_id = os.getenv("APPSTORE_KEY_ID")
    issuer_id = os.getenv("APPSTORE_ISSUER_ID")
    private_key = os.getenv("APPSTORE_PRIVATE_KEY")

    if not all([key_id, issuer_id, private_key]):
        print("❌ Missing required environment variables:")
        print("   APPSTORE_KEY_ID, APPSTORE_ISSUER_ID, APPSTORE_PRIVATE_KEY")
        print("   Source them from Random-Timer/.env")
        return None

    # Create JWT
    now = datetime.now(timezone.utc)
    payload = {
        'iss': issuer_id,
        'aud': 'appstoreconnect-v1',
        'iat': int(now.timestamp()),
        'exp': int((now + timedelta(minutes=20)).timestamp())
    }

    token = jwt.encode(payload, private_key, algorithm='ES256', headers={'kid': key_id})
    return token

def list_certificates(token):
    """List all certificates"""
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }

    response = requests.get(
        'https://api.appstoreconnect.apple.com/v1/certificates',
        headers=headers
    )

    if response.status_code == 200:
        return response.json()
    else:
        print(f"❌ Failed to list certificates: {response.status_code}")
        print(f"Response: {response.text}")
        return None

def delete_certificate(token, cert_id):
    """Delete a specific certificate"""
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }

    response = requests.delete(
        f'https://api.appstoreconnect.apple.com/v1/certificates/{cert_id}',
        headers=headers
    )

    return response.status_code == 204

def main():
    print("🔧 Starting automated certificate cleanup...")

    # Create API token
    token = create_jwt_token()
    if not token:
        return False

    # List certificates
    print("📋 Fetching certificates...")
    cert_data = list_certificates(token)
    if not cert_data:
        return False

    certificates = cert_data.get('data', [])
    print(f"📊 Found {len(certificates)} certificates")

    # Show all certificate types first
    print("📋 Certificate types found:")
    cert_types = {}
    for cert in certificates:
        cert_type = cert['attributes']['certificateType']
        cert_name = cert['attributes']['name']
        if cert_type not in cert_types:
            cert_types[cert_type] = []
        cert_types[cert_type].append(cert_name)

    for cert_type, names in cert_types.items():
        print(f"   {cert_type}: {len(names)} certificates")
        for name in names[:3]:  # Show first 3 names
            print(f"     - {name}")
        if len(names) > 3:
            print(f"     ... and {len(names) - 3} more")

    # Filter iOS certificates (use the actual certificate types we found)
    ios_certs = []
    for cert in certificates:
        cert_type = cert['attributes']['certificateType']
        if cert_type in ['DISTRIBUTION', 'DEVELOPMENT']:
            ios_certs.append(cert)

    print(f"🎯 Found {len(ios_certs)} iOS certificates")

    if len(ios_certs) <= 5:
        print("✅ Certificate count is acceptable, no cleanup needed")
        return True

    # Sort by creation date (keep newest)
    ios_certs.sort(key=lambda x: x['attributes']['expirationDate'], reverse=True)

    # Delete oldest certificates (keep 3 newest)
    certs_to_delete = ios_certs[3:]

    deleted_count = 0
    for cert in certs_to_delete:
        cert_id = cert['id']
        cert_name = cert['attributes']['name']
        cert_type = cert['attributes']['certificateType']

        print(f"🗑️  Deleting: {cert_name} ({cert_type})")

        if delete_certificate(token, cert_id):
            deleted_count += 1
            print(f"✅ Deleted certificate: {cert_name}")
        else:
            print(f"❌ Failed to delete certificate: {cert_name}")

    print(f"🎯 Cleanup complete: deleted {deleted_count} certificates")
    return deleted_count > 0

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)