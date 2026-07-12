"""
AI Journal - Flask Backend

REST API for managing work items (tasks) and their journal entries.
Uses SQLite via Flask-SQLAlchemy for persistence.

Routes:
    /                           - Serve the SPA
    /api/items                  - CRUD for work items
    /api/items/<id>/entries     - Create entries under a work item
    /api/entries/<id>           - Update/delete individual entries
    /api/search                 - Full-text search with state/date filters (FTS5 + BM25)
    /api/admin/reindex          - Backfill FTS5 index for all existing rows
    /api/upload                 - File upload for embedded attachments
    /api/open/<filename>        - Native file open (Windows only)
"""

from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone
import os
import uuid
import re
from html.parser import HTMLParser
from werkzeug.utils import secure_filename
from sqlalchemy import inspect, text
from sqlalchemy.orm import joinedload

# ============================================================================
# APP CONFIGURATION
# ============================================================================

app = Flask(__name__)

basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('TEST_DATABASE_URI') or 'sqlite:///' + os.path.join(basedir, 'journal.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = os.path.join(basedir, 'static', 'uploads')

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

db = SQLAlchemy(app)

# ============================================================================
# HTML UTILITY
# ============================================================================

class _HTMLStripper(HTMLParser):
    """Minimal HTML-to-plaintext converter used for FTS indexing."""
    def __init__(self):
        super().__init__()
        self._parts: list[str] = []

    def handle_data(self, data: str) -> None:
        stripped = data.strip()
        if stripped:
            self._parts.append(stripped)

    def get_text(self) -> str:
        return ' '.join(self._parts)


def strip_html(html: str) -> str:
    """Return the visible text content of an HTML string, with all tags removed."""
    if not html:
        return ''
    s = _HTMLStripper()
    try:
        s.feed(html)
    except Exception:
        # Fallback: crude regex strip for malformed HTML
        return re.sub(r'<[^>]+>', ' ', html)
    return s.get_text()

# ============================================================================
# DATABASE MODELS
# ============================================================================

class WorkItem(db.Model):
    """A task/work item that contains journal entries. States: TODO, WIP, MEMO, DONE."""
    id = db.Column(db.Integer, primary_key=True)
    heading = db.Column(db.String(200), nullable=False)
    state = db.Column(db.String(20), default='TODO')
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    memo_folder_id = db.Column(db.Integer, db.ForeignKey('memo_folder.id'), nullable=True)
    entries = db.relationship('JournalEntry', backref='work_item', cascade='all, delete-orphan')

    def to_dict(self, exclude_content=False):
        return {
            'id': self.id,
            'heading': self.heading,
            'state': self.state,
            'sort_order': self.sort_order,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'memo_folder_id': self.memo_folder_id,
            'entries': [entry.to_dict(exclude_content=exclude_content) for entry in sorted(self.entries, key=lambda e: e.created_at.isoformat() if e.created_at else "")]
        }


class JournalEntry(db.Model):
    """A single journal entry (rich text) belonging to a work item."""
    id = db.Column(db.Integer, primary_key=True)
    work_item_id = db.Column(db.Integer, db.ForeignKey('work_item.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(20), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    markers = db.relationship('Marker', backref='entry', cascade='all, delete-orphan')

    def to_dict(self, exclude_content=False):
        active_markers = [m.to_dict() for m in self.markers if m.state == 'OPEN']
        data = {
            'id': self.id,
            'work_item_id': self.work_item_id,
            'title': self.title,
            'status': self.status,
            'created_at': self.created_at.isoformat(),
            'markers': active_markers
        }
        if not exclude_content:
            data['content'] = self.content
        return data

class Marker(db.Model):
    """A span of text highlighted as a marker within a journal entry, optionally with a reminder."""
    id = db.Column(db.Integer, primary_key=True)
    entry_id = db.Column(db.Integer, db.ForeignKey('journal_entry.id'), nullable=False)
    text = db.Column(db.Text, nullable=True)
    state = db.Column(db.String(20), default='OPEN') # 'OPEN' or 'CLOSED'
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    reminder_due_date = db.Column(db.DateTime, nullable=True)
    is_status_marker = db.Column(db.Boolean, default=False, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'entry_id': self.entry_id,
            'text': self.text,
            'state': self.state,
            'created_at': self.created_at.isoformat(),
            'reminder_due_date': self.reminder_due_date.isoformat() if self.reminder_due_date else None,
            'is_status_marker': self.is_status_marker
        }

class MemoFolder(db.Model):
    """A named folder for organizing MEMO work items in the sidebar."""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    parent_id = db.Column(db.Integer, db.ForeignKey('memo_folder.id', ondelete='CASCADE'), nullable=True)
    
    items = db.relationship('WorkItem', backref='folder', lazy=True)
    children = db.relationship('MemoFolder', backref=db.backref('parent', remote_side=[id]), lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'parent_id': self.parent_id,
            'created_at': self.created_at.isoformat()
        }


# ============================================================================
# FTS5 SEARCH INDEX HELPERS
# ============================================================================

FTS_CREATE = """
    CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
        kind UNINDEXED,
        source_id UNINDEXED,
        parent_id UNINDEXED,
        body,
        tokenize = 'porter unicode61'
    );
"""


def _fts_body_for_entry(entry: 'JournalEntry') -> str:
    """Build the text body to index for a journal entry."""
    title_text = entry.title or ''
    content_text = strip_html(entry.content)
    return f"{title_text} {content_text}".strip()


def _fts_body_for_item(item: 'WorkItem') -> str:
    """Build the text body to index for a work item heading."""
    return (item.heading or '').strip()


def fts_upsert_entry(conn, entry: 'JournalEntry') -> None:
    """Insert or replace a journal entry's row in the FTS index."""
    conn.execute(
        text("DELETE FROM search_index WHERE kind = 'entry' AND source_id = :id"),
        {'id': entry.id}
    )
    conn.execute(
        text("INSERT INTO search_index(kind, source_id, parent_id, body) VALUES ('entry', :id, :pid, :body)"),
        {'id': entry.id, 'pid': entry.work_item_id, 'body': _fts_body_for_entry(entry)}
    )


def fts_upsert_item(conn, item: 'WorkItem') -> None:
    """Insert or replace a work item heading's row in the FTS index."""
    conn.execute(
        text("DELETE FROM search_index WHERE kind = 'item' AND source_id = :id"),
        {'id': item.id}
    )
    conn.execute(
        text("INSERT INTO search_index(kind, source_id, parent_id, body) VALUES ('item', :id, NULL, :body)"),
        {'id': item.id, 'body': _fts_body_for_item(item)}
    )


def fts_delete_entry(conn, entry_id: int) -> None:
    conn.execute(
        text("DELETE FROM search_index WHERE kind = 'entry' AND source_id = :id"),
        {'id': entry_id}
    )


def fts_delete_item(conn, item_id: int) -> None:
    conn.execute(
        text("DELETE FROM search_index WHERE kind IN ('item', 'entry') AND (source_id = :id OR parent_id = :id)"),
        {'id': item_id}
    )


# ============================================================================
# DATABASE SETUP & MIGRATIONS
# ============================================================================

# Create tables on startup
with app.app_context():
    db.create_all()

    with db.engine.connect() as _conn:
        # Create FTS5 virtual table
        _conn.execute(text(FTS_CREATE))

        # Auto-migration: status column
        try:
            inspector = inspect(db.engine)
            if 'journal_entry' in inspector.get_table_names():
                columns = [col['name'] for col in inspector.get_columns('journal_entry')]
                if 'status' not in columns:
                    _conn.execute(text('ALTER TABLE journal_entry ADD COLUMN status VARCHAR(20)'))
        except Exception as e:
            print(f"Error during schema migration: {e}")

        # Auto-migration: is_status_marker column
        try:
            inspector = inspect(db.engine)
            if 'marker' in inspector.get_table_names():
                columns = [col['name'] for col in inspector.get_columns('marker')]
                if 'is_status_marker' not in columns:
                    _conn.execute(text('ALTER TABLE marker ADD COLUMN is_status_marker BOOLEAN DEFAULT 0'))
        except Exception as e:
            print(f"Error during Marker schema migration: {e}")

        # Auto-migration: sort_order column on work_item
        try:
            inspector = inspect(db.engine)
            if 'work_item' in inspector.get_table_names():
                columns = [col['name'] for col in inspector.get_columns('work_item')]
                if 'sort_order' not in columns:
                    _conn.execute(text('ALTER TABLE work_item ADD COLUMN sort_order INTEGER DEFAULT 0'))
                    # Backfill: assign sequential sort_order based on current created_at DESC order
                    rows = _conn.execute(text('SELECT id FROM work_item ORDER BY created_at DESC')).fetchall()
                    for idx, row in enumerate(rows):
                        _conn.execute(text('UPDATE work_item SET sort_order = :order WHERE id = :id'), {'order': idx, 'id': row[0]})
        except Exception as e:
            print(f"Error during sort_order migration: {e}")

        # Backfill FTS index on startup (idempotent — deletes first)
        try:
            _conn.execute(text("DELETE FROM search_index"))
            items = db.session.query(WorkItem).all()
            for _item in items:
                fts_upsert_item(_conn, _item)
                for _entry in _item.entries:
                    fts_upsert_entry(_conn, _entry)
        except Exception as e:
            print(f"Error during FTS backfill: {e}")

        _conn.commit()

# ============================================================================
# CSRF PROTECTION
# ============================================================================

@app.before_request
def csrf_origin_check():
    """Lightweight CSRF guard: reject state-changing API requests from foreign origins.
    
    Browsers always send an Origin header on POST/PUT/DELETE requests.
    If the Origin doesn't match the server, the request is rejected.
    This blocks cross-site form submissions while allowing same-origin
    fetch() calls and non-browser clients (curl, Postman) which don't
    send an Origin header.
    """
    if request.method in ('GET', 'HEAD', 'OPTIONS'):
        return  # Safe methods — no check needed
    if not request.path.startswith('/api/'):
        return  # Only guard API routes

    origin = request.headers.get('Origin')
    if origin is None:
        return  # Non-browser client (curl, tests) — allow

    # Compare origin against the request's own host
    allowed = f"{request.scheme}://{request.host}"
    if origin != allowed:
        return jsonify({'error': 'Cross-origin request blocked'}), 403

# ============================================================================
# ROUTES: Pages
# ============================================================================

@app.route('/')
def index():
    """Serve the single-page application."""
    return render_template('index.html')

# ============================================================================
# ROUTES: Work Items CRUD
# ============================================================================

@app.route('/api/items', methods=['GET'])
def get_items():
    """List all work items ordered by priority (sort_order) with their entries."""
    items = db.session.query(WorkItem).options(
        joinedload(WorkItem.entries).joinedload(JournalEntry.markers)
    ).order_by(WorkItem.sort_order.asc(), WorkItem.created_at.desc()).all()
    return jsonify([item.to_dict() for item in items])

@app.route('/api/timeline', methods=['GET'])
def get_timeline():
    """Lightweight endpoint for the sidebar timeline. Fetches items without their rich text content."""
    from sqlalchemy.orm import defer
    items = db.session.query(WorkItem).options(
        joinedload(WorkItem.entries).joinedload(JournalEntry.markers),
        joinedload(WorkItem.entries).defer(JournalEntry.content)
    ).order_by(WorkItem.created_at.desc()).all()
    return jsonify([item.to_dict(exclude_content=True) for item in items])


@app.route('/api/items', methods=['POST'])
def create_item():
    """Create a new work item. New items go to the top of the priority list."""
    data = request.json
    heading = data.get('heading')
    if not heading:
        return jsonify({'error': 'Heading is required'}), 400

    # Push all existing items down by 1 so the new item lands at position 0
    db.session.execute(
        text('UPDATE work_item SET sort_order = sort_order + 1')
    )
    new_item = WorkItem(heading=heading, state=data.get('state', 'TODO'), sort_order=0)
    db.session.add(new_item)
    db.session.commit()
    with db.engine.connect() as conn:
        fts_upsert_item(conn, new_item)
        conn.commit()
    return jsonify(new_item.to_dict()), 201


@app.route('/api/items/<int:item_id>', methods=['PUT'])
def update_item(item_id):
    """Update a work item's heading, state, and/or memo folder."""
    item = db.get_or_404(WorkItem, item_id)
    data = request.json

    if 'heading' in data:
        item.heading = data['heading']
    if 'state' in data:
        item.state = data['state']
    if 'memo_folder_id' in data:
        folder_id = data['memo_folder_id']
        if folder_id is None or db.session.get(MemoFolder, folder_id):
            item.memo_folder_id = folder_id

    db.session.commit()
    with db.engine.connect() as conn:
        fts_upsert_item(conn, item)
        conn.commit()
    return jsonify(item.to_dict())


@app.route('/api/items/<int:item_id>', methods=['DELETE'])
def delete_item(item_id):
    """Delete a work item and all its entries (cascade)."""
    item = db.get_or_404(WorkItem, item_id)
    item_id_to_delete = item.id
    db.session.delete(item)
    db.session.commit()
    with db.engine.connect() as conn:
        fts_delete_item(conn, item_id_to_delete)
        conn.commit()
    return '', 204


@app.route('/api/items/reorder', methods=['POST'])
def reorder_items():
    """Bulk-update sort_order for work items based on the provided ordered list of IDs."""
    data = request.json
    order = data.get('order', [])
    if not order or not isinstance(order, list):
        return jsonify({'error': 'An ordered list of item IDs is required'}), 400

    for idx, item_id in enumerate(order):
        db.session.execute(
            text('UPDATE work_item SET sort_order = :order WHERE id = :id'),
            {'order': idx, 'id': item_id}
        )
    db.session.commit()
    return jsonify({'status': 'ok'})


# ============================================================================
# ROUTES: Memo Folders
# ============================================================================

@app.route('/api/memo-folders', methods=['GET'])
def get_memo_folders():
    """List all memo folders in a hierarchical structure with their items."""
    def build_tree(parent_id=None):
        folders = db.session.query(MemoFolder).filter_by(parent_id=parent_id).order_by(MemoFolder.created_at.asc()).all()
        result = []
        for folder in folders:
            f = folder.to_dict()
            f['items'] = [item.to_dict() for item in folder.items if item.state == 'MEMO']
            f['children'] = build_tree(folder.id)
            result.append(f)
        return result

    # Root-level items (memos with no folder)
    root_memos = db.session.query(WorkItem).filter_by(state='MEMO', memo_folder_id=None).order_by(WorkItem.created_at.desc()).all()
    
    return jsonify({
        'folders': build_tree(None),
        'root_memos': [item.to_dict() for item in root_memos]
    })


@app.route('/api/memo-folders', methods=['POST'])
def create_memo_folder():
    """Create a new memo folder, optionally under a parent folder."""
    data = request.json
    name = (data.get('name') or '').strip()
    parent_id = data.get('parent_id')
    
    if not name:
        return jsonify({'error': 'Folder name is required'}), 400
    
    # Enforce unique folder names within the same parent (case-insensitive)
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


@app.route('/api/memo-folders/<int:folder_id>', methods=['DELETE'])
def delete_memo_folder(folder_id):
    """Delete a memo folder. Memos inside move back to root (folder_id = NULL)."""
    folder = db.get_or_404(MemoFolder, folder_id)
    # Unassign all items in this folder
    for item in folder.items:
        item.memo_folder_id = None
    db.session.delete(folder)
    db.session.commit()
    return '', 204

# ============================================================================
# ROUTES: Journal Entries CRUD
# ============================================================================

@app.route('/api/items/<int:item_id>/entries', methods=['POST'])
def create_entry(item_id):
    """Create a new journal entry under a work item."""
    item = db.get_or_404(WorkItem, item_id)
    data = request.json

    title = data.get('title') or f"{item.heading} details..."

    new_entry = JournalEntry(
        work_item_id=item.id,
        title=title,
        content=data.get('content', ''),
        status=data.get('status')
    )
    db.session.add(new_entry)
    db.session.commit()

    if new_entry.status == 'FOLLOWUP':
        status_marker = Marker(
            entry_id=new_entry.id,
            text=new_entry.title,
            state='OPEN',
            is_status_marker=True
        )
        db.session.add(status_marker)
        db.session.commit()

    with db.engine.connect() as conn:
        fts_upsert_entry(conn, new_entry)
        conn.commit()
    return jsonify(new_entry.to_dict()), 201


@app.route('/api/entries/<int:entry_id>', methods=['PUT'])
def update_entry(entry_id):
    """Update a journal entry's title and/or content."""
    entry = db.get_or_404(JournalEntry, entry_id)
    data = request.json

    if 'title' in data:
        entry.title = data['title']
        # Keep status marker text in sync with new title
        status_marker = db.session.query(Marker).filter_by(entry_id=entry.id, is_status_marker=True).first()
        if status_marker:
            status_marker.text = entry.title

    if 'content' in data:
        entry.content = data['content']

    if 'status' in data:
        old_status = entry.status
        new_status = data['status']
        entry.status = new_status

        if new_status == 'FOLLOWUP' and old_status != 'FOLLOWUP':
            status_marker = db.session.query(Marker).filter_by(entry_id=entry.id, is_status_marker=True).first()
            if not status_marker:
                status_marker = Marker(
                    entry_id=entry.id,
                    text=entry.title,
                    state='OPEN',
                    is_status_marker=True
                )
                db.session.add(status_marker)
        elif new_status != 'FOLLOWUP' and old_status == 'FOLLOWUP':
            db.session.query(Marker).filter_by(entry_id=entry.id, is_status_marker=True).delete()

    db.session.commit()
    with db.engine.connect() as conn:
        fts_upsert_entry(conn, entry)
        conn.commit()
    return jsonify(entry.to_dict())


@app.route('/api/entries/<int:entry_id>', methods=['DELETE'])
def delete_entry(entry_id):
    """Delete a single journal entry."""
    entry = db.get_or_404(JournalEntry, entry_id)
    entry_id_to_delete = entry.id
    db.session.delete(entry)
    db.session.commit()
    with db.engine.connect() as conn:
        fts_delete_entry(conn, entry_id_to_delete)
        conn.commit()
    return '', 204

# ============================================================================
# ROUTES: Markers
# ============================================================================

@app.route('/api/entries/<int:entry_id>/markers', methods=['POST'])
def create_marker(entry_id):
    """Create a new marker inside a journal entry."""
    entry = db.get_or_404(JournalEntry, entry_id)
    data = request.json
    
    new_marker = Marker(
        entry_id=entry.id,
        text=data.get('text', ''),
        state='OPEN'
    )
    if data.get('reminder_due_date'):
        new_marker.reminder_due_date = datetime.fromisoformat(data['reminder_due_date'])

    db.session.add(new_marker)
    db.session.commit()
    return jsonify(new_marker.to_dict()), 201

@app.route('/api/markers/<int:marker_id>', methods=['PUT'])
def update_marker(marker_id):
    """Update a marker's state or reminder."""
    marker = db.get_or_404(Marker, marker_id)
    data = request.json

    if 'state' in data:
        marker.state = data['state']
    
    if 'reminder_due_date' in data:
        if data['reminder_due_date'] is None:
            marker.reminder_due_date = None
        else:
            try:
                marker.reminder_due_date = datetime.fromisoformat(data['reminder_due_date'].replace('Z', '+00:00'))
            except ValueError:
                marker.reminder_due_date = datetime.fromisoformat(data['reminder_due_date'])

    db.session.commit()
    return jsonify(marker.to_dict())

@app.route('/api/markers/reminders', methods=['GET'])
def get_reminders():
    """Get all open markers."""
    markers = db.session.query(Marker).filter(
        Marker.state == 'OPEN'
    ).order_by(Marker.created_at.desc()).all()
    
    return jsonify([{
        **marker.to_dict(),
        'entry_title': marker.entry.title if marker.entry else '',
        'work_item_heading': marker.entry.work_item.heading if (marker.entry and marker.entry.work_item) else '',
        'work_item_id': marker.entry.work_item_id if marker.entry else None,
        'is_archived': (marker.entry.work_item.state == 'DONE') if (marker.entry and marker.entry.work_item) else False
    } for marker in markers])

# ============================================================================
# ROUTES: Search
# ============================================================================

@app.route('/api/search', methods=['GET'])
def search_items():
    """
    Search work items and entries with optional filters:
      - q: text search using SQLite FTS5 with Porter stemmer and BM25 ranking.
           Multi-word queries match entries that contain all words (in any form).
           Stemming means "running" matches "run", "fixed" matches "fix", etc.
      - state: comma-separated state filter (e.g. "TODO,WIP")
      - from/to: date range filter on work item creation date

    When a text query is provided, entries are filtered to only include matches
    (unless the parent heading itself matches, in which case all entries are kept).
    Results are ordered by BM25 relevance score when a query is present.
    """
    q = request.args.get('q', '').strip()
    states = request.args.get('state', '')
    from_date = request.args.get('from', '')
    to_date = request.args.get('to', '')

    # --- No text query: SQL-only path (fast, unchanged behaviour) ---
    if not q:
        query = db.session.query(WorkItem).options(
            joinedload(WorkItem.entries).joinedload(JournalEntry.markers)
        )
        if states:
            query = query.filter(WorkItem.state.in_(states.split(',')))
        if from_date:
            try:
                query = query.filter(WorkItem.created_at >= datetime.fromisoformat(from_date))
            except ValueError:
                pass
        if to_date:
            try:
                to_dt = datetime.fromisoformat(to_date)
                if len(to_date) == 10:
                    to_dt = to_dt.replace(hour=23, minute=59, second=59)
                query = query.filter(WorkItem.created_at <= to_dt)
            except ValueError:
                pass
        items = query.order_by(WorkItem.sort_order.asc(), WorkItem.created_at.desc()).all()
        return jsonify([item.to_dict() for item in items])

    # --- Text query: FTS5 path ---
    # Build a safe FTS5 MATCH expression.
    # Wrap each token in double-quotes to treat it as a literal phrase token
    # (prevents FTS5 syntax errors from special chars like * : ( ) etc.).
    def _fts_escape(token: str) -> str:
        return '"' + token.replace('"', '""') + '"'

    tokens = q.split()
    fts_query = ' '.join(_fts_escape(t) for t in tokens)

    # Query FTS index; rank is negative BM25 (lower = better match)
    try:
        fts_rows = db.session.execute(
            text(
                "SELECT kind, source_id, parent_id "
                "FROM search_index "
                "WHERE body MATCH :q "
                "ORDER BY rank"
            ),
            {'q': fts_query}
        ).fetchall()
    except Exception:
        # FTS syntax error fallback: return empty
        return jsonify([])

    if not fts_rows:
        return jsonify([])

    # Collect matched item IDs and entry IDs (preserving BM25 rank order)
    matched_item_ids: list[int] = []   # items that directly matched
    matched_entry_ids: set[int] = set()
    # Map entry_id -> parent work_item_id for items that matched via entry
    entry_to_item: dict[int, int] = {}

    seen_items: set[int] = set()
    for row in fts_rows:
        kind, source_id, parent_id = row.kind, row.source_id, row.parent_id
        if kind == 'item':
            if source_id not in seen_items:
                matched_item_ids.append(source_id)
                seen_items.add(source_id)
        elif kind == 'entry':
            matched_entry_ids.add(source_id)
            entry_to_item[source_id] = parent_id
            if parent_id not in seen_items:
                matched_item_ids.append(parent_id)
                seen_items.add(parent_id)

    if not matched_item_ids:
        return jsonify([])

    # Use FTS5 highlight() to discover which words actually matched per entry.
    # This lets the frontend highlight the real word ("running") even when the
    # query was a different form ("ran") that matched via porter stemming.
    entry_matched_terms: dict[int, list[str]] = {}
    try:
        hl_rows = db.session.execute(
            text(
                "SELECT source_id, "
                "       highlight(search_index, 3, '<<M>>', '<</M>>') AS hl "
                "FROM search_index "
                "WHERE kind = 'entry' AND body MATCH :q"
            ),
            {'q': fts_query}
        ).fetchall()
        for hl_row in hl_rows:
            # Extract the words wrapped by <<M>>…<</M>> markers
            terms = re.findall(r'<<M>>(.+?)<</M>>', hl_row.hl)
            if terms:
                # De-duplicate while preserving order; keep original casing
                seen_terms: set[str] = set()
                unique: list[str] = []
                for t in terms:
                    key = t.lower()
                    if key not in seen_terms:
                        seen_terms.add(key)
                        unique.append(t)
                entry_matched_terms[hl_row.source_id] = unique
    except Exception:
        pass  # Non-critical; highlighting still falls back to raw query

    # Fetch matching work items (apply state/date filters here)
    item_query = db.session.query(WorkItem).options(
        joinedload(WorkItem.entries).joinedload(JournalEntry.markers)
    ).filter(WorkItem.id.in_(matched_item_ids))

    if states:
        item_query = item_query.filter(WorkItem.state.in_(states.split(',')))
    if from_date:
        try:
            item_query = item_query.filter(WorkItem.created_at >= datetime.fromisoformat(from_date))
        except ValueError:
            pass
    if to_date:
        try:
            to_dt = datetime.fromisoformat(to_date)
            if len(to_date) == 10:
                to_dt = to_dt.replace(hour=23, minute=59, second=59)
            item_query = item_query.filter(WorkItem.created_at <= to_dt)
        except ValueError:
            pass

    items_by_id = {item.id: item for item in item_query.all()}

    # Build results in BM25 rank order, filtering entries to only matched ones
    filtered_results = []
    seen_result_ids: set[int] = set()

    for item_id in matched_item_ids:
        if item_id not in items_by_id or item_id in seen_result_ids:
            continue
        seen_result_ids.add(item_id)
        item = items_by_id[item_id]
        item_dict = item.to_dict()

        heading_matched = item_id in {
            row.source_id for row in fts_rows if row.kind == 'item'
        }

        if not heading_matched:
            # Keep only entries that matched in the FTS index
            item_dict['entries'] = [
                e for e in item_dict['entries']
                if e['id'] in matched_entry_ids
            ]

        # Annotate each entry with the actual words that matched
        for entry_dict in item_dict['entries']:
            terms = entry_matched_terms.get(entry_dict['id'])
            if terms:
                entry_dict['matched_terms'] = terms

        if heading_matched or item_dict['entries']:
            item_dict['relevance_score'] = len([
                r for r in fts_rows
                if (r.kind == 'item' and r.source_id == item_id)
                or (r.kind == 'entry' and r.parent_id == item_id)
            ])
            filtered_results.append(item_dict)

    return jsonify(filtered_results)


@app.route('/api/admin/reindex', methods=['POST'])
def admin_reindex():
    """
    Rebuild the FTS5 search index from scratch for all existing work items and entries.
    Safe to call repeatedly — always clears before re-inserting.
    """
    try:
        with db.engine.connect() as conn:
            conn.execute(text("DELETE FROM search_index"))
            items = db.session.query(WorkItem).options(
                joinedload(WorkItem.entries)
            ).all()
            for item in items:
                fts_upsert_item(conn, item)
                for entry in item.entries:
                    fts_upsert_entry(conn, entry)
            conn.commit()
        return jsonify({'status': 'ok', 'indexed_items': len(items)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============================================================================
# ROUTES: File Upload & Native Open
# ============================================================================

@app.route('/api/upload', methods=['POST'])
def upload_file():
    """Upload a file to the server. Returns the URL and metadata."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    filename = secure_filename(file.filename)
    unique_filename = f"{uuid.uuid4().hex[:12]}_{filename}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
    file.save(filepath)

    is_image = filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'))

    return jsonify({
        'url': f"/static/uploads/{unique_filename}",
        'name': filename,
        'original_name': file.filename,
        'is_image': is_image
    }), 201


@app.route('/api/open/<path:filename>', methods=['GET'])
def open_local_file(filename):
    """Open a file using the system's default application (Windows only)."""
    upload_folder_abs = os.path.abspath(app.config['UPLOAD_FOLDER'])
    filepath_abs = os.path.abspath(os.path.join(upload_folder_abs, filename))
    
    # Path traversal check using commonpath for robustness
    if os.path.commonpath([filepath_abs, upload_folder_abs]) != upload_folder_abs:
        return jsonify({'error': 'Invalid file path'}), 403

    if os.path.exists(filepath_abs):
        os.startfile(filepath_abs)
        return jsonify({'status': 'opened natively'})
    return jsonify({'error': 'File not found'}), 404


# ============================================================================
# ENTRY POINT
# ============================================================================

if __name__ == '__main__':
    app.run(debug=True)
