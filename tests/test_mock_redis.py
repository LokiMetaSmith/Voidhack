import pytest
from mock_redis import MockRedis

def test_mock_redis_get_set():
    r = MockRedis()
    assert r.set("foo", "bar") == True
    assert r.get("foo") == "bar"
    assert r.get("baz") is None

def test_mock_redis_hset_hget():
    r = MockRedis()
    assert r.hset("user:1", mapping={"name": "Jules", "rank": "Cadet"}) == 1
    assert r.hget("user:1", "name") == "Jules"
    assert r.hget("user:1", "rank") == "Cadet"
    assert r.hget("user:1", "unknown") is None
    assert r.hgetall("user:1") == {"name": "Jules", "rank": "Cadet"}

def test_mock_redis_hincrby():
    r = MockRedis()
    r.hset("stats", "count", 10)
    assert r.hincrby("stats", "count", 5) == 15
    assert r.hget("stats", "count") == "15"

def test_mock_redis_zadd_zrevrange():
    r = MockRedis()
    r.zadd("leaderboard", {"alice": 100, "bob": 200, "charlie": 150})

    # Test order (descending)
    top_players = r.zrevrange("leaderboard", 0, -1)
    assert top_players == ["bob", "charlie", "alice"]

    # Test slice
    top_2 = r.zrevrange("leaderboard", 0, 1)
    assert top_2 == ["bob", "charlie"]

    # Test with scores
    top_with_scores = r.zrevrange("leaderboard", 0, -1, withscores=True)
    assert top_with_scores == [("bob", 200), ("charlie", 150), ("alice", 100)]

def test_mock_redis_pipeline():
    r = MockRedis()
    pipe = r.pipeline()
    pipe.set("p1", "v1")
    pipe.hset("p2", "f1", "v2")
    results = pipe.execute()

    assert results == [True, 1]
    assert r.get("p1") == "v1"
    assert r.hget("p2", "f1") == "v2"

def test_mock_redis_delete():
    r = MockRedis()
    r.set("foo", "bar")
    assert r.exists("foo") == 1
    r.delete("foo")
    assert r.exists("foo") == 0
