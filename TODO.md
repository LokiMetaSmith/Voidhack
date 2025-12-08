# TODO List

## High Priority
- [x] **Tests:** Implement unit tests for `mock_redis.py` and `main.py` (specifically `process_command_logic`).
- [ ] **Error Handling:** Improve error handling in `process_command_logic` to provide more specific feedback to the user.
- [ ] **Security:** Implement Role-Based Access Control (RBAC) for the `authorize_session` feature (currently any user can authorize).

## Medium Priority
- [ ] **Refactoring:** Split `main.py` into smaller modules (e.g., `routes.py`, `services.py`, `models.py`).
- [ ] **MockRedis:** Improve `MockRedis` to better simulate Redis behavior (e.g., raise errors on type mismatches).
- [ ] **Logging:** Implement structured logging for better observability.
- [ ] **Environment Variables:** Use `python-dotenv` for better environment variable management.

## Low Priority
- [ ] **WASM:** Add more sophisticated audio analysis features to the WASM module.
- [ ] **Frontend:** Improve accessibility and add more visual feedback.
