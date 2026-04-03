import pytest
from playwright.sync_api import Page, expect
import time

def test_single_line_indent(flask_server, page: Page):
    """Verifies that indenting a single line creates a parent-node chevron on the line above."""
    page.goto(flask_server)
    
    # Wait for the editor to load
    editor_locator = page.locator('div#tinymce-1')
    editor_locator.wait_for(state='visible')
    
    # Click inside to focus
    editor_locator.click()
    
    # Set standard block content
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        editor.setContent('<p>Line 1</p><p>Line 2</p>');
    }''')
    
    # Wait a bit for outliner to process
    time.sleep(0.5)
    
    # Select inside "Line 2"
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const p2 = editor.dom.select('p')[1];
        editor.selection.setCursorLocation(p2, 0);
    }''')
    
    # Press Tab to indent
    page.keyboard.press('Tab')
    
    # Wait a bit for outliner to process
    time.sleep(0.5)
    
    # Verify Line 1 has parent-node class
    has_parent_class = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const p1 = editor.dom.select('p')[0];
        return p1.classList.contains('parent-node');
    }''')
    
    assert has_parent_class is True, "The line above the indented line should become a parent-node"

def test_multiline_br_split_indent(flask_server, page: Page):
    """Verifies that pressing Tab on an un-split <br> text block successfully splits and indents without destroying the editor."""
    page.goto(flask_server)
    
    # Wait for the editor to load
    editor_locator = page.locator('div#tinymce-1')
    editor_locator.wait_for(state='visible')
    
    editor_locator.click()
    
    # Insert <br> paragraph
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        editor.setContent('<p>Pasted Line 1<br>Pasted Line 2<br>Pasted Line 3</p>');
    }''')
    
    time.sleep(0.5)
    
    # Select "Pasted Line 2"
    # Actually wait, setting cursor inside <br> separated text is tricky programmatically.
    # We can select it by searching for text node.
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const p = editor.dom.select('p')[0];
        // The childNodes are [text, br, text, br, text]
        const textNode = p.childNodes[2]; // "Pasted Line 2"
        editor.selection.select(textNode);
    }''')
    
    # Press Tab
    page.keyboard.press('Tab')
    
    time.sleep(0.5)
    
    # Verify it was split into 3 <p> tags
    p_count = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        return editor.dom.select('p').length;
    }''')
    
    # Because it split the 3 sentences, it should be 3 <p> tags
    assert p_count == 3, f"Expected 3 <p> tags, got {p_count}"
    
    # Verify the second <p> tag has padding-left (it actually indented)
    is_indented = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const p2 = editor.dom.select('p')[1];
        return p2.style.paddingLeft !== '';
    }''')
    
    assert is_indented is True, "The middle line should have been indented"
