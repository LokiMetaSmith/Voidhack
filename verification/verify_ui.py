from playwright.sync_api import sync_playwright, expect
import time

def verify_access_denied(page):
    page.on("console", lambda msg: print(f"Console: {msg.text}"))

    # 1. Navigate to the app
    page.goto("http://localhost:8080")

    # 2. Click INIT COMMS to establish connection
    page.locator("#init-btn").click()

    # 3. Wait for WebSocket connection
    expect(page.locator("#log-panel")).to_contain_text("Connection established.", timeout=10000)

    # 4. Switch to COMS panel
    page.get_by_text("COMS", exact=True).click()

    # 5. Type restricted command
    terminal_input = page.locator("#terminal-input")
    expect(terminal_input).to_be_visible()
    terminal_input.fill("Computer, eject warp core")

    terminal_input.press("Enter")

    # 6. Wait for alert overlay
    overlay = page.locator("#access-denied-overlay")
    expect(overlay).to_be_visible(timeout=5000)

    # 7. Check text inside overlay
    expect(page.locator("#required-location-text")).to_have_text("ENGINEERING")

    # 8. Take screenshot
    page.screenshot(path="verification/access_denied.png")
    print("Screenshot saved to verification/access_denied.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(permissions=['microphone'])
        page = context.new_page()
        try:
            verify_access_denied(page)
        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="verification/failed.png")
        finally:
            browser.close()
