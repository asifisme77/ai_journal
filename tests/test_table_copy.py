import pytest
import time
try:
    from playwright.sync_api import Page, expect
except ImportError:
    pytest.skip("playwright not installed", allow_module_level=True)


def test_html_to_tsv_plain_text_converts_multi_line_cells(flask_server, page: Page):
    """
    Verify that htmlToTsvPlainText() collapses intra-cell line breaks into spaces
    so that multi-line cells paste as a single cell in Excel.
    """
    page.goto(flask_server)

    # Wait for the editor to load
    editor_locator = page.locator('div#tinymce-1')
    editor_locator.wait_for(state='visible')
    editor_locator.click(force=True)
    time.sleep(0.5)

    # Insert a table with multi-line cells into the editor
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        editor.setContent(`<table>
            <tbody>
                <tr>
                    <td>Line one<br>Line two<br>Line three</td>
                    <td>Single line</td>
                    <td>Also<br>multi</td>
                </tr>
                <tr>
                    <td>Second row<br>with two lines</td>
                    <td>Another single</td>
                    <td>Yet<br>another<br>multi<br>cell</td>
                </tr>
            </tbody>
        </table>`);
    }''')
    time.sleep(0.5)

    # Run htmlToTsvPlainText via evaluate on the selected table HTML
    tsv = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const html = editor.getContent({ format: 'html' });
        // Extract just the table HTML for the function
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const tableHtml = doc.querySelector('table').outerHTML;
        return htmlToTsvPlainText(tableHtml);
    }''')

    print("TSV output:")
    print(repr(tsv))

    # Split into rows
    rows = tsv.split('\r\n')
    assert len(rows) == 2, f"Expected 2 TSV rows, got {len(rows)}"

    # First row: 3 cells
    cells_row0 = rows[0].split('\t')
    assert len(cells_row0) == 3, f"Expected 3 cells in row 0, got {len(cells_row0)}"
    # Multi-line cell should be collapsed: "Line one Line two Line three"
    assert cells_row0[0] == "Line one Line two Line three", \
        f"Expected 'Line one Line two Line three', got '{cells_row0[0]}'"
    assert cells_row0[1] == "Single line", f"Expected 'Single line', got '{cells_row0[1]}'"
    assert cells_row0[2] == "Also multi", f"Expected 'Also multi', got '{cells_row0[2]}'"

    # Second row: 3 cells
    cells_row1 = rows[1].split('\t')
    assert len(cells_row1) == 3, f"Expected 3 cells in row 1, got {len(cells_row1)}"
    assert cells_row1[0] == "Second row with two lines", \
        f"Expected 'Second row with two lines', got '{cells_row1[0]}'"
    assert cells_row1[1] == "Another single", f"Expected 'Another single', got '{cells_row1[1]}'"
    assert cells_row1[2] == "Yet another multi cell", \
        f"Expected 'Yet another multi cell', got '{cells_row1[2]}'"


def test_table_copy_puts_tsv_on_clipboard(flask_server, page: Page):
    """
    End-to-end test: select a table in the editor, press Ctrl+C,
    and verify the clipboard contains the correct TSV.
    """
    # Grant clipboard read/write permissions
    context = page.context
    context.grant_permissions(['clipboard-read', 'clipboard-write'])

    page.goto(flask_server)

    editor_locator = page.locator('div#tinymce-1')
    editor_locator.wait_for(state='visible')
    editor_locator.click(force=True)
    time.sleep(0.5)

    # Insert a table
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        editor.setContent(`<table>
            <tbody>
                <tr>
                    <td>Cell A1<br>line two</td>
                    <td>Cell B1</td>
                </tr>
                <tr>
                    <td>Cell A2</td>
                    <td>Cell B2<br>line two<br>line three</td>
                </tr>
            </tbody>
        </table>`);
    }''')
    time.sleep(0.5)

    # Select all content in the editor
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        editor.execCommand('selectAll');
    }''')
    time.sleep(0.3)

    # Copy to clipboard
    page.keyboard.press('Control+c')
    time.sleep(1)

    # Read clipboard text
    clipboard_text = page.evaluate('''async () => {
        try {
            return await navigator.clipboard.readText();
        } catch (e) {
            return "CLIPBOARD_ERROR: " + e.message;
        }
    }''')

    print("Clipboard text after copy:")
    print(repr(clipboard_text))

    # If clipboard API failed, skip the assertion with a helpful message
    if clipboard_text.startswith("CLIPBOARD_ERROR"):
        pytest.skip(f"Clipboard API not available in test browser: {clipboard_text}")

    # Verify TSV structure
    rows = clipboard_text.split('\r\n')
    assert len(rows) == 2, f"Expected 2 rows, got {len(rows)}"

    cells_row0 = rows[0].split('\t')
    assert len(cells_row0) == 2, f"Expected 2 cells in row 0, got {len(cells_row0)}"
    assert cells_row0[0] == "Cell A1 line two", \
        f"Multi-line cell A1 should collapse: '{cells_row0[0]}'"
    assert cells_row0[1] == "Cell B1", f"Expected 'Cell B1', got '{cells_row0[1]}'"

    cells_row1 = rows[1].split('\t')
    assert len(cells_row1) == 2, f"Expected 2 cells in row 1, got {len(cells_row1)}"
    assert cells_row1[0] == "Cell A2", f"Expected 'Cell A2', got '{cells_row1[0]}'"
    assert cells_row1[1] == "Cell B2 line two line three", \
        f"Multi-line cell B2 should collapse: '{cells_row1[1]}'"