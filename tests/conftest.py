"""
Shared pytest fixtures for the AI Journal test suite.

Provides:
  - flask_app: Configured Flask app with in-memory SQLite
  - client: Flask test client for API tests
  - flask_server: Live server for Playwright browser tests
"""

import os
import threading
import pytest
import time
from werkzeug.serving import make_server
from sqlalchemy import text

# Set test environment to in-memory database BEFORE importing app
os.environ['TEST_DATABASE_URI'] = 'sqlite:///:memory:'

from app import app, db


# ============================================================================
# API Test Fixtures (lightweight — no server needed)
# ============================================================================

@pytest.fixture()
def flask_app():
    """Creates a fresh Flask app with a clean in-memory database for each test."""
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'

    with app.app_context():
        db.create_all()
        # Create the FTS5 virtual table (not created by SQLAlchemy's create_all)
        from app import FTS_CREATE
        with db.engine.connect() as conn:
            conn.execute(text(FTS_CREATE))
            conn.commit()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(flask_app):
    """Flask test client bound to a fresh database."""
    return flask_app.test_client()


# ============================================================================
# Browser Test Fixtures (Playwright — starts a real server)
# ============================================================================

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
    """Starts the Flask server on port 5005 before Playwright tests run."""
    app.config['TESTING'] = True

    with app.app_context():
        db.create_all()
        # Create a default test item and entry for browser tests
        from app import WorkItem, JournalEntry
        item = WorkItem(heading="Test Work Item")
        db.session.add(item)
        db.session.commit()

        entry = JournalEntry(title="Test Entry", content="", work_item_id=item.id)
        db.session.add(entry)
        db.session.commit()

    server = ServerThread(app)
    server.start()

    # Wait briefly for server to bind
    time.sleep(1)

    yield "http://127.0.0.1:5005"

    server.shutdown()
    server.join()
