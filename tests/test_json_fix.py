import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
from server.game_logic import process_command_logic
from server.models import CommandRequest
import json
import httpx

# Mock Redis
@pytest.fixture
def mock_redis():
    mock_r = MagicMock()
    # Default behavior for redis
    mock_r.hgetall.return_value = {}
    mock_r.get.return_value = None
    mock_r.hget.return_value = "0"

    with patch("server.database.r", new=mock_r), \
         patch("server.game_logic.r", new=mock_r):
        yield mock_r

# Mock VLLM vars
@pytest.fixture
def mock_vllm_config():
    with patch('server.game_logic.USE_MOCK_LLM', False), \
         patch('server.game_logic.VLLM_API_URL', 'http://test-llm/v1/chat/completions'):
        yield

@pytest.mark.asyncio
async def test_process_command_clean_json(mock_redis, mock_vllm_config):
    """Test standard clean JSON response."""
    response_content = json.dumps({"updates": {"shields": 50}, "response": "Shields raised."})

    mock_response = MagicMock()
    mock_response.json.return_value = {
        'choices': [{'message': {'content': response_content}}]
    }

    with patch('server.game_logic.httpx.AsyncClient.post', new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response

        req = CommandRequest(text="raise shields", user_id="test_user")
        result = await process_command_logic(req)

        assert result["response"] == "Shields raised."
        assert result["updates"]["shields"] == 50

@pytest.mark.asyncio
async def test_process_command_wrapped_json(mock_redis, mock_vllm_config):
    """Test JSON wrapped in markdown code blocks."""
    response_content = '```json\n{"updates": {}, "response": "Wrapped JSON."}\n```'

    mock_response = MagicMock()
    mock_response.json.return_value = {
        'choices': [{'message': {'content': response_content}}]
    }

    with patch('server.game_logic.httpx.AsyncClient.post', new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response

        req = CommandRequest(text="test", user_id="test_user")
        result = await process_command_logic(req)

        assert result["response"] == "Wrapped JSON."

@pytest.mark.asyncio
async def test_process_command_mixed_content(mock_redis, mock_vllm_config):
    """Test JSON mixed with other text."""
    response_content = 'Here is the response:\n{"updates": {}, "response": "Mixed content."}\nHope that helps.'

    mock_response = MagicMock()
    mock_response.json.return_value = {
        'choices': [{'message': {'content': response_content}}]
    }

    with patch('server.game_logic.httpx.AsyncClient.post', new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response

        req = CommandRequest(text="test", user_id="test_user")
        result = await process_command_logic(req)

        assert result["response"] == "Mixed content."

@pytest.mark.asyncio
async def test_process_command_plain_text(mock_redis, mock_vllm_config):
    """Test plain text fallback."""
    response_content = "I am not JSON but I am a valid response."

    mock_response = MagicMock()
    mock_response.json.return_value = {
        'choices': [{'message': {'content': response_content}}]
    }

    with patch('server.game_logic.httpx.AsyncClient.post', new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response

        req = CommandRequest(text="test", user_id="test_user")
        result = await process_command_logic(req)

        # Should fallback to using the text as response
        assert result["response"] == response_content
        assert result["updates"] == {}

@pytest.mark.asyncio
async def test_process_command_empty_string(mock_redis, mock_vllm_config):
    """Test empty string fallback."""
    response_content = ""

    mock_response = MagicMock()
    mock_response.json.return_value = {
        'choices': [{'message': {'content': response_content}}]
    }

    with patch('server.game_logic.httpx.AsyncClient.post', new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response

        req = CommandRequest(text="test", user_id="test_user")
        result = await process_command_logic(req)

        # Fallback to empty string cleaned -> ""
        assert result["response"] == ""
        assert result["updates"] == {}

@pytest.mark.asyncio
async def test_process_command_malformed_json_fallback(mock_redis, mock_vllm_config):
    """Test malformed JSON string uses fallback."""
    # Missing closing brace
    response_content = '{"updates": {}, "response": "Cut off...'

    mock_response = MagicMock()
    mock_response.json.return_value = {
        'choices': [{'message': {'content': response_content}}]
    }

    with patch('server.game_logic.httpx.AsyncClient.post', new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response

        req = CommandRequest(text="test", user_id="test_user")
        result = await process_command_logic(req)

        # Should treat the malformed string as the response text
        assert result["response"] == response_content
