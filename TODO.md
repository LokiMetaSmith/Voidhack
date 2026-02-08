# TODO List

## High Priority
- [x] **Tests:** Implement unit tests for `mock_redis.py` and `main.py` (specifically `process_command_logic`).
- [x] **Error Handling:** Improve error handling in `process_command_logic` to provide more specific feedback to the user.
- [x] **Security:** Implement Role-Based Access Control (RBAC) for the `authorize_session` feature (currently any user can authorize).
- [x] **Features:** Implement Location-Based Command Restrictions (e.g., "Eject Warp Core" only in Engineering).

## Medium Priority
- [x] **Refactoring:** Split `main.py` into smaller modules (e.g., `routes.py`, `services.py`, `models.py`).
- [x] **MockRedis:** Improve `MockRedis` to better simulate Redis behavior (e.g., raise errors on type mismatches).
- [x] **Logging:** Implement structured logging for better observability.
- [x] **Environment Variables:** Use `python-dotenv` for better environment variable management (Handled via Docker Compose).
- [x] **Documentation:** Update `README.md` to reflect the actual "mission_success" JSON logic instead of the "hidden hash" win condition.

## Low Priority
- [ ] **WASM:** Add more sophisticated audio analysis features to the WASM module.
- [x] **Frontend:** Improve accessibility and add more visual feedback (e.g., specific alerts for location denials).
