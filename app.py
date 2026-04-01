"""
AI Journal - Flask Backend

REST API for managing work items (tasks) and their journal entries.
Uses SQLite via Flask-SQLAlchemy for persistence.

Routes:
    /                           - Serve the SPA
    /api/items                  - CRUD for work items
    /api/items/<id>/entries     - Create entries under a work item
    /api/entries/<id>           - Update/delete individual entries
    /api/search                 - Full-text search with state/date filters
    /api/upload                 - File upload for embedded attachments
    /api/open/<filename>        - Native file open (Windows only)
"""

from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import os
from werkzeug.utils import secure_filename

# ============================================================================
# APP CONFIGURATION
# ============================================================================

app = Flask(__name__)

basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'journal.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = os.path.join(basedir, 'static', 'uploads')

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

db = SQLAlchemy(app)

# ============================================================================
# DATABASE MODELS
# ============================================================================

class WorkItem(db.Model):
    """A task/work item that contains journal entries. States: TODO, WIP, MEMO, DONE."""
    id = db.Column(db.Integer, primary_key=True)
    heading = db.Column(db.String(200), nullable=False)
    state = db.Column(db.String(20), default='TODO')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    entries = db.relationship('JournalEntry', backref='work_item', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'heading': self.heading,
            'state': self.state,
            'created_at': self.created_at.isoformat(),
            'entries': [entry.to_dict() for entry in self.entries]
        }


class JournalEntry(db.Model):
    """A single journal entry (rich text) belonging to a work item."""
    id = db.Column(db.Integer, primary_key=True)
    work_item_id = db.Column(db.Integer, db.ForeignKey('work_item.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    markers = db.relationship('Marker', backref='entry', cascade='all, delete-orphan')

    def to_dict(self):
        active_markers = [m.to_dict() for m in self.markers if m.state == 'OPEN']
        return {
            'id': self.id,
            'work_item_id': self.work_item_id,
            'title': self.title,
            'content': self.content,
            'created_at': self.created_at.isoformat(),
            'markers': active_markers
        }

class Marker(db.Model):
    """A span of text highlighted as a marker within a journal entry, optionally with a reminder."""
    id = db.Column(db.Integer, primary_key=True)
    entry_id = db.Column(db.Integer, db.ForeignKey('journal_entry.id'), nullable=False)
    text = db.Column(db.Text, nullable=True)
    state = db.Column(db.String(20), default='OPEN') # 'OPEN' or 'CLOSED'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    reminder_due_date = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'entry_id': self.entry_id,
            'text': self.text,
            'state': self.state,
            'created_at': self.created_at.isoformat(),
            'reminder_due_date': self.reminder_due_date.isoformat() if self.reminder_due_date else None
        }

# Create tables on startup
with app.app_context():
    db.create_all()

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
    """List all work items (newest first) with their entries."""
    items = WorkItem.query.order_by(WorkItem.created_at.desc()).all()
    return jsonify([item.to_dict() for item in items])


@app.route('/api/items', methods=['POST'])
def create_item():
    """Create a new work item."""
    data = request.json
    heading = data.get('heading')
    if not heading:
        return jsonify({'error': 'Heading is required'}), 400

    new_item = WorkItem(heading=heading, state=data.get('state', 'TODO'))
    db.session.add(new_item)
    db.session.commit()
    return jsonify(new_item.to_dict()), 201


@app.route('/api/items/<int:item_id>', methods=['PUT'])
def update_item(item_id):
    """Update a work item's heading and/or state."""
    item = WorkItem.query.get_or_404(item_id)
    data = request.json

    if 'heading' in data:
        item.heading = data['heading']
    if 'state' in data:
        item.state = data['state']

    db.session.commit()
    return jsonify(item.to_dict())


@app.route('/api/items/<int:item_id>', methods=['DELETE'])
def delete_item(item_id):
    """Delete a work item and all its entries (cascade)."""
    item = WorkItem.query.get_or_404(item_id)
    db.session.delete(item)
    db.session.commit()
    return '', 204

# ============================================================================
# ROUTES: Journal Entries CRUD
# ============================================================================

@app.route('/api/items/<int:item_id>/entries', methods=['POST'])
def create_entry(item_id):
    """Create a new journal entry under a work item."""
    item = WorkItem.query.get_or_404(item_id)
    data = request.json

    title = data.get('title') or datetime.now().strftime("%B %d, %Y")

    new_entry = JournalEntry(
        work_item_id=item.id,
        title=title,
        content=data.get('content', '')
    )
    db.session.add(new_entry)
    db.session.commit()
    return jsonify(new_entry.to_dict()), 201


@app.route('/api/entries/<int:entry_id>', methods=['PUT'])
def update_entry(entry_id):
    """Update a journal entry's title and/or content."""
    entry = JournalEntry.query.get_or_404(entry_id)
    data = request.json

    if 'title' in data:
        entry.title = data['title']
    if 'content' in data:
        entry.content = data['content']

    db.session.commit()
    return jsonify(entry.to_dict())


@app.route('/api/entries/<int:entry_id>', methods=['DELETE'])
def delete_entry(entry_id):
    """Delete a single journal entry."""
    entry = JournalEntry.query.get_or_404(entry_id)
    db.session.delete(entry)
    db.session.commit()
    return '', 204

# ============================================================================
# ROUTES: Markers
# ============================================================================

@app.route('/api/entries/<int:entry_id>/markers', methods=['POST'])
def create_marker(entry_id):
    """Create a new marker inside a journal entry."""
    entry = JournalEntry.query.get_or_404(entry_id)
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
    marker = Marker.query.get_or_404(marker_id)
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
    markers = Marker.query.filter(
        Marker.state == 'OPEN'
    ).order_by(Marker.created_at.asc()).all()
    
    return jsonify([{
        **marker.to_dict(),
        'entry_title': marker.entry.title,
        'work_item_heading': marker.entry.work_item.heading,
        'work_item_id': marker.entry.work_item_id
    } for marker in markers])

# ============================================================================
# ROUTES: Search
# ============================================================================

@app.route('/api/search', methods=['GET'])
def search_items():
    """
    Search work items and entries with optional filters:
      - q: text search (matches heading, entry title, or entry content)
      - state: comma-separated state filter (e.g. "TODO,WIP")
      - from/to: date range filter on work item creation date
    
    When a text query is provided, entries are filtered to only include matches
    (unless the parent heading itself matches, in which case all entries are kept).
    """
    q = request.args.get('q', '')
    states = request.args.get('state', '')
    from_date = request.args.get('from', '')
    to_date = request.args.get('to', '')

    query = WorkItem.query

    # Filter by state
    if states:
        query = query.filter(WorkItem.state.in_(states.split(',')))

    # Filter by date range
    if from_date:
        try:
            query = query.filter(WorkItem.created_at >= datetime.fromisoformat(from_date))
        except ValueError:
            pass

    if to_date:
        try:
            to_dt = datetime.fromisoformat(to_date)
            if len(to_date) == 10:  # Date-only: extend to end of day
                to_dt = to_dt.replace(hour=23, minute=59, second=59)
            query = query.filter(WorkItem.created_at <= to_dt)
        except ValueError:
            pass

    # Text search: match heading OR any entry title/content
    if q:
        heading_filter = WorkItem.heading.ilike(f'%{q}%')
        entry_filter = WorkItem.entries.any(
            db.or_(
                JournalEntry.title.ilike(f'%{q}%'),
                JournalEntry.content.ilike(f'%{q}%')
            )
        )
        query = query.filter(db.or_(heading_filter, entry_filter))

    items = query.order_by(WorkItem.created_at.desc()).all()

    # Without text query, return all entries for matched items
    if not q:
        return jsonify([item.to_dict() for item in items])

    # With text query, filter individual entries for precise timeline results
    q_lower = q.lower()
    filtered_results = []

    for item in items:
        item_dict = item.to_dict()
        heading_matches = q_lower in item.heading.lower()

        if not heading_matches:
            # Keep only entries whose title or content matches
            item_dict['entries'] = [
                e for e in item_dict['entries']
                if q_lower in (e.get('title') or '').lower()
                or q_lower in (e.get('content') or '').lower()
            ]

        if heading_matches or item_dict['entries']:
            filtered_results.append(item_dict)

    return jsonify(filtered_results)

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
    unique_filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{filename}"
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
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if os.path.exists(filepath):
        os.startfile(filepath)
        return jsonify({'status': 'opened natively'})
    return jsonify({'error': 'File not found'}), 404

# ============================================================================
# ENTRY POINT
# ============================================================================

if __name__ == '__main__':
    app.run(debug=True)
