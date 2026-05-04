import pytest
import time
try:
    from playwright.sync_api import Page, expect
except ImportError:
    pytest.skip("playwright not installed", allow_module_level=True)

def test_list_indentation(flask_server, page: Page):
    """Verifies that nested lists have visual indentation."""
    page.goto(flask_server)
    
    # Wait for the editor to load
    editor_locator = page.locator('div#tinymce-1')
    editor_locator.wait_for(state='visible')
    
    # Focus and set list content
    editor_locator.click(force=True)
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        editor.setContent('<ul><li>Parent<li><ul><li>Child</li></ul></li></ul>');
    }''')
    
    time.sleep(0.5)
    
    # Check the bounding box of parent and child li
    child_li_x = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const childLi = editor.dom.select('ul ul li')[0];
        return childLi.getBoundingClientRect().left;
    }''')
    
    parent_li_x = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const parentLi = editor.dom.select('ul li')[0];
        return parentLi.getBoundingClientRect().left;
    }''')
    
    # Child should be further right than parent
    assert child_li_x > parent_li_x + 10, f"Child LI (x={child_li_x}) should be indented relative to Parent LI (x={parent_li_x})"

def test_list_indentation_in_table(flask_server, page: Page):
    """Verifies that nested lists inside tables have visual indentation."""
    page.goto(flask_server)
    
    # Wait for the editor to load
    editor_locator = page.locator('div#tinymce-1')
    editor_locator.wait_for(state='visible')
    
    # Focus and set table with list
    editor_locator.click(force=True)
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        editor.setContent('<table><tr><td><ul><li>Parent<li><ul><li>Child</li></ul></li></ul></td></tr></table>');
    }''')
    
    time.sleep(0.5)
    
    child_li_x = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const childLi = editor.dom.select('td ul ul li')[0];
        return childLi.getBoundingClientRect().left;
    }''')
    
    parent_li_x = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const parentLi = editor.dom.select('td ul li')[0];
        return parentLi.getBoundingClientRect().left;
    }''')
    
    assert child_li_x > parent_li_x + 10, f"In table: Child LI (x={child_li_x}) should be indented relative to Parent LI (x={parent_li_x})"
