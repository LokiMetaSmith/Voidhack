import logging
import fnmatch
import redis

class MockRedis:
    def __init__(self):
        self.store = {} # Unified storage {key: (type, value)}
        # types: 'string', 'hash', 'zset'

    def _check_type(self, name, expected_type):
        if name not in self.store:
            return True # New key
        if self.store[name][0] != expected_type:
            raise redis.ResponseError(f"WRONGTYPE Operation against a key holding the wrong kind of value")
        return True

    def get(self, name):
        if name in self.store:
            self._check_type(name, 'string')
            return self.store[name][1]
        return None

    def set(self, name, value, ex=None):
        # set overwrites any existing key regardless of type in real Redis?
        # Actually yes, SET overwrites.
        self.store[name] = ('string', str(value))
        return True

    def exists(self, *names):
        count = 0
        for name in names:
            if name in self.store:
                count += 1
        return count

    def hset(self, name, key=None, value=None, mapping=None):
        self._check_type(name, 'hash')

        if name not in self.store:
            self.store[name] = ('hash', {})

        hash_data = self.store[name][1]

        if mapping:
            hash_data.update({k: str(v) for k, v in mapping.items()})
        if key is not None and value is not None:
            hash_data[key] = str(value)
        return 1

    def hget(self, name, key):
        if name in self.store:
            self._check_type(name, 'hash')
            return self.store[name][1].get(key)
        return None

    def hgetall(self, name):
        if name in self.store:
            self._check_type(name, 'hash')
            return self.store[name][1].copy()
        return {}

    def hincrby(self, name, key, amount=1):
        self._check_type(name, 'hash')

        if name not in self.store:
            self.store[name] = ('hash', {})

        hash_data = self.store[name][1]
        current = int(hash_data.get(key, 0))
        new_val = current + amount
        hash_data[key] = str(new_val)
        return new_val

    def zadd(self, name, mapping):
        self._check_type(name, 'zset')

        if name not in self.store:
            self.store[name] = ('zset', {})

        zset_data = self.store[name][1]
        for member, score in mapping.items():
            zset_data[member] = score
        return len(mapping)

    def zrevrange(self, name, start, end, withscores=False):
        if name not in self.store:
            return []

        self._check_type(name, 'zset')

        zset_data = self.store[name][1]
        # Sort by score descending
        items = sorted(zset_data.items(), key=lambda x: x[1], reverse=True)

        # Handle Redis slice behavior including negative indices
        # Redis uses inclusive end. Python slice is exclusive end.

        # Adjust start
        if start < 0:
            start = len(items) + start
        if start < 0: start = 0 # clamped

        # Adjust end
        # In Redis, end is inclusive.
        # If end is -1, it means the last element.
        if end < 0:
            end = len(items) + end

        # Python slice needs end + 1
        slice_end = end + 1

        sliced = items[start : slice_end]

        if withscores:
            return sliced
        return [x[0] for x in sliced]

    def delete(self, *names):
        count = 0
        for name in names:
            if name in self.store:
                del self.store[name]
                count += 1
        return count

    def flushall(self):
        self.store = {}
        return True

    def keys(self, pattern):
        return [k for k in self.store.keys() if fnmatch.fnmatch(k, pattern)]

    def pipeline(self):
        return MockPipeline(self)

    def ping(self):
        return True

class MockPipeline:
    def __init__(self, redis_instance):
        self.redis = redis_instance
        self.commands = []

    def set(self, *args, **kwargs):
        self.commands.append((self.redis.set, args, kwargs))
        return self

    def hset(self, *args, **kwargs):
        self.commands.append((self.redis.hset, args, kwargs))
        return self

    def hgetall(self, *args, **kwargs):
        self.commands.append((self.redis.hgetall, args, kwargs))
        return self

    def hincrby(self, *args, **kwargs):
        self.commands.append((self.redis.hincrby, args, kwargs))
        return self

    def zadd(self, *args, **kwargs):
        self.commands.append((self.redis.zadd, args, kwargs))
        return self

    def execute(self):
        results = []
        for func, args, kwargs in self.commands:
            results.append(func(*args, **kwargs))
        self.commands = []
        return results
