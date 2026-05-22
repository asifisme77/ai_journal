import pytest
import time
try:
    from playwright.sync_api import Page, expect
except ImportError:
    pytest.skip("playwright not installed", allow_module_level=True)

def test_sidebar_marker_right_click_options_followup(flask_server, page: Page):
    """Verifies right-clicking a follow-up status marker in the sidebar, closing it, and verifying status is cleared to None."""
    page.goto(flask_server)
    
    # Wait for the page to load
    page.wait_for_selector('#items-container .work-item', timeout=20000)
    
    # 1. Change an entry's status to FOLLOWUP to generate a status marker
    page.evaluate('''() => {
        const select = document.querySelector('.entry-status-select');
        if (select) {
            select.value = 'FOLLOWUP';
            select.dispatchEvent(new Event('change'));
        }
    }''')
    
    # Wait for sidebar refresh
    time.sleep(2)
    
    # Check that the reminder/marker item is in the sidebar
    reminder_selector = '#reminders-container .reminder-item'
    page.wait_for_selector(reminder_selector, timeout=5000)
    
    # Locate the reminder item in the sidebar
    reminder_el = page.locator(reminder_selector).first
    
    # 2. Right-click the reminder item to show the popover
    reminder_el.click(button='right')
    
    # Wait for popover to be visible
    popover_selector = '#marker-popover'
    page.wait_for_selector(popover_selector, timeout=5000)
    
    # Check that popover is not hidden
    is_popover_visible = page.evaluate('''() => {
        const popover = document.getElementById('marker-popover');
        return popover && !popover.classList.contains('hidden');
    }''')
    assert is_popover_visible, "Popover should be visible on right-click"
    
    # 3. Click "Close Marker" button in the popover
    close_btn = page.locator('#marker-btn-close')
    close_btn.click()
    
    # Wait for DB save and sidebar refresh
    time.sleep(2)
    
    # Check that the status select has changed to NONE ("")
    status_val = page.evaluate('''() => {
        const select = document.querySelector('.entry-status-select');
        return select ? select.value : 'none_not_found';
    }''')
    assert status_val == '', "Entry status dropdown should have transitioned to NONE"
    
    # Verify that the reminder item is removed from the sidebar
    reminders_count = page.locator('#reminders-container .reminder-item').count()
    assert reminders_count == 0, "Reminder item should be removed from the sidebar"

def test_sidebar_marker_right_click_options_normal(flask_server, page: Page):
    """Verifies right-clicking a normal text marker in the sidebar, setting a reminder, and closing it."""
    page.goto(flask_server)
    page.wait_for_selector('#items-container .work-item', timeout=20000)
    
    # 1. Create a normal marker inside the editor
    page.evaluate('''async () => {
        const editor = tinymce.get('tinymce-1');
        editor.setContent('<p>Normal paragraph content</p>');
        editor.selection.select(editor.dom.select('p')[0]);
        
        // Call the API to create the marker
        const res = await fetch(`/api/entries/1/markers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'Normal paragraph content' })
        });
        const marker = await res.json();
        editor.selection.setContent(`<span class="marker marker-open" data-marker-id="${marker.id}">Normal paragraph content</span><span class="marker-bubble" data-marker-id="${marker.id}" contenteditable="false" title="Marker Options">M</span>&nbsp;`);
        editor.fire('change');
        
        if (window.refreshSidebar) window.refreshSidebar();
    }''')
    
    time.sleep(2)
    
    # Locate the reminder item in the sidebar
    reminder_selector = '#reminders-container .reminder-item'
    page.wait_for_selector(reminder_selector, timeout=5000)
    reminder_el = page.locator(reminder_selector).first
    
    # 2. Right-click the reminder item to show the popover
    reminder_el.click(button='right')
    page.wait_for_selector('#marker-popover', timeout=5000)
    
    # Set a reminder date
    page.evaluate('''() => {
        const input = document.getElementById('marker-reminder-input');
        input.value = '2026-12-31T23:59';
    }''')
    
    page.locator('#marker-btn-reminder').click()
    time.sleep(2)
    
    # Check that bubble in editor has class has-reminder
    has_reminder_class = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const bubble = editor.dom.select('.marker-bubble')[0];
        return bubble ? bubble.classList.contains('has-reminder') : false;
    }''')
    assert has_reminder_class, "Bubble in editor should have has-reminder class"
    
    # 3. Right-click again to close it
    page.locator(reminder_selector).first.click(button='right')
    page.wait_for_selector('#marker-popover', timeout=5000)
    page.locator('#marker-btn-close').click()
    time.sleep(2)
    
    # Verify that the reminder item is removed from the sidebar
    reminders_count = page.locator('#reminders-container .reminder-item').count()
    assert reminders_count == 0, "Reminder item should be removed from the sidebar"
    
    # Verify that marker spans and bubbles are removed from the editor
    editor_html = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        return editor.getContent();
    }''')
    assert 'marker' not in editor_html, "Marker HTML elements should be unwrapped and removed"
