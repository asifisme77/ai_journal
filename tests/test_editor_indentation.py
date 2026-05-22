import pytest
try:
    from playwright.sync_api import Page, expect
except ImportError:
    pytest.skip("playwright not installed", allow_module_level=True)
import time

def test_single_line_indent(flask_server, page: Page):
    """Verifies that indenting a single line creates a parent-node chevron on the line above."""
    page.goto(flask_server)
    
    # Wait for the editor to load
    editor_locator = page.locator('div#tinymce-1')
    editor_locator.wait_for(state='visible')
    
    # Click inside to focus
    editor_locator.click(force=True)
    
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
    logs = []
    page.on('console', lambda msg: logs.append(msg.text))
    page.goto(flask_server)
    
    # Wait for the editor to load
    editor_locator = page.locator('div#tinymce-1')
    editor_locator.wait_for(state='visible')
    
    editor_locator.click(force=True)
    
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

def test_preformatted_margin_indentation(flask_server, page: Page):
    """Verifies that converting an indented paragraph to a PRE block uses margin-left instead of padding-left,
    and that indenting/outdenting a PRE block correctly increases/decreases margin-left and clears padding-left.
    """
    page.goto(flask_server)
    
    # Wait for the editor to load
    editor_locator = page.locator('div#tinymce-1')
    editor_locator.wait_for(state='visible')
    
    # Focus
    editor_locator.click(force=True)
    
    # Set up an indented paragraph
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        editor.setContent('<p style="padding-left: 20px;">Indented line</p>');
    }''')
    
    time.sleep(0.5)
    
    # Select inside the paragraph
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const p = editor.dom.select('p')[0];
        editor.selection.setCursorLocation(p.firstChild, 0);
    }''')
    
    # Convert to preformatted block via FormatBlock
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        editor.execCommand('FormatBlock', false, 'pre');
    }''')
    
    time.sleep(0.5)
    
    # Verify the created pre block uses margin-left instead of padding-left
    styles = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const pre = editor.dom.select('pre')[0];
        return {
            nodeName: pre.nodeName,
            marginLeft: pre.style.marginLeft,
            paddingLeft: pre.style.paddingLeft
        };
    }''')
    
    assert styles['nodeName'] == 'PRE'
    assert styles['marginLeft'] == '20px'
    assert styles['paddingLeft'] == '' or styles['paddingLeft'] is None, "Padding-left must be cleared"
    
    # Now let's indent it via editor.execCommand('Indent')
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        editor.execCommand('Indent');
    }''')
    
    time.sleep(0.5)
    
    styles_after_indent = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const pre = editor.dom.select('pre')[0];
        return {
            marginLeft: pre.style.marginLeft,
            paddingLeft: pre.style.paddingLeft
        };
    }''')
    
    assert styles_after_indent['marginLeft'] == '40px'
    assert styles_after_indent['paddingLeft'] == '' or styles_after_indent['paddingLeft'] is None, "Padding-left must be cleared after Indent"

    # Now let's outdent it via editor.execCommand('Outdent')
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        editor.execCommand('Outdent');
    }''')
    
    time.sleep(0.5)
    
    styles_after_outdent = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const pre = editor.dom.select('pre')[0];
        return {
            marginLeft: pre.style.marginLeft,
            paddingLeft: pre.style.paddingLeft
        };
    }''')
    
    assert styles_after_outdent['marginLeft'] == '20px'
    assert styles_after_outdent['paddingLeft'] == '' or styles_after_outdent['paddingLeft'] is None, "Padding-left must be cleared after Outdent"

def test_preformatted_unformat_preserves_indentation(flask_server, page: Page):
    """Verifies that converting an indented PRE block back to a normal block (e.g. paragraph)
    correctly preserves the indentation level and alignment, mapping margin-left back to padding-left.
    """
    page.goto(flask_server)
    
    # Wait for the editor to load
    editor_locator = page.locator('div#tinymce-1')
    editor_locator.wait_for(state='visible')
    
    # Focus
    editor_locator.click(force=True)
    
    # Set up an indented PRE block
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        editor.setContent('<pre style="margin-left: 40px; text-align: right;">Indented preformatted text</pre>');
    }''')
    
    time.sleep(0.5)
    
    # Select inside the PRE block
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const pre = editor.dom.select('pre')[0];
        editor.selection.setCursorLocation(pre.firstChild, 0);
    }''')
    
    # Convert to normal block (p) via FormatBlock
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        editor.execCommand('FormatBlock', false, 'p');
    }''')
    
    time.sleep(0.5)
    
    # Verify the created P block uses padding-left instead of margin-left and maintains text-align
    styles = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const p = editor.dom.select('p')[0];
        return {
            nodeName: p.nodeName,
            marginLeft: p.style.marginLeft,
            paddingLeft: p.style.paddingLeft,
            textAlign: p.style.textAlign
        };
    }''')
    
    assert styles['nodeName'] == 'P'
    assert styles['paddingLeft'] == '40px', "Paragraph should retain the 40px indentation as padding-left"
    assert styles['marginLeft'] == '' or styles['marginLeft'] is None, "Margin-left must be cleared on paragraph conversion"
    assert styles['textAlign'] == 'right', "Text-alignment should be retained"

