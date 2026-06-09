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

// Immediate theme initialization to prevent flash
const savedTheme = localStorage.getItem('theme') || 'dark';
if (savedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
}

document.addEventListener('DOMContentLoaded', () => {
    const itemsContainer = document.getElementById('items-container');
    const addItemForm = document.getElementById('add-item-form');
    const headingInput = document.getElementById('heading-input');

    // Listen for custom event to render archived items from the timeline focus flow
    document.addEventListener('RenderArchivedItem', (e) => {
        renderItem(e.detail.itemObj, false, e.detail.container);
    });

    // Initial data load
    initThemeToggle();
    fetchItems();
    initResizableSidebar();
    initSidebarSections();

    /**
     * Initializes the theme toggle button action.
     */
    function initThemeToggle() {
        const themeBtn = document.getElementById('theme-toggle');
        if (!themeBtn) return;

        // Set initial icon
        themeBtn.innerHTML = document.documentElement.getAttribute('data-theme') === 'light'
            ? '<i class="ph ph-moon"></i>'
            : '<i class="ph ph-sun"></i>';

        // Expose toggle globally to ensure DOM can access it directly via onclick
        window.toggleTheme = function (e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            const isLight = document.documentElement.getAttribute('data-theme') === 'light';
            const newTheme = isLight ? 'dark' : 'light';

            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            console.log("Theme switched to", newTheme);

            const themeBtn = document.getElementById('theme-toggle');
            if (themeBtn) {
                themeBtn.innerHTML = newTheme === 'light' ? '<i class="ph ph-moon"></i>' : '<i class="ph ph-sun"></i>';
            }

            // Update TinyMCE skin and content CSS dynamically
            document.querySelectorAll('link[href*="tinymce"]').forEach(link => {
                if (newTheme === 'light') {
                    link.href = link.href.replace('/oxide-dark/', '/oxide/').replace('/content/dark/', '/content/default/');
                } else {
                    link.href = link.href.replace('/oxide/', '/oxide-dark/').replace('/content/default/', '/content/dark/');
                }
            });
        };

        themeBtn.addEventListener('click', window.toggleTheme);
    }

    /**
     * Initializes collapsible sidebar section headers.
     */
    function initSidebarSections() {
        document.querySelectorAll('.sidebar-section-header').forEach(header => {
            header.addEventListener('click', (e) => {
                // Don't toggle when clicking buttons inside the header
                if (e.target.closest('button')) return;
                header.closest('.sidebar-section').classList.toggle('open');
            });
        });
    }

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

    /**
     * Initializes the resizable sidebar logic.
     */
    function initResizableSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const resizer = document.getElementById('sidebar-resizer');
        if (!sidebar || !resizer) return;

        let isResizing = false;

        resizer.addEventListener('mousedown', (event) => {
            isResizing = true;
            document.body.classList.add('body-resizing'); // Consistent with CSS

            // Prevent pointer events on the iframe/editors while resizing to avoid focus issues
            document.querySelectorAll('iframe').forEach(ifr => ifr.style.pointerEvents = 'none');

            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', stopResizing);
        });

        function handleMouseMove(event) {
            if (!isResizing) return;

            // Width is based on viewport mouse position
            let newWidth = event.clientX;

            // Constrain limits
            if (newWidth < 200) newWidth = 200;
            if (newWidth > 800) newWidth = 800;

            sidebar.style.width = `${newWidth}px`;

            // If the sidebar is too narrow, we might want to hide some overflow or truncate text
            // But usually the width control is enough
        }

        function stopResizing() {
            if (!isResizing) return;
            isResizing = false;
            document.body.classList.remove('body-resizing');

            // Re-enable pointer events
            document.querySelectorAll('iframe').forEach(ifr => ifr.style.pointerEvents = 'auto');

            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', stopResizing);
        }
    }

    /**
     * Fetches all reminders from API and displays them.
     */
    async function fetchReminders() {
        try {
            const res = await fetch('/api/markers/reminders');
            const reminders = await res.json();
            const container = document.getElementById('reminders-container');
            container.innerHTML = '';

            if (reminders.length === 0) {
                container.innerHTML = '<div class="loading-state">No active reminders.</div>';
                return;
            }

            reminders.forEach(marker => {
                let timeStr = '';
                let isOverdue = false;
                if (marker.reminder_due_date) {
                    const dateObj = parseUTCDate(marker.reminder_due_date);
                    isOverdue = dateObj < new Date();
                    const icon = isOverdue ? '<i class="ph ph-warning-circle overdue-icon"></i>' : '<i class="ph ph-bell-ringing"></i>';
                    timeStr = `${icon} ${dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
                } else {
                    const dateObj = parseUTCDate(marker.created_at);
                    timeStr = '<i class="ph ph-clock"></i> ' + dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
                }

                const div = document.createElement('div');
                div.className = `reminder-item ${isOverdue ? 'has-reminder is-overdue' : ''}`;
                div.innerHTML = `
                    <div class="reminder-item-text" title="${escapeHtml(marker.text)}">"${escapeHtml(marker.text)}"</div>
                    <div class="reminder-item-meta">
                        <span class="reminder-item-task">${escapeHtml(marker.work_item_heading)}</span>
                        <span class="reminder-item-time">${timeStr}</span>
                    </div>
                `;
                div.onclick = () => window.focusEntry(marker.entry_id, marker.is_archived, marker.work_item_id, marker.is_status_marker ? null : marker.id);
                div.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.openMarkerPopover(
                        marker.id,
                        e.clientX,
                        e.clientY,
                        null,
                        null,
                        marker.entry_id,
                        marker.is_status_marker
                    );
                });
                container.appendChild(div);
            });
        } catch (error) {
            console.error('Error fetching reminders:', error);
        }
    }

    /**
     * Fetches all MEMO items and folders, renders the Memos sidebar section.
     */
    async function fetchMemos() {
        try {
            const res = await fetch('/api/memo-folders');
            const data = await res.json();
            const container = document.getElementById('memos-container');
            container.innerHTML = '';

            const { folders, root_memos } = data;

            if (folders.length === 0 && root_memos.length === 0) {
                container.innerHTML = '<div class="loading-state">No memos yet.</div>';
                return;
            }

            // We need a flattened list of folders for the buildMemoItem dropdowns
            const allFoldersFlattened = [];
            function flatten(folderList) {
                folderList.forEach(f => {
                    allFoldersFlattened.push(f);
                    if (f.children) flatten(f.children);
                });
            }
            flatten(folders);

            // Build a path map: folder id -> "Parent > Sub > Sub" breadcrumb
            const pathMap = {};
            function buildPaths(folderList, parentPath) {
                folderList.forEach(f => {
                    const thisPath = parentPath ? parentPath + ' › ' + f.name : f.name;
                    pathMap[f.id] = thisPath;
                    if (f.children) buildPaths(f.children, thisPath);
                });
            }
            buildPaths(folders, '');

            // Recursive function to render a folder and its children/items
            function renderFolder(folder, targetContainer) {
                const folderEl = document.createElement('div');
                folderEl.className = 'memo-folder';
                folderEl.dataset.folderId = folder.id;

                folderEl.innerHTML = `
                    <div class="memo-folder-header" data-folder-id="${folder.id}">
                        <i class="ph ph-caret-down memo-folder-caret"></i>
                        <i class="ph ph-folder memo-folder-icon"></i>
                        <span class="memo-folder-name" title="${escapeHtml(folder.name)}">${escapeHtml(folder.name)}</span>
                        <div class="memo-folder-actions">
                            <button class="memo-folder-add-sub-btn" title="New subfolder" data-folder-id="${folder.id}">
                                <i class="ph ph-folder-plus"></i>
                            </button>
                            <button class="memo-folder-delete-btn" title="Delete folder" data-folder-id="${folder.id}">
                                <i class="ph ph-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="memo-folder-content">
                        <div class="memo-folder-children"></div>
                        <div class="memo-folder-items"></div>
                    </div>
                `;

                const contentEl = folderEl.querySelector('.memo-folder-content');
                const childrenContainer = folderEl.querySelector('.memo-folder-children');
                const itemsContainer = folderEl.querySelector('.memo-folder-items');

                // Render subfolders
                if (folder.children && folder.children.length > 0) {
                    folder.children.forEach(child => renderFolder(child, childrenContainer));
                }

                // Render items
                if (folder.items && folder.items.length > 0) {
                    folder.items.forEach(item => {
                        itemsContainer.appendChild(buildMemoItem(item, allFoldersFlattened, pathMap));
                    });
                } else if (!folder.children || folder.children.length === 0) {
                    itemsContainer.innerHTML = '<div class="memo-empty-folder">Empty</div>';
                }

                // Toggle collapse
                folderEl.querySelector('.memo-folder-header').addEventListener('click', (e) => {
                    if (e.target.closest('button')) return;
                    folderEl.classList.toggle('collapsed');
                });

                // --- Drag-and-drop: folder as a drop target ---
                const headerEl = folderEl.querySelector('.memo-folder-header');
                headerEl.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    headerEl.classList.add('memo-drop-target');
                    // Auto-expand collapsed folder on hover
                    if (folderEl.classList.contains('collapsed')) {
                        folderEl.classList.remove('collapsed');
                    }
                });
                headerEl.addEventListener('dragleave', (e) => {
                    headerEl.classList.remove('memo-drop-target');
                });
                headerEl.addEventListener('drop', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    headerEl.classList.remove('memo-drop-target');
                    const draggedItemId = e.dataTransfer.getData('text/memo-item-id');
                    if (!draggedItemId) return;
                    await fetch(`/api/items/${draggedItemId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ memo_folder_id: folder.id })
                    });
                    fetchMemos();
                });

                // Add subfolder
                folderEl.querySelector('.memo-folder-add-sub-btn').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const row = document.getElementById('memo-new-folder-row');
                    const input = document.getElementById('memo-new-folder-input');
                    row.dataset.parentId = folder.id;
                    input.placeholder = `Subfolder in "${folder.name}"...`;
                    row.classList.remove('hidden');
                    input.focus();
                });

                // Delete folder
                folderEl.querySelector('.memo-folder-delete-btn').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Delete folder "${folder.name}"? Everything inside will be moved up or deleted.`)) return;
                    await fetch(`/api/memo-folders/${folder.id}`, { method: 'DELETE' });
                    fetchMemos();
                });

                targetContainer.appendChild(folderEl);
            }

            // Render root folders
            folders.forEach(folder => renderFolder(folder, container));

            // Render root-level memos
            if (root_memos.length > 0) {
                root_memos.forEach(item => {
                    container.appendChild(buildMemoItem(item, allFoldersFlattened, pathMap));
                });
            }

            // --- Drag-and-drop: memos-container as root drop target ---
            container.addEventListener('dragover', (e) => {
                // Only show root drop zone when not hovering over a folder header
                if (!e.target.closest('.memo-folder-header')) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    container.classList.add('memo-root-drop-target');
                }
            });
            container.addEventListener('dragleave', (e) => {
                // Only remove if actually leaving the container
                if (!container.contains(e.relatedTarget)) {
                    container.classList.remove('memo-root-drop-target');
                }
            });
            container.addEventListener('drop', async (e) => {
                container.classList.remove('memo-root-drop-target');
                // Don't handle if dropped on a folder header (that handler takes priority)
                if (e.target.closest('.memo-folder-header')) return;
                e.preventDefault();
                const draggedItemId = e.dataTransfer.getData('text/memo-item-id');
                if (!draggedItemId) return;
                await fetch(`/api/items/${draggedItemId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ memo_folder_id: null })
                });
                fetchMemos();
            });

        } catch (error) {
            console.error('Error fetching memos:', error);
        }
    }

    /**
     * Builds a single memo sidebar item element with drag-and-drop folder assignment.
     */
    function buildMemoItem(item, folders, pathMap) {
        const el = document.createElement('div');
        el.className = 'memo-item';
        el.dataset.itemId = item.id;
        el.draggable = true;

        // Build path + date meta line
        const dateObj = parseUTCDate(item.created_at);
        const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
        const folderPath = (pathMap && item.memo_folder_id && pathMap[item.memo_folder_id]) ? pathMap[item.memo_folder_id] : '';
        const pathHtml = folderPath
            ? `<span class="memo-item-path" title="${escapeHtml(folderPath)}"><i class="ph ph-folder-open"></i> ${escapeHtml(folderPath)}</span>`
            : '';

        el.innerHTML = `
            <div class="memo-item-inner">
                <i class="ph ph-dots-six-vertical memo-drag-handle"></i>
                <i class="ph ph-note memo-item-icon"></i>
                <div class="memo-item-body">
                    <span class="memo-item-title" title="${escapeHtml(item.heading)}">${escapeHtml(item.heading)}</span>
                    <div class="memo-item-meta">
                        <span class="memo-item-date"><i class="ph ph-clock"></i> ${dateStr}</span>
                        ${pathHtml}
                    </div>
                </div>
            </div>
        `;

        // --- Drag-and-drop: make memo item draggable ---
        el.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/memo-item-id', String(item.id));
            e.dataTransfer.effectAllowed = 'move';
            el.classList.add('memo-item-dragging');
            // Highlight all valid drop targets
            document.querySelectorAll('.memo-folder-header').forEach(h => h.classList.add('memo-drop-hint'));
            document.getElementById('memos-container').classList.add('memo-drop-hint-root');
        });
        el.addEventListener('dragend', () => {
            el.classList.remove('memo-item-dragging');
            // Remove all drop target highlights
            document.querySelectorAll('.memo-folder-header').forEach(h => h.classList.remove('memo-drop-hint', 'memo-drop-target'));
            document.getElementById('memos-container').classList.remove('memo-drop-hint-root', 'memo-root-drop-target');
        });

        // Click title to navigate to last entry
        el.querySelector('.memo-item-title').addEventListener('click', () => {
            if (item.entries && item.entries.length > 0) {
                const lastEntry = item.entries[item.entries.length - 1];
                const itemDateStr = parseUTCDate(item.created_at).toDateString();
                const isToday = itemDateStr === new Date().toDateString();
                // Archived if: state is DONE OR (state is MEMO AND not created today)
                const isArchived = item.state === 'DONE' || (item.state === 'MEMO' && !isToday);
                window.focusEntry(lastEntry.id, isArchived, item.id);
            }
        });

        return el;
    }

    // ---- New Folder creation UI ----
    document.getElementById('memo-add-folder-btn').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const sectionEl = e.target.closest('.sidebar-section');
        if (sectionEl) sectionEl.classList.add('open');

        const row = document.getElementById('memo-new-folder-row');
        const input = document.getElementById('memo-new-folder-input');
        row.dataset.parentId = '';
        input.placeholder = 'Folder name...';
        row.classList.remove('hidden');
        input.focus();
    });

    document.getElementById('memo-new-folder-cancel').addEventListener('click', () => {
        const row = document.getElementById('memo-new-folder-row');
        const input = document.getElementById('memo-new-folder-input');
        row.classList.add('hidden');
        row.dataset.parentId = '';
        input.value = '';
        input.placeholder = 'Folder name...';
    });

    document.getElementById('memo-new-folder-save').addEventListener('click', async () => {
        const input = document.getElementById('memo-new-folder-input');
        const row = document.getElementById('memo-new-folder-row');
        const name = input.value.trim();
        if (!name) return;

        const payload = { name };
        if (row.dataset.parentId) {
            payload.parent_id = parseInt(row.dataset.parentId, 10);
        }

        const res = await fetch('/api/memo-folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            // Show error inline on the input
            input.classList.add('memo-folder-input-error');
            input.placeholder = err.error || 'Folder name already exists';
            input.value = '';
            input.focus();
            setTimeout(() => input.classList.remove('memo-folder-input-error'), 1500);
            return;
        }

        input.value = '';
        input.placeholder = 'Folder name...';
        row.dataset.parentId = '';
        row.classList.add('hidden');
        fetchMemos();
    });

    document.getElementById('memo-new-folder-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('memo-new-folder-save').click();
        if (e.key === 'Escape') document.getElementById('memo-new-folder-cancel').click();
    });

    /**
     * Fetches all work items from the API and renders them.
     * Active items (not DONE, or MEMO from today) go to the main column.
     * All items feed into the timeline sidebar.
     */
    async function fetchItems() {
        fetchReminders();
        fetchMemos();
        try {
            const [itemsRes, foldersRes] = await Promise.all([
                fetch('/api/items'),
                fetch('/api/memo-folders')
            ]);
            const items = await itemsRes.json();
            const folderData = await foldersRes.json();

            // Build folder path map: folder id -> "Parent › Sub › Sub"
            const folderPathMap = {};
            function buildPaths(folderList, parentPath) {
                folderList.forEach(f => {
                    const thisPath = parentPath ? parentPath + ' › ' + f.name : f.name;
                    folderPathMap[f.id] = thisPath;
                    if (f.children) buildPaths(f.children, thisPath);
                });
            }
            buildPaths(folderData.folders || [], '');
            window.folderPathMap = folderPathMap;

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

        // Build folder path for MEMO items
        let folderPathHtml = '';
        if (item.state === 'MEMO' && item.memo_folder_id && window.folderPathMap && window.folderPathMap[item.memo_folder_id]) {
            const path = window.folderPathMap[item.memo_folder_id];
            folderPathHtml = `<span class="work-item-folder-path" title="${escapeHtml(path)}"><i class="ph ph-folder-open"></i> ${escapeHtml(path)}</span>`;
        }

        div.innerHTML = `
            <div class="work-item-header">
                <div class="work-item-title-group">
                    <i class="ph ph-dots-six-vertical drag-handle" title="Drag to reorder"></i>
                    <i class="ph ph-caret-down toggle-icon"></i>
                    <div style="display: flex; flex-direction: column; flex-grow: 1; min-width: 0; margin-right: 1rem;">
                        <input type="text" class="item-title-input" value="${escapeHtml(item.heading)}" onchange="updateItemHeading(${item.id}, this.value)">
                        <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.1rem; font-weight: normal; display: flex; align-items: center; gap: 0.5rem; min-width: 0;"><i class="ph ph-clock"></i> ${timeStr}${folderPathHtml}</div>
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
        div.querySelector('.work-item-header').addEventListener('click', (e) => {
            // Ignore clicks on buttons/selects/drag handle (these handle their own logic)
            if (e.target.closest('button') || e.target.closest('select') || e.target.closest('.drag-handle')) return;

            const isInput = e.target.tagName === 'INPUT';
            const isExpanded = div.classList.contains('expanded');

            if (isInput) {
                if (!isExpanded) {
                    div.classList.add('expanded');
                }
            } else {
                div.classList.toggle('expanded');
            }
        });

        // --- Drag-and-drop: make work item draggable via handle ---
        div.draggable = false; // Not draggable by default
        const dragHandle = div.querySelector('.drag-handle');
        dragHandle.addEventListener('mousedown', () => { div.draggable = true; });
        // Reset draggable on mouseup anywhere (in case drag didn't start)
        document.addEventListener('mouseup', () => { div.draggable = false; }, { once: false });

        div.addEventListener('dragstart', (e) => {
            // Only allow drag if initiated from the handle
            if (!div.draggable) { e.preventDefault(); return; }
            e.dataTransfer.setData('text/work-item-id', String(item.id));
            e.dataTransfer.effectAllowed = 'move';
            div.classList.add('dragging');
            // Disable pointer events on iframes to prevent drag interference
            document.querySelectorAll('iframe').forEach(ifr => ifr.style.pointerEvents = 'none');
        });

        div.addEventListener('dragend', () => {
            div.draggable = false;
            div.classList.remove('dragging');
            // Re-enable iframe pointer events
            document.querySelectorAll('iframe').forEach(ifr => ifr.style.pointerEvents = 'auto');
            // Remove all drop indicators
            document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
            document.querySelectorAll('.work-item.drop-above').forEach(el => el.classList.remove('drop-above'));
            document.querySelectorAll('.work-item.drop-below').forEach(el => el.classList.remove('drop-below'));
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
                // Default: only the last entry is expanded
                entriesContainer.appendChild(createEntryElement(entry, isLast, isLast));
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
     * @param {Array}  items      - Work item objects from the API
     * @param {string} [searchTerm=''] - Optional query string; when set, clicking a
     *                                   result places the cursor on the first match.
     */
    function renderTimeline(items, searchTerm = '') {
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

                        // Build markers markup (no inline onclick — wired via addEventListener below)
                        let markersHTML = '';
                        if (entry.markers && entry.markers.length > 0) {
                            markersHTML = `<details class="timeline-marker-details">
                                <summary>${entry.markers.length} Marker${entry.markers.length > 1 ? 's' : ''}</summary>
                                <div class="timeline-markers">
                                    ${entry.markers.map(m => `
                                        <div class="timeline-marker-item" data-entry-id="${entry.id}" data-is-archived="${isArchived}" data-item-id="${entry.parentItem.id}">
                                            <div class="timeline-marker-bubble ${m.reminder_due_date ? 'has-reminder' : ''}"></div>
                                            <div class="timeline-marker-text" title="${escapeHtml(m.text || 'Marker')}">${escapeHtml(m.text || 'Marker')}</div>
                                        </div>
                                    `).join('')}
                                </div>
                            </details>`;
                        }

                        entryDiv.innerHTML = `
                            <div class="timeline-task">${escapeHtml(entry.parentItem.heading)}</div>
                            <div class="timeline-entry-title">
                                <span class="timeline-entry-text">${escapeHtml(entry.title)}</span>
                                <span class="timeline-time">${timeStr}</span>
                            </div>
                            ${markersHTML}
                        `;

                        // Wire click on the whole card — markers stop propagation so they won't mis-fire
                        entryDiv.addEventListener('click', () =>
                            window.focusEntry(entry.id, isArchived, entry.parentItem.id, null, searchTerm, entry.parentItem, entry.matched_terms)
                        );

                        entryDiv.querySelectorAll('.timeline-marker-item').forEach(markerEl => {
                            markerEl.addEventListener('click', (e) => {
                                e.stopPropagation();
                                window.focusEntry(
                                    parseInt(markerEl.dataset.entryId, 10),
                                    markerEl.dataset.isArchived === 'true',
                                    parseInt(markerEl.dataset.itemId, 10),
                                    null,
                                    searchTerm
                                );
                            });
                        });

                        // Prevent the marker <details> toggle from bubbling to entry click
                        const markerDetails = entryDiv.querySelector('.timeline-marker-details');
                        if (markerDetails) {
                            markerDetails.addEventListener('click', e => e.stopPropagation());
                        }

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
                renderTimeline(items, q);
            }
        } catch (error) {
            console.error('Search error:', error);
            document.getElementById('timeline-container').innerHTML = '<div class="loading-state" style="color:#ef4444">Search error.</div>';
        }
    }

    window.fetchItems = fetchItems;
    window.fetchReminders = fetchReminders;

    // ========================================================================
    // WORK ITEM DRAG-AND-DROP REORDERING
    // ========================================================================

    /**
     * Sets up dragover/drop listeners on the items container to enable
     * drag-and-drop reordering of work items.
     */
    function initWorkItemDragDrop() {
        itemsContainer.addEventListener('dragover', (e) => {
            const draggedId = e.dataTransfer.types.includes('text/work-item-id');
            if (!draggedId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            // Remove existing indicators
            document.querySelectorAll('.work-item.drop-above').forEach(el => el.classList.remove('drop-above'));
            document.querySelectorAll('.work-item.drop-below').forEach(el => el.classList.remove('drop-below'));

            // Find the closest work-item to the mouse position
            const items = [...itemsContainer.querySelectorAll('.work-item:not(.dragging)')];
            let closestItem = null;
            let insertBefore = true;
            let closestDist = Infinity;

            items.forEach(item => {
                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                const dist = Math.abs(e.clientY - midY);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestItem = item;
                    insertBefore = e.clientY < midY;
                }
            });

            if (closestItem) {
                if (insertBefore) {
                    closestItem.classList.add('drop-above');
                } else {
                    closestItem.classList.add('drop-below');
                }
            }
        });

        itemsContainer.addEventListener('dragleave', (e) => {
            if (!itemsContainer.contains(e.relatedTarget)) {
                document.querySelectorAll('.work-item.drop-above').forEach(el => el.classList.remove('drop-above'));
                document.querySelectorAll('.work-item.drop-below').forEach(el => el.classList.remove('drop-below'));
            }
        });

        itemsContainer.addEventListener('drop', async (e) => {
            e.preventDefault();
            const draggedItemId = e.dataTransfer.getData('text/work-item-id');
            if (!draggedItemId) return;

            // Remove indicators
            document.querySelectorAll('.work-item.drop-above').forEach(el => el.classList.remove('drop-above'));
            document.querySelectorAll('.work-item.drop-below').forEach(el => el.classList.remove('drop-below'));

            const draggedEl = itemsContainer.querySelector(`.work-item[data-id="${draggedItemId}"]`);
            if (!draggedEl) return;

            // Find target position
            const items = [...itemsContainer.querySelectorAll('.work-item:not(.dragging)')];
            let closestItem = null;
            let insertBefore = true;
            let closestDist = Infinity;

            items.forEach(item => {
                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                const dist = Math.abs(e.clientY - midY);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestItem = item;
                    insertBefore = e.clientY < midY;
                }
            });

            // Move the DOM element
            if (closestItem) {
                if (insertBefore) {
                    itemsContainer.insertBefore(draggedEl, closestItem);
                } else {
                    itemsContainer.insertBefore(draggedEl, closestItem.nextSibling);
                }
            }

            // Persist the new order
            persistReorder();
        });
    }

    /**
     * Reads the current DOM order of work items in the main container
     * and persists it to the backend.
     */
    async function persistReorder() {
        const orderedIds = [...itemsContainer.querySelectorAll('.work-item')]
            .map(el => parseInt(el.dataset.id, 10))
            .filter(id => !isNaN(id));

        if (orderedIds.length === 0) return;

        try {
            await fetch('/api/items/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order: orderedIds })
            });
        } catch (error) {
            console.error('Error persisting reorder:', error);
        }
    }

    // Initialize drag-and-drop on the items container
    initWorkItemDragDrop();

    /**
     * Refreshes only the sidebar components (Reminders & Timeline)
     * without re-rendering the main task list (preserving editor state).
     */
    window.refreshSidebar = async () => {
        fetchReminders();
        try {
            const res = await fetch('/api/items');
            const items = await res.json();
            window.allItemsData = items;
            const timelineContainer = document.getElementById('timeline-container');
            if (timelineContainer) {
                timelineContainer.innerHTML = '';
                renderTimeline(items);
            }
        } catch (error) {
            console.error('Error refreshing sidebar:', error);
        }
    };
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
 * Initializes resizable columns for all tables in the editor.
 * Adds resize handles to each column that users can drag to resize.
 */
function initResizableTableColumns(editor) {
    console.log('initResizableTableColumns called');
    const tables = editor.dom.select('table');
    console.log('Found tables:', tables.length);

    tables.forEach(function (table) {
        const rows = editor.dom.select('tr', table);
        if (rows.length === 0) return;

        // Initialize column widths if not set
        const firstRow = rows[0];
        const cells = editor.dom.select('td, th', firstRow);
        const numCols = cells.length;

        // Set widths on cells that don't already have explicit widths
        rows.forEach(function (row) {
            editor.dom.select('td, th', row).forEach(function (cell) {
                if (!cell.style.width) {
                    // Use pixels instead of percentages to allow immediate downsizing
                    // 60% is the default table width, we distribute it among columns
                    const tableWidth = table.offsetWidth || 600;
                    cell.style.width = Math.floor(tableWidth / numCols) + 'px';
                }
            });
        });
    });

    // Add mousedown handler to the editor's entire content area
    // (only bound once via a flag to prevent duplicates)
    if (editor._resizeColumnsInitialized) {
        console.log('Table resizing already initialized');
        return;
    }
    editor._resizeColumnsInitialized = true;
    console.log('Setting up table resize event listeners');

    // Track the currently highlighted cell for resize hover feedback
    let hoveredResizeCell = null;

    /**
     * Helper to find which column we should be resizing based on mouse position.
     * If near the right edge of cell i, return cell i (can resize any column except possibly the last).
     * If near the left edge of cell i (and i > 0), return cell i-1.
     */
    function getResizeTarget(e) {
        const cell = editor.dom.getParent(e.target, 'td,th');
        if (!cell) return null;

        const rect = cell.getBoundingClientRect();
        const clickX = e.clientX;
        const nearRight = (rect.right - clickX) <= 15;
        const nearLeft = (clickX - rect.left) <= 15;

        console.log('getResizeTarget:', {
            cell: cell,
            rect: rect,
            clickX: clickX,
            nearRight: nearRight,
            nearLeft: nearLeft,
            rectRight: rect.right,
            rectLeft: rect.left
        });

        const row = editor.dom.getParent(cell, 'tr');
        const rowCells = editor.dom.select('td,th', row);
        const cellIndex = rowCells.indexOf(cell);

        if (nearRight) {
            // If near right edge, we are resizing this cell
            return cell;
        } else if (nearLeft) {
            // If near left edge, we are resizing the PREVIOUS cell (if it exists)
            if (cellIndex > 0) return rowCells[cellIndex - 1];
        }

        return null;
    }

    // ---- Hover feedback: cursor + border highlight ----
    editor.on('mousemove', function (e) {
        const targetCell = getResizeTarget(e);

        // Clear previous highlight if it's different
        if (hoveredResizeCell && hoveredResizeCell !== targetCell) {
            hoveredResizeCell.classList.remove('cell-resize-hover');
            hoveredResizeCell = null;
        }

        if (targetCell) {
            editor.getBody().style.cursor = 'col-resize';
            targetCell.classList.add('cell-resize-hover');
            hoveredResizeCell = targetCell;
        } else {
            editor.getBody().style.cursor = '';
            // If we are over a cell but not near an edge, make sure it's not highlighted
            const cell = editor.dom.getParent(e.target, 'td,th');
            if (cell && cell.classList.contains('cell-resize-hover')) {
                cell.classList.remove('cell-resize-hover');
            }
        }
    });

    // ---- Mousedown: initiate drag resize ----
    editor.on('mousedown', function (e) {
        console.log('Editor mousedown event triggered', e);
        const cell = getResizeTarget(e);
        if (!cell) {
            console.log('No resize target found');
            return;
        }

        console.log('Starting resize for cell:', cell);
        e.preventDefault();
        e.stopPropagation();

        const row = editor.dom.getParent(cell, 'tr');
        const rowCells = editor.dom.select('td,th', row);
        const cellIndex = rowCells.indexOf(cell);

        const startX = e.clientX;
        const startWidth = cell.offsetWidth;
        const tableNode = editor.dom.getParent(cell, 'table');
        const tableRows = editor.dom.select('tr', tableNode);

        // Get all cells in this column
        const colCells = [];
        tableRows.forEach(function (row) {
            const cells = editor.dom.select('td,th', row);
            if (cells[cellIndex]) {
                colCells.push(cells[cellIndex]);
            }
        });

        // Determine which column to adjust (the next one, or the previous if we're at the edge)
        let adjacentColCells = [];
        let adjacentCellIndex = cellIndex + 1; // Default: adjust the next column

        // If we're resizing the last column, adjust the previous column instead
        if (cellIndex === rowCells.length - 1) {
            adjacentCellIndex = cellIndex - 1;
        }

        // Get cells for the adjacent column
        if (adjacentCellIndex >= 0 && adjacentCellIndex < rowCells.length) {
            tableRows.forEach(function (row) {
                const cells = editor.dom.select('td,th', row);
                if (cells[adjacentCellIndex]) {
                    adjacentColCells.push(cells[adjacentCellIndex]);
                }
            });
        }

        const startAdjacentWidth = adjacentColCells.length > 0 ? adjacentColCells[0].offsetWidth : 0;

        // Add active resize class to all cells in the column
        colCells.forEach(c => c.classList.add('cell-resizing'));
        adjacentColCells.forEach(c => c.classList.add('cell-resizing'));

        // Force col-resize cursor on the entire body during drag
        document.body.style.cursor = 'col-resize';

        function onMouseMove(e) {
            console.log('Mouse move during resize:', e.clientX, e.clientY);
            const diff = e.clientX - startX;
            const newWidth = Math.max(30, startWidth + diff);
            const widthDiff = newWidth - startWidth;

            // Calculate new width for adjacent column to maintain total width
            const newAdjacentWidth = Math.max(30, startAdjacentWidth - widthDiff);

            console.log('New widths:', newWidth, newAdjacentWidth);

            // Use a transaction or block updates to avoid interfering with other elements
            editor.undoManager.transact(() => {
                // Update the resized column
                colCells.forEach(function (cell) {
                    const currentWidth = parseInt(cell.style.width, 10);
                    if (currentWidth !== newWidth) {
                        cell.style.width = newWidth + 'px';
                    }
                });

                // Update the adjacent column
                adjacentColCells.forEach(function (cell) {
                    const currentWidth = parseInt(cell.style.width, 10);
                    if (currentWidth !== newAdjacentWidth) {
                        cell.style.width = newAdjacentWidth + 'px';
                    }
                });
            });
        }

        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            colCells.forEach(c => c.classList.remove('cell-resizing'));
            adjacentColCells.forEach(c => c.classList.remove('cell-resizing'));
            if (hoveredResizeCell) {
                hoveredResizeCell.classList.remove('cell-resize-hover');
                hoveredResizeCell = null;
            }
            // Trigger a save after resizing
            editor.fire('change');
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}




/**
 * Creates a journal entry DOM element with an inline TinyMCE editor.
 * @param {Object} entry - Entry data from the API
 * @param {boolean} isLast - Whether this is the last entry (shows the + button)
 * @param {boolean} initiallyExpanded - Whether the entry starts expanded
 * @returns {HTMLElement} The entry DOM element
 */
function createEntryElement(entry, isLast = false, initiallyExpanded = false, autoFocus = false) {
    const entryDiv = document.createElement('div');
    entryDiv.className = `journal-entry ${initiallyExpanded ? 'expanded' : ''}`;
    entryDiv.dataset.entryId = entry.id;

    const dateObj = parseUTCDate(entry.created_at);
    const compactDateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        + ', '
        + dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const dateTooltipStr = dateObj.toLocaleDateString()
        + ' at '
        + dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    // Only the last entry in a work item gets the green "+" button
    const addButtonHTML = isLast
        ? `<button class="btn-secondary btn-small" style="border: none; padding: 0.25rem; color: #4ade80; margin-right: 2px;" onclick="addEntry(${entry.work_item_id})" title="Add new entry"><i class="ph ph-plus-circle"></i></button>`
        : '';

    entryDiv.innerHTML = `
        <div class="entry-header" style="cursor: pointer;">
            <i class="ph ph-caret-down entry-toggle-icon"></i>
            <div class="entry-title-block">
                <input type="text" class="entry-title-input" value="${escapeHtml(entry.title)}" onchange="updateEntryTitle(${entry.id}, this.value)" onfocus="this.closest('.journal-entry').classList.add('title-editing'); this.closest('.journal-entry').classList.add('editing-active'); this.closest('.work-item').classList.add('task-editing-active');" onblur="this.closest('.journal-entry').classList.remove('title-editing'); this.closest('.journal-entry').classList.remove('editing-active'); this.closest('.work-item').classList.remove('task-editing-active');" style="margin-right: 0; padding: 0.15rem;">
                <span class="entry-date" title="${dateTooltipStr}">${compactDateStr}</span>
            </div>
            <div id="toolbar-${entry.id}" class="entry-toolbar-container"></div>
            <div class="entry-actions" onclick="event.stopPropagation()">
                <select class="entry-status-select" onchange="updateEntryStatus(${entry.id}, this.value)" style="background: transparent; border: 1px solid var(--border-main); color: var(--text-muted); border-radius: 4px; padding: 0.1rem; font-size: 0.75rem; outline: none; margin-left: 0.25rem;">
                    <option value="" ${!entry.status ? 'selected' : ''}>NONE</option>
                    <option value="FOLLOWUP" ${entry.status === 'FOLLOWUP' ? 'selected' : ''}>FOLLOWUP</option>
                    <option value="DONE" ${entry.status === 'DONE' ? 'selected' : ''}>DONE</option>
                </select>
                ${addButtonHTML}
                <button class="btn-secondary btn-danger btn-small" style="border: none; padding: 0.25rem;" onclick="deleteEntry(${entry.id}); event.stopPropagation()"><i class="ph ph-trash"></i></button>
            </div>
        </div>
        <div class="entry-content">
            <div class="entry-content-inner">
                <div id="tinymce-${entry.id}" class="tinymce-editor">${entry.content || '<p><br></p>'}</div>
            </div>
        </div>
    `;

    // Toggle expand/collapse on header click
    entryDiv.querySelector('.entry-header').addEventListener('click', (e) => {
        // Stop propagation to prevent nested clicks from firing parent events
        // However, do not stop it if we are clicking a button/select/toolbar/actions that needs to trigger its own global handler
        if (e.target.closest('button') || e.target.closest('select') || e.target.closest('.entry-actions') || e.target.closest('.entry-toolbar-container')) return;

        e.stopPropagation();

        const isInput = e.target.tagName === 'INPUT';
        const isExpanded = entryDiv.classList.contains('expanded');

        if (isInput) {
            if (!isExpanded) {
                entryDiv.classList.add('expanded');
            }
        } else {
            entryDiv.classList.toggle('expanded');
        }
    });

    // Initialize TinyMCE on next tick (element must be in DOM first)
    setTimeout(() => initTinyMCE(entry, autoFocus), 0);

    return entryDiv;
}

/**
 * Initializes a TinyMCE inline editor for a journal entry.
 * Configures: outliner, auto-save, custom toolbar buttons, click handlers,
 * table indentation, and keyboard shortcuts.
 */
function initTinyMCE(entry, autoFocus = false) {
    const targetId = `tinymce-${entry.id}`;

    // Remove any pre-existing editor instance for this target
    if (tinymce.get(targetId)) {
        tinymce.get(targetId).remove();
    }

    const currentTheme = localStorage.getItem('theme') || 'dark';
    tinymce.init({
        selector: `#${targetId}`,
        inline: true,
        indentation: '20px',
        fixed_toolbar_container: `#toolbar-${entry.id}`,
        ui_container: 'body',
        skin: currentTheme === 'light' ? 'oxide' : 'oxide-dark',
        content_css: currentTheme === 'light' ? 'default' : 'dark',
        font_family_formats: 'Lexend=Lexend,sans-serif; Inter=Inter,sans-serif; Arial=Arial,Helvetica,sans-serif; Courier New=Courier New,Courier,monospace; Georgia=Georgia,serif; Times New Roman=Times New Roman,Times,serif; Verdana=Verdana,Geneva,sans-serif',
        menubar: false,
        statusbar: false,
        branding: false,
        promotion: false,
        extended_valid_elements: 'details[class|open|style],summary,span[class|data-marker-id|contenteditable|title|style]',
        plugins: 'lists link table autolink nonbreaking forecolor backcolor',
        toolbar: 'setparagraph setpreformatted collapsible table | bold italic underline strikethrough | bullist numlist | outdent indent | formatting alignment inserting',
        toolbar_groups: {
            formatting: {
                icon: 'format',
                tooltip: 'More Formatting',
                items: 'blocks fontfamily forecolor backcolor | removeformatwithindent'
            },
            alignment: {
                icon: 'align-left',
                tooltip: 'Alignment',
                items: 'alignleft aligncenter alignright alignjustify'
            },
            inserting: {
                icon: 'plus',
                tooltip: 'Insert',
                items: 'link embedfile'
            }
        },
        contextmenu: 'addmarker | cut copy paste | link table',
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

        setup: function (editor) {

            // ================================================================
            // PASTE HANDLER: Preserve plain text in PRE blocks
            // ================================================================
            editor.on('paste', function (e) {
                const node = editor.selection.getNode();
                const pre = editor.dom.getParent(node, 'PRE');
                if (pre || node.nodeName === 'PRE') {
                    // Prevent default paste from stripping or breaking PRE tags
                    e.preventDefault();
                    let text = '';
                    if (e.clipboardData && e.clipboardData.getData) {
                        text = e.clipboardData.getData('text/plain');
                    } else if (window.clipboardData && window.clipboardData.getData) {
                        text = window.clipboardData.getData('Text');
                    }
                    if (text) {
                        // Insert as plain text with line breaks preserved
                        const safeText = escapeHtml(text).replace(/\r?\n/g, '<br>');
                        editor.insertContent(safeText);
                    }
                }
            });

            // ================================================================
            // COPY/CUT HANDLER: Convert structural indents to plain spaces
            // ================================================================
            editor.on('copy cut', function (e) {
                const sel = editor.selection;
                if (sel.isCollapsed()) return;

                e.preventDefault();

                // 1. Get raw HTML for rich-text paste scenarios
                const richHtml = sel.getContent({ format: 'html' });

                // 2. Temporarily inject spatial text nodes for plain-text extraction
                const blocks = sel.getSelectedBlocks();
                const injectedNodes = [];
                const SPACES_PER_INDENT = 4;

                blocks.forEach(block => {
                    const indentPx = getBlockIndent(editor, block);
                    const spacesCount = Math.round(indentPx / 20) * SPACES_PER_INDENT;

                    if (spacesCount > 0) {
                        const indentChars = ' '.repeat(spacesCount);
                        const textNode = document.createTextNode(indentChars);
                        block.insertBefore(textNode, block.firstChild);
                        injectedNodes.push(textNode);
                    }
                });

                // 3. Read native selection plain text (which perfectly incorporates partial selection limits)
                let plainText = '';
                const nativeSel = window.getSelection();
                if (nativeSel.rangeCount > 0) {
                    plainText = nativeSel.toString();
                }

                // 4. Cleanup injected nodes instantly
                injectedNodes.forEach(node => node.remove());

                // 5. Pipe to clipboard
                if (e.clipboardData) {
                    e.clipboardData.setData('text/plain', plainText);
                    e.clipboardData.setData('text/html', richHtml);
                } else if (window.clipboardData) {
                    window.clipboardData.setData('Text', plainText);
                }

                // 6. Complete the operation if it was a cut
                if (e.type === 'cut') {
                    editor.execCommand('delete');
                }
            });

            // ================================================================
            // INIT FOCUS
            // ================================================================
            editor.on('init', function () {
                if (autoFocus) {
                    editor.focus();
                }
            });

            // ================================================================
            // LINK: Simplified Prompt (Replaces heavy dialog)
            // ================================================================

            // Track right-click position so we can anchor the link popover near it
            let _lastContextMenuPos = { x: 0, y: 0 };
            editor.on('contextmenu', function (e) {
                _lastContextMenuPos = { x: e.clientX, y: e.clientY };
            });
            // Also track toolbar Ctrl+K
            editor.on('keydown', function (e) {
                if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                    const rng = editor.selection.getRng();
                    const rect = rng.getBoundingClientRect();
                    if (rect.width || rect.height) {
                        _lastContextMenuPos = { x: rect.left, y: rect.bottom };
                    }
                }
            });

            editor.addCommand('mceLink', function () {
                const node = editor.selection.getNode();
                let existingUrl = '';
                let existingAnchor = null;

                // If cursor is inside a link, pre-populate with existing URL
                if (node && node.nodeName === 'A') {
                    existingAnchor = node;
                    existingUrl = editor.dom.getAttrib(node, 'href');
                } else {
                    existingAnchor = editor.dom.getParent(node, 'a');
                    if (existingAnchor) existingUrl = editor.dom.getAttrib(existingAnchor, 'href');
                }

                // Save selection bookmark before opening modal (modal loses focus)
                const bookmark = editor.selection.getBookmark(2, true);

                const overlay = document.createElement('div');
                overlay.id = 'link-modal-overlay';
                overlay.innerHTML = `
                    <div class="link-modal" id="link-modal-panel">
                        <div class="link-modal-body">
                            <input type="url" id="link-modal-input" class="link-modal-input" 
                                   placeholder="Paste or type a URL..." 
                                   value="${existingUrl || ''}" />
                        </div>
                        <div class="link-modal-footer">
                            <button id="link-modal-cancel" class="btn-secondary btn-small">Cancel</button>
                            <button id="link-modal-submit" class="btn-primary btn-small"><i class="ph ph-link"></i> Insert</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(overlay);

                // Position near right-click / selection using stored coords
                const modal = overlay.querySelector('#link-modal-panel');
                requestAnimationFrame(() => {
                    const MARGIN = 8;
                    const modalW = modal.offsetWidth;
                    const modalH = modal.offsetHeight;
                    const vw = window.innerWidth;
                    const vh = window.innerHeight;

                    // Anchor just below the right-click point
                    let top = _lastContextMenuPos.y + MARGIN;
                    let left = _lastContextMenuPos.x;

                    // Flip above if it would overflow the bottom
                    if (top + modalH > vh - MARGIN) top = _lastContextMenuPos.y - modalH - MARGIN;
                    // Clamp horizontal
                    if (left + modalW > vw - MARGIN) left = vw - modalW - MARGIN;
                    if (left < MARGIN) left = MARGIN;
                    // Clamp vertical
                    if (top < MARGIN) top = MARGIN;

                    modal.style.position = 'fixed';
                    modal.style.top = top + 'px';
                    modal.style.left = left + 'px';
                });

                const input = overlay.querySelector('#link-modal-input');
                input.focus();
                input.select();

                const cleanup = () => {
                    overlay.remove();
                    editor.selection.moveToBookmark(bookmark);
                    editor.focus();
                };

                const insertLink = () => {
                    const rawUrl = input.value.trim();
                    if (!rawUrl) {
                        if (existingAnchor) {
                            editor.selection.moveToBookmark(bookmark);
                            editor.execCommand('unlink');
                        }
                        cleanup();
                        return;
                    }
                    // Normalize URL — prepend https:// if no protocol given
                    const finalUrl = /^(https?:\/\/|mailto:|ftp:\/\/|\/|#)/.test(rawUrl)
                        ? rawUrl
                        : 'https://' + rawUrl;

                    editor.selection.moveToBookmark(bookmark);

                    if (existingAnchor) {
                        editor.dom.setAttrib(existingAnchor, 'href', finalUrl);
                    } else {
                        const selectedContent = editor.selection.getContent();
                        const linkHtml = `<a href="${finalUrl}" target="_blank">${selectedContent || finalUrl}</a>`;
                        editor.selection.setContent(linkHtml);
                    }

                    editor.fire('change');
                    cleanup();
                };

                overlay.querySelector('#link-modal-submit').addEventListener('click', insertLink);
                overlay.querySelector('#link-modal-cancel').addEventListener('click', cleanup);
                overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) cleanup(); });
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); insertLink(); }
                    if (e.key === 'Escape') cleanup();
                });
            });

            // ================================================================
            // MARKER: Context Menu Integration
            // ================================================================

            editor.ui.registry.addMenuItem('addmarker', {
                text: 'Add Marker',
                icon: 'highlight-bg-color',
                onAction: async function () {
                    const selectedText = editor.selection.getContent({ format: 'text' });
                    if (!selectedText) return;

                    try {
                        const res = await fetch(`/api/entries/${entry.id}/markers`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text: selectedText })
                        });
                        if (res.ok) {
                            const marker = await res.json();
                            const currentHtml = editor.selection.getContent();
                            editor.selection.setContent(`<span class="marker marker-open" data-marker-id="${marker.id}">${currentHtml}</span><span class="marker-bubble" data-marker-id="${marker.id}" contenteditable="false" title="Marker Options">M</span>&nbsp;`);
                            editor.fire('change');
                            if (window.refreshSidebar) window.refreshSidebar();
                        }
                    } catch (error) {
                        console.error('Error adding marker:', error);
                    }
                }
            });

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
                // Include all common block-level elements to handle styled content
                const rawBlocks = Array.from(editor.dom.select('p, h1, h2, h3, h4, h5, h6, li, details, div, blockquote, pre, section, article, aside'));

                // Only evaluate leaf blocks (blocks that don't contain other blocks) to avoid double-parsing wrappers
                const blocks = rawBlocks.filter(b => {
                    for (let c of rawBlocks) {
                        if (c !== b && b.contains(c)) return false;
                    }
                    return true;
                });

                let hideThreshold = Infinity;

                for (let i = 0; i < blocks.length; i++) {
                    const block = blocks[i];
                    const currentIndent = getOutlinerIndent(editor, block);

                    // Determine if this block is a collapsible parent
                    let isParent = false;
                    const textContent = (block.textContent || '').replace(/[\s\u00A0\u200B\u200E\u200F\uFEFF]/g, '');

                    // Do not allow bulleted or numbered list items to become outliner parents
                    if (textContent.length > 0 && block.nodeName !== 'LI') {
                        // Look ahead for the next non-blank block to compare indentation
                        let nextIndent = -1;
                        for (let j = i + 1; j < blocks.length; j++) {
                            const nextTc = (blocks[j].textContent || '').replace(/[\s\u00A0\u200B\u200E\u200F\uFEFF]/g, '');
                            if (nextTc.length > 0) {
                                nextIndent = getOutlinerIndent(editor, blocks[j]);
                                break;
                            }
                        }

                        if (nextIndent > currentIndent) {
                            isParent = true;
                        }
                    }

                    // Apply or remove parent-node class
                    if (isParent) {
                        editor.dom.addClass(block, 'parent-node');
                    } else {
                        editor.dom.removeClass(block, 'parent-node');
                        editor.dom.removeClass(block, 'collapsed');
                    }

                    // Apply collapse visibility
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

                // Hide toolbar on blur (via CSS class)
                const toolbarEl = document.getElementById(`toolbar-${entry.id}`);
                if (toolbarEl) {
                    toolbarEl.classList.remove('toolbar-visible');
                }
                const entryDiv = document.querySelector(`.journal-entry[data-entry-id="${entry.id}"]`);
                if (entryDiv) {
                    entryDiv.classList.remove('editing-active');
                    const workItem = entryDiv.closest('.work-item');
                    if (workItem) workItem.classList.remove('task-editing-active');
                }
            });

            editor.on('focus', () => {
                // Show toolbar on focus (via CSS class)
                const toolbarEl = document.getElementById(`toolbar-${entry.id}`);
                if (toolbarEl) {
                    toolbarEl.classList.add('toolbar-visible');
                }
                const entryDiv = document.querySelector(`.journal-entry[data-entry-id="${entry.id}"]`);
                if (entryDiv) {
                    entryDiv.classList.add('editing-active');
                    const workItem = entryDiv.closest('.work-item');
                    if (workItem) workItem.classList.add('task-editing-active');
                }
            });

            editor.on('input change keyup NodeChange', () => {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(triggerSave, 2000);
            });

            // ================================================================
            // EDITOR INIT: Migrations & initial state
            // ================================================================

            editor.on('init', function () {
                // Migration: strip <code> wrappers from legacy log blocks
                // (old log blocks used <pre><code>..., which TinyMCE auto-selects on click)
                const codeEls = editor.dom.select('details.log-block pre code');
                codeEls.forEach(function (codeEl) {
                    const parent = codeEl.parentNode;
                    while (codeEl.firstChild) {
                        parent.insertBefore(codeEl.firstChild, codeEl);
                    }
                    parent.removeChild(codeEl);
                });

                // Migration: convert padding-left on PRE elements to margin-left (excluding log-blocks)
                const preElements = editor.dom.select('pre');
                preElements.forEach(function (preEl) {
                    if (!editor.dom.getParent(preEl, 'details.log-block')) {
                        const pl = parseInt(editor.dom.getStyle(preEl, 'padding-left') || 0, 10);
                        if (pl > 0) {
                            const ml = parseInt(editor.dom.getStyle(preEl, 'margin-left') || 0, 10);
                            editor.dom.setStyle(preEl, 'margin-left', (ml + pl) + 'px');
                            editor.dom.setStyle(preEl, 'padding-left', '');
                        }
                    }
                });

                triggerOutlinerUpdate();
                lastSavedContent = editor.getContent();
                initResizableTableColumns(editor);
            });

            // Initialize resizable columns on content changes
            editor.on('SetContent', function () {
                initResizableTableColumns(editor);
            });

            // ================================================================
            // CUSTOM TOOLBAR BUTTONS
            // ================================================================

            editor.ui.registry.addButton('setparagraph', {
                icon: 'paragraph',
                tooltip: 'Convert to Paragraph (Normal Text)',
                onAction: function () {
                    editor.execCommand('FormatBlock', false, 'p');
                }
            });

            editor.ui.registry.addButton('setpreformatted', {
                icon: 'sourcecode',
                tooltip: 'Convert to Preformatted Block',
                onAction: function () {
                    editor.execCommand('FormatBlock', false, 'pre');
                }
            });

            /**
             * Collapsible Log Block button: inserts a <details> block with a <pre>
             * area for pasting logs/code. Inherits current indentation level.
             */
            editor.ui.registry.addButton('collapsible', {
                icon: 'chevron-down',
                tooltip: 'Insert Collapsible Log Block',
                onAction: function () {
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

                    // Capture current text selection to place inside the log block
                    let selectedText = editor.selection.getContent({ format: 'text' });
                    let preContent = 'Paste logs/code here...';

                    if (selectedText && selectedText.trim() !== '') {
                        // Encode HTML entities to prevent rendering arbitrary HTML, convert newlines to <br> for <pre>
                        preContent = selectedText.replace(/&/g, '&amp;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;')
                            .replace(/\n/g, '<br>');
                    }

                    editor.insertContent(
                        `<details class="log-block"${marginStyle}>`
                        + `<summary>Logs (click to expand) <span class="delete-log-block" contenteditable="false" title="Delete this block" style="float: right; margin-right: 8px; color: #ef4444; font-size: 14px;">&times;</span></summary>`
                        + `<pre>${preContent}</pre>`
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
                onAction: function () {
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
                onAction: function () {
                    editor.undoManager.transact(() => {
                        // 1. Insert span bookmarks to accurately track selection across node replacements
                        const bookmark = editor.selection.getBookmark(2, true);

                        const selectedBlocks = editor.selection.getSelectedBlocks();

                        selectedBlocks.forEach(block => {
                            if (!block) return;

                            const logBlock = editor.dom.getParent(block, 'details.log-block');
                            if (logBlock) {
                                // Prevent processing the same logBlock multiple times if multiple inner blocks are selected
                                if (logBlock.hasAttribute('data-processing')) return;
                                logBlock.setAttribute('data-processing', 'true');

                                const ml = editor.dom.getStyle(logBlock, 'margin-left');
                                const attrString = ml ? ` style="padding-left: ${ml};"` : '';
                                const pre = logBlock.querySelector('pre');

                                if (pre) {
                                    // Salvage any bookmark spans inside the details block that aren't in the pre
                                    const bmSpans = Array.from(logBlock.querySelectorAll('span[data-mce-type="bookmark"]'));
                                    bmSpans.forEach(span => {
                                        if (!pre.contains(span)) {
                                            pre.appendChild(span);
                                        }
                                    });

                                    // Convert literal newlines to <br> so paragraphs format correctly
                                    const content = pre.innerHTML.replace(/\\n/g, '<br>');
                                    logBlock.outerHTML = `<p${attrString}>${content}</p>`;
                                }
                            } else if (block.nodeName === 'PRE' || /^H[1-6]$/.test(block.nodeName)) {
                                const pl = editor.dom.getStyle(block, 'padding-left');
                                const ml = editor.dom.getStyle(block, 'margin-left');
                                let styleStr = '';
                                if (pl) styleStr += `padding-left: ${pl}; `;
                                if (ml) styleStr += `margin-left: ${ml}; `;

                                const attrString = styleStr ? ` style="${styleStr.trim()}"` : '';
                                const content = block.nodeName === 'PRE' ? block.innerHTML.replace(/\\n/g, '<br>') : block.innerHTML;

                                block.outerHTML = `<p${attrString}>${content}</p>`;
                            } else {
                                // Temporarily store indent styles for standard blocks
                                block.setAttribute('data-pl', editor.dom.getStyle(block, 'padding-left') || '');
                                block.setAttribute('data-ml', editor.dom.getStyle(block, 'margin-left') || '');
                            }
                        });

                        // 2. Restore selection using the spans
                        editor.selection.moveToBookmark(bookmark);

                        // 3. Clear formatting (inline styles, colors, bold, etc.) on the restored selection
                        editor.execCommand('removeFormat', false, {
                            'selector': 'b,strong,i,em,u,strike,s,sub,sup,span,font,a',
                            'attributes': ['style', 'class', 'id', 'title', 'href', 'target', 'rel']
                        });

                        // 4. Manually strip specific tags like 'A' and restore indents on standard blocks
                        const currentBlocks = editor.selection.getSelectedBlocks();
                        currentBlocks.forEach(block => {
                            if (!block) return;

                            // Strip lingering links inside selection
                            const links = Array.from(block.querySelectorAll('a'));
                            links.forEach(link => {
                                if (editor.selection.getRng().intersectsNode(link)) {
                                    const text = link.textContent || link.innerText;
                                    editor.dom.replace(editor.dom.create('span', {}, text), link);
                                }
                            });

                            // Restore padding for standard blocks
                            if (block.hasAttribute('data-pl')) {
                                const pl = block.getAttribute('data-pl');
                                const ml = block.getAttribute('data-ml');
                                if (pl) editor.dom.setStyle(block, 'padding-left', pl);
                                if (ml) editor.dom.setStyle(block, 'margin-left', ml);
                                block.removeAttribute('data-pl');
                                block.removeAttribute('data-ml');
                            }
                        });
                    });
                }
            });

            // ================================================================
            // CLICK HANDLERS: Embedded files, log blocks, outliner toggles
            // ================================================================

            editor.on('click', function (e) {
                // --- Regular link: open on Ctrl+Click (inline editor blocks native clicks) ---
                const regularLink = editor.dom.getParent(e.target, 'a:not(.embedded-file)');
                if (regularLink && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    const href = editor.dom.getAttrib(regularLink, 'href');
                    if (href) window.open(href, '_blank');
                    return;
                }

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

                // --- Marker Bubble Click ---
                if (e.target.classList && e.target.classList.contains('marker-bubble')) {
                    e.preventDefault();
                    e.stopPropagation();

                    const markerId = e.target.getAttribute('data-marker-id');
                    const rect = e.target.getBoundingClientRect();

                    window.openMarkerPopover(markerId, rect.left, rect.bottom, editor, e.target);
                    return false;
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
            // TABLE INDENTATION & ALIGNMENT: Preserve indent and alignment level on block insertions
            // ================================================================

            let tableInsertIndent = 0;
            let blockStyleCache = [];

            // Capture current indent and alignment before table insertion or format block
            editor.on('BeforeExecCommand', function (e) {
                if (e.command === 'mceInsertTable') {
                    const node = editor.selection.getNode();
                    const block = editor.dom.getParent(node, editor.dom.isBlock);
                    tableInsertIndent = 0;

                    if (block) {
                        tableInsertIndent += parseInt(editor.dom.getStyle(block, 'padding-left') || 0, 10);
                        tableInsertIndent += parseInt(editor.dom.getStyle(block, 'margin-left') || 0, 10);
                    }
                    tableInsertIndent += editor.dom.getParents(node, 'OL,UL').length * 20;
                } else if (e.command === 'FormatBlock' && typeof e.value === 'string') {
                    blockStyleCache = [];
                    const selectedBlocks = editor.selection.getSelectedBlocks();
                    selectedBlocks.forEach(block => {
                        let indent = 0;
                        if (block) {
                            indent += parseInt(editor.dom.getStyle(block, 'padding-left') || 0, 10);
                            indent += parseInt(editor.dom.getStyle(block, 'margin-left') || 0, 10);
                            indent += editor.dom.getParents(block, 'OL,UL').length * 20;
                        }
                        const align = block ? (editor.dom.getStyle(block, 'text-align') || '') : '';
                        blockStyleCache.push({ indent, align });
                    });
                } else if (e.command === 'Indent' || e.command === 'Outdent') {
                    // Temporarily map margin-left of PRE tags to padding-left for TinyMCE native engine to indent/outdent them
                    const preBlocks = Array.from(editor.getBody().querySelectorAll('pre'));
                    preBlocks.forEach(preEl => {
                        if (!editor.dom.getParent(preEl, 'details.log-block')) {
                            const ml = parseInt(editor.dom.getStyle(preEl, 'margin-left') || 0, 10);
                            if (ml > 0) {
                                editor.dom.setStyle(preEl, 'padding-left', ml + 'px');
                                editor.dom.setStyle(preEl, 'margin-left', '');
                            }
                        }
                    });
                }
            });

            // Apply indent to newly inserted table and ensure trailing paragraph
            editor.on('ExecCommand', function (e) {
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

                // If FormatBlock was executed, restore the cached indentation levels and alignments
                if (e.command === 'FormatBlock' && typeof e.value === 'string') {
                    editor.undoManager.transact(() => {
                        const bookmark = editor.selection.getBookmark(2, true);

                        // 1. Re-apply captured indentation and alignment specifically to the newly formatted selection
                        const selectedBlocks = editor.selection.getSelectedBlocks();
                        selectedBlocks.forEach((block, index) => {
                            if (block && blockStyleCache[index]) {
                                const cached = blockStyleCache[index];
                                if (cached.indent > 0) {
                                    if (block.nodeName === 'PRE') {
                                        editor.dom.setStyle(block, 'margin-left', cached.indent + 'px');
                                        editor.dom.setStyle(block, 'padding-left', ''); // clear padding-left
                                    } else {
                                        editor.dom.setStyle(block, 'padding-left', cached.indent + 'px');
                                        editor.dom.setStyle(block, 'margin-left', ''); // clear margin-left
                                    }
                                } else {
                                    editor.dom.setStyle(block, 'padding-left', '');
                                    editor.dom.setStyle(block, 'margin-left', '');
                                }
                                if (cached.align) {
                                    editor.dom.setStyle(block, 'text-align', cached.align);
                                }
                            }
                        });

                        const isPre = e.value.toLowerCase() === 'pre';
                        if (isPre) {
                            const preBlocks = Array.from(editor.getBody().querySelectorAll('pre'));
                            for (let i = 0; i < preBlocks.length - 1; i++) {
                                const current = preBlocks[i];
                                let next = current.nextSibling;

                                while (next && next.nodeType === 3 && next.textContent.trim() === '') {
                                    const temp = next;
                                    next = next.nextSibling;
                                    temp.remove(); // clear whitespace nodes between pre tags
                                }

                                if (next && next.nodeName === 'PRE') {
                                    // Merge adjacent pre blocks not inside a details wrapper
                                    if (!editor.dom.getParent(current, 'details') && !editor.dom.getParent(next, 'details')) {
                                        // Make sure both have the same margin and alignment
                                        const currentMargin = parseInt(editor.dom.getStyle(current, 'margin-left') || 0, 10);
                                        const nextMargin = parseInt(editor.dom.getStyle(next, 'margin-left') || 0, 10);
                                        const currentAlign = editor.dom.getStyle(current, 'text-align') || '';
                                        const nextAlign = editor.dom.getStyle(next, 'text-align') || '';

                                        // Only merge if they are at the same indentation level and alignment
                                        if (currentMargin === nextMargin && currentAlign === nextAlign) {
                                            current.innerHTML += '\n' + next.innerHTML;
                                            next.remove();

                                            const index = preBlocks.indexOf(next);
                                            if (index > -1) preBlocks.splice(index, 1);

                                            i--; // re-check the newly merged element against upcoming siblings
                                        }
                                    }
                                }
                            }
                        }

                        editor.selection.moveToBookmark(bookmark);
                    });
                } else if (e.command === 'Indent' || e.command === 'Outdent') {
                    // Restore margin-left from padding-left after TinyMCE finishes indenting/outdenting
                    editor.undoManager.transact(() => {
                        const preBlocks = Array.from(editor.getBody().querySelectorAll('pre'));
                        preBlocks.forEach(preEl => {
                            if (!editor.dom.getParent(preEl, 'details.log-block')) {
                                const pl = parseInt(editor.dom.getStyle(preEl, 'padding-left') || 0, 10);
                                if (pl > 0) {
                                    editor.dom.setStyle(preEl, 'margin-left', pl + 'px');
                                    editor.dom.setStyle(preEl, 'padding-left', '');
                                } else {
                                    editor.dom.setStyle(preEl, 'margin-left', '');
                                    editor.dom.setStyle(preEl, 'padding-left', '');
                                }
                            }
                        });
                    });
                }
            });

            // ================================================================
            // KEYBOARD: Tab key for indent/outdent
            // ================================================================

            editor.on('keydown', function (event) {
                // Table Cell Block Escape (Arrow keys)
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    const node = editor.selection.getNode();
                    const targetBlock = editor.dom.getParent(node, 'PRE, DETAILS');
                    if (targetBlock && editor.dom.getParent(targetBlock, 'TD,TH')) {
                        if (event.key === 'ArrowDown') {
                            let next = targetBlock.nextSibling;
                            while (next && next.nodeType === 3 && next.textContent.trim() === '') {
                                next = next.nextSibling;
                            }
                            if (!next) {
                                const p = editor.dom.create('p', {}, '<br data-mce-bogus="1">');
                                editor.dom.insertAfter(p, targetBlock);
                            }
                        } else if (event.key === 'ArrowUp') {
                            let prev = targetBlock.previousSibling;
                            while (prev && prev.nodeType === 3 && prev.textContent.trim() === '') {
                                prev = prev.previousSibling;
                            }
                            if (!prev) {
                                const p = editor.dom.create('p', {}, '<br data-mce-bogus="1">');
                                targetBlock.parentNode.insertBefore(p, targetBlock);
                            }
                        }
                    }
                }

                if (event.keyCode === 9) {
                    event.preventDefault();
                    event.stopPropagation();

                    // Focus/indent handling for Collapsible Log Blocks & PRE tags
                    const node = editor.selection.getNode();
                    const preBlock = editor.dom.getParent(node, 'PRE');
                    if (preBlock) {
                        // Standard code editor behavior: insert tab/spaces instead of indenting the block element
                        if (!event.shiftKey) {
                            editor.insertContent('    ');
                        }
                        return false;
                    }

                    // Preemptively split <br> separated lines into distinct block tags
                    // before applying indent to prevent TinyMCE from shifting unselected lines
                    if (!event.shiftKey) {
                        const selectedBlocks = editor.selection.getSelectedBlocks();
                        let modified = false;

                        // Start a transaction so cursor tracking can be undone atomically
                        editor.undoManager.transact(() => {
                            let marker = null;
                            try {
                                const range = editor.selection.getRng();
                                if (range) {
                                    marker = editor.dom.create('span', { id: 'temp-tab-marker', style: 'display:none;' });
                                    range.insertNode(marker);
                                }
                            } catch (err) {
                                console.error('Error inserting temporary tab marker:', err);
                            }

                            selectedBlocks.forEach(block => {
                                // Prevent this logic from touching the editor container, tables, or pre tags
                                if (block && block !== editor.getBody() && block.nodeName !== 'BODY' && block.nodeName !== 'TABLE' && block.nodeName !== 'TD' && block.nodeName !== 'TH' && block.nodeName !== 'PRE' && !editor.dom.getParent(block, 'table')) {
                                    const brs = Array.from(block.querySelectorAll('br')).filter(br => !br.getAttribute('data-mce-bogus'));
                                    if (brs.length > 0) {
                                        let html = block.innerHTML;
                                        const outerTag = block.nodeName.toLowerCase();

                                        let blockStyles = block.getAttribute('style') || '';
                                        let attrString = '';
                                        if (blockStyles) attrString += ` style="${blockStyles}"`;

                                        // Drop internal outliner state classes for the new clones
                                        let cleanClass = (block.className || '').replace(/parent-node|hidden-by-collapse|collapsed/g, '').trim();
                                        if (cleanClass) attrString += ` class="${cleanClass}"`;

                                        // Remove bogus tags first to avoid trailing empty blocks
                                        let newHtml = html.replace(/<br\s+data-mce-bogus="1"[^>]*>/gi, '');
                                        newHtml = newHtml.replace(/<br\s*\/?>/gi, `</${outerTag}><${outerTag}${attrString}>`);

                                        block.outerHTML = `<${outerTag}${attrString}>${newHtml}</${outerTag}>`;
                                        modified = true;
                                    }
                                }
                            });

                            if (modified) {
                                const markerInDom = editor.dom.select('#temp-tab-marker')[0];
                                if (markerInDom) {
                                    editor.selection.select(markerInDom);
                                    editor.selection.collapse(true);
                                    editor.dom.remove(markerInDom);
                                }
                            } else if (marker) {
                                editor.dom.remove(marker);
                            }
                        });
                    }

                    editor.execCommand(event.shiftKey ? 'Outdent' : 'Indent');
                    return false;
                }
            });
        }
    });
}

// ============================================================================
// GLOBAL CRUD OPERATIONS (called from inline HTML event handlers)
// ============================================================================

let currentMarkerContext = null;

window.openMarkerPopover = function (markerId, x, y, editorInstance, bubbleElement, entryId = null, isStatusMarker = false) {
    const popover = document.getElementById('marker-popover');
    if (!popover) return;

    // Resolve editor and bubble if not explicitly passed but entryId is available
    const activeEditor = editorInstance || (entryId ? tinymce.get(`tinymce-${entryId}`) : null);
    const activeBubble = bubbleElement || (activeEditor ? activeEditor.dom.select(`.marker-bubble[data-marker-id="${markerId}"]`)[0] : null);
    const resolvedEntryId = entryId || (activeEditor ? activeEditor.id.split('-')[1] : null);

    currentMarkerContext = { 
        markerId, 
        editor: activeEditor, 
        bubble: activeBubble,
        entryId: resolvedEntryId,
        isStatusMarker
    };

    popover.style.left = `${x}px`;
    popover.style.top = `${y + 10}px`;
    popover.classList.remove('hidden');

    document.getElementById('marker-reminder-input').value = '';
};

document.addEventListener('DOMContentLoaded', () => {
    const popover = document.getElementById('marker-popover');
    const btnClosePopover = document.getElementById('marker-popover-close');
    const btnCloseMarker = document.getElementById('marker-btn-close');
    const btnSaveReminder = document.getElementById('marker-btn-reminder');
    const reminderInput = document.getElementById('marker-reminder-input');

    if (!popover) return;

    function hidePopover() {
        popover.classList.add('hidden');
        currentMarkerContext = null;
    }

    btnClosePopover.addEventListener('click', hidePopover);

    // Hide popover when clicking outside
    document.addEventListener('click', (e) => {
        if (!popover.contains(e.target) && !e.target.classList.contains('marker-bubble') && !e.target.closest('.reminder-item')) {
            hidePopover();
        }
    });

    // Close Marker
    btnCloseMarker.addEventListener('click', async () => {
        if (!currentMarkerContext) return;
        const { markerId, editor, entryId, isStatusMarker } = currentMarkerContext;

        if (isStatusMarker) {
            try {
                await window.updateEntryStatus(entryId, "");
                // Update select element in DOM if it exists
                const selectEl = document.querySelector(`.journal-entry[data-entry-id="${entryId}"] .entry-status-select`);
                if (selectEl) {
                    selectEl.value = "";
                }
                hidePopover();
            } catch (error) {
                console.error('Error closing status marker:', error);
            }
            return;
        }

        try {
            const res = await fetch(`/api/markers/${markerId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ state: 'CLOSED' })
            });

            if (res.ok) {
                if (editor) {
                    // Remove all associated bubbles (handles potential duplicates)
                    const bubbles = editor.dom.select(`.marker-bubble[data-marker-id="${markerId}"]`);
                    bubbles.forEach(b => editor.dom.remove(b));

                    // Unwrap all associated spans (handles potential duplicates)
                    const markerSpans = editor.dom.select(`span.marker[data-marker-id="${markerId}"]`);
                    markerSpans.forEach(span => {
                        editor.dom.remove(span, true); // true = keep children (unwrap)
                    });

                    // Force sync save directly to DB before reloading the page!
                    // The auto-save debounce takes 2s and would be terminated by reload.
                    if (entryId) {
                        const currentContent = editor.getContent();
                        await fetch(`/api/entries/${entryId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ content: currentContent })
                        });
                    }

                    editor.fire('change');
                } else if (entryId) {
                    // If editor is not open/loaded, we modify the entry content in the DB
                    if (!window.allItemsData) {
                        const itemsRes = await fetch('/api/items');
                        window.allItemsData = await itemsRes.json();
                    }
                    let entryContent = "";
                    for (const item of window.allItemsData) {
                        const found = item.entries.find(e => e.id === entryId);
                        if (found) {
                            entryContent = found.content;
                            break;
                        }
                    }
                    if (entryContent) {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(entryContent, 'text/html');
                        
                        // Remove all associated bubbles
                        const bubbles = doc.querySelectorAll(`.marker-bubble[data-marker-id="${markerId}"]`);
                        bubbles.forEach(b => b.remove());

                        // Unwrap all associated spans
                        const markerSpans = doc.querySelectorAll(`span.marker[data-marker-id="${markerId}"]`);
                        markerSpans.forEach(span => {
                            const parent = span.parentNode;
                            while (span.firstChild) {
                                parent.insertBefore(span.firstChild, span);
                            }
                            span.remove();
                        });
                        const updatedContent = doc.body.innerHTML;

                        await fetch(`/api/entries/${entryId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ content: updatedContent })
                        });
                    }
                }

                hidePopover();

                // Refresh sidebar dynamically instead of full page reload
                if (window.refreshSidebar) window.refreshSidebar();
            }
        } catch (error) {
            console.error('Error closing marker:', error);
        }
    });

    // Set Reminder
    btnSaveReminder.addEventListener('click', async () => {
        if (!currentMarkerContext) return;
        const { markerId, editor, bubble, entryId } = currentMarkerContext;
        const dateVal = reminderInput.value;

        const payload = { reminder_due_date: dateVal ? new Date(dateVal).toISOString() : null };

        try {
            const res = await fetch(`/api/markers/${markerId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const activeBubble = bubble || (editor ? editor.dom.select(`.marker-bubble[data-marker-id="${markerId}"]`)[0] : null);
                if (editor && activeBubble) {
                    if (dateVal) {
                        activeBubble.classList.add('has-reminder');
                    } else {
                        activeBubble.classList.remove('has-reminder');
                    }

                    const resolvedEntryId = entryId || editor.id.split('-')[1];
                    if (resolvedEntryId) {
                        await fetch(`/api/entries/${resolvedEntryId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ content: editor.getContent() })
                        });
                    }

                    editor.fire('change');
                }
                hidePopover();
                if (window.refreshSidebar) window.refreshSidebar();
            }
        } catch (error) {
            console.error('Error setting reminder:', error);
        }
    });
});

/**
 * Creates a new journal entry under a work item.
 * Removes existing "+" buttons, appends the new entry, and auto-expands the item.
 */
window.addEntry = async function (itemId) {
    const workItem = document.querySelector(`.work-item[data-id="${itemId}"]`);
    const headingInput = workItem ? workItem.querySelector('.item-title-input') : null;
    const taskTitle = headingInput ? headingInput.value.trim() : '';
    const defaultTitle = taskTitle ? (taskTitle + ' details...') : 'New Entry details...';

    try {
        const res = await fetch(`/api/items/${itemId}/entries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: defaultTitle, content: '' })
        });

        if (res.ok) {
            const newEntry = await res.json();
            const entriesContainer = document.getElementById(`entries-${itemId}`);

            // Remove existing "+" buttons and "Add First Entry" ghost button
            entriesContainer.querySelectorAll('.ph-plus-circle').forEach(icon => icon.parentElement.remove());
            const addFirstBtn = entriesContainer.querySelector('.btn-ghost');
            if (addFirstBtn) addFirstBtn.parentElement.remove();

            // Collapse all previously expanded entries before adding the new one
            entriesContainer.querySelectorAll('.journal-entry.expanded').forEach(entry => {
                entry.classList.remove('expanded');
            });

            // Newly added entries are always expanded and focused
            const entryEl = createEntryElement(newEntry, true, true, true);
            entriesContainer.appendChild(entryEl);

            // Focus and select the default title text
            const titleInput = entryEl.querySelector('.entry-title-input');
            if (titleInput) {
                setTimeout(() => {
                    titleInput.focus();
                    titleInput.select();
                }, 50);
            }

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
window.updateEntryTitle = async function (entryId, newTitle) {
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

/** Updates a journal entry's status via the API. */
window.updateEntryStatus = async function (entryId, newStatus) {
    try {
        const res = await fetch(`/api/entries/${entryId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus === "" ? null : newStatus })
        });
        if (res.ok && window.refreshSidebar) {
            await window.refreshSidebar();
        }
    } catch (error) {
        console.error('Error updating entry status:', error);
    }
};

/** Updates a work item's heading via the API. */
window.updateItemHeading = async function (id, newHeading) {
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
window.deleteEntry = async function (entryId) {
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

            // Safety: remove any orphaned toolbar that might be on document.body
            const orphanedToolbar = document.body.querySelector(`#toolbar-${entryId}.floating-toolbar`);
            if (orphanedToolbar) orphanedToolbar.remove();
        }
    } catch (error) {
        console.error('Error deleting entry:', error);
    }
};

/**
 * Updates a work item's state (TODO/WIP/MEMO/DONE) in-place without a page
 * reload.  Saves any dirty TinyMCE editors first (so the 2-second auto-save
 * debounce can't lose data), updates the state badge CSS, moves the card
 * between active/archived containers when needed, and refreshes the sidebar.
 */
window.updateState = async function (id, newState) {
    try {
        // 1. Flush every dirty TinyMCE editor to the server before anything else
        const savePromises = tinymce.get().map(editor => {
            if (editor.isDirty()) {
                const entryId = editor.id.split('-')[1];
                if (entryId) {
                    return fetch(`/api/entries/${entryId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content: editor.getContent() })
                    }).then(() => editor.setDirty(false));
                }
            }
            return Promise.resolve();
        });
        await Promise.all(savePromises);

        // 2. Send the state update to the API
        const res = await fetch(`/api/items/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: newState })
        });
        if (!res.ok) return;

        // 3. Update the <select> badge styling in-place
        const workItemEl = document.querySelector(`.work-item[data-id="${id}"]`);
        if (workItemEl) {
            const selectEl = workItemEl.querySelector('.state-select');
            if (selectEl) {
                // Strip all previous state-* classes and apply the new one
                selectEl.className = selectEl.className.replace(/\bstate-\w+/g, '');
                selectEl.classList.add('state-select', `state-${newState}`);
            }

            // 4. Determine if the item should be in the active or archived section
            const isArchived = newState === 'DONE';
            const activeContainer = document.getElementById('items-container');
            const archivedContainer = document.getElementById('archived-container');
            const archivedHeader = document.getElementById('archived-header');
            const currentlyInActive = activeContainer && activeContainer.contains(workItemEl);

            if (isArchived && currentlyInActive) {
                // Move from active → archived
                workItemEl.remove();

                // Show empty-state message if the active list is now empty
                if (activeContainer.querySelectorAll('.work-item').length === 0) {
                    activeContainer.innerHTML = '<div class="loading-state">No active tasks. Start by adding one!</div>';
                }

                // Ensure archived section is visible and prepend the card
                if (archivedHeader) archivedHeader.style.display = 'flex';
                if (archivedContainer) archivedContainer.prepend(workItemEl);
            } else if (!isArchived && archivedContainer && archivedContainer.contains(workItemEl)) {
                // Move from archived → active
                workItemEl.remove();

                // Clear the empty-state placeholder if present
                const placeholder = activeContainer.querySelector('.loading-state');
                if (placeholder) placeholder.remove();

                // Prepend to active list (newest-style behaviour)
                if (activeContainer) activeContainer.prepend(workItemEl);

                // Hide archived header if no archived items remain
                if (archivedContainer.querySelectorAll('.work-item').length === 0) {
                    if (archivedHeader) archivedHeader.style.display = 'none';
                }
            }
        }

        // 5. Refresh the sidebar timeline (lightweight, no editor destruction)
        if (window.refreshSidebar) window.refreshSidebar();

    } catch (error) {
        console.error('Error updating state:', error);
    }
};

/** Deletes a work item and all its entries after user confirmation. */
window.deleteItem = async function (id) {
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
 * Places the cursor on the first occurrence of a search match inside the
 * TinyMCE editor for the given entry.  When `matchedTerms` are provided
 * (extracted by FTS5 highlight()), those exact words are used for
 * highlighting — so stemmed matches like "running" are found even when the
 * user searched "ran".  Falls back to a raw substring search on `searchTerm`.
 *
 * @param {number}  entryId      - Journal entry ID
 * @param {boolean} isArchived   - Whether the parent work item is archived
 * @param {number}  itemId       - Parent work item ID
 * @param {number|null} markerId - Optional marker ID to focus
 * @param {string}  searchTerm   - Optional text to find in the editor (raw query)
 * @param {Object|null} itemObj  - Optional full item object (used for archived items to avoid stale allItemsData lookup)
 * @param {string[]|undefined} matchedTerms - Actual words that matched via FTS5 stemming
 */
window.focusEntry = function (entryId, isArchived, itemId, markerId = null, searchTerm = '', itemObj = null, matchedTerms = undefined) {
    console.log('[focusEntry] called', { entryId, isArchived, itemId, markerId, searchTerm, matchedTerms });
    if (isArchived) {
        const archivedContainer = document.getElementById('archived-container');
        const existingItem = archivedContainer.querySelector(`.work-item[data-id="${itemId}"]`);

        if (!existingItem) {
            // Prefer the directly-passed itemObj (e.g. from search results) to avoid
            // stale or missing data in allItemsData.
            const renderObj = itemObj || window.allItemsData.find(i => i.id === itemId);
            console.log('[focusEntry] renderObj found?', !!renderObj, 'from closure?', !!itemObj);
            if (renderObj) {
                document.getElementById('archived-header').style.display = 'flex';
                document.dispatchEvent(new CustomEvent('RenderArchivedItem', {
                    detail: { itemObj: renderObj, container: archivedContainer }
                }));
            }
        }

        // Expand the work-item card as soon as it appears (it may not be in DOM yet)
        setTimeout(() => {
            const div = archivedContainer.querySelector(`.work-item[data-id="${itemId}"]`);
            if (div && !div.classList.contains('expanded')) div.classList.add('expanded');
        }, 50);
    } else {
        const div = document.querySelector(`#items-container .work-item[data-id="${itemId}"]`);
        if (div && !div.classList.contains('expanded')) div.classList.add('expanded');
    }

    // -------------------------------------------------------------------------
    // Poll until both the entry element AND its TinyMCE editor are ready.
    // For active items 1-2 ticks is enough; archived items need more time
    // because renderItem + initTinyMCE run asynchronously after the event.
    // -------------------------------------------------------------------------
    const MAX_WAIT_MS = 3000;
    const POLL_INTERVAL_MS = 50;
    let elapsed = 0;

    function attemptFocus() {
        const entryEl = document.querySelector(`.journal-entry[data-entry-id="${entryId}"]`);
        const editor = tinymce.get(`tinymce-${entryId}`);

        if (!entryEl || !editor) {
            elapsed += POLL_INTERVAL_MS;
            if (elapsed < MAX_WAIT_MS) {
                setTimeout(attemptFocus, POLL_INTERVAL_MS);
            } else {
                console.warn('[focusEntry] timed out waiting for entry/editor', { entryId, entryEl: !!entryEl, editor: !!editor });
            }
            return;
        }

        // Expand the entry panel
        if (!entryEl.classList.contains('expanded')) {
            entryEl.classList.add('expanded');
        }

        // Scroll into view and pulse
        entryEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        entryEl.classList.add('highlight-pulse');
        setTimeout(() => entryEl.classList.remove('highlight-pulse'), 2000);

        // Focus the editor
        editor.focus();

        if (markerId) {
            // Place cursor at end of the marker span
            const markerSpan = editor.dom.select(`span.marker[data-marker-id="${markerId}"]`)[0];
            if (markerSpan) {
                markerSpan.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                const range = editor.dom.createRng();
                range.setStartAfter(markerSpan);
                range.setEndAfter(markerSpan);
                editor.selection.setRng(range);
            }
        } else if (searchTerm || (matchedTerms && matchedTerms.length)) {
            // Build a list of terms to search for in priority order:
            //   1. matchedTerms from FTS5 highlight() — the actual words that
            //      matched after porter stemming (e.g. "running" when query was "ran")
            //   2. Fall back to the raw searchTerm as a substring
            const termsToTry = [];
            if (matchedTerms && matchedTerms.length) {
                matchedTerms.forEach(t => termsToTry.push(t.toLowerCase()));
            }
            if (searchTerm) {
                const raw = searchTerm.toLowerCase();
                if (!termsToTry.includes(raw)) termsToTry.push(raw);
            }

            const body = editor.getBody();
            let found = false;

            for (const term of termsToTry) {
                if (found) break;
                const walker = editor.dom.doc.createTreeWalker(
                    body,
                    NodeFilter.SHOW_TEXT,
                    null,
                    false
                );

                let node;
                while ((node = walker.nextNode())) {
                    const text = node.nodeValue || '';
                    const idx = text.toLowerCase().indexOf(term);
                    if (idx !== -1) {
                        const range = editor.dom.createRng();
                        range.setStart(node, idx);
                        range.setEnd(node, idx + term.length);
                        editor.selection.setRng(range);

                        const selEl = editor.selection.getNode();
                        if (selEl) selEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                        found = true;
                        break;
                    }
                }
            }

            if (!found) {
                editor.selection.select(body, true);
                editor.selection.collapse(true);
            }
        }
    }

    // Give the DOM one tick to start rendering before the first poll attempt
    setTimeout(attemptFocus, 50);
};



