import time
from playwright.sync_api import sync_playwright

def verify_comms_init(page):
    print("Navigating to app...")
    page.goto("http://localhost:8000")

    print("Waiting for page load...")
    page.wait_for_selector(".lcars-container")

    print("Clicking INIT COMMS...")
    page.click("#init-btn")

    print("Checking if STATUS panel becomes active...")
    # The default view switches to STATUS on init
    page.wait_for_selector("#status-panel.active")

    # Check if log shows connection established
    log_text = page.locator("#log-panel").text_content()
    print(f"Log content: {log_text}")

    # Check if listening indicator is present (might be hidden if no permission, but check for element)
    indicator = page.locator("#listening-indicator")
    print(f"Indicator visible: {indicator.is_visible()}")
    print(f"Indicator text: {indicator.text_content()}")

    page.screenshot(path="/home/jules/verification/comms_verification.png")
    print("Screenshot saved.")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_comms_init(page)
        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="/home/jules/verification/error.png")
        finally:
            browser.close()
