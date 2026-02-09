from playwright.sync_api import sync_playwright, expect
import time

def verify_visuals(page):
    print("Navigating to app...")
    page.goto("http://localhost:8080")

    # Wait for the app to load
    page.wait_for_selector(".lcars-header")
    print("App loaded.")

    # 1. Verify Structure (Elbow Layout)
    header = page.locator(".lcars-header")
    sidebar = page.locator(".lcars-sidebar")
    right_bar = page.locator(".lcars-right-bar")

    expect(header).to_be_visible()
    expect(sidebar).to_be_visible()
    expect(right_bar).to_be_visible()
    print("Core layout elements visible.")

    # 2. Verify Terminal Input Style
    # We switch to COMS panel
    print("Switching to COMS...")
    # Click init first to ensure everything is ready (though not strictly needed for UI)
    page.locator("#init-btn").click()

    # Click COMS button
    page.get_by_text("COMS", exact=True).click()

    input_box = page.locator("#terminal-input")
    expect(input_box).to_be_visible()

    page.screenshot(path="verification/visuals_input.png")
    print("Input screenshot saved.")

    # 3. Verify Leaderboard Style
    print("Switching to RANK...")
    page.get_by_text("RANK", exact=True).click()

    # Inject mock data to ensure table has content to render
    page.evaluate("""
        const table = document.getElementById('leaderboard-table');
        table.innerHTML = '<tr><th>RANK</th><th>NAME</th><th>XP</th></tr><tr><td>ENSIGN</td><td>JANE DOE</td><td>500</td></tr><tr><td>CADET</td><td>JOHN SMITH</td><td>150</td></tr>';
    """)

    # Wait for table to be visible
    # The panel toggles display:none/flex instantly in JS, so wait_for_selector should work
    leaderboard_panel = page.locator("#leaderboard-panel")
    expect(leaderboard_panel).to_have_class("leaderboard-panel active")
    expect(page.locator("#leaderboard-table")).to_be_visible()

    page.screenshot(path="verification/visuals_leaderboard.png")
    print("Leaderboard screenshot saved.")

    # 4. Verify Colors (Optional sampling)
    # Check header color (Gold/Orange)
    header_color = header.evaluate("el => getComputedStyle(el).backgroundColor")
    print(f"Header Color: {header_color}")
    # Expected: rgb(255, 170, 0) for #ffaa00 (Gold)

    if "255, 170, 0" in header_color or "255, 153, 0" in header_color:
        print("Header color matches LCARS Gold/Orange.")
    else:
        print(f"Warning: Header color {header_color} might be incorrect.")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_visuals(page)
        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="verification/failed.png")
            raise e
        finally:
            browser.close()
