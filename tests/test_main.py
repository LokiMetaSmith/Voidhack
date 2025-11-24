from fastapi.testclient import TestClient
from main import app, init_db
import os

client = TestClient(app)

def setup_module(module):
    # Ensure a fresh DB for tests
    if os.path.exists("ship_state.db"):
        os.remove("ship_state.db")
    init_db()

def test_status():
    response = client.get("/status")
    assert response.status_code == 200
    data = response.json()
    assert "systems" in data
    assert "neural_net" in data["systems"]

def test_register_user():
    response = client.post("/user", json={"user_id": "test_uuid", "name": "Tester"})
    assert response.status_code == 200
    assert response.json()["status"] == "registered"
    assert response.json()["rank"] == "Ensign"

def test_fast_path_command():
    # Test Shields Up (No LLM needed)
    response = client.post("/command", json={"text": "shields up", "user_id": "test_uuid"})
    assert response.status_code == 200
    data = response.json()
    assert data["updates"]["shields"] == 100
    assert "raised" in data["response"]

def test_easter_egg_destruct():
    response = client.post("/command", json={"text": "000-destruct-0", "user_id": "test_uuid"})
    assert response.status_code == 200
    data = response.json()
    assert data["updates"]["shields"] == 0
    assert "just kidding" in data["response"]

def test_easter_egg_joshua():
    response = client.post("/command", json={"text": "Hello Joshua", "user_id": "test_uuid"})
    assert response.status_code == 200
    data = response.json()
    assert "winning move" in data["response"]
