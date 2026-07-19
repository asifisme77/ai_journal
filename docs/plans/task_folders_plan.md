# Extend Folder Structure to Tasks — Unified Root Folders

Reuse the existing `MemoFolder` table with two permanent system root folders ("Memos" and "Tasks") to organize both item types. The sidebar "Memos" section is renamed to "Folders". No new tables, no new FK columns, no data migration, no duplicate code.

## Design Decisions

- **System root folders as collapsible headers**: The two roots ("📝 Memos", "📋 Tasks") render as styled collapsible section headers — visually distinct from user-created subfolders (bolder, non-deletable, with a distinct icon).
- **No data migration**: Existing memos with `folder_id = NULL` render directly under the "Memos" root in the UI without any DB update. Existing user-created folders remain as-is; at startup they are re-parented under the "Memos" root only if they are currently orphaned at the top level.
- **Reusing `memo_folder_id` column**: The DB column name stays `memo_folder_id` to avoid risky SQLite renames. The Python model aliases it to `folder_id`.

---

## Architecture Overview

```
Sidebar "Folders" Section
├── 📝 Memos (system root, is_system=True, collapsible header, non-deletable)
│   ├── Work/            ← user-created folder (parent_id = memos_root.id)
│   │   ├── Meeting Notes   ← MEMO item with folder_id = Work.id
│   │   └── Design Docs     ← MEMO item with folder_id = Work.id
│   ├── Personal/        ← user-created folder
│   └── My Unfoldered Memo  ← MEMO item with folder_id = NULL (rendered here by state)
│
└── 📋 Tasks (system root, is_system=True, collapsible header, non-deletable)
    ├── Sprint 12/       ← user-created folder (parent_id = tasks_root.id)
    │   ├── Fix login bug    ← TODO item with folder_id = Sprint12.id
    │   └── Review PR #42    ← WIP item with folder_id = Sprint12.id
    ├── Backlog/         ← user-created folder
    └── Random TODO task    ← TODO item with folder_id = NULL (rendered here by state)
```

---

## Proposed Changes

### Database Layer

#### [MODIFY] app.py

**1. Add `is_system` column to `MemoFolder`** (~line 146):

```python
class MemoFolder(db.Model):
    """A named folder for organizing work items in the sidebar.
    System root folders ('Memos', 'Tasks') partition items by type."""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    parent_id = db.Column(db.Integer, db.ForeignKey('memo_folder.id', ondelete='CASCADE'), nullable=True)
    is_system = db.Column(db.Boolean, default=False, nullable=False)

    items = db.relationship('WorkItem', backref='folder', lazy=True)
    children = db.relationship('MemoFolder',
                               backref=db.backref('parent', remote_side=[id]),
                               lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'parent_id': self.parent_id,
            'is_system': self.is_system,
            'created_at': self.created_at.isoformat()
        }
```

**2. Alias `memo_folder_id` on `WorkItem`** — No DB column rename, just a Python alias:

Update from:
```python
memo_folder_id = db.Column(db.Integer, db.ForeignKey('memo_folder.id'), nullable=True)
```
to:
```python
folder_id = db.Column('memo_folder_id', db.Integer, db.ForeignKey('memo_folder.id'), nullable=True)
```

Update `WorkItem.to_dict()` to return `folder_id` instead of `memo_folder_id`.

**3. Auto-migration** — Add to the startup `with app.app_context():` block:

```python
# Auto-migration: is_system column on memo_folder
try:
    inspector = inspect(db.engine)
    if 'memo_folder' in inspector.get_table_names():
        columns = [col['name'] for col in inspector.get_columns('memo_folder')]
        if 'is_system' not in columns:
            _conn.execute(text('ALTER TABLE memo_folder ADD COLUMN is_system BOOLEAN DEFAULT 0 NOT NULL'))
except Exception as e:
    print(f"Error during is_system migration: {e}")

# Ensure system root folders exist
try:
    for root_name in ['Memos', 'Tasks']:
        exists = _conn.execute(
            text("SELECT id FROM memo_folder WHERE name = :name AND parent_id IS NULL AND is_system = 1"),
            {'name': root_name}
        ).fetchone()
        if not exists:
            _conn.execute(
                text("INSERT INTO memo_folder (name, parent_id, is_system) VALUES (:name, NULL, 1)"),
                {'name': root_name}
            )
except Exception as e:
    print(f"Error creating system root folders: {e}")

# Re-parent any orphaned top-level user folders under Memos root (backward compat)
try:
    memos_root = _conn.execute(
        text("SELECT id FROM memo_folder WHERE name = 'Memos' AND is_system = 1")
    ).fetchone()
    if memos_root:
        _conn.execute(
            text("UPDATE memo_folder SET parent_id = :root_id WHERE parent_id IS NULL AND is_system = 0"),
            {'root_id': memos_root[0]}
        )
except Exception as e:
    print(f"Error re-parenting folders: {e}")
```

---

### API Layer

#### [MODIFY] app.py

Replace the existing `ROUTES: Memo Folders` section with a generalized `ROUTES: Folders` section.

**GET `/api/folders`** (replaces `/api/memo-folders`):

Returns the full folder tree starting from the two system roots, with items nested inside.

```python
@app.route('/api/folders', methods=['GET'])
def get_folders():
    """List all folders in a hierarchical structure with their items."""
    def build_tree(parent_id=None):
        folders = db.session.query(MemoFolder).filter_by(parent_id=parent_id) \
            .order_by(MemoFolder.is_system.desc(), MemoFolder.created_at.asc()).all()
        result = []
        for folder in folders:
            f = folder.to_dict()
            if folder.is_system and folder.name == 'Memos':
                f['items'] = [item.to_dict() for item in folder.items if item.state == 'MEMO']
                f['root_items'] = [item.to_dict() for item in
                    db.session.query(WorkItem).filter_by(state='MEMO', folder_id=None)
                    .order_by(WorkItem.created_at.desc()).all()]
            elif folder.is_system and folder.name == 'Tasks':
                f['items'] = [item.to_dict() for item in folder.items if item.state in ('TODO', 'WIP')]
                f['root_items'] = [item.to_dict() for item in
                    db.session.query(WorkItem).filter(
                        WorkItem.state.in_(['TODO', 'WIP']),
                        WorkItem.folder_id == None
                    ).order_by(WorkItem.sort_order.asc()).all()]
            else:
                f['items'] = [item.to_dict() for item in folder.items]
                f['root_items'] = []
            f['children'] = build_tree(folder.id)
            result.append(f)
        return result

    return jsonify({'folders': build_tree(None)})
```

Response shape:
```json
{
  "folders": [
    {
      "id": 1, "name": "Memos", "is_system": true,
      "items": [],
      "root_items": [{ "id": 10, "heading": "Unfoldered memo", "folder_id": null }],
      "children": [
        { "id": 3, "name": "Work", "is_system": false, "items": [...], "children": [] }
      ]
    },
    {
      "id": 2, "name": "Tasks", "is_system": true,
      "items": [],
      "root_items": [{ "id": 20, "heading": "Unfoldered task", "folder_id": null }],
      "children": [...]
    }
  ]
}
```

**POST `/api/folders`** (replaces `/api/memo-folders`):

```python
@app.route('/api/folders', methods=['POST'])
def create_folder():
    """Create a new folder under a parent. Cannot create system roots."""
    data = request.json
    name = (data.get('name') or '').strip()
    parent_id = data.get('parent_id')

    if not name:
        return jsonify({'error': 'Folder name is required'}), 400
    if not parent_id:
        return jsonify({'error': 'Parent folder is required'}), 400

    existing = db.session.query(MemoFolder).filter(
        db.func.lower(MemoFolder.name) == name.lower(),
        MemoFolder.parent_id == parent_id
    ).first()
    if existing:
        return jsonify({'error': f'A folder named "{existing.name}" already exists here'}), 409

    folder = MemoFolder(name=name, parent_id=parent_id)
    db.session.add(folder)
    db.session.commit()
    return jsonify(folder.to_dict()), 201
```

`parent_id` is **required** — all user-created folders must be children of a system root or another folder.

**DELETE `/api/folders/<id>`** (replaces `/api/memo-folders/<id>`):

```python
@app.route('/api/folders/<int:folder_id>', methods=['DELETE'])
def delete_folder(folder_id):
    """Delete a folder. System root folders cannot be deleted."""
    folder = db.get_or_404(MemoFolder, folder_id)
    if folder.is_system:
        return jsonify({'error': 'Cannot delete system folders'}), 403
    for item in folder.items:
        item.folder_id = None
    db.session.delete(folder)
    db.session.commit()
    return '', 204
```

**Update `update_item()` route** — Replace `memo_folder_id` with `folder_id`:

```python
if 'folder_id' in data:
    fid = data['folder_id']
    if fid is None or db.session.get(MemoFolder, fid):
        item.folder_id = fid
```

Also keep backward compat by accepting `memo_folder_id` as a fallback key.

**State change guard** — In `update_item()`, when state crosses the memo/task boundary, clear `folder_id`:

```python
if 'state' in data:
    old_state = item.state
    new_state = data['state']
    item.state = new_state
    if item.folder_id is not None:
        is_memo_to_task = (old_state == 'MEMO' and new_state in ('TODO', 'WIP'))
        is_task_to_memo = (old_state in ('TODO', 'WIP') and new_state == 'MEMO')
        if is_memo_to_task or is_task_to_memo:
            item.folder_id = None
```

---

### Frontend — HTML

#### [MODIFY] index.html

Rename the sidebar section from "Memos" to "Folders" and update element IDs. Replace lines 71-89:

```html
<div class="sidebar-section open">
    <div class="sidebar-section-header">
        <h2><i class="ph ph-caret-right sidebar-section-caret"></i><i class="ph ph-folders"></i> Folders</h2>
    </div>
    <div class="sidebar-section-content">
        <div id="folder-new-row" class="folder-new-row hidden">
            <input type="text" id="folder-new-input" placeholder="Folder name..."
                class="folder-input" />
            <button id="folder-new-save" class="btn-primary btn-small">Save</button>
            <button id="folder-new-cancel" class="btn-secondary btn-small">✕</button>
        </div>
        <div id="folders-container">
            <div class="loading-state">Loading folders...</div>
        </div>
    </div>
</div>
```

The "New folder" button moves from the section header into each system root header (each root gets its own "+" button).

---

### Frontend — JavaScript

#### [MODIFY] app.js

**1. Rename `fetchMemos()` → `fetchFolders()`**:

- Fetch from `/api/folders` instead of `/api/memo-folders`
- Render into `#folders-container`
- Iterate over the two system root folders returned at the top level

**2. System root rendering** — Each system root renders as a **collapsible header**:

```js
function renderSystemRoot(rootFolder, container) {
    const isMemos = rootFolder.name === 'Memos';
    const iconClass = isMemos ? 'ph-note' : 'ph-kanban';
    const accentClass = isMemos ? 'folder-root-memo' : 'folder-root-task';

    const rootEl = document.createElement('div');
    rootEl.className = `folder-system-root ${accentClass}`;
    rootEl.dataset.folderId = rootFolder.id;
    rootEl.dataset.rootType = isMemos ? 'memo' : 'task';

    rootEl.innerHTML = `
        <div class="folder-root-header" data-folder-id="${rootFolder.id}">
            <i class="ph ph-caret-down folder-root-caret"></i>
            <i class="ph ${iconClass} folder-root-icon"></i>
            <span class="folder-root-name">${escapeHtml(rootFolder.name)}</span>
            <div class="folder-root-actions">
                <button class="folder-add-sub-btn" title="New folder" data-folder-id="${rootFolder.id}">
                    <i class="ph ph-folder-plus"></i>
                </button>
            </div>
        </div>
        <div class="folder-root-content">
            <div class="folder-children"></div>
            <div class="folder-items"></div>
        </div>
    `;

    // Render child folders
    const childrenContainer = rootEl.querySelector('.folder-children');
    if (rootFolder.children) {
        rootFolder.children.forEach(child => renderFolder(child, childrenContainer));
    }

    // Render items (assigned to this root) + root_items (unfoldered, matched by state)
    const itemsContainer = rootEl.querySelector('.folder-items');
    const allItems = [...(rootFolder.items || []), ...(rootFolder.root_items || [])];
    allItems.forEach(item => {
        itemsContainer.appendChild(buildFolderItem(item));
    });

    // Toggle collapse on header click
    rootEl.querySelector('.folder-root-header').addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        rootEl.classList.toggle('collapsed');
    });

    // "New folder" button wiring
    rootEl.querySelector('.folder-add-sub-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const row = document.getElementById('folder-new-row');
        const input = document.getElementById('folder-new-input');
        row.dataset.parentId = rootFolder.id;
        input.placeholder = `New folder in "${rootFolder.name}"...`;
        row.classList.remove('hidden');
        input.focus();
    });

    // Drop target for drag-and-drop (accept items matching this root's type)
    // ...

    container.appendChild(rootEl);
}
```

**3. Regular folder rendering** — `renderFolder(folder, container)` mirrors the existing logic but uses the new `folder-*` CSS classes. Includes:
- Collapse/expand toggle
- Subfolder creation button
- Delete button
- Drag-over/drop handlers calling `PUT /api/items/<id>` with `{ folder_id: folder.id }`
- Type validation: checks drag data against root type to prevent cross-type drops

**4. `buildFolderItem(item)`** (replaces `buildMemoItem()`):
- Renders each item with state-appropriate icon:
  - MEMO: `ph-note`
  - TODO: `ph-check-square`
  - WIP: `ph-spinner`
- Shows heading, date, and state badge for TODO/WIP items
- Makes item draggable with `text/folder-item-id` data type
- Click navigates to last entry via `focusEntry()`

**5. Drag-drop type enforcement**:
```js
function getRootType(folderEl) {
    const root = folderEl.closest('.folder-system-root');
    return root ? root.dataset.rootType : null;  // 'memo' or 'task'
}

// In drop handler:
const targetType = getRootType(folderEl);
const draggedItem = window.allItemsData.find(i => i.id === parseInt(draggedItemId));
const itemType = draggedItem.state === 'MEMO' ? 'memo' : 'task';
if (targetType !== itemType) return;  // Reject cross-type drop
```

**6. Update `fetchItems()`**:
- Replace `fetch('/api/memo-folders')` with `fetch('/api/folders')`
- Build `window.folderPathMap` from the unified tree
- Call `fetchFolders()` instead of `fetchMemos()`

**7. Update `renderItem()`**:
- Change folder breadcrumb condition from `item.state === 'MEMO' && item.memo_folder_id` to `item.folder_id && window.folderPathMap[item.folder_id]` — works for any state

**8. Update all references**: Replace all occurrences of:
- `/api/memo-folders` → `/api/folders`
- `memo_folder_id` → `folder_id`
- `fetchMemos()` → `fetchFolders()`
- `memos-container` → `folders-container`
- `memo-add-folder-btn` → uses root-level buttons instead
- `memo-new-folder-*` → `folder-new-*`

**9. New folder creation wiring**:
- `#folder-new-save` creates via `POST /api/folders` with `{ name, parent_id }` (parent_id from `row.dataset.parentId`)
- `#folder-new-cancel` hides the row and clears input

---

### Frontend — CSS

#### [MODIFY] style.css

Replace all `.memo-folder-*` and `.memo-item-*` classes with the new `.folder-*` namespace. Add system root header styles.

**System root header styles:**

```css
.folder-system-root {
    margin-bottom: 0.5rem;
}

.folder-root-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.5rem;
    cursor: pointer;
    border-radius: 6px;
    transition: background 0.2s;
    user-select: none;
    font-weight: 700;
    font-size: 0.85rem;
}

.folder-root-header:hover {
    background: rgba(255, 255, 255, 0.05);
}

.folder-root-caret {
    font-size: 0.85rem;
    color: var(--text-muted);
    transition: transform 0.2s;
}

.folder-system-root.collapsed .folder-root-caret {
    transform: rotate(-90deg);
}

.folder-system-root.collapsed .folder-root-content {
    display: none;
}

.folder-root-content {
    display: flex;
    flex-direction: column;
}

.folder-root-actions {
    display: none;
    gap: 0.3rem;
    margin-left: auto;
}

.folder-root-header:hover .folder-root-actions {
    display: flex;
}
```

**Accent colors via CSS custom properties:**

```css
.folder-root-memo { --folder-accent: #3b82f6; }
.folder-root-task { --folder-accent: #10b981; }

.folder-root-icon {
    font-size: 1.1rem;
    color: var(--folder-accent);
}

.folder-root-name {
    color: var(--text-main);
}

.folder-icon { color: var(--folder-accent); }
.folder-add-sub-btn:hover { color: var(--folder-accent); }
.folder-drop-target .folder-icon { color: var(--folder-accent); }
```

**Regular folder styles** — Rename from `.memo-folder-*` to `.folder-*`:

All existing `.memo-folder`, `.memo-folder-header`, `.memo-folder-caret`, `.memo-folder-icon`, `.memo-folder-name`, `.memo-folder-actions`, `.memo-folder-add-sub-btn`, `.memo-folder-delete-btn`, `.memo-folder-content`, `.memo-folder-children`, `.memo-folder-items` → `.folder`, `.folder-header`, `.folder-caret`, etc. Same CSS rules, new class names.

**Item styles** — Rename from `.memo-item-*` to `.folder-item-*`:

All `.memo-item`, `.memo-item-inner`, `.memo-item-icon`, `.memo-item-body`, `.memo-item-title`, `.memo-item-meta`, `.memo-item-date`, `.memo-item-path`, `.memo-item-dragging` → `.folder-item`, `.folder-item-inner`, etc.

**New: state badge for TODO/WIP items:**

```css
.folder-item-state {
    font-size: 0.6rem;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 3px;
    text-transform: uppercase;
    flex-shrink: 0;
}

.folder-item-state-todo {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
}

.folder-item-state-wip {
    background: rgba(59, 130, 246, 0.15);
    color: #3b82f6;
}
```

**Drag-and-drop styles** — Rename from `.memo-drop-*` to `.folder-drop-*`.

---

### Logical Separation Summary

| Aspect | How separation is maintained |
|---|---|
| DB | Single `memo_folder` table; type implicit from root ancestry |
| Root folders | `is_system = True`, non-deletable, created at startup |
| Item assignment | `folder_id` FK; items with `NULL` render under matching root by state |
| Uniqueness | Name + `parent_id` — naturally scoped per root subtree |
| Drag-drop guard | Drop handler validates item state matches target root type |
| Visual | Memos subtree = blue accent; Tasks subtree = green accent |
| State change | TODO↔MEMO clears `folder_id` to prevent cross-root items |

---

### State Change Logic

When an item's state crosses the memo/task boundary, the backend clears `folder_id`:

```python
if 'state' in data:
    old_state = item.state
    new_state = data['state']
    item.state = new_state
    if item.folder_id is not None:
        is_memo_to_task = (old_state == 'MEMO' and new_state in ('TODO', 'WIP'))
        is_task_to_memo = (old_state in ('TODO', 'WIP') and new_state == 'MEMO')
        if is_memo_to_task or is_task_to_memo:
            item.folder_id = None
```

---

## Verification Plan

### Automated Tests

```powershell
cmd /c "workon ai_journal && pytest -v"
```

New test file `tests/test_folders.py`:
- System roots exist after startup (GET returns 2 system folders)
- Cannot delete system root (403)
- Create subfolder under Memos root → OK
- Create subfolder under Tasks root → OK
- Same-name folders under different roots → OK (no conflict)
- Same-name folders under same parent → 409
- Assign TODO item to Tasks subfolder → appears in folder
- Assign MEMO item to Memos subfolder → appears in folder
- State change TODO→MEMO clears `folder_id`
- Delete folder → items become unfoldered (`folder_id = NULL`)
- Existing data: memos with `folder_id = NULL` show under Memos root

### Manual Verification

- Start app, verify "Folders" section with "📝 Memos" and "📋 Tasks" collapsible headers
- Collapse/expand each root header
- Create folders under each root, verify nesting
- Drag items between folders, verify cross-type rejection
- Change item state TODO→MEMO, verify it moves between roots and loses folder assignment
- Verify main-column folder breadcrumb for both MEMO and TODO/WIP items
- Verify existing memo folders appear under "Memos" root
