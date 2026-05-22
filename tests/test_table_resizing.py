import pytest
try:
    from playwright.sync_api import Page, expect
except ImportError:
    pytest.skip("playwright not installed", allow_module_level=True)
import time

def test_table_column_resizing_first_column_smaller(flask_server, page: Page):
    """Verifies that the first column can be made smaller by resizing from its right edge."""
    page.goto(flask_server)

    # Wait for the page to load and items to be fetched
    page.wait_for_selector('#items-container .work-item', timeout=20000)

    # Wait for the editor to load
    editor_locator = page.locator('div#tinymce-1')
    editor_locator.wait_for(state='visible', timeout=10000)

    # Click inside to focus - use force=True to click through any overlays
    editor_locator.click(force=True)

    # Expand the work item so its content is fully visible and not clipped
    page.evaluate('''() => {
        document.querySelectorAll('.work-item').forEach(el => el.classList.add('expanded'));
    }''')
    time.sleep(0.5)

    # Insert a table with 3 columns
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        editor.insertContent('<table><tr><td>Col 1</td><td>Col 2</td><td>Col 3</td></tr></table>');
    }''')

    # Wait for table to be inserted and resizable
    time.sleep(1.5)

    # Trigger table column resizing initialization
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        // Force re-initialization
        editor._resizeColumnsInitialized = false;
        initResizableTableColumns(editor);
    }''')

    # Wait a bit more for initialization
    time.sleep(0.5)

    # Get initial column widths
    initial_widths = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const cells = editor.dom.select('td');
        return cells.map(cell => cell.offsetWidth);
    }''')

    assert len(initial_widths) == 3, "Should have 3 columns"

    # Get the first cell's position for resizing
    first_cell_rect = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const firstCell = editor.dom.select('td')[0];
        const rect = firstCell.getBoundingClientRect();
        return { right: rect.right, top: rect.top + rect.height / 2 };
    }''')

    # Use playwright mouse events to simulate resizing (more realistic than manual dispatch)
    # Move to the right edge of the first cell
    page.mouse.move(first_cell_rect['right'] - 5, first_cell_rect['top'])
    page.mouse.down()

    # Drag left by 50 pixels
    page.mouse.move(first_cell_rect['right'] - 55, first_cell_rect['top'])
    page.mouse.up()

    # Wait for resize to complete
    time.sleep(0.5)

    # Check new column widths
    final_widths = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const cells = editor.dom.select('td');
        return cells.map(cell => cell.offsetWidth);
    }''')

    # First column should be smaller
    assert final_widths[0] < initial_widths[0], f"First column should be smaller: {final_widths[0]} < {initial_widths[0]}"

    # Second column should be larger to compensate
    assert final_widths[1] > initial_widths[1], f"Second column should be larger: {final_widths[1]} > {initial_widths[1]}"

    # Third column should remain approximately the same
    assert abs(final_widths[2] - initial_widths[2]) < 5, f"Third column should be unchanged: {final_widths[2]} ≈ {initial_widths[2]}"


def test_table_column_resizing_middle_column(flask_server, page: Page):
    """Verifies that resizing a middle column affects adjacent columns properly."""
    page.goto(flask_server)

    # Wait for the page to load and items to be fetched
    page.wait_for_selector('#items-container .work-item', timeout=20000)

    # Wait for the editor to load
    editor_locator = page.locator('div#tinymce-1')
    editor_locator.wait_for(state='visible', timeout=10000)

    # Click inside to focus - use force=True to click through any overlays
    editor_locator.click(force=True)

    # Expand the work item so its content is fully visible and not clipped
    page.evaluate('''() => {
        document.querySelectorAll('.work-item').forEach(el => el.classList.add('expanded'));
    }''')
    time.sleep(0.5)

    # Insert a table with 3 columns
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        editor.insertContent('<table><tr><td>Col 1</td><td>Col 2</td><td>Col 3</td></tr></table>');
    }''')

    # Wait for table to be inserted and resizable
    time.sleep(2)

    # Trigger table column resizing initialization
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        // Re-initialize table resizing for newly inserted tables
        const tables = editor.dom.select('table');
        if (tables.length > 0) {
            // Force re-initialization
            editor._resizeColumnsInitialized = false;
            initResizableTableColumns(editor);
        }
    }''')

    # Wait a bit more for initialization
    time.sleep(0.5)

    # Get initial column widths
    initial_widths = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const cells = editor.dom.select('td');
        return cells.map(cell => cell.offsetWidth);
    }''')

    # Get the second cell's position for resizing
    second_cell_rect = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const secondCell = editor.dom.select('td')[1];
        const rect = secondCell.getBoundingClientRect();
        return { right: rect.right, top: rect.top + rect.height / 2 };
    }''')

    # Move mouse to the right edge of the second column
    page.mouse.move(second_cell_rect['right'] - 5, second_cell_rect['top'])

    # Start dragging to make the second column larger
    page.mouse.down()

    # Drag right by 30 pixels
    page.mouse.move(second_cell_rect['right'] + 25, second_cell_rect['top'])
    page.mouse.up()

    # Wait for resize to complete
    time.sleep(0.5)

    # Check new column widths
    final_widths = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const cells = editor.dom.select('td');
        return cells.map(cell => cell.offsetWidth);
    }''')

    # Second column should be larger
    assert final_widths[1] > initial_widths[1], f"Second column should be larger: {final_widths[1]} > {initial_widths[1]}"

    # Third column should be smaller to compensate
    assert final_widths[2] < initial_widths[2], f"Third column should be smaller: {final_widths[2]} < {initial_widths[2]}"

    # First column should remain approximately the same
    assert abs(final_widths[0] - initial_widths[0]) < 5, f"First column should be unchanged: {final_widths[0]} ≈ {initial_widths[0]}"


def test_table_column_resizing_last_column(flask_server, page: Page):
    """Verifies that the last column can be resized and affects the previous column."""
    page.goto(flask_server)

    # Wait for the page to load and items to be fetched
    page.wait_for_selector('#items-container .work-item', timeout=20000)

    # Wait for the editor to load
    editor_locator = page.locator('div#tinymce-1')
    editor_locator.wait_for(state='visible', timeout=10000)

    # Click inside to focus - use force=True to click through any overlays
    editor_locator.click(force=True)

    # Expand the work item so its content is fully visible and not clipped
    page.evaluate('''() => {
        document.querySelectorAll('.work-item').forEach(el => el.classList.add('expanded'));
    }''')
    time.sleep(0.5)

    # Insert a table with 3 columns
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        editor.insertContent('<table><tr><td>Col 1</td><td>Col 2</td><td>Col 3</td></tr></table>');
    }''')

    # Wait for table to be inserted and resizable
    time.sleep(2)

    # Trigger table column resizing initialization
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        // Re-initialize table resizing for newly inserted tables
        const tables = editor.dom.select('table');
        if (tables.length > 0) {
            // Force re-initialization
            editor._resizeColumnsInitialized = false;
            initResizableTableColumns(editor);
        }
    }''')

    # Wait a bit more for initialization
    time.sleep(0.5)

    # Get initial column widths
    initial_widths = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const cells = editor.dom.select('td');
        return cells.map(cell => cell.offsetWidth);
    }''')

    # Get the third cell's position for resizing
    third_cell_rect = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const thirdCell = editor.dom.select('td')[2];
        const rect = thirdCell.getBoundingClientRect();
        return { right: rect.right, top: rect.top + rect.height / 2 };
    }''')

    # Move mouse to the right edge of the third column
    page.mouse.move(third_cell_rect['right'] - 5, third_cell_rect['top'])

    # Start dragging to make the third column smaller
    page.mouse.down()

    # Drag left by 40 pixels
    page.mouse.move(third_cell_rect['right'] - 45, third_cell_rect['top'])
    page.mouse.up()

    # Wait for resize to complete
    time.sleep(0.5)

    # Check new column widths
    final_widths = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const cells = editor.dom.select('td');
        return cells.map(cell => cell.offsetWidth);
    }''')

    # Third column should be smaller
    assert final_widths[2] < initial_widths[2], f"Third column should be smaller: {final_widths[2]} < {initial_widths[2]}"

    # Second column should be larger to compensate
    assert final_widths[1] > initial_widths[1], f"Second column should be larger: {final_widths[1]} > {initial_widths[1]}"

    # First column should remain approximately the same
    assert abs(final_widths[0] - initial_widths[0]) < 5, f"First column should be unchanged: {final_widths[0]} ≈ {initial_widths[0]}"


def test_table_column_minimum_width(flask_server, page: Page):
    """Verifies that columns cannot be resized below minimum width (30px)."""
    page.goto(flask_server)

    # Wait for the page to load and items to be fetched
    page.wait_for_selector('#items-container .work-item', timeout=20000)

    # Wait for the editor to load
    editor_locator = page.locator('div#tinymce-1')
    editor_locator.wait_for(state='visible', timeout=10000)

    # Click inside to focus - use force=True to click through any overlays
    editor_locator.click(force=True)

    # Expand the work item so its content is fully visible and not clipped
    page.evaluate('''() => {
        document.querySelectorAll('.work-item').forEach(el => el.classList.add('expanded'));
    }''')
    time.sleep(0.5)

    # Insert a table with 2 columns
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        editor.insertContent('<table><tr><td>Col 1</td><td>Col 2</td></tr></table>');
    }''')

    # Wait for table to be inserted and resizable
    time.sleep(2)

    # Trigger table column resizing initialization
    page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        // Re-initialize table resizing for newly inserted tables
        const tables = editor.dom.select('table');
        if (tables.length > 0) {
            // Force re-initialization
            editor._resizeColumnsInitialized = false;
            initResizableTableColumns(editor);
        }
    }''')

    # Wait a bit more for initialization
    time.sleep(0.5)

    # Get the first cell's position for resizing
    first_cell_rect = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const firstCell = editor.dom.select('td')[0];
        const rect = firstCell.getBoundingClientRect();
        return { right: rect.right, top: rect.top + rect.height / 2 };
    }''')

    # Move mouse to the right edge of the first column
    page.mouse.move(first_cell_rect['right'] - 5, first_cell_rect['top'])

    # Start dragging to make the first column very small
    page.mouse.down()

    # Try to drag far left (way below minimum)
    page.mouse.move(first_cell_rect['right'] - 200, first_cell_rect['top'])
    page.mouse.up()

    # Wait for resize to complete
    time.sleep(0.5)

    # Check final column width
    final_width = page.evaluate('''() => {
        const editor = tinymce.get('tinymce-1');
        const firstCell = editor.dom.select('td')[0];
        return firstCell.offsetWidth;
    }''')

    # Should not be smaller than 30px minimum
    assert final_width >= 30, f"Column width should not be below minimum: {final_width} >= 30"