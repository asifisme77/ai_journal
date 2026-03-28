/**
 * AI Journal - Main Application Script
 * 
 * Manages work items (tasks), journal entries with inline TinyMCE editors,
 * a timeline sidebar, and search/filter functionality.
 * 
 * Architecture:
 *   - DOMContentLoaded scope: fetchItems, renderItem, renderTimeline, search handlers
 *   - Global (window.*) scope: CRUD operations called from inline HTML event handlers
 *   - Utility functions: parseUTCDate, escapeHtml, createEntryElement
 */

// ============================================================================
// INITIALIZATION & CORE DATA FETCHING
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    const itemsContainer = document.getElementById('items-container');
    const addItemForm = document.getElementById('add-item-form');
    const headingInput = document.getElementById('heading-input');

    // Listen for custom event to render archived items from the timeline focus flow
    document.addEventListener('RenderArchivedItem', (e) => {
        renderItem(e.detail.itemObj, false, e.detail.container);
    });

    // Initial data load
    fetchItems();

    // ---------- New Work Item Form ----------
    addItemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const heading = headingInput.value.trim();
        if (!heading) return;

        try {
            const res = await fetch('/api/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ heading })
            });
            if (res.ok) {
                const newItem = await res.json();
                headingInput.value = '';
                renderItem(newItem, true);

                // Clear the "no tasks" empty state if present
                const loadingState = document.querySelector('.loading-state');
                if (loadingState) loadingState.remove();
            }
        } catch (error) {
            console.error('Error creating item:', error);
        }
    });

    // ---------- Fetch & Render All Items ----------

    /**
     * Fetches all work items from the API and renders them.
     * Active items (not DONE, or MEMO from today) go to the main column.
     * All items feed into the timeline sidebar.
     */
    async function fetchItems() {
        try {
            const res = await fetch('/api/items');
            const items = await res.json();

            // Store globally for the archived-item focus flow
            window.allItemsData = items;

            // Clear all containers
            itemsContainer.innerHTML = '';
            document.getElementById('timeline-container').innerHTML = '';
            document.getElementById('archived-container').innerHTML = '';
            document.getElementById('archived-header').style.display = 'none';

            // Filter to active items: exclude DONE; MEMO only shown on creation day
            const todayStr = new Date().toDateString();
            const activeItems = items.filter(item => {
                if (item.state === 'DONE') return false;
                if (item.state === 'MEMO') {
                    return parseUTCDate(item.created_at).toDateString() === todayStr;
                }
                return true;
            });

            if (activeItems.length === 0) {
                itemsContainer.innerHTML = '<div class="loading-state">No active tasks. Start by adding one!</div>';
            } else {
                activeItems.forEach(item => renderItem(item, false, itemsContainer));
            }

            renderTimeline(items);
        } catch (error) {
            console.error('Error fetching items:', error);
            itemsContainer.innerHTML = '<div class="loading-state" style="color:#ef4444">Failed to load entries.</div>';
            document.getElementById('timeline-container').innerHTML = '<div class="loading-state" style="color:#ef4444">Error loading timeline.</div>';
        }
    }

    // ---------- Render a Single Work Item ----------

    /**
     * Creates a work item card and appends/prepends it to the given container.
     * Each item has an expandable header and an entries section with TinyMCE editors.
     */
    function renderItem(item, prepend = false, container = itemsContainer) {
        const div = document.createElement('div');
        div.className = 'work-item';
        div.dataset.id = item.id;

        const dateObj = parseUTCDate(item.created_at);
        const timeStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' })
            + ' at '
            + dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

        div.innerHTML = `
            <div class="work-item-header">
                <div class="work-item-title-group">
                    <i class="ph ph-caret-down toggle-icon"></i>
                    <div style="display: flex; flex-direction: column; flex-grow: 1; min-width: 0; margin-right: 1rem;">
                        <input type="text" class="item-title-input" value="${escapeHtml(item.heading)}" onchange="updateItemHeading(${item.id}, this.value)" onclick="event.stopPropagation()">
                        <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 0.1rem; font-weight: normal;"><i class="ph ph-clock"></i> ${timeStr}</div>
                    </div>
                </div>
                <div class="item-actions" onclick="event.stopPropagation()">
                    <button class="btn-secondary btn-danger btn-small" style="padding: 0.25rem 0.5rem; margin-right: 0.5rem;" onclick="deleteItem(${item.id})"><i class="ph ph-trash"></i></button>
                    <div class="item-state-controls" style="display:inline-block;">
                        <select class="state-select state-${item.state}" onchange="updateState(${item.id}, this.value)">
                            <option value="TODO" ${item.state === 'TODO' ? 'selected' : ''}>TODO</option>
                            <option value="WIP" ${item.state === 'WIP' ? 'selected' : ''}>WIP</option>
                            <option value="MEMO" ${item.state === 'MEMO' ? 'selected' : ''}>MEMO</option>
                            <option value="DONE" ${item.state === 'DONE' ? 'selected' : ''}>DONE</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="work-item-content">
                <div class="content-inner">
                    <div class="entries-container" id="entries-${item.id}"></div>
                </div>
            </div>
        `;

        // Toggle expand/collapse on header click
        div.querySelector('.work-item-header').addEventListener('click', () => {
            div.classList.toggle('expanded');
        });

        if (prepend) {
            container.prepend(div);
        } else {
            container.appendChild(div);
        }

        // Populate journal entries (or show "Add First Entry" button)
        const entriesContainer = div.querySelector(`#entries-${item.id}`);
        if (item.entries && item.entries.length > 0) {
            item.entries.forEach((entry, index) => {
                const isLast = index === item.entries.length - 1;
                entriesContainer.appendChild(createEntryElement(entry, isLast));
            });
        } else {
            entriesContainer.innerHTML = `
                <div style="display: flex; justify-content: flex-start; margin-top: 0.5rem; padding-bottom: 0.5rem;">
                    <button class="btn-ghost" style="padding: 0.35rem 0.85rem; width: auto; font-size: 0.75rem; border-radius: 6px; font-weight: 500;" onclick="addEntry(${item.id})"><i class="ph ph-plus"></i> Add First Entry</button>
                </div>
            `;
        }
    }

    // ========================================================================
    // TIMELINE SIDEBAR
    // ========================================================================

    /**
     * Builds a nested Year > Month > Date > Entry tree for the timeline sidebar.
     * Entries are sorted newest-first. Each entry links back to its parent work item.
     */
    function renderTimeline(items) {
        // Flatten all entries with parent item reference
        const allEntries = [];
        items.forEach(item => {
            if (item.entries) {
                item.entries.forEach(entry => {
                    allEntries.push({ ...entry, parentItem: item });
                });
            }
        });

        if (allEntries.length === 0) {
            document.getElementById('timeline-container').innerHTML = '<div class="loading-state">No timeline activity.</div>';
            return;
        }

        // Sort entries newest-first
        allEntries.sort((a, b) => parseUTCDate(b.created_at) - parseUTCDate(a.created_at));

        // Build nested date tree: Year -> Month -> Date -> [entries]
        const tree = new Map();
        const todayStr = new Date().toDateString();

        allEntries.forEach(entry => {
            const dateObj = parseUTCDate(entry.created_at);
            const yearStr = dateObj.getFullYear().toString();
            const monthStr = dateObj.toLocaleDateString('en-US', { month: 'long' });
            const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            if (!tree.has(yearStr)) tree.set(yearStr, new Map());
            if (!tree.get(yearStr).has(monthStr)) tree.get(yearStr).set(monthStr, new Map());
            if (!tree.get(yearStr).get(monthStr).has(dateStr)) tree.get(yearStr).get(monthStr).set(dateStr, []);

            tree.get(yearStr).get(monthStr).get(dateStr).push(entry);
        });

        // Render the tree into collapsible <details> elements
        const timelineContainer = document.getElementById('timeline-container');

        for (const [year, months] of tree.entries()) {
            const yearDetails = document.createElement('details');
            yearDetails.className = 'timeline-year';
            yearDetails.open = true;
            yearDetails.innerHTML = `<summary>${year}</summary><div class="timeline-year-content"></div>`;
            const yearContent = yearDetails.querySelector('.timeline-year-content');

            for (const [month, dates] of months.entries()) {
                const monthDetails = document.createElement('details');
                monthDetails.className = 'timeline-month';
                monthDetails.open = true;
                monthDetails.innerHTML = `<summary>${month}</summary><div class="timeline-month-content"></div>`;
                const monthContent = monthDetails.querySelector('.timeline-month-content');

                for (const [dateStr, entries] of dates.entries()) {
                    const dateDetails = document.createElement('details');
                    dateDetails.className = 'timeline-date';
                    dateDetails.open = true;
                    dateDetails.innerHTML = `<summary>${dateStr}</summary><div class="timeline-date-content"></div>`;
                    const dateContent = dateDetails.querySelector('.timeline-date-content');

                    entries.forEach(entry => {
                        // Determine if this entry's parent item is archived
                        let isArchived = entry.parentItem.state === 'DONE';
                        if (entry.parentItem.state === 'MEMO') {
                            isArchived = parseUTCDate(entry.parentItem.created_at).toDateString() !== todayStr;
                        }

                        const stateClass = `timeline-item-${entry.parentItem.state.toLowerCase()}`;
                        const timeStr = parseUTCDate(entry.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

                        const entryDiv = document.createElement('div');
                        entryDiv.className = `timeline-item ${stateClass} ${isArchived ? 'timeline-item-archived' : ''}`;
                        entryDiv.innerHTML = `
                            <div class="timeline-task">${escapeHtml(entry.parentItem.heading)}</div>
                            <div class="timeline-entry-title">
                                <span class="timeline-entry-text">${escapeHtml(entry.title)}</span>
                                <span class="timeline-time">${timeStr}</span>
                            </div>
                        `;
                        entryDiv.onclick = () => window.focusEntry(entry.id, isArchived, entry.parentItem.id);
                        dateContent.appendChild(entryDiv);
                    });

                    monthContent.appendChild(dateDetails);
                }
                yearContent.appendChild(monthDetails);
            }
            timelineContainer.appendChild(yearDetails);
        }
    }

    // ========================================================================
    // SEARCH & FILTERING
    // ========================================================================

    const searchInput = document.getElementById('search-input');
    const advancedToggle = document.getElementById('search-advanced-toggle');
    const advancedPanel = document.getElementById('search-advanced');
    const searchApply = document.getElementById('search-apply');
    const searchClear = document.getElementById('search-clear');

    // Toggle advanced filters panel
    if (advancedToggle) {
        advancedToggle.addEventListener('click', () => advancedPanel.classList.toggle('hidden'));
    }

    // Debounced search on text input
    let searchDebounce;
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(performSearch, 300);
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') performSearch();
        });
    }

    if (searchApply) {
        searchApply.addEventListener('click', performSearch);
    }

    // Clear all search filters and restore full view
    if (searchClear) {
        searchClear.addEventListener('click', () => {
            searchInput.value = '';
            document.querySelectorAll('.search-state-chips input').forEach(cb => cb.checked = false);
            document.getElementById('search-from').value = '';
            document.getElementById('search-to').value = '';
            fetchItems();
        });
    }

    /**
     * Performs a search using the current filter values.
     * Only updates the timeline sidebar — main task list is preserved.
     */
    async function performSearch() {
        const q = searchInput.value.trim();
        const selectedStates = Array.from(document.querySelectorAll('.search-state-chips input:checked')).map(cb => cb.value).join(',');
        const dateFrom = document.getElementById('search-from').value;
        const dateTo = document.getElementById('search-to').value;

        // Empty filters = restore full view
        if (!q && !selectedStates && !dateFrom && !dateTo) {
            fetchItems();
            return;
        }

        const params = new URLSearchParams();
        if (q) params.append('q', q);
        if (selectedStates) params.append('state', selectedStates);
        if (dateFrom) params.append('from', dateFrom);
        if (dateTo) params.append('to', dateTo);

        try {
            const res = await fetch(`/api/search?${params.toString()}`);
            if (!res.ok) throw new Error('Search request failed');
            const items = await res.json();

            // Search only updates the timeline; main task list stays unchanged
            const timelineContainer = document.getElementById('timeline-container');
            timelineContainer.innerHTML = '';

            if (items.length === 0) {
                timelineContainer.innerHTML = '<div class="loading-state">No results.</div>';
            } else {
                renderTimeline(items);
            }
        } catch (error) {
            console.error('Search error:', error);
            document.getElementById('timeline-container').innerHTML = '<div class="loading-state" style="color:#ef4444">Search error.</div>';
        }
    }
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Parses a naive UTC datetime string from the backend (e.g. "2026-03-27 19:04:35")
 * into a local Date object. Appends 'Z' suffix if no timezone info is present.
 */
function parseUTCDate(dateString) {
    if (!dateString) return new Date();
    let d = String(dateString).replace(' ', 'T');
    if (!d.endsWith('Z') && !d.includes('+') && !d.match(/-\d{2}:\d{2}$/)) {
        d += 'Z';
    }
    return new Date(d);
}

/**
 * Escapes HTML special characters to prevent XSS in dynamically-inserted content.
 */
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ============================================================================
// ENTRY ELEMENT CREATION & TINYMCE INITIALIZATION
// ============================================================================

/**
 * Calculates the total visual indentation of a block element.
 * Combines padding-left, margin-left, and nested list depth.
 * Used by both the outliner and the indent-aware insertion commands.
 */
function getBlockIndent(editor, block) {
    const pl = parseInt(editor.dom.getStyle(block, 'padding-left') || 0, 10);
    const ml = parseInt(editor.dom.getStyle(block, 'margin-left') || 0, 10);
    const node = editor.selection.getNode();
    const listDepth = editor.dom.getParents(node, 'OL,UL').length;
    return pl + ml + (listDepth * 20);
}

/**
 * Calculates indent for a specific block element in the outliner context.
 * Unlike getBlockIndent, this recomputes list depth relative to the block itself.
 */
function getOutlinerIndent(editor, block) {
    const pl = parseInt(editor.dom.getStyle(block, 'padding-left') || 0, 10);
    const ml = parseInt(editor.dom.getStyle(block, 'margin-left') || 0, 10);
    const listDepth = editor.dom.getParents(block, 'OL,UL').length;
    return pl + ml + (listDepth * 20);
}

/**
 * Initializes resizable columns for tables within log blocks.
 * Adds resize handles to each column that users can drag to resize.
 */
function initResizableLogBlockColumns(editor) {
    const logBlocks = editor.dom.select('details.log-block');

    logBlocks.forEach(function(logBlock) {
        const table = editor.dom.select('table', logBlock)[0];
        if (!table) return;

        const rows = editor.dom.select('tr', table);
        if (rows.length === 0) return;

        // Initialize column widths if not set
        const firstRow = rows[0];
        const cells = editor.dom.select('td, th', firstRow);
        const numCols = cells.length;

        // Force equal column widths initially
        cells.forEach(function(cell) {
            cell.style.width = (100 / numCols) + '%';
        });

        // Set all cells to have explicit widths
        rows.forEach(function(row) {
            editor.dom.select('td, th', row).forEach(function(cell, idx) {
                if (!cell.style.width) {
                    cell.style.width = (100 / numCols) + '%';
                }
            });
        });
    });

    // Add mousedown handler to the editor's entire content area
    editor.on('mousedown', function(e) {
        const cell = editor.dom.getParent(e.target, 'td,th');
        if (!cell) return;

        const table = editor.dom.getParent(cell, 'table');
        if (!table || !editor.dom.getParent(table, 'details.log-block')) return;

        // Only allow resize if clicking on the right edge (last 15px of cell)
        const rect = cell.getBoundingClientRect();
        const cellRightEdge = rect.right;
        const clickX = e.clientX;

        if (cellRightEdge - clickX > 15) return; // Not near the right edge

        // Check if this is the last column
        const row = editor.dom.getParent(cell, 'tr');
        const rowCells = editor.dom.select('td,th', row);
        let cellIndex = -1;
        for (let i = 0; i < rowCells.length; i++) {
            if (rowCells[i] === cell) {
                cellIndex = i;
                break;
            }
        }

        if (cellIndex === rowCells.length - 1) return; // No resize on last column

        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;
        const startWidth = cell.offsetWidth;
        const tableNode = editor.dom.getParent(cell, 'table');
        const tableRows = editor.dom.select('tr', tableNode);

        // Get all cells in this column
        const colCells = [];
        tableRows.forEach(function(row) {
            const cells = editor.dom.select('td,th', row);
            if (cells[cellIndex]) {
                colCells.push(cells[cellIndex]);
            }
        });

        function onMouseMove(e) {
            const diff = e.clientX - startX;
            const newWidth = Math.max(30, startWidth + diff);
            colCells.forEach(function(cell) {
                cell.style.width = newWidth + 'px';
            });
        }

        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}




/**
 * Creates a journal entry DOM element with an inline TinyMCE editor.
 * @param {Object} entry - Entry data from the API
 * @param {boolean} isLast - Whether this is the last entry (shows the + button)
 * @returns {HTMLElement} The entry DOM element
 */
function createEntryElement(entry, isLast = false) {
    const entryDiv = document.createElement('div');
    entryDiv.className = 'journal-entry';
    entryDiv.dataset.entryId = entry.id;

    const dateObj = parseUTCDate(entry.created_at);
    const dateStr = dateObj.toLocaleDateString()
        + ' at '
        + dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    // Only the last entry in a work item gets the green "+" button
    const addButtonHTML = isLast
        ? `<button class="btn-secondary btn-small" style="border: none; padding: 0.25rem; color: #4ade80; margin-right: 2px;" onclick="addEntry(${entry.work_item_id})" title="Add new entry"><i class="ph ph-plus-circle"></i></button>`
        : '';

    entryDiv.innerHTML = `
        <div class="entry-header" style="display: flex; gap: 0.5rem; align-items: center; justify-content: space-between; flex-wrap: nowrap; overflow: visible; min-height: 28px;">
            <input type="text" class="entry-title-input" value="${escapeHtml(entry.title)}" onchange="updateEntryTitle(${entry.id}, this.value)" style="flex-grow: 1; flex-shrink: 1; min-width: 40px; margin-right: 0; padding: 0.15rem;">
            <div id="toolbar-${entry.id}" class="entry-toolbar-container"></div>
            <div class="entry-meta" style="display: flex; align-items: center; gap: 0.25rem; flex-shrink: 0; margin-left: auto;">
                <span class="entry-date" style="white-space: nowrap;">${dateStr}</span>
                ${addButtonHTML}
                <button class="btn-secondary btn-danger btn-small" style="border: none; padding: 0.25rem;" onclick="deleteEntry(${entry.id})"><i class="ph ph-trash"></i></button>
            </div>
        </div>
        <div id="tinymce-${entry.id}" class="tinymce-editor">${entry.content || '<p><br></p>'}</div>
    `;

    // Initialize TinyMCE on next tick (element must be in DOM first)
    setTimeout(() => initTinyMCE(entry), 0);

    return entryDiv;
}

/**
 * Initializes a TinyMCE inline editor for a journal entry.
 * Configures: outliner, auto-save, custom toolbar buttons, click handlers,
 * table indentation, and keyboard shortcuts.
 */
function initTinyMCE(entry) {
    const targetId = `tinymce-${entry.id}`;

    // Remove any pre-existing editor instance for this target
    if (tinymce.get(targetId)) {
        tinymce.get(targetId).remove();
    }

    tinymce.init({
        selector: `#${targetId}`,
        inline: true,
        indentation: '20px',
        fixed_toolbar_container: `#toolbar-${entry.id}`,
        ui_container: 'body',
        skin: 'oxide-dark',
        menubar: false,
        statusbar: false,
        extended_valid_elements: 'details[class|open|style],summary',
        plugins: 'lists link table autolink nonbreaking forecolor backcolor',
        toolbar: 'blocks fontfamily forecolor backcolor | bold italic underline | bullist numlist | outdent indent | table link embedfile collapsible | removeformatwithindent',
        table_default_attributes: {
            border: '0'
        },
        table_default_styles: {
            width: '60%',
            'border-collapse': 'collapse'
        },
        table_resize_bars: true,
        table_column_resizing: true,
        table_use_colgroups: false,

        setup: function(editor) {

            // ================================================================
            // OUTLINER: Indent-based collapsible sections
            // ================================================================

            /**
             * Scans all block elements and assigns parent-node / collapsed /
             * hidden-by-collapse classes based on indentation hierarchy.
             * A block is a "parent" only if it has text content and the next
             * block is more deeply indented.
             */
            function updateOutliner() {
                const blocks = editor.dom.select('p, h1, h2, h3, h4, h5, h6, li, details');
                let hideThreshold = Infinity;

                for (let i = 0; i < blocks.length; i++) {
                    const block = blocks[i];
                    const currentIndent = getOutlinerIndent(editor, block);

                    // Determine if this block is a collapsible parent
                    let isParent = false;
                    if (i + 1 < blocks.length) {
                        const nextIndent = getOutlinerIndent(editor, blocks[i + 1]);
                        if (nextIndent > currentIndent) {
                            // Skip blank/empty lines — they shouldn't show a collapse chevron
                            const textContent = (block.textContent || '').replace(/[\s\u00a0]/g, '');
                            if (textContent.length > 0) {
                                isParent = true;
                            }
                        }
                    }

                    // Apply or remove parent-node class
                    if (isParent) {
                        editor.dom.addClass(block, 'parent-node');
                    } else {
                        editor.dom.removeClass(block, 'parent-node');
                        editor.dom.removeClass(block, 'collapsed');
                    }

                    // Apply collapse visibility: blocks deeper than a collapsed parent are hidden
                    if (currentIndent <= hideThreshold) {
                        hideThreshold = Infinity;
                    }
                    if (currentIndent > hideThreshold) {
                        editor.dom.addClass(block, 'hidden-by-collapse');
                    } else {
                        editor.dom.removeClass(block, 'hidden-by-collapse');
                        if (editor.dom.hasClass(block, 'collapsed')) {
                            hideThreshold = currentIndent;
                        }
                    }
                }
            }

            // Debounced outliner refresh (fires on content/structure changes)
            let outlinerTimeout;
            function triggerOutlinerUpdate() {
                clearTimeout(outlinerTimeout);
                outlinerTimeout = setTimeout(updateOutliner, 50);
            }

            editor.on('NodeChange KeyUp ExecCommand', triggerOutlinerUpdate);

            // ================================================================
            // AUTO-SAVE: Debounced content persistence
            // ================================================================

            let lastSavedContent = null;
            let saveTimeout;

            const triggerSave = async () => {
                const currentContent = editor.getContent();
                if (currentContent !== lastSavedContent) {
                    try {
                        await fetch(`/api/entries/${entry.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ content: currentContent })
                        });
                        lastSavedContent = currentContent;
                    } catch (error) {
                        console.error('Auto-save error:', error);
                    }
                }
            };

            // Save immediately on blur, debounced (2s) on edit
            editor.on('blur', () => {
                clearTimeout(saveTimeout);
                triggerSave();
            });

            editor.on('input change keyup NodeChange', () => {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(triggerSave, 2000);
            });

            // ================================================================
            // EDITOR INIT: Migrations & initial state
            // ================================================================

            editor.on('init', function() {
                // Migration: strip <code> wrappers from legacy log blocks
                // (old log blocks used <pre><code>..., which TinyMCE auto-selects on click)
                const codeEls = editor.dom.select('details.log-block pre code');
                codeEls.forEach(function(codeEl) {
                    const parent = codeEl.parentNode;
                    while (codeEl.firstChild) {
                        parent.insertBefore(codeEl.firstChild, codeEl);
                    }
                    parent.removeChild(codeEl);
                });

                triggerOutlinerUpdate();
                lastSavedContent = editor.getContent();
                initResizableLogBlockColumns(editor);
            });

            // Initialize resizable columns on content changes
            editor.on('SetContent', function() {
                initResizableLogBlockColumns(editor);
            });

            // ================================================================
            // CUSTOM TOOLBAR BUTTONS
            // ================================================================

            /**
             * Collapsible Log Block button: inserts a <details> block with a <pre>
             * area for pasting logs/code. Inherits current indentation level.
             */
            editor.ui.registry.addButton('collapsible', {
                icon: 'chevron-down',
                tooltip: 'Insert Collapsible Log Block',
                onAction: function() {
                    const node = editor.selection.getNode();
                    const block = editor.dom.getParent(node, editor.dom.isBlock);
                    let indent = 0;

                    if (block) {
                        indent += parseInt(editor.dom.getStyle(block, 'padding-left') || 0, 10);
                        indent += parseInt(editor.dom.getStyle(block, 'margin-left') || 0, 10);
                    }
                    indent += editor.dom.getParents(node, 'OL,UL').length * 20;

                    const marginStyle = indent > 0 ? ` style="margin-left: ${indent}px;"` : '';
                    const pStyle = indent > 0 ? ` style="padding-left: ${indent}px;"` : '';

                    editor.insertContent(
                        `<details class="log-block"${marginStyle}>`
                        + `<summary>Logs (click to expand) <span class="delete-log-block" contenteditable="false" title="Delete this block" style="float: right; margin-right: 8px; color: #ef4444; font-size: 14px;">&times;</span></summary>`
                        + `<pre>Paste logs/code here...</pre>`
                        + `</details>`
                        + `<p${pStyle}>&nbsp;</p>`
                    );
                }
            });

            /**
             * Embed File button: opens a file picker, uploads to the server,
             * and inserts an image or download link into the editor.
             */
            editor.ui.registry.addButton('embedfile', {
                icon: 'upload',
                tooltip: 'Embed File or Image',
                onAction: function() {
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.onchange = async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;

                        const formData = new FormData();
                        formData.append('file', file);

                        try {
                            const res = await fetch('/api/upload', { method: 'POST', body: formData });
                            if (res.ok) {
                                const data = await res.json();
                                if (data.is_image) {
                                    editor.insertContent(`<img src="${data.url}" alt="${data.original_name}" style="max-width: 100%; height: auto; border-radius: 6px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin: 10px 0;" />`);
                                } else {
                                    editor.insertContent(`<a href="${data.url}" class="embedded-file" contenteditable="false" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: rgba(255,255,255,0.05); border-radius: 4px; text-decoration: none; border: 1px solid rgba(255,255,255,0.1); margin: 0.25rem 0; cursor: pointer;">📄 ${data.original_name}</a>&nbsp;`);
                                }
                            } else {
                                alert('Failed to upload file');
                            }
                        } catch (error) {
                            console.error('Upload Error:', error);
                            alert('Error uploading file');
                        }
                    };
                    fileInput.click();
                }
            });

            /**
             * Remove Format with Indentation: removes text formatting (bold, italic, colors, links, etc.)
             * while preserving the block's indentation level.
             */
            editor.ui.registry.addButton('removeformatwithindent', {
                icon: 'remove-formatting',
                tooltip: 'Clear Formatting',
                onAction: function() {
                    const node = editor.selection.getNode();
                    const block = editor.dom.getParent(node, editor.dom.isBlock);

                    if (block) {
                        // Preserve indentation styles
                        const paddingLeft = editor.dom.getStyle(block, 'padding-left');
                        const marginLeft = editor.dom.getStyle(block, 'margin-left');

                        // Remove all formatting including links
                        editor.execCommand('removeFormat', false, {
                            'selector': 'b,strong,i,em,u,strike,s,sub,sup,span,font,a',
                            'attributes': ['style', 'class', 'id', 'title', 'href', 'target', 'rel']
                        });

                        // Also remove any remaining links specifically
                        const links = editor.dom.select('a');
                        links.forEach(function(link) {
                            const text = link.textContent || link.innerText;
                            editor.dom.replace(editor.dom.create('span', {}, text), link);
                        });

                        // Restore indentation
                        if (paddingLeft) editor.dom.setStyle(block, 'padding-left', paddingLeft);
                        if (marginLeft) editor.dom.setStyle(block, 'margin-left', marginLeft);
                    } else {
                        // Remove all formatting including links
                        editor.execCommand('removeFormat', false, {
                            'selector': 'b,strong,i,em,u,strike,s,sub,sup,span,font,a',
                            'attributes': ['style', 'class', 'id', 'title', 'href', 'target', 'rel']
                        });

                        // Also remove any remaining links specifically
                        const links = editor.dom.select('a');
                        links.forEach(function(link) {
                            const text = link.textContent || link.innerText;
                            editor.dom.replace(editor.dom.create('span', {}, text), link);
                        });
                    }
                }
            });

            // ================================================================
            // CLICK HANDLERS: Embedded files, log blocks, outliner toggles
            // ================================================================

            editor.on('click', function(e) {
                // --- Embedded file links: open natively on Windows ---
                const embeddedLink = editor.dom.getParent(e.target, 'a.embedded-file');
                if (embeddedLink) {
                    e.preventDefault();
                    const urlParts = embeddedLink.href.split('/');
                    const filename = urlParts[urlParts.length - 1];

                    // Try native OS open via backend; fallback to browser tab
                    fetch('/api/open/' + encodeURIComponent(filename))
                        .then(res => { if (!res.ok) window.open(embeddedLink.href, '_blank'); })
                        .catch(() => window.open(embeddedLink.href, '_blank'));
                    return;
                }

                // --- Log block delete button ---
                if (e.target.classList && e.target.classList.contains('delete-log-block')) {
                    const detailsBlock = editor.dom.getParent(e.target, 'DETAILS');
                    if (detailsBlock) {
                        editor.dom.remove(detailsBlock);
                        updateOutliner();
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }

                // --- <details>/<summary> toggle (TinyMCE blocks native toggle) ---
                if (e.target.nodeName === 'SUMMARY') {
                    const details = e.target.parentNode;
                    if (details && details.nodeName === 'DETAILS') {
                        if (details.hasAttribute('open')) {
                            details.removeAttribute('open');
                        } else {
                            details.setAttribute('open', 'open');
                        }
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }

                // --- Outliner collapse toggle (click on chevron area) ---
                const block = editor.dom.getParent(e.target, editor.dom.isBlock);
                // Skip tables and anything inside tables
                if (block && block.nodeName === 'TABLE') return;
                if (editor.dom.getParent(e.target, 'table')) return;

                if (block && editor.dom.hasClass(block, 'parent-node')) {
                    const indent = getOutlinerIndent(editor, block);
                    const bodyRect = editor.getBody().getBoundingClientRect();
                    const clickX = e.clientX - bodyRect.left;
                    const bodyPaddingLeft = parseInt(window.getComputedStyle(editor.getBody()).paddingLeft || 0, 10);
                    const textStartX = bodyPaddingLeft + indent;

                    // Click must be in the narrow gutter zone just left of text
                    if (clickX >= textStartX - 25 && clickX <= textStartX + 5) {
                        editor.dom.toggleClass(block, 'collapsed');
                        updateOutliner();
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }
                }
            });

            // ================================================================
            // TABLE INDENTATION: Preserve indent level on table insert
            // ================================================================

            let tableInsertIndent = 0;

            // Capture current indent before table insertion
            editor.on('BeforeExecCommand', function(e) {
                if (e.command === 'mceInsertTable') {
                    const node = editor.selection.getNode();
                    const block = editor.dom.getParent(node, editor.dom.isBlock);
                    tableInsertIndent = 0;

                    if (block) {
                        tableInsertIndent += parseInt(editor.dom.getStyle(block, 'padding-left') || 0, 10);
                        tableInsertIndent += parseInt(editor.dom.getStyle(block, 'margin-left') || 0, 10);
                    }
                    tableInsertIndent += editor.dom.getParents(node, 'OL,UL').length * 20;
                }
            });

            // Apply indent to newly inserted table and ensure trailing paragraph
            editor.on('ExecCommand', function(e) {
                if (e.command === 'mceInsertTable' && tableInsertIndent > 0) {
                    const node = editor.selection.getNode();
                    const tableNode = editor.dom.getParent(node, 'TABLE');

                    if (tableNode) {
                        // Indent the table itself
                        editor.dom.setStyle(tableNode, 'margin-left', tableInsertIndent + 'px');
                        if (tableNode.style.width === '100%') {
                            editor.dom.setStyle(tableNode, 'width', `calc(100% - ${tableInsertIndent}px)`);
                        }

                        // Ensure a paragraph after the table maintains the same indent
                        const nextNode = tableNode.nextSibling;
                        if (!nextNode || nextNode.nodeName !== 'P') {
                            const p = editor.dom.create('p', { style: `padding-left: ${tableInsertIndent}px;` }, '<br data-mce-bogus="1">');
                            editor.dom.insertAfter(p, tableNode);
                        } else {
                            editor.dom.setStyle(nextNode, 'padding-left', tableInsertIndent + 'px');
                        }
                    }
                }
            });

            // ================================================================
            // KEYBOARD: Tab key for indent/outdent
            // ================================================================

            editor.on('keydown', function(event) {
                if (event.keyCode === 9) {
                    editor.execCommand(event.shiftKey ? 'Outdent' : 'Indent');
                    event.preventDefault();
                    event.stopPropagation();
                    return false;
                }
            });
        }
    });
}

// ============================================================================
// GLOBAL CRUD OPERATIONS (called from inline HTML event handlers)
// ============================================================================

/**
 * Creates a new journal entry under a work item.
 * Removes existing "+" buttons, appends the new entry, and auto-expands the item.
 */
window.addEntry = async function(itemId) {
    const now = new Date();
    const dateTitle = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        + ' at '
        + now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    try {
        const res = await fetch(`/api/items/${itemId}/entries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: dateTitle, content: '' })
        });

        if (res.ok) {
            const newEntry = await res.json();
            const entriesContainer = document.getElementById(`entries-${itemId}`);

            // Remove existing "+" buttons and "Add First Entry" ghost button
            entriesContainer.querySelectorAll('.ph-plus-circle').forEach(icon => icon.parentElement.remove());
            const addFirstBtn = entriesContainer.querySelector('.btn-ghost');
            if (addFirstBtn) addFirstBtn.parentElement.remove();

            entriesContainer.appendChild(createEntryElement(newEntry, true));

            // Auto-expand the parent work item
            const workItem = document.querySelector(`.work-item[data-id="${itemId}"]`);
            if (workItem && !workItem.classList.contains('expanded')) {
                workItem.classList.add('expanded');
            }
        }
    } catch (error) {
        console.error('Error adding entry:', error);
    }
};

/** Updates a journal entry's title via the API. */
window.updateEntryTitle = async function(entryId, newTitle) {
    try {
        await fetch(`/api/entries/${entryId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle })
        });
    } catch (error) {
        console.error('Error updating entry title:', error);
    }
};

/** Updates a work item's heading via the API. */
window.updateItemHeading = async function(id, newHeading) {
    if (!newHeading.trim()) return;
    try {
        await fetch(`/api/items/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ heading: newHeading.trim() })
        });
    } catch (error) {
        console.error('Error updating item heading:', error);
    }
};

/**
 * Deletes a journal entry after user confirmation.
 * Handles DOM cleanup: removes the entry, reassigns the "+" button to the new
 * last entry, or shows the "Add First Entry" button if no entries remain.
 */
window.deleteEntry = async function(entryId) {
    if (!confirm('Delete this entry?')) return;

    try {
        const res = await fetch(`/api/entries/${entryId}`, { method: 'DELETE' });

        if (res.ok || res.status === 204) {
            const el = document.querySelector(`.journal-entry[data-entry-id="${entryId}"]`);
            if (el) {
                const container = el.parentElement;
                const workItemId = container.id.split('-')[1];
                el.remove();

                const remainingEntries = container.querySelectorAll('.journal-entry');
                if (remainingEntries.length === 0) {
                    // No entries left — show "Add First Entry" button
                    container.innerHTML = `
                        <div style="display: flex; justify-content: flex-start; margin-top: 0.5rem; padding-bottom: 0.5rem;">
                            <button class="btn-ghost" style="padding: 0.35rem 0.85rem; width: auto; font-size: 0.75rem; border-radius: 6px; font-weight: 500;" onclick="addEntry(${workItemId})"><i class="ph ph-plus"></i> Add First Entry</button>
                        </div>
                    `;
                } else {
                    // Move "+" button to the new last entry
                    const newLastEntry = remainingEntries[remainingEntries.length - 1];
                    const metaDiv = newLastEntry.querySelector('.entry-meta');
                    if (metaDiv && !metaDiv.querySelector('.ph-plus-circle')) {
                        const plusHTML = `<button class="btn-secondary btn-small" style="border: none; padding: 0.25rem; color: #4ade80; margin-right: 2px;" onclick="addEntry(${workItemId})" title="Add new entry"><i class="ph ph-plus-circle"></i></button>`;
                        const trashBtn = metaDiv.querySelector('.btn-danger');
                        if (trashBtn) trashBtn.insertAdjacentHTML('beforebegin', plusHTML);
                        else metaDiv.insertAdjacentHTML('beforeend', plusHTML);
                    }
                }
            }

            // Clean up TinyMCE instance
            const editor = tinymce.get(`tinymce-${entryId}`);
            if (editor) editor.remove();
        }
    } catch (error) {
        console.error('Error deleting entry:', error);
    }
};

/**
 * Updates a work item's state (TODO/WIP/MEMO/DONE) and reloads the page.
 * Full reload is used because state changes affect filtering, sorting, and archiving.
 */
window.updateState = async function(id, newState) {
    try {
        const res = await fetch(`/api/items/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: newState })
        });
        if (res.ok) {
            window.location.reload();
        }
    } catch (error) {
        console.error('Error updating state:', error);
    }
};

/** Deletes a work item and all its entries after user confirmation. */
window.deleteItem = async function(id) {
    if (!confirm('Are you sure you want to delete this Work Item and ALL nested journals?')) return;

    try {
        const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });

        if (res.ok || res.status === 204) {
            const el = document.querySelector(`.work-item[data-id="${id}"]`);
            if (el) el.remove();

            // Show empty state if no items remain
            const container = document.getElementById('items-container');
            if (container.children.length === 0) {
                container.innerHTML = '<div class="loading-state">No journal entries yet. Start by adding one!</div>';
            }
        }
    } catch (error) {
        console.error('Error deleting item:', error);
    }
};

// ============================================================================
// TIMELINE FOCUS: Scroll to and highlight an entry from the sidebar
// ============================================================================

/**
 * Focuses a specific journal entry, scrolling to it and pulsing a highlight.
 * If the entry belongs to a DONE/archived item, renders it in the archived section.
 */
window.focusEntry = function(entryId, isArchived, itemId) {
    if (isArchived) {
        const archivedContainer = document.getElementById('archived-container');
        const existingItem = archivedContainer.querySelector(`.work-item[data-id="${itemId}"]`);

        if (!existingItem) {
            const itemObj = window.allItemsData.find(i => i.id === itemId);
            if (itemObj) {
                document.getElementById('archived-header').style.display = 'flex';
                // Dispatch event to renderItem (which is scoped inside DOMContentLoaded)
                document.dispatchEvent(new CustomEvent('RenderArchivedItem', {
                    detail: { itemObj, container: archivedContainer }
                }));
            }
        }

        setTimeout(() => {
            const div = archivedContainer.querySelector(`.work-item[data-id="${itemId}"]`);
            if (div && !div.classList.contains('expanded')) div.classList.add('expanded');
        }, 50);
    } else {
        const div = document.querySelector(`#items-container .work-item[data-id="${itemId}"]`);
        if (div && !div.classList.contains('expanded')) div.classList.add('expanded');
    }

    // Scroll to entry and apply highlight pulse animation
    setTimeout(() => {
        const entryEl = document.querySelector(`.journal-entry[data-entry-id="${entryId}"]`);
        if (entryEl) {
            entryEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            entryEl.classList.add('highlight-pulse');
            setTimeout(() => entryEl.classList.remove('highlight-pulse'), 2000);

            const editor = tinymce.get(`tinymce-${entryId}`);
            if (editor) editor.focus();
        }
    }, 200);
};
