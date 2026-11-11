import pytest
import httpx
from server import http_client

@pytest.mark.asyncio
async def test_get_client_singleton():
    http_client._client = None

    client1 = http_client.get_client()
    assert isinstance(client1, httpx.AsyncClient)

    client2 = http_client.get_client()
    assert client1 is client2

    await http_client.close_client()

@pytest.mark.asyncio
async def test_close_client():
    http_client._client = None

    client = http_client.get_client()
    assert http_client._client is not None
    assert not client.is_closed

    await http_client.close_client()

    assert http_client._client is None
    assert client.is_closed
