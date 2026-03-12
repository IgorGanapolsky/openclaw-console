from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = (ROOT / ".github/workflows/internal-distribution.yml").read_text()
FASTFILE = (ROOT / "ios/OpenClawConsole/fastlane/Fastfile").read_text()
SETUP_SCRIPT = (ROOT / "scripts/setup-secrets.sh").read_text()


class InternalDistributionContractTests(unittest.TestCase):
    def test_fastfile_emits_build_outputs_and_waits_for_processing(self):
        self.assertIn('emit_github_output("ios_marketing_version"', FASTFILE)
        self.assertIn('emit_github_output("ios_build_number"', FASTFILE)
        self.assertNotIn("skip_waiting_for_build_processing: true", FASTFILE)
        self.assertIn('wait_processing_timeout_duration', FASTFILE)

    def test_workflow_consumes_testflight_audience_and_runs_verifier_script(self):
        for token in (
            "TESTFLIGHT_GROUPS_SECRET",
            "TESTFLIGHT_TESTERS_SECRET",
            "TESTFLIGHT_REQUIRED_TESTER_EMAIL_SECRET",
            "scripts/testflight-internal-distribute.sh",
            "id: testflight_upload",
            "IOS_MARKETING_VERSION: ${{ steps.testflight_upload.outputs.ios_marketing_version }}",
            "IOS_BUILD_NUMBER: ${{ steps.testflight_upload.outputs.ios_build_number }}",
        ):
            self.assertIn(token, WORKFLOW)

    def test_workflow_supports_firebase_secret_and_variable_fallbacks(self):
        for token in (
            "FIREBASE_INTERNAL_TESTERS_SECRET",
            "FIREBASE_INTERNAL_GROUPS_SECRET",
            "FIREBASE_REQUIRED_TESTER_EMAIL_SECRET",
            'Firebase distribution audience is empty',
            'Required Firebase tester missing from App Distribution',
        ):
            self.assertIn(token, WORKFLOW)

    def test_setup_script_writes_audience_to_the_correct_github_storage(self):
        for token in (
            'gh secret set FIREBASE_SERVICE_ACCOUNT_JSON',
            'gh variable set FIREBASE_INTERNAL_TESTERS',
            'gh variable set FIREBASE_INTERNAL_GROUPS',
            'gh variable set FIREBASE_REQUIRED_TESTER_EMAIL',
            'gh secret set TESTFLIGHT_GROUPS',
            'gh secret set TESTFLIGHT_TESTERS',
            'gh secret set TESTFLIGHT_REQUIRED_TESTER_EMAIL',
        ):
            self.assertIn(token, SETUP_SCRIPT)


if __name__ == "__main__":
    unittest.main()
