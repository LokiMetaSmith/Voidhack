import httpx

_client: httpx.AsyncClient | None = None

def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient()
    return _client

async def close_client():
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
