// We no longer need to manually track instances; TinyMCE has a global tinymce.editors array accessible by target ID

document.addEventListener('DOMContentLoaded', () => {
    const itemsContainer = document.getElementById('items-container');
    const addItemForm = document.getElementById('add-item-form');
    const headingInput = document.getElementById('heading-input');

    document.addEventListener('RenderArchivedItem', (e) => {
        renderItem(e.detail.itemObj, false, e.detail.container);
    });

    // Fetch and render initial items
    fetchItems();

    // Form submit listener
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
                // Instead of refetching all, just add to the DOM
                renderItem(newItem, true);
                
                // Remove loading state if it exists
                const loadingState = document.querySelector('.loading-state');
                if (loadingState) loadingState.remove();
            }
        } catch (error) {
            console.error('Error creating item:', error);
        }
    });

    async function fetchItems() {
        try {
            const res = await fetch('/api/items');
            const items = await res.json();
            
            window.allItemsData = items;
            
            itemsContainer.innerHTML = '';
            document.getElementById('timeline-container').innerHTML = '';
            document.getElementById('archived-container').innerHTML = '';
            document.getElementById('archived-header').style.display = 'none';
            
            const activeItems = items.filter(i => {
                if (i.state === 'DONE') return false;
                if (i.state === 'MEMO') {
                    const createdDate = parseUTCDate(i.created_at).toDateString();
                    const todayDate = new Date().toDateString();
                    return createdDate === todayDate;
                }
                return true;
            });
            
            if (activeItems.length === 0) {
                itemsContainer.innerHTML = `<div class="loading-state">No active tasks. Start by adding one!</div>`;
            } else {
                activeItems.forEach(item => renderItem(item, false, itemsContainer));
            }
            
            renderTimeline(items);
        } catch (error) {
            console.error('Error fetching items:', error);
            itemsContainer.innerHTML = `<div class="loading-state" style="color:#ef4444">Failed to load entries.</div>`;
            document.getElementById('timeline-container').innerHTML = `<div class="loading-state" style="color:#ef4444">Error loading timeline.</div>`;
        }
    }

    function renderItem(item, prepend = false, container = itemsContainer) {
        const div = document.createElement('div');
        div.className = 'work-item';
        div.dataset.id = item.id;
        
        const dateObj = parseUTCDate(item.created_at);
        const timeStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' at ' + dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

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
                    <div class="entries-container" id="entries-${item.id}">
                        <!-- Entries Will Load Here -->
                    </div>
                    
                    <div class="add-entry-row">
                        <button class="btn-ghost" onclick="addEntry(${item.id})"><i class="ph ph-plus"></i> Add New Entry</button>
                    </div>
                </div>
            </div>
        `;

        // Toggle Expand/Collapse
        const header = div.querySelector('.work-item-header');
        header.addEventListener('click', () => {
            div.classList.toggle('expanded');
        });

        if (prepend) {
            container.prepend(div);
        } else {
            container.appendChild(div);
        }

        // Render entries for this item
        const entriesContainer = div.querySelector(`#entries-${item.id}`);
        if (item.entries && item.entries.length > 0) {
            item.entries.forEach(entry => {
                entriesContainer.appendChild(createEntryElement(entry));
            });
        }
    }
    function renderTimeline(items) {
        let allEntries = [];
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
        
        allEntries.sort((a,b) => parseUTCDate(b.created_at) - parseUTCDate(a.created_at));
        
        const tree = new Map();
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
                        let isArchived = entry.parentItem.state === 'DONE';
                        if (entry.parentItem.state === 'MEMO') {
                            const createdDate = parseUTCDate(entry.parentItem.created_at).toDateString();
                            const todayDate = new Date().toDateString();
                            if (createdDate !== todayDate) isArchived = true;
                        }
                        const stateClass = `timeline-item-${entry.parentItem.state.toLowerCase()}`;
                        const timeStr = parseUTCDate(entry.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                        const entryDiv = document.createElement('div');
                        entryDiv.className = `timeline-item ${stateClass} ${isArchived ? 'timeline-item-archived' : ''}`;
                        entryDiv.innerHTML = `
                            <div class="timeline-task">${escapeHtml(entry.parentItem.heading)}</div>
                            <div class="timeline-entry-title">
                                ${escapeHtml(entry.title)}
                                <span style="float: right; font-size: 0.75rem; color: var(--text-secondary);">${timeStr}</span>
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
});

// Helper to parse naive backend UTC strings securely into localized client Date objects
function parseUTCDate(dateString) {
    if (!dateString) return new Date();
    let d = String(dateString).replace(' ', 'T');
    if (!d.endsWith('Z') && !d.includes('+') && !d.match(/-\d{2}:\d{2}$/)) {
        d += 'Z';
    }
    return new Date(d);
}

// Helper to escape HTML and prevent XSS
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function createEntryElement(entry) {
    const entryDiv = document.createElement('div');
    entryDiv.className = 'journal-entry';
    entryDiv.dataset.entryId = entry.id;

    const dateObj = parseUTCDate(entry.created_at);
    const dateStr = dateObj.toLocaleDateString() + ' at ' + dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    entryDiv.innerHTML = `
        <div class="entry-header">
            <input type="text" class="entry-title-input" value="${escapeHtml(entry.title)}" onchange="updateEntryTitle(${entry.id}, this.value)">
            <span class="entry-date">${dateStr}</span>
            <button class="btn-secondary btn-danger btn-small" style="margin-left: 0.5rem; border: none; padding: 0.25rem;" onclick="deleteEntry(${entry.id})"><i class="ph ph-x"></i></button>
        </div>
        <div id="tinymce-${entry.id}" class="tinymce-editor">${entry.content || '<p><br></p>'}</div>
    `;

    // Initialize TinyMCE on the next tick so the textarea exists in the DOM
    setTimeout(() => {
        const targetId = `tinymce-${entry.id}`;
        if (tinymce.get(targetId)) {
            tinymce.get(targetId).remove();
        }

        tinymce.init({
            selector: `#${targetId}`,
            inline: true,
            indentation: '20px',
            fixed_toolbar_container: '#global-toolbar',
            skin: 'oxide-dark',
            menubar: false,
            statusbar: false,
            extended_valid_elements: 'details[class|open|style],summary',
            plugins: 'lists link table autolink nonbreaking',
            toolbar: 'blocks fontfamily | bold italic underline | bullist numlist | outdent indent | table link embedfile collapsible | removeformat',
            setup: function(editor) {
                function getOutlinerIndent(block) {
                    let pl = parseInt(editor.dom.getStyle(block, 'padding-left') || 0, 10);
                    let ml = parseInt(editor.dom.getStyle(block, 'margin-left') || 0, 10);
                    let listDepth = editor.dom.getParents(block, 'OL,UL').length;
                    return pl + ml + (listDepth * 20);
                }

                function updateOutliner() {
                    const blocks = editor.dom.select('p, h1, h2, h3, h4, h5, h6, li, table, details');
                    let hideThreshold = Infinity;
                    
                    for (let i = 0; i < blocks.length; i++) {
                        const block = blocks[i];
                        let currentIndent = getOutlinerIndent(block);
                        
                        let isParent = false;
                        if (i + 1 < blocks.length) {
                            let nextIndent = getOutlinerIndent(blocks[i+1]);
                            if (nextIndent > currentIndent) {
                                isParent = true;
                            }
                        }
                        
                        if (isParent) {
                            editor.dom.addClass(block, 'parent-node');
                        } else {
                            editor.dom.removeClass(block, 'parent-node');
                            editor.dom.removeClass(block, 'collapsed');
                        }
                        
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

                let outlinerTimeout;
                function triggerOutlinerUpdate() {
                    clearTimeout(outlinerTimeout);
                    outlinerTimeout = setTimeout(() => { updateOutliner(); }, 50);
                }

                editor.on('NodeChange KeyUp ExecCommand', triggerOutlinerUpdate);
                
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

                editor.on('init', function() {
                    triggerOutlinerUpdate();
                    lastSavedContent = editor.getContent();
                });

                editor.on('blur', () => {
                    clearTimeout(saveTimeout);
                    triggerSave();
                });

                editor.on('input change keyup NodeChange', () => {
                    clearTimeout(saveTimeout);
                    saveTimeout = setTimeout(triggerSave, 2000);
                });

                editor.ui.registry.addButton('collapsible', {
                    icon: 'chevron-down',
                    tooltip: 'Insert Collapsible Log Block',
                    onAction: function (_) {
                        const node = editor.selection.getNode();
                        const block = editor.dom.getParent(node, editor.dom.isBlock);
                        let indent = 0;
                        
                        if (block) {
                            let pl = parseInt(editor.dom.getStyle(block, 'padding-left') || 0, 10);
                            let ml = parseInt(editor.dom.getStyle(block, 'margin-left') || 0, 10);
                            indent += pl + ml;
                        }
                        
                        const listDepth = editor.dom.getParents(node, 'OL,UL').length;
                        indent += listDepth * 20;
                        
                        let marginStyle = '';
                        let pStyle = '';
                        if (indent > 0) {
                            marginStyle = ` style="margin-left: ${indent}px;"`;
                            pStyle = ` style="padding-left: ${indent}px;"`;
                        }
                        
                        editor.insertContent(`<details class="log-block"${marginStyle}><summary>Logs (click to expand) <span class="delete-log-block" contenteditable="false" title="Delete this block" style="float: right; margin-right: 8px; color: #ef4444; font-size: 14px;">&times;</span></summary><pre><code>Paste logs/code here...</code></pre></details><p${pStyle}>&nbsp;</p>`);
                    }
                });

                editor.ui.registry.addButton('embedfile', {
                    icon: 'upload',
                    tooltip: 'Embed File or Image',
                    onAction: function (_) {
                        const fileInput = document.createElement('input');
                        fileInput.type = 'file';
                        fileInput.onchange = async (e) => {
                            const file = e.target.files[0];
                            if (!file) return;
                            
                            const formData = new FormData();
                            formData.append('file', file);
                            
                            try {
                                const res = await fetch('/api/upload', {
                                    method: 'POST',
                                    body: formData
                                });
                                if (res.ok) {
                                    const data = await res.json();
                                    let htmlToInsert = '';
                                    if (data.is_image) {
                                        htmlToInsert = `<img src="${data.url}" alt="${data.original_name}" style="max-width: 100%; height: auto; border-radius: 6px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin: 10px 0;" />`;
                                    } else {
                                        htmlToInsert = `<a href="${data.url}" class="embedded-file" contenteditable="false" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: rgba(255,255,255,0.05); border-radius: 4px; text-decoration: none; border: 1px solid rgba(255,255,255,0.1); margin: 0.25rem 0; cursor: pointer;">📄 ${data.original_name}</a>&nbsp;`;
                                    }
                                    editor.insertContent(htmlToInsert);
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

                // Workaround for contenteditable blocking <details> toggle and delete button
                editor.on('click', function(e) {
                    const embeddedLink = editor.dom.getParent(e.target, 'a.embedded-file');
                    if (embeddedLink) {
                        e.preventDefault();
                        const urlParts = embeddedLink.href.split('/');
                        const filename = urlParts[urlParts.length - 1];
                        
                        // Instruct the local Python server to natively execute the file using the local Windows OS defaults!
                        fetch('/api/open/' + encodeURIComponent(filename))
                            .then(res => {
                                if (!res.ok) window.open(embeddedLink.href, '_blank');
                            })
                            .catch(() => window.open(embeddedLink.href, '_blank'));
                        return;
                    }

                    // Check if they clicked the delete button inside the log block
                    if (e.target && e.target.classList && e.target.classList.contains('delete-log-block')) {
                        const detailsBlock = editor.dom.getParent(e.target, 'DETAILS');
                        if (detailsBlock) {
                            editor.dom.remove(detailsBlock);
                            updateOutliner();
                        }
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }
                    
                    const block = editor.dom.getParent(e.target, editor.dom.isBlock);
                    if (block && editor.dom.hasClass(block, 'parent-node')) {
                        let indent = getOutlinerIndent(block);
                        const bodyRect = editor.getBody().getBoundingClientRect();
                        const clickX = e.clientX - bodyRect.left;
                        const bodyStyle = window.getComputedStyle(editor.getBody());
                        const bodyPaddingLeft = parseInt(bodyStyle.paddingLeft || 0, 10);
                        const textStartX = bodyPaddingLeft + indent;
                        
                        if (clickX >= textStartX - 25 && clickX <= textStartX + 5) {
                            editor.dom.toggleClass(block, 'collapsed');
                            updateOutliner();
                            e.preventDefault();
                            e.stopPropagation();
                            return false;
                        }
                    }
                    
                    if (e.target.nodeName === 'SUMMARY') {
                        var details = e.target.parentNode;
                        if (details && details.nodeName === 'DETAILS') {
                            if (details.hasAttribute('open')) {
                                details.removeAttribute('open');
                            } else {
                                details.setAttribute('open', 'open');
                            }
                        }
                    }
                });

                let currentIndent = 0;
                editor.on('BeforeExecCommand', function(e) {
                    if (e.command === 'mceInsertTable') {
                        const node = editor.selection.getNode();
                        const block = editor.dom.getParent(node, editor.dom.isBlock);
                        currentIndent = 0;
                        
                        if (block) {
                            let pl = parseInt(editor.dom.getStyle(block, 'padding-left') || 0, 10);
                            let ml = parseInt(editor.dom.getStyle(block, 'margin-left') || 0, 10);
                            currentIndent += pl + ml;
                        }
                        
                        const listDepth = editor.dom.getParents(node, 'OL,UL').length;
                        currentIndent += listDepth * 20;
                    }
                });

                editor.on('ExecCommand', function(e) {
                    if (e.command === 'mceInsertTable') {
                        if (currentIndent > 0) {
                            // After insertion, the cursor is inside the new table
                            const node = editor.selection.getNode();
                            const tableNode = editor.dom.getParent(node, 'TABLE');
                            if (tableNode) {
                                editor.dom.setStyle(tableNode, 'margin-left', currentIndent + 'px');
                                if (tableNode.style.width === '100%') {
                                    editor.dom.setStyle(tableNode, 'width', `calc(100% - ${currentIndent}px)`);
                                }
                            }
                        }
                    }
                });

                editor.on('keydown', function(event) {
                    if (event.keyCode === 9) { // Tab key
                        if (event.shiftKey) {
                            editor.execCommand('Outdent');
                        } else {
                            editor.execCommand('Indent');
                        }
                        event.preventDefault();
                        event.stopPropagation();
                        return false;
                    }
                });
            }
        });
    }, 0);

    return entryDiv;
}

window.addEntry = async function(itemId) {
    const dateTitle = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    
    try {
        const res = await fetch(`/api/items/${itemId}/entries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: dateTitle, content: '' })
        });
        
        if (res.ok) {
            const newEntry = await res.json();
            const entriesContainer = document.getElementById(`entries-${itemId}`);
            entriesContainer.appendChild(createEntryElement(newEntry));
            
            // Auto expand the work item if it's not already
            const workItem = document.querySelector(`.work-item[data-id="${itemId}"]`);
            if (workItem && !workItem.classList.contains('expanded')) {
                workItem.classList.add('expanded');
            }
        }
    } catch (error) {
        console.error('Error adding entry:', error);
    }
};

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

window.deleteEntry = async function(entryId) {
    if (!confirm('Delete this entry?')) return;
    
    try {
        const res = await fetch(`/api/entries/${entryId}`, {
            method: 'DELETE'
        });
        if (res.ok || res.status === 204) {
            const el = document.querySelector(`.journal-entry[data-entry-id="${entryId}"]`);
            if (el) el.remove();
            
            // Clean up TinyMCE instance
            const editor = tinymce.get(`tinymce-${entryId}`);
            if (editor) {
                editor.remove();
            }
        }
    } catch (error) {
        console.error('Error deleting entry:', error);
    }
};

window.updateState = async function(id, newState) {
    try {
        const res = await fetch(`/api/items/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: newState })
        });
        if (res.ok) {
            // Re-fetch all items to synchronize the DOM (sorting, archiving, and filtering out DONE tasks cleanly)
            const DOMContentLoadedEvent = new Event('DOMContentLoaded');
            document.dispatchEvent(DOMContentLoadedEvent); // Wait, better to just reload. The easiest is reloading page or manual JS refresh.
            // Oh, since `fetchItems` is scoped inside DOMContentLoaded, we can't easily call it directly here.
            // Let's just reload the page - it's a SPA-lite, but reloading is safest to rebuild everything instantly without global scope issues.
            window.location.reload();
        }
    } catch (error) {
        console.error('Error updating state:', error);
    }
};

window.deleteItem = async function(id) {
    if (!confirm('Are you sure you want to delete this Work Item and ALL nested journals?')) return;
    
    try {
        const res = await fetch(`/api/items/${id}`, {
            method: 'DELETE'
        });
        if (res.ok || res.status === 204) {
            const el = document.querySelector(`.work-item[data-id="${id}"]`);
            if (el) el.remove();
            
            // Show empty state if needed
            const container = document.getElementById('items-container');
            if (container.children.length === 0) {
                container.innerHTML = `<div class="loading-state">No journal entries yet. Start by adding one!</div>`;
            }
        }
    } catch (error) {
        console.error('Error deleting item:', error);
    }
};

// Expose focusEntry globally
window.focusEntry = function(entryId, isDone, itemId) {
    if (isDone) {
        const archivedContainer = document.getElementById('archived-container');
        let existingItem = archivedContainer.querySelector(`.work-item[data-id="${itemId}"]`);
        if (!existingItem) {
            const itemObj = window.allItemsData.find(i => i.id === itemId);
            if (itemObj) {
                document.getElementById('archived-header').style.display = 'flex';
                // Rather than copying renderItem directly (since it's not global), we can trigger a DOM rebuild or copy logic.
                // Wait, it's easier to just dispatch a custom event that `DOMContentLoaded` listener catches.
                const event = new CustomEvent('RenderArchivedItem', { detail: { itemObj, container: archivedContainer } });
                document.dispatchEvent(event);
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
