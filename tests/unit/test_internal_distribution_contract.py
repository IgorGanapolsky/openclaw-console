import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = (ROOT / ".github/workflows/internal-distribution.yml").read_text()
SETUP_SCRIPT = (ROOT / "scripts/setup-secrets.sh").read_text()
FASTFILE = (ROOT / "ios/OpenClawConsole/fastlane/Fastfile").read_text()


class InternalDistributionContractTest(unittest.TestCase):
    def test_workflow_requires_testflight_group_and_required_tester(self):
        self.assertIn("TESTFLIGHT_GROUPS", WORKFLOW)
        self.assertIn("TESTFLIGHT_REQUIRED_TESTER_EMAIL", WORKFLOW)
        self.assertIn("Verify TestFlight build delivery to internal beta groups", WORKFLOW)

    def test_setup_script_collects_distribution_proof_inputs(self):
        self.assertIn("FIREBASE_REQUIRED_TESTER_EMAIL", SETUP_SCRIPT)
        self.assertIn("TESTFLIGHT_GROUPS", SETUP_SCRIPT)
        self.assertIn("TESTFLIGHT_REQUIRED_TESTER_EMAIL", SETUP_SCRIPT)

    def test_fastfile_persists_metadata_beside_lane_and_requires_groups(self):
        self.assertIn('File.join(__dir__, "testflight_build.json")', FASTFILE)
        self.assertIn('TESTFLIGHT_GROUPS is required for internal TestFlight distribution', FASTFILE)


if __name__ == "__main__":
    unittest.main()
