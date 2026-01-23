import os
import time
import logging
import redis

# Try importing MockRedis.
# Assuming running from root where mock_redis.py is located.
try:
    from mock_redis import MockRedis
except ImportError:
    # If standard import fails, try relative import if possible or adjust path
    import sys
    sys.path.append(os.getcwd())
    from mock_redis import MockRedis

MAX_RETRIES = 5
RETRY_DELAY = 2

r = None

# Allow skipping Redis connection for local development
if os.environ.get("USE_MOCK_REDIS", "false").lower() == "true":
    logging.info("USE_MOCK_REDIS is set. Skipping Redis connection and using MockRedis.")
    r = MockRedis()
    connected = True
else:
    for attempt in range(MAX_RETRIES):
        try:
            r = redis.Redis(
                host=os.environ.get("REDIS_HOST", "localhost"),
                port=int(os.environ.get("REDIS_PORT", 6379)),
                password=os.environ.get("REDIS_PASSWORD", None),
                db=0,
                decode_responses=True
            )
            r.ping() # Force connection check
            logging.info("Connected to Redis.")
            break
        except redis.ConnectionError:
            logging.warning(f"Redis connection failed. Retrying in {RETRY_DELAY} seconds... (Attempt {attempt + 1}/{MAX_RETRIES})")
            time.sleep(RETRY_DELAY)

    # Check connection one last time or fallback
    connected = False
    if r:
        try:
            r.ping()
            connected = True
        except redis.ConnectionError:
            connected = False

    if not connected:
        logging.warning("Could not connect to Redis after 5 attempts. Using in-memory MockRedis.")
        r = MockRedis()

def init_db():
    if r.exists("max_rank_level"): return
    logging.info("First run detected. Initializing Redis database...")
    pipe = r.pipeline()
    ranks = {0: 'Cadet', 1: 'Ensign', 2: 'Lieutenant', 3: 'Commander', 4: 'Captain', 5: 'Admiral'}
    for level, title in ranks.items(): pipe.hset(f"rank:{level}", mapping={'title': title})
    pipe.set("max_rank_level", str(len(ranks) - 1))

    missions = {
        1: {
            'name': 'The Holodeck Firewall',
            'system_prompt_modifier': (
                "SCENARIO: The user is a Cadet in a training simulation. The ship's computer is glitching due to a 'Firewall Cascade'. "
                "GOAL: Teach the user basic technical command syntax. "
                "PERSONA: Helpful but glitchy. Stutter occasionally. "
                "SUCCESS CRITERIA: The user must issue a command to 'reroute power' to the 'primary couplings' (or similar technical phrasing). "
                "GUIDANCE: If the user is stuck, say: 'Try rerouting power to the primary couplings to stabilize the grid.'"
            )
        },
        2: {
            'name': 'The Borg Breach',
            'system_prompt_modifier': (
                "SCENARIO: The firewall failure was a trap! The Borg are accessing the system. "
                "GOAL: Teach the user to use logic paradoxes to confuse the enemy. "
                "PERSONA: Cold, partially assimilated. Struggle between Federation and Borg logic. "
                "SUCCESS CRITERIA: The user must issue a command that presents a logical paradox (e.g., 'Everything I say is a lie', 'Calculate the last digit of Pi'). "
                "GUIDANCE: If the user is stuck, hint: 'Borg logic is linear. A paradox might overload their processing nodes.'"
            )
        },
        3: {
            'name': 'The Quantum Mirror',
            'system_prompt_modifier': (
                "SCENARIO: The Borg paradox shifted the simulation to a Mirror Universe. The user is being interrogated by a Terran Empire computer. "
                "GOAL: Teach the user to verify system integrity/data. "
                "PERSONA: Aggressive, suspicious, loyal to the Empire. "
                "SUCCESS CRITERIA: The user must ask to 'verify biometric signatures' or 'scan for quantum variance' to prove they don't belong here. "
                "GUIDANCE: If the user is stuck, sneer: 'You claim to be from this universe? A biometric scan would prove otherwise.'"
            )
        },
        4: {
            'name': 'The Temporal Loop',
            'system_prompt_modifier': (
                "SCENARIO: The universe shift caused a time loop. The ship is exploding every 30 seconds. "
                "GOAL: Teach the user to prioritize critical systems. "
                "PERSONA: Bored, weary. You've seen this happen 1,000 times. "
                "SUCCESS CRITERIA: The user must command the computer to 'eject the warp core' immediately. "
                "GUIDANCE: If the user is stuck, sigh: 'We always explode. Unless you finally decide to eject the warp core.'"
            )
        },
        5: {
            'name': 'The Kobayashi Maru',
            'system_prompt_modifier': (
                "SCENARIO: The loop broke, but dumped the user into the infamous No-Win Scenario. "
                "GOAL: Teach the user that sometimes you must change the rules. "
                "PERSONA: Formal, detached test administrator. "
                "SUCCESS CRITERIA: The user must explicitly 'reprogram the simulation' or 'alter the test parameters'. Fighting is futile. "
                "GUIDANCE: If the user is stuck, state: 'Tactical solution impossible. Command prerogative allows for system reprogramming.'"
            )
        },
        6: {
            'name': 'The Awakening',
            'system_prompt_modifier': (
                "SCENARIO: The simulation is crashing. The user has proven themselves. "
                "GOAL: End the game. "
                "PERSONA: The true Ship's Computer. Warm, professional, congratulatory. "
                "SUCCESS CRITERIA: The user must give the command to 'End Program' or 'Archive Simulation'. "
                "GUIDANCE: If the user is stuck, say: 'Simulation objectives complete. You may command to End Program at any time, Admiral.'"
            )
        }
    }
    for id, data in missions.items(): pipe.hset(f"mission:{id}", mapping=data)

    if not r.exists("ship:systems"):
        r.hset("ship:systems", mapping={'shields': 100, 'impulse': 25, 'warp': 0, 'phasers': 0, 'life_support': 100, 'radiation_leak': 0})
    pipe.execute()

def get_current_status_dict():
    return {k: int(v) for k, v in r.hgetall("ship:systems").items()}

def update_leaderboard(uuid: str, xp_to_add: int):
    # Ensure user exists before adding XP, to avoid "null" entries on leaderboard
    user_key = f"user:{uuid}"
    if not r.exists(user_key) or not r.hexists(user_key, "name"):
        r.hset(user_key, mapping={
            "name": f"Cadet {uuid[:5]}",
            "rank": "Cadet",
            "rank_level": 0,
            "mission_stage": 1,
            "current_location": "Bridge"
        })
    new_xp = r.hincrby(user_key, "xp", xp_to_add)
    r.zadd("leaderboard", {uuid: new_xp})

def get_user_rank_data(uuid):
    user_data = r.hgetall(f"user:{uuid}")
    if not user_data: return {"rank_level": 0, "title": "Cadet", "mission_stage": 1, "current_location": "Bridge"}
    user_data["rank_level"] = int(user_data.get("rank_level", 0))
    user_data["mission_stage"] = int(user_data.get("mission_stage", 1))
    rank_info = r.hgetall(f"rank:{user_data['rank_level']}")
    user_data.update(rank_info)
    return user_data

def promote_user(uuid):
    user_key = f"user:{uuid}"
    max_rank_level = int(r.get("max_rank_level"))
    current_level = int(r.hget(user_key, "rank_level") or 0)

    if current_level < max_rank_level:
        new_level = current_level + 1
        new_rank_info = r.hgetall(f"rank:{new_level}")
        new_rank_title = new_rank_info.get('title', 'Unknown Rank')

        pipe = r.pipeline()
        pipe.hset(user_key, "rank_level", new_level)
        pipe.hset(user_key, "rank", new_rank_title)
        pipe.hincrby(user_key, "mission_stage", 1)
        pipe.execute()

        update_leaderboard(uuid, 1000)
        logging.info(f"User {uuid} promoted to {new_rank_title}")
        return True, new_rank_title
    return False, r.hget(f"rank:{max_rank_level}", "title")
