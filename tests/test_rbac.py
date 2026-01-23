import pytest
from unittest.mock import MagicMock, patch
from server.game_logic import process_command_logic
from server.models import CommandRequest

@pytest.fixture
def mock_redis_fixture():
    mock_r = MagicMock()
    # Default behaviors
    mock_r.hgetall.return_value = {}
    mock_r.hget.return_value = None
    mock_r.get.return_value = None
    mock_r.keys.return_value = []

    with patch("server.database.r", new=mock_r), \
         patch("server.game_logic.r", new=mock_r):
        yield mock_r

@pytest.mark.asyncio
async def test_authorize_session_insufficient_rank(mock_redis_fixture):
    # User is rank 2 (Lieutenant)
    user_id = "user_lt"

    def hget_side_effect(key, field):
        if key == f"user:{user_id}" and field == "rank_level":
            return "2"
        return None
    mock_redis_fixture.hget.side_effect = hget_side_effect

    req = CommandRequest(text="authorize session 1234", user_id=user_id)
    result = await process_command_logic(req)

    assert "Access Denied" in result["response"]
    assert "Authorization level insufficient" in result["response"]

@pytest.mark.asyncio
async def test_authorize_session_sufficient_rank(mock_redis_fixture):
    # User is rank 3 (Commander)
    user_id = "user_cmdr"
    session_code = "1234"
    initiating_user_id = "user_cadet"

    # Mock Redis to simulate an active auth session
    mock_redis_fixture.keys.return_value = [f"auth_session:{initiating_user_id}"]

    def get_side_effect(key):
        if key == f"auth_session:{initiating_user_id}":
            return session_code
        return None
    mock_redis_fixture.get.side_effect = get_side_effect

    def hget_side_effect(key, field):
        if key == f"user:{user_id}" and field == "rank_level":
            return "3"
        if key == f"user:{user_id}" and field == "name":
            return "Commander Riker"
        if key == f"user:{initiating_user_id}" and field == "name":
            return "Cadet Crusher"
        return None
    mock_redis_fixture.hget.side_effect = hget_side_effect

    req = CommandRequest(text=f"authorize session {session_code}", user_id=user_id)
    result = await process_command_logic(req)

    assert "Session 1234 initiated by Cadet Crusher has been authorized" in result["response"]
    # Verify session key deletion
    mock_redis_fixture.delete.assert_called_with(f"auth_session:{initiating_user_id}")
