from playwright.sync_api import sync_playwright, expect
import time

def verify_wasm_ui(page):
    # 1. Navigate to the app
    page.goto("http://localhost:8080")

    # 2. Click INIT COMMS to establish connection and start audio context (required for some UI logic)
    page.locator("#init-btn").click()

    # 3. Inject JS to trigger the noisy audio state
    # We call updateAudioUI(3) directly to simulate the WASM output
    page.evaluate("updateAudioUI(3)")

    # 4. Wait for the audio-quality element to be visible
    quality_indicator = page.locator("#audio-quality")
    expect(quality_indicator).to_be_visible()

    # 5. Check text content
    expect(quality_indicator).to_have_text("AUDIO: NOISY")

    # 6. Check class/color
    expect(quality_indicator).to_have_class("audio-noisy")

    # 7. Take screenshot
    page.screenshot(path="verification/wasm_noisy.png")
    print("Screenshot saved to verification/wasm_noisy.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(permissions=['microphone'])
        page = context.new_page()
        try:
            verify_wasm_ui(page)
        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="verification/failed_wasm.png")
        finally:
            browser.close()
