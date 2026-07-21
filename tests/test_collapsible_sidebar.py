import pytest
import time
try:
    from playwright.sync_api import Page
except ImportError:
    pytest.skip("playwright not installed", allow_module_level=True)


def test_collapsible_right_sidebar(flask_server, page: Page):
    """Verifies collapsing and expanding the right-hand sidebar and localStorage persistence."""
    page.goto(flask_server)

    # Wait for the main page to load
    page.wait_for_selector('#right-sidebar', timeout=20000)

    # Initially right sidebar should be visible (not collapsed)
    is_collapsed_initial = page.evaluate('''() => {
        const sidebar = document.getElementById('right-sidebar');
        return sidebar.classList.contains('collapsed');
    }''')
    assert not is_collapsed_initial, "Right sidebar should not be collapsed initially"

    # Click collapse button
    collapse_btn = page.locator('#right-sidebar-collapse-btn')
    collapse_btn.click()

    # Verify right sidebar and resizer have collapsed class and expand button is visible
    is_collapsed = page.evaluate('''() => {
        const sidebar = document.getElementById('right-sidebar');
        const resizer = document.getElementById('right-sidebar-resizer');
        const expandBtn = document.getElementById('right-sidebar-expand-btn');
        return sidebar.classList.contains('collapsed') &&
               resizer.classList.contains('collapsed') &&
               !expandBtn.classList.contains('hidden');
    }''')
    assert is_collapsed, "Right sidebar should be collapsed after clicking collapse button"

    # Reload page and verify persistence via localStorage
    page.reload()
    page.wait_for_selector('#right-sidebar', state='attached', timeout=20000)

    is_collapsed_after_reload = page.evaluate('''() => {
        const sidebar = document.getElementById('right-sidebar');
        const expandBtn = document.getElementById('right-sidebar-expand-btn');
        return sidebar.classList.contains('collapsed') && !expandBtn.classList.contains('hidden');
    }''')
    assert is_collapsed_after_reload, "Right sidebar should remain collapsed after page reload"

    # Click expand button
    expand_btn = page.locator('#right-sidebar-expand-btn')
    expand_btn.click()

    # Verify right sidebar is restored
    is_expanded = page.evaluate('''() => {
        const sidebar = document.getElementById('right-sidebar');
        const resizer = document.getElementById('right-sidebar-resizer');
        const expandBtn = document.getElementById('right-sidebar-expand-btn');
        return !sidebar.classList.contains('collapsed') &&
               !resizer.classList.contains('collapsed') &&
               expandBtn.classList.contains('hidden');
    }''')
    assert is_expanded, "Right sidebar should be expanded after clicking expand button"
