import re
import sys

def verify_media_session_handlers():
    try:
        with open('index.html', 'r') as f:
            content = f.read()

        # Check for pause handler
        if "setActionHandler('pause'" in content or 'setActionHandler("pause"' in content:
            print("SUCCESS: 'pause' handler found.")
            return True
        else:
            print("FAILURE: 'pause' handler NOT found.")
            return False

    except FileNotFoundError:
        print("Error: index.html not found.")
        return False

if __name__ == "__main__":
    if verify_media_session_handlers():
        sys.exit(0)
    else:
        sys.exit(1)
