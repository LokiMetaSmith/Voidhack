from fastapi.testclient import TestClient
from main import app, init_db
import os
import sqlite3
import base64

client = TestClient(app)

def setup_module(module):
    # Ensure a fresh DB for tests
    if os.path.exists("ship_state.db"):
        os.remove("ship_state.db")
    init_db()

def test_location_update():
    # 1. Register User
    uid = "loc_test_user"
    client.post("/user", json={"user_id": uid, "name": "Loc Tester"})

    # 2. Update Location (Valid)
    token = base64.b64encode(b"Engineering").decode('utf-8')
    response = client.post("/location", json={"user_id": uid, "token": token})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["location"] == "Engineering"

    # 3. Verify DB update
    conn = sqlite3.connect("ship_state.db")
    loc = conn.execute("SELECT current_location FROM users WHERE user_id=?", (uid,)).fetchone()[0]
    conn.close()
    assert loc == "Engineering"

def test_location_update_invalid():
    uid = "loc_test_user"
    # Invalid Token (Not Base64)
    response = client.post("/location", json={"user_id": uid, "token": "not_base64"})
    assert response.json()["status"] == "error"

    # Invalid Location (Valid Base64, but not in list)
    token = base64.b64encode(b"McDonalds").decode('utf-8')
    response = client.post("/location", json={"user_id": uid, "token": token})
    assert response.json()["status"] == "error"
