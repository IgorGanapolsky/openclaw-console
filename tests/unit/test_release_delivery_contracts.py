import pathlib
import unittest


REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
FASTFILE = (REPO_ROOT / "ios/OpenClawConsole/fastlane/Fastfile").read_text()
INTERNAL_WORKFLOW = (REPO_ROOT / ".github/workflows/internal-distribution.yml").read_text()
NATIVE_RELEASE_WORKFLOW = (REPO_ROOT / ".github/workflows/native-release.yml").read_text()
SETUP_SCRIPT = (REPO_ROOT / "scripts/setup-secrets.sh").read_text()


class ReleaseDeliveryContractsTest(unittest.TestCase):
    def test_fastfile_requires_explicit_testflight_groups(self):
        self.assertIn("def required_testflight_groups!", FASTFILE)
        self.assertIn('TESTFLIGHT_GROUPS must list at least one internal TestFlight group', FASTFILE)
        self.assertIn("groups: testflight_groups", FASTFILE)

    def test_fastfile_waits_for_processing_before_distribution(self):
        self.assertIn("skip_waiting_for_build_processing: false", FASTFILE)
        self.assertNotIn("skip_waiting_for_build_processing: true", FASTFILE)

    def test_internal_distribution_requires_testflight_groups_secret(self):
        self.assertIn("TESTFLIGHT_GROUPS: ${{ secrets.TESTFLIGHT_GROUPS }}", INTERNAL_WORKFLOW)
        self.assertIn("MATCH_GIT_BASIC_AUTHORIZATION APPSTORE_PRIVATE_KEY APPSTORE_KEY_ID APPSTORE_ISSUER_ID ADMIN_TOKEN APPLE_TEAM_ID TESTFLIGHT_GROUPS", INTERNAL_WORKFLOW.replace("\n", " "))

    def test_internal_distribution_supports_firebase_audience_from_vars_or_secrets(self):
        self.assertIn("FIREBASE_INTERNAL_TESTERS_VAR", INTERNAL_WORKFLOW)
        self.assertIn("FIREBASE_INTERNAL_TESTERS_SECRET", INTERNAL_WORKFLOW)
        self.assertIn("FIREBASE_INTERNAL_GROUPS_VAR", INTERNAL_WORKFLOW)
        self.assertIn("FIREBASE_INTERNAL_GROUPS_SECRET", INTERNAL_WORKFLOW)
        self.assertIn("FIREBASE_REQUIRED_TESTER_EMAIL_VAR", INTERNAL_WORKFLOW)
        self.assertIn("FIREBASE_REQUIRED_TESTER_EMAIL_SECRET", INTERNAL_WORKFLOW)
        self.assertIn("No Firebase tester audience configured", INTERNAL_WORKFLOW)

    def test_internal_distribution_verifies_required_firebase_tester(self):
        self.assertIn("Required Firebase tester is not registered for this app", INTERNAL_WORKFLOW)
        self.assertIn("firebase appdistribution:testers:list", INTERNAL_WORKFLOW)

    def test_native_release_uses_same_testflight_audience_contract(self):
        self.assertIn("TESTFLIGHT_GROUPS: ${{ secrets.TESTFLIGHT_GROUPS }}", NATIVE_RELEASE_WORKFLOW)
        self.assertIn("APPSTORE_PRIVATE_KEY APPSTORE_KEY_ID APPSTORE_ISSUER_ID APPLE_TEAM_ID MATCH_GIT_URL MATCH_PASSWORD MATCH_GIT_BASIC_AUTHORIZATION ADMIN_TOKEN TESTFLIGHT_GROUPS", NATIVE_RELEASE_WORKFLOW.replace("\n", " "))

    def test_setup_script_provisions_testflight_and_required_firebase_audience(self):
        self.assertIn("TestFlight internal groups", SETUP_SCRIPT)
        self.assertIn("gh secret set TESTFLIGHT_GROUPS", SETUP_SCRIPT)
        self.assertIn("Firebase required tester email for verification", SETUP_SCRIPT)
        self.assertIn("gh secret set FIREBASE_REQUIRED_TESTER_EMAIL", SETUP_SCRIPT)


if __name__ == "__main__":
    unittest.main()
