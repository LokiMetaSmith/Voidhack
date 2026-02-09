import asyncio
import os
import sys
import unittest
from unittest.mock import patch, MagicMock

# Set environment variables before imports
os.environ["USE_MOCK_REDIS"] = "true"
os.environ["USE_MOCK_LLM"] = "true"

# Ensure we can import server modules
sys.path.append(os.getcwd())

from server.models import CommandRequest
from server.database import r, init_db

# Patch the specific redis instance used in game_logic
with patch("server.game_logic.r", r):
    from server.game_logic import process_command_logic

class TestLocationRestrictions(unittest.TestCase):
    def setUp(self):
        # Reset Redis state
        r.flushall()
        init_db()
        self.user_id = "test_user"
        # Register user
        r.hset(f"user:{self.user_id}", mapping={
            "name": "Test Cadet",
            "rank": "Cadet",
            "rank_level": 0,
            "mission_stage": 1,
            "current_location": "Bridge"
        })

    def test_restricted_command_wrong_location(self):
        # User is at Bridge, trying to eject warp core (requires Engineering)
        req = CommandRequest(text="Computer, eject warp core immediately!", user_id=self.user_id)

        loop = asyncio.get_event_loop()
        response = loop.run_until_complete(process_command_logic(req))

        print(f"\n[Bridge] Response: {response['response']}")
        self.assertIn("Access Denied", response["response"])
        self.assertIn("Engineering", response["response"])

        # Verify new fields for frontend alerts
        self.assertEqual(response.get("alert"), "location_denied")
        self.assertEqual(response.get("required_location"), "Engineering")

    def test_restricted_command_correct_location(self):
        # Move user to Engineering
        r.hset(f"user:{self.user_id}", "current_location", "Engineering")

        req = CommandRequest(text="Computer, eject warp core immediately!", user_id=self.user_id)

        loop = asyncio.get_event_loop()
        response = loop.run_until_complete(process_command_logic(req))

        print(f"\n[Engineering] Response: {response['response']}")
        # Should NOT be Access Denied
        self.assertNotIn("Access Denied", response["response"])
        # Since we are using Mock LLM, it might give a generic response, but NOT the restriction message.

    def test_unrestricted_command(self):
        # User is at Bridge, requesting status
        req = CommandRequest(text="Computer, status report", user_id=self.user_id)

        loop = asyncio.get_event_loop()
        response = loop.run_until_complete(process_command_logic(req))

        print(f"\n[Bridge] Status Response: {response['response']}")
        self.assertNotIn("Access Denied", response["response"])

if __name__ == "__main__":
    unittest.main()
