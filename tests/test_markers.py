"""
API Tests — Markers CRUD

Tests for creating, updating, and listing markers within journal entries.
"""
import pytest
from datetime import datetime, timedelta


class TestCreateMarker:
    """POST /api/entries/<entry_id>/markers"""

    def _create_entry(self, client):
        """Helper: create a work item with one entry, return the entry dict."""
        item = client.post('/api/items', json={'heading': 'Task'}).get_json()
        entry = client.post(f'/api/items/{item["id"]}/entries',
                            json={'title': 'Entry'}).get_json()
        return entry

    def test_creates_marker(self, client):
        entry = self._create_entry(client)

        res = client.post(f'/api/entries/{entry["id"]}/markers',
                          json={'text': 'Important note'})
        assert res.status_code == 201
        data = res.get_json()
        assert data['text'] == 'Important note'
        assert data['state'] == 'OPEN'
        assert data['entry_id'] == entry['id']
        assert data['reminder_due_date'] is None

    def test_creates_marker_with_reminder(self, client):
        entry = self._create_entry(client)
        due = (datetime.now() + timedelta(days=1)).isoformat()

        res = client.post(f'/api/entries/{entry["id"]}/markers',
                          json={'text': 'Remind me', 'reminder_due_date': due})
        assert res.status_code == 201
        assert res.get_json()['reminder_due_date'] is not None

    def test_creates_marker_with_empty_text(self, client):
        entry = self._create_entry(client)

        res = client.post(f'/api/entries/{entry["id"]}/markers', json={'text': ''})
        assert res.status_code == 201
        assert res.get_json()['text'] == ''

    def test_marker_under_nonexistent_entry_returns_404(self, client):
        res = client.post('/api/entries/9999/markers', json={'text': 'X'})
        assert res.status_code == 404


class TestUpdateMarker:
    """PUT /api/markers/<marker_id>"""

    def _create_marker(self, client, text='Test marker'):
        """Helper: create a full chain (item → entry → marker)."""
        item = client.post('/api/items', json={'heading': 'Task'}).get_json()
        entry = client.post(f'/api/items/{item["id"]}/entries',
                            json={'title': 'Entry'}).get_json()
        marker = client.post(f'/api/entries/{entry["id"]}/markers',
                             json={'text': text}).get_json()
        return marker

    def test_closes_marker(self, client):
        marker = self._create_marker(client)

        res = client.put(f'/api/markers/{marker["id"]}', json={'state': 'CLOSED'})
        assert res.status_code == 200
        assert res.get_json()['state'] == 'CLOSED'

    def test_sets_reminder_date(self, client):
        marker = self._create_marker(client)
        due = (datetime.now() + timedelta(hours=2)).isoformat()

        res = client.put(f'/api/markers/{marker["id"]}',
                         json={'reminder_due_date': due})
        assert res.status_code == 200
        assert res.get_json()['reminder_due_date'] is not None

    def test_clears_reminder_date(self, client):
        marker = self._create_marker(client)
        due = (datetime.now() + timedelta(hours=2)).isoformat()
        client.put(f'/api/markers/{marker["id"]}', json={'reminder_due_date': due})

        res = client.put(f'/api/markers/{marker["id"]}',
                         json={'reminder_due_date': None})
        assert res.status_code == 200
        assert res.get_json()['reminder_due_date'] is None

    def test_update_nonexistent_returns_404(self, client):
        res = client.put('/api/markers/9999', json={'state': 'CLOSED'})
        assert res.status_code == 404


class TestGetReminders:
    """GET /api/markers/reminders"""

    def _create_marker(self, client, text='Marker', state='OPEN'):
        item = client.post('/api/items', json={'heading': 'Task'}).get_json()
        entry = client.post(f'/api/items/{item["id"]}/entries',
                            json={'title': 'Entry'}).get_json()
        marker = client.post(f'/api/entries/{entry["id"]}/markers',
                             json={'text': text}).get_json()
        if state != 'OPEN':
            client.put(f'/api/markers/{marker["id"]}', json={'state': state})
        return marker

    def test_returns_empty_when_no_markers(self, client):
        res = client.get('/api/markers/reminders')
        assert res.status_code == 200
        assert res.get_json() == []

    def test_returns_open_markers(self, client):
        self._create_marker(client, text='Open one')

        res = client.get('/api/markers/reminders')
        data = res.get_json()
        assert len(data) == 1
        assert data[0]['text'] == 'Open one'

    def test_excludes_closed_markers(self, client):
        self._create_marker(client, text='Open')
        self._create_marker(client, text='Closed', state='CLOSED')

        res = client.get('/api/markers/reminders')
        data = res.get_json()
        assert len(data) == 1
        assert data[0]['text'] == 'Open'

    def test_includes_work_item_context(self, client):
        """Reminders should include parent entry title and work item heading."""
        self._create_marker(client, text='Check this')

        res = client.get('/api/markers/reminders')
        data = res.get_json()[0]
        assert 'entry_title' in data
        assert 'work_item_heading' in data
        assert data['work_item_heading'] == 'Task'


class TestMarkerCascade:
    """Verify markers are deleted when parent entry or work item is deleted."""

    def test_markers_deleted_with_entry(self, client):
        item = client.post('/api/items', json={'heading': 'Task'}).get_json()
        entry = client.post(f'/api/items/{item["id"]}/entries',
                            json={'title': 'Entry'}).get_json()
        client.post(f'/api/entries/{entry["id"]}/markers', json={'text': 'M1'})
        client.post(f'/api/entries/{entry["id"]}/markers', json={'text': 'M2'})

        # Delete the entry
        client.delete(f'/api/entries/{entry["id"]}')

        # Markers should be gone
        reminders = client.get('/api/markers/reminders').get_json()
        assert len(reminders) == 0

    def test_markers_deleted_with_work_item(self, client):
        item = client.post('/api/items', json={'heading': 'Task'}).get_json()
        entry = client.post(f'/api/items/{item["id"]}/entries',
                            json={'title': 'Entry'}).get_json()
        client.post(f'/api/entries/{entry["id"]}/markers', json={'text': 'M1'})

        # Delete the entire work item
        client.delete(f'/api/items/{item["id"]}')

        reminders = client.get('/api/markers/reminders').get_json()
        assert len(reminders) == 0
