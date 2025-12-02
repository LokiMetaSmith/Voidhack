import logging
import fnmatch

class MockRedis:
    def __init__(self):
        self.store = {} # Unified storage {key: (type, value)}
        # types: 'string', 'hash', 'zset'

    def _check_type(self, name, expected_type):
        if name not in self.store:
            return True # New key
        if self.store[name][0] != expected_type:
            # In real Redis, this raises a WrongType error.
            # For this mock, we'll log a warning and return False (or maybe raise error to be strict?)
            # Raising error is better to catch bugs.
            # But let's just return False for now to simulate "operation failed" or similar,
            # actually Redis raises response error.
            # To keep it simple and robust for the user app, we'll just overwrite or ignore?
            # Redis raises WRONGTYPE.
            # Let's just return False to indicate mismatch for internal logic.
            return False
        return True

    def get(self, name):
        if name in self.store and self.store[name][0] == 'string':
            return self.store[name][1]
        return None

    def set(self, name, value, ex=None):
        self.store[name] = ('string', str(value))
        return True

    def exists(self, *names):
        count = 0
        for name in names:
            if name in self.store:
                count += 1
        return count

    def hset(self, name, key=None, value=None, mapping=None):
        if name in self.store and self.store[name][0] != 'hash':
            return 0 # Wrong type

        if name not in self.store:
            self.store[name] = ('hash', {})

        hash_data = self.store[name][1]

        if mapping:
            hash_data.update({k: str(v) for k, v in mapping.items()})
        if key is not None and value is not None:
            hash_data[key] = str(value)
        return 1

    def hget(self, name, key):
        if name in self.store and self.store[name][0] == 'hash':
            return self.store[name][1].get(key)
        return None

    def hgetall(self, name):
        if name in self.store and self.store[name][0] == 'hash':
            return self.store[name][1].copy()
        return {}

    def hincrby(self, name, key, amount=1):
        if name in self.store and self.store[name][0] != 'hash':
            return 0 # Or raise error

        if name not in self.store:
            self.store[name] = ('hash', {})

        hash_data = self.store[name][1]
        current = int(hash_data.get(key, 0))
        new_val = current + amount
        hash_data[key] = str(new_val)
        return new_val

    def zadd(self, name, mapping):
        if name in self.store and self.store[name][0] != 'zset':
            return 0

        if name not in self.store:
            self.store[name] = ('zset', {})

        zset_data = self.store[name][1]
        for member, score in mapping.items():
            zset_data[member] = score
        return len(mapping)

    def zrevrange(self, name, start, end, withscores=False):
        if name not in self.store or self.store[name][0] != 'zset':
            return []

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
        # But we need to be careful if end was initially negative and resulted in < start?
        # Redis logic:
        # zrevrange key 0 -1 => all items
        # zrevrange key 0 0 => first item

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

    def keys(self, pattern):
        return [k for k in self.store.keys() if fnmatch.fnmatch(k, pattern)]

    def pipeline(self):
        return self

    def execute(self):
        pass

    def ping(self):
        return True
