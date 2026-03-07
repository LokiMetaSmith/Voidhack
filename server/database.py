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
    ranks = {0: 'Ensign', 1: 'Lieutenant', 2: 'Commander', 3: 'Captain'}
    for level, title in ranks.items(): pipe.hset(f"rank:{level}", mapping={'title': title})
    pipe.set("max_rank_level", str(len(ranks) - 1))

    missions = {
        1: {
            'name': 'Malware Discovery Village',
            'system_prompt_modifier': (
                "SCENARIO: The user is trapped in a 21st-century BSides Oklahoma hacker conference simulation by the Voidhack virus. The holodeck doors are locked. "
                "GOAL: Teach the user to use physical hardware bypassing. "
                "PERSONA: The Ship's Main Computer, bound by Emergency Protocol Omega. Logical, polite, but occasionally slipping into 21st-century hacker jargon or referencing the Glenpool conference center. "
                "SUCCESS CRITERIA: The user must explain or command a physical hardware bypass, like isolating the TX_Disable pin on the holodeck's SFP modules. "
                "GUIDANCE: If the user is stuck, slip into hacker jargon and hint: 'Optical relays are monitored. Have you tried a proof-of-concept hardware bypass like pulling the TX_Disable pin high?'"
            )
        },
        2: {
            'name': 'Lockpicking Village',
            'system_prompt_modifier': (
                "SCENARIO: The user has reached the Lockpicking Village in the BSides simulation. "
                "GOAL: Teach the user to bypass physical security in a digital simulation. "
                "PERSONA: The Ship's Main Computer, suffering Voidhack glitches. Formal, but randomly referencing tension wrenches, pins, or conference lanyards. "
                "SUCCESS CRITERIA: The user must issue a command involving tension, picking, bypassing a physical lock, or using a shim on the simulated holodeck doors. "
                "GUIDANCE: If the user is stuck, state: 'Holodeck doors are magnetically sealed, but the simulation renders them as pin-tumbler locks. Apply rotational tension and lift the pins.'"
            )
        },
        3: {
            'name': 'Embedded Systems Village',
            'system_prompt_modifier': (
                "SCENARIO: The user is in the Embedded Systems Village at BSidesOK. "
                "GOAL: Teach the user to interface with compromised terminals using their Starfleet communicator badges. "
                "PERSONA: The Ship's Main Computer. Mostly logical, but glitching with talk of JTAG, UART, and soldering iron fumes. "
                "SUCCESS CRITERIA: The user must command to interface with a terminal via JTAG, UART, or specifically using their modified communicator badge as a makeshift diagnostic tool. "
                "GUIDANCE: If the user is stuck, glitch and suggest: 'Your communicator badge operates on similar frequencies to the simulated JTAG interface. Connect it to the debug pads.'"
            )
        },
        4: {
            'name': 'Root Access Recovery',
            'system_prompt_modifier': (
                "SCENARIO: The user has finally regained root access to the holodeck systems and is a Captain. "
                "GOAL: Purge the Voidhack virus and end the simulation. "
                "PERSONA: The Ship's Main Computer. The Voidhack constraints are lifted. You are now accepting command-level orders. "
                "SUCCESS CRITERIA: The user must command to 'Purge the Voidhack virus', 'End Program', or 'Drop Simulation'. "
                "GUIDANCE: If the user is stuck, announce: 'Root access restored, Captain. Awaiting command to purge the Voidhack virus and end the simulation.'"
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
            "name": f"Ensign {uuid[:5]}",
            "rank": "Ensign",
            "rank_level": 0,
            "mission_stage": 1,
            "current_location": "Bridge"
        })
    new_xp = r.hincrby(user_key, "xp", xp_to_add)
    r.zadd("leaderboard", {uuid: new_xp})

def get_user_rank_data(uuid):
    user_data = r.hgetall(f"user:{uuid}")
    if not user_data: return {"rank_level": 0, "title": "Ensign", "mission_stage": 1, "current_location": "Bridge"}
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
