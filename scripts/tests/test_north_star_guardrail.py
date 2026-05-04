import unittest
from unittest.mock import Mock, patch

from scripts import north_star_guardrail


class NorthStarPostHogQueryTests(unittest.TestCase):
    def test_query_counts_distinct_ids_for_all_approval_event_names(self) -> None:
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {"results": [[3]]}

        with patch.object(north_star_guardrail.requests, "post", return_value=response) as post:
            result = north_star_guardrail._query_posthog_daa_1d("phx_personal", "123")

        self.assertEqual(result, 3)
        payload = post.call_args.kwargs["json"]
        query = payload["query"]["query"]
        self.assertIn("count(DISTINCT distinct_id)", query)
        self.assertIn("'first_approval'", query)
        self.assertIn("'approval_completed'", query)
        self.assertIn("'approval_submitted'", query)
        self.assertIn("'approval_approved'", query)
        self.assertIn("'approval_action_taken'", query)


if __name__ == "__main__":
    unittest.main()
