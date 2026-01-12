from playwright.sync_api import sync_playwright

def verify_frontend():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--use-fake-ui-for-media-stream'])
        page = browser.new_page()
        try:
            # Go to the local server
            page.goto("http://localhost:8000")

            # Check for the button that was previously causing the ReferenceError
            # The error happened on click, so let's ensure the element is there and we can interact.
            # But the error was "ReferenceError: initComms is not defined" when clicking.
            # If the script is loaded, initComms should be defined.

            # Check if initComms is defined in the window object
            is_defined = page.evaluate("typeof initComms !== 'undefined'")
            print(f"initComms defined: {is_defined}")

            if not is_defined:
                raise Exception("initComms is not defined! The script tag fix failed.")

            # Take a screenshot of the initial state
            page.screenshot(path="verification/frontend_fixed.png")
            print("Screenshot saved to verification/frontend_fixed.png")

        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="verification/frontend_error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_frontend()
