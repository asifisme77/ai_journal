import os
import threading
import pytest
from playwright.sync_api import sync_playwright
import time
from werkzeug.serving import make_server

# Set test environment constraints
os.environ['TEST_DATABASE_URI'] = 'sqlite:///:memory:'

# Import app *after* setting environ to ensure memory DB is used
from app import app, db

class ServerThread(threading.Thread):
    def __init__(self, app):
        threading.Thread.__init__(self)
        self.server = make_server('127.0.0.1', 5005, app)
        self.ctx = app.app_context()
        self.ctx.push()

    def run(self):
        self.server.serve_forever()

    def shutdown(self):
        self.server.shutdown()

@pytest.fixture(scope="session")
def flask_server():
    """Starts the Flask server on port 5005 before tests run."""
    app.config['TESTING'] = True
    
    with app.app_context():
        db.create_all()
        # Create a default test item and entry
        from app import WorkItem, JournalEntry
        item = WorkItem(heading="Test Work Item")
        db.session.add(item)
        db.session.commit()
        
        entry = JournalEntry(title="Test Entry", content="", work_item_id=item.id)
        db.session.add(entry)
        db.session.commit()
        
        # Test entry ID should be 1
        
    server = ServerThread(app)
    server.start()
    
    # Wait briefly for server to bind
    time.sleep(1)
    
    yield "http://127.0.0.1:5005"
    
    server.shutdown()
    server.join()
