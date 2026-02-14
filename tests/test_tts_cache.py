import pytest
import hashlib
import base64
import os
from unittest.mock import AsyncMock, MagicMock, patch
from server.models import CommandRequest

# Import main (it might have side effects, but we will patch around them)
import main

@pytest.mark.asyncio
async def test_tts_caching():
    # Mock Redis client
    mock_redis = MagicMock()
    mock_redis.get.return_value = None
    mock_redis.set.return_value = True

    # Mock HTTPX client
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.raise_for_status = MagicMock()

    # Create an async iterator for aiter_bytes
    async def async_iter():
        yield b"chunk1"
        yield b"chunk2"

    mock_response.aiter_bytes = async_iter

    mock_client = AsyncMock()
    mock_client.build_request.return_value = "request"
    mock_client.send.return_value = mock_response
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None

    # Patch dependencies
    # We patch 'main.r' because speak_endpoint uses 'r' from the global namespace of main module
    # We patch 'main.TTS_ENGINE' to control the engine logic
    with patch("main.r", mock_redis), \
         patch("httpx.AsyncClient", return_value=mock_client), \
         patch("main.TTS_ENGINE", "kokoro"):

        # --- Test Case 1: Cache Miss ---
        text = "Hello Computer"
        request = CommandRequest(text=text, user_id="test_user")

        # Calculate expected cache key
        key_hash = hashlib.md5(text.encode()).hexdigest()
        cache_key = f"tts_cache:kokoro:{key_hash}"

        # Call the endpoint
        response = await main.speak_endpoint(request)

        # Consume the streaming response to trigger the caching logic
        content = b""
        async for chunk in response.body_iterator:
            content += chunk

        assert content == b"chunk1chunk2"

        # Verify Redis SET was called with correct key and value
        expected_b64 = base64.b64encode(b"chunk1chunk2").decode('utf-8')
        mock_redis.set.assert_called_with(cache_key, expected_b64, ex=3600)

        # --- Test Case 2: Cache Hit ---
        # Update mock_redis to return the cached value
        mock_redis.get.return_value = expected_b64

        # Reset mock_client to ensure it's not called again
        mock_client.send.reset_mock()

        # Call the endpoint again
        response_hit = await main.speak_endpoint(request)

        # Verify response content
        content_hit = b""
        async for chunk in response_hit.body_iterator:
            content_hit += chunk

        assert content_hit == b"chunk1chunk2"

        # Verify HTTPX was NOT called
        mock_client.send.assert_not_called()
