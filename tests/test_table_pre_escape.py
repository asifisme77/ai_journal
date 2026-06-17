import pytest
import time
try:
    from playwright.sync_api import Page, expect
except ImportError:
    pytest.skip("playwright not installed", allow_module_level=True)

def test_table_pre_escape(flask_server, page: Page):
    """Verifies that pressing ArrowDown in a <pre> block at the end of a table cell creates a new paragraph."""
    page.goto(flask_server)
    
    # Wait for the editor to load
    editor_locator = page.locator('div#tinymce-1')
    editor_locator.wait_for(state='visible')
    
    # Click inside to focus (force to bypass overlapping UI elements)
    editor_locator.click(force=True)
    
    # Insert a table with a <pre> block inside
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        editor.setContent('<table><tbody><tr><td><pre>Code block</pre></td></tr></tbody></table>');
    }''')
    
    time.sleep(0.5)
    
    # Verify there is NO paragraph after the PRE
    p_count_before = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const td = editor.dom.select('td')[0];
        return td.querySelectorAll('p').length;
    }''')
    assert p_count_before == 0, "Should have no paragraphs initially"
    
    # Select inside the <pre> block
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const pre = editor.dom.select('pre')[0];
        editor.selection.setCursorLocation(pre.firstChild, 10); // End of "Code block"
    }''')
    
    # Press ArrowDown
    page.keyboard.press('ArrowDown')
    
    time.sleep(0.5)
    
    # Verify a paragraph was created after the PRE inside the TD
    p_count_after = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const td = editor.dom.select('td')[0];
        return td.querySelectorAll('p').length;
    }''')
    
    assert p_count_after == 1, "A paragraph should have been created below the <pre> block in the table cell"
    
    # Check if we can also escape with ArrowUp
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const pre = editor.dom.select('pre')[0];
        editor.selection.setCursorLocation(pre.firstChild, 0); // Start of "Code block"
    }''')
    
    page.keyboard.press('ArrowUp')
    
    time.sleep(0.5)
    
    p_count_after_up = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const td = editor.dom.select('td')[0];
        return td.querySelectorAll('p').length;
    }''')
    
    assert p_count_after_up == 2, "A paragraph should have been created above the <pre> block as well"


def test_standard_pre_escape(flask_server, page: Page):
    """Verifies that pressing ArrowDown in a standard <pre> block at the end of the last line escapes it."""
    page.goto(flask_server)
    
    # Wait for the editor to load
    editor_locator = page.locator('div#tinymce-1')
    editor_locator.wait_for(state='visible')
    
    # Click inside to focus
    editor_locator.click(force=True)
    
    # Insert a preformatted block
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        editor.setContent('<pre>First line\\nSecond line</pre>');
    }''')
    
    time.sleep(0.5)
    
    # Cursor at the end of the last line
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const pre = editor.dom.select('pre')[0];
        editor.selection.setCursorLocation(pre.firstChild, 22);
    }''')
    
    # Press ArrowDown
    page.keyboard.press('ArrowDown')
    
    time.sleep(0.5)
    
    # Verify a paragraph was created below the PRE block
    p_count = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        return editor.dom.select('p').length;
    }''')
    assert p_count == 1, "A paragraph should have been created below the pre block"


def test_pasted_pre_escape(flask_server, page: Page):
    """Verifies that pressing ArrowDown in a pre block with trailing newlines escapes it."""
    page.goto(flask_server)
    
    # Wait for the editor to load
    editor_locator = page.locator('div#tinymce-1')
    editor_locator.wait_for(state='visible')
    
    # Click inside to focus
    editor_locator.click(force=True)
    
    # Insert a preformatted block resembling pasted text with trailing newlines
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        editor.setContent('<pre>Windows PowerShell\\nCopyright (C) Microsoft Corporation. All rights reserved.\\n\\nPS C:\\\\Users\\\\asifa>\\n</pre>');
    }''')
    
    time.sleep(0.5)
    
    # Position cursor at the end of content before trailing newline
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const pre = editor.dom.select('pre')[0];
        const textNode = pre.firstChild;
        const len = textNode.textContent.length;
        const pos = textNode.textContent.endsWith('\\n') ? len - 1 : len;
        editor.selection.setCursorLocation(textNode, pos);
    }''')
    
    # Press ArrowDown
    page.keyboard.press('ArrowDown')
    
    time.sleep(0.5)
    
    # Verify a paragraph was created below the PRE block
    p_count = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        return editor.dom.select('p').length;
    }''')
    assert p_count == 1, "A paragraph should have been created below the pre block"


