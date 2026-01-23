import pytest
import asyncio
from unittest.mock import MagicMock, patch
from server.game_logic import process_command_logic
from server.models import CommandRequest
from server.database import get_user_rank_data

# Helper to mock Redis
@pytest.fixture
def mock_redis_fixture():
    mock_r = MagicMock()
    # Default behaviors
    mock_r.hgetall.return_value = {}
    mock_r.hget.return_value = None
    mock_r.get.return_value = None

    # Patch in both locations where 'r' is used
    with patch("server.database.r", new=mock_r), \
         patch("server.game_logic.r", new=mock_r):
        yield mock_r

@pytest.fixture
def mock_httpx_client():
    # Patch httpx where it is used
    with patch("server.game_logic.httpx.AsyncClient") as mock_client:
        yield mock_client

@pytest.mark.asyncio
async def test_process_command_turbo_mode_status(mock_redis_fixture):
    # Test "status" command
    req = CommandRequest(text="status report", user_id="user123")

    # Setup mock redis return for ship systems
    mock_redis_fixture.hgetall.return_value = {"shields": "100", "warp": "50"}

    result = await process_command_logic(req)

    assert "updates" in result
    assert "response" in result
    assert "All systems nominal" in result["response"]

@pytest.mark.asyncio
async def test_process_command_radiation_leak(mock_redis_fixture):
    # Simulate radiation leak
    mock_redis_fixture.hget.side_effect = lambda name, key: "1" if key == "radiation_leak" else None

    req = CommandRequest(text="warp engage", user_id="user123")
    result = await process_command_logic(req)

    assert "Cannot comply" in result["response"]
    assert "radiation alert" in result["response"]

@pytest.mark.asyncio
async def test_process_command_llm_fallback(mock_redis_fixture, mock_httpx_client):
    # Test LLM path
    req = CommandRequest(text="What is the meaning of life?", user_id="user123")

    # Mock Redis responses
    mock_redis_fixture.hget.return_value = "0"
    mock_redis_fixture.hgetall.return_value = {}
    mock_redis_fixture.get.return_value = None # No cache

    # Mock HTTPX response
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "choices": [{
            "message": {"content": '{"updates": {}, "response": "42"}'}
        }]
    }
    mock_response.status_code = 200

    # Setup async context manager for httpx.AsyncClient
    mock_client_instance = mock_httpx_client.return_value.__aenter__.return_value
    mock_client_instance.post.return_value = mock_response

    result = await process_command_logic(req)

    assert result["response"] == "42"

@pytest.mark.asyncio
async def test_process_command_rank_up(mock_redis_fixture, mock_httpx_client):
    req = CommandRequest(text="mission success", user_id="user123")

    # Mock Redis
    mock_redis_fixture.hget.return_value = "0"
    mock_redis_fixture.hgetall.return_value = {}
    mock_redis_fixture.get.return_value = None
    mock_redis_fixture.get.side_effect = lambda k: "5" if k == "max_rank_level" else None

    # Mock HTTPX response containing the mission_success key
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "choices": [{
            "message": {"content": '{"updates": {}, "response": "Well done.", "mission_success": true}'}
        }]
    }
    mock_client_instance = mock_httpx_client.return_value.__aenter__.return_value
    mock_client_instance.post.return_value = mock_response

    def hget_side_effect(name, key):
        if key == "radiation_leak": return "0"
        if name.startswith("user:") and key == "rank_level": return "0"
        if name.startswith("rank:") and key == "title": return "Ensign"
        return None

    def hgetall_side_effect(name):
        if name.startswith("rank:1"): return {"title": "Ensign"}
        return {}

    mock_redis_fixture.hget.side_effect = hget_side_effect
    mock_redis_fixture.hgetall.side_effect = hgetall_side_effect

    mock_pipeline = MagicMock()
    mock_redis_fixture.pipeline.return_value = mock_pipeline

    result = await process_command_logic(req)

    assert "rank_up" in result["updates"]
    assert result["updates"]["rank_up"] == "Ensign"
