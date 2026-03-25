from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import os
from werkzeug.utils import secure_filename

app = Flask(__name__)
# Configure SQLite database
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'journal.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Configure Uploads
app.config['UPLOAD_FOLDER'] = os.path.join(basedir, 'static', 'uploads')
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

db = SQLAlchemy(app)

class WorkItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    heading = db.Column(db.String(200), nullable=False)
    state = db.Column(db.String(20), default='TODO') # e.g. TODO, WIP, DONE
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationship to JournalEntries
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
    id = db.Column(db.Integer, primary_key=True)
    work_item_id = db.Column(db.Integer, db.ForeignKey('work_item.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'work_item_id': self.work_item_id,
            'title': self.title,
            'content': self.content,
            'created_at': self.created_at.isoformat()
        }

with app.app_context():
    db.create_all()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/items', methods=['GET'])
def get_items():
    items = WorkItem.query.order_by(WorkItem.created_at.desc()).all()
    return jsonify([item.to_dict() for item in items])

@app.route('/api/items', methods=['POST'])
def create_item():
    data = request.json
    heading = data.get('heading')
    if not heading:
        return jsonify({'error': 'Heading is required'}), 400
    
    new_item = WorkItem(
        heading=heading,
        state=data.get('state', 'TODO')
    )
    db.session.add(new_item)
    db.session.commit()
    
    return jsonify(new_item.to_dict()), 201

@app.route('/api/items/<int:item_id>', methods=['PUT'])
def update_item(item_id):
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
    item = WorkItem.query.get_or_404(item_id)
    db.session.delete(item)
    db.session.commit()
    return '', 204

@app.route('/api/items/<int:item_id>/entries', methods=['POST'])
def create_entry(item_id):
    item = WorkItem.query.get_or_404(item_id)
    data = request.json
    
    title = data.get('title')
    if not title:
        # Default title to current date string
        title = datetime.now().strftime("%B %d, %Y")
        
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
    entry = JournalEntry.query.get_or_404(entry_id)
    db.session.delete(entry)
    db.session.commit()
    return '', 204
@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    if file:
        filename = secure_filename(file.filename)
        unique_filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
        file.save(filepath)
        
        file_url = f"/static/uploads/{unique_filename}"
        is_image = filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'))
        
        return jsonify({
            'url': file_url,
            'name': filename,
            'original_name': file.filename,
            'is_image': is_image
        }), 201

@app.route('/api/open/<path:filename>', methods=['GET'])
def open_local_file(filename):
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if os.path.exists(filepath):
        os.startfile(filepath) # Native Windows hook to open file in default OS application
        return jsonify({'status': 'opened natively'})
    return jsonify({'error': 'File not found'}), 404

if __name__ == '__main__':
    app.run(debug=True)
