import pytest
from unittest.mock import MagicMock, patch
import httpx
import json
from main import process_command_logic, CommandRequest

@pytest.fixture
def mock_redis_fixture():
    with patch("main.r") as mock_r:
        mock_r.hgetall.return_value = {}
        mock_r.hget.return_value = None
        mock_r.get.return_value = None
        yield mock_r

@pytest.fixture
def mock_httpx_client():
    with patch("httpx.AsyncClient") as mock_client:
        yield mock_client

@pytest.mark.asyncio
async def test_process_command_llm_timeout(mock_redis_fixture, mock_httpx_client):
    req = CommandRequest(text="analyze anomaly", user_id="user1")

    mock_client_instance = mock_httpx_client.return_value.__aenter__.return_value
    mock_client_instance.post.side_effect = httpx.TimeoutException("Timeout")

    result = await process_command_logic(req)
    # New specific message
    assert "Processing delay" in result["response"]
    assert "rerouting power" in result["response"]

@pytest.mark.asyncio
async def test_process_command_llm_json_error(mock_redis_fixture, mock_httpx_client):
    req = CommandRequest(text="analyze anomaly", user_id="user1")

    mock_response = MagicMock()
    # Invalid JSON in content
    mock_response.json.return_value = {
        "choices": [{
            "message": {"content": 'Invalid JSON'}
        }]
    }
    mock_response.status_code = 200

    mock_client_instance = mock_httpx_client.return_value.__aenter__.return_value
    mock_client_instance.post.return_value = mock_response

    result = await process_command_logic(req)
    # New specific message
    assert "Data corruption detected" in result["response"]

@pytest.mark.asyncio
async def test_process_command_llm_http_error(mock_redis_fixture, mock_httpx_client):
    req = CommandRequest(text="analyze anomaly", user_id="user1")

    mock_client_instance = mock_httpx_client.return_value.__aenter__.return_value
    mock_client_instance.post.side_effect = httpx.HTTPStatusError("Error", request=None, response=None)

    result = await process_command_logic(req)
    # New specific message
    assert "Sensor arrays are offline" in result["response"]
