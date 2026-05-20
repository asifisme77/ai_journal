"""
API Tests — Journal Entries CRUD

Tests for creating, reading, updating, and deleting journal entries,
including the new status field.
"""
import pytest


class TestCreateEntry:
    """POST /api/items/<item_id>/entries"""

    def test_creates_entry_with_title(self, client):
        item = client.post('/api/items', json={'heading': 'Task'}).get_json()

        res = client.post(f'/api/items/{item["id"]}/entries', json={'title': 'Day 1'})
        assert res.status_code == 201
        data = res.get_json()
        assert data['title'] == 'Day 1'
        assert data['work_item_id'] == item['id']
        assert data['content'] == ''
        assert data['status'] is None

    def test_creates_entry_with_default_title(self, client):
        """When no title is provided, it should default to the work item heading + ' details...'."""
        item = client.post('/api/items', json={'heading': 'Task'}).get_json()

        res = client.post(f'/api/items/{item["id"]}/entries', json={})
        assert res.status_code == 201
        assert res.get_json()['title'] == 'Task details...'

    def test_creates_entry_with_status(self, client):
        item = client.post('/api/items', json={'heading': 'Task'}).get_json()

        res = client.post(f'/api/items/{item["id"]}/entries',
                          json={'title': 'Follow up', 'status': 'FOLLOWUP'})
        assert res.status_code == 201
        assert res.get_json()['status'] == 'FOLLOWUP'

    def test_creates_entry_with_content(self, client):
        item = client.post('/api/items', json={'heading': 'Task'}).get_json()

        res = client.post(f'/api/items/{item["id"]}/entries',
                          json={'title': 'Notes', 'content': '<p>Hello world</p>'})
        assert res.status_code == 201
        assert '<p>Hello world</p>' in res.get_json()['content']

    def test_entry_under_nonexistent_item_returns_404(self, client):
        res = client.post('/api/items/9999/entries', json={'title': 'X'})
        assert res.status_code == 404

    def test_multiple_entries_per_item(self, client):
        item = client.post('/api/items', json={'heading': 'Task'}).get_json()
        client.post(f'/api/items/{item["id"]}/entries', json={'title': 'Entry 1'})
        client.post(f'/api/items/{item["id"]}/entries', json={'title': 'Entry 2'})
        client.post(f'/api/items/{item["id"]}/entries', json={'title': 'Entry 3'})

        items = client.get('/api/items').get_json()
        assert len(items[0]['entries']) == 3


class TestUpdateEntry:
    """PUT /api/entries/<entry_id>"""

    def _create_entry(self, client, title='Test', content='', status=None):
        """Helper to create a work item with one entry."""
        item = client.post('/api/items', json={'heading': 'Task'}).get_json()
        payload = {'title': title, 'content': content}
        if status:
            payload['status'] = status
        entry = client.post(f'/api/items/{item["id"]}/entries', json=payload).get_json()
        return entry

    def test_updates_title(self, client):
        entry = self._create_entry(client, title='Old Title')

        res = client.put(f'/api/entries/{entry["id"]}', json={'title': 'New Title'})
        assert res.status_code == 200
        assert res.get_json()['title'] == 'New Title'

    def test_updates_content(self, client):
        entry = self._create_entry(client)

        res = client.put(f'/api/entries/{entry["id"]}',
                         json={'content': '<p>Updated content</p>'})
        assert res.status_code == 200
        assert res.get_json()['content'] == '<p>Updated content</p>'

    def test_updates_status_to_followup(self, client):
        entry = self._create_entry(client)

        res = client.put(f'/api/entries/{entry["id"]}', json={'status': 'FOLLOWUP'})
        assert res.status_code == 200
        assert res.get_json()['status'] == 'FOLLOWUP'

    def test_updates_status_to_done(self, client):
        entry = self._create_entry(client)

        res = client.put(f'/api/entries/{entry["id"]}', json={'status': 'DONE'})
        assert res.status_code == 200
        assert res.get_json()['status'] == 'DONE'

    def test_clears_status_to_null(self, client):
        entry = self._create_entry(client, status='FOLLOWUP')

        res = client.put(f'/api/entries/{entry["id"]}', json={'status': None})
        assert res.status_code == 200
        assert res.get_json()['status'] is None

    def test_partial_update_preserves_other_fields(self, client):
        """Updating only title should not wipe content or status."""
        entry = self._create_entry(client, title='Original', content='<p>Keep me</p>')

        res = client.put(f'/api/entries/{entry["id"]}', json={'title': 'Changed'})
        data = res.get_json()
        assert data['title'] == 'Changed'
        assert data['content'] == '<p>Keep me</p>'

    def test_update_nonexistent_returns_404(self, client):
        res = client.put('/api/entries/9999', json={'title': 'X'})
        assert res.status_code == 404


class TestDeleteEntry:
    """DELETE /api/entries/<entry_id>"""

    def test_deletes_entry(self, client):
        item = client.post('/api/items', json={'heading': 'Task'}).get_json()
        entry = client.post(f'/api/items/{item["id"]}/entries',
                            json={'title': 'Doomed'}).get_json()

        res = client.delete(f'/api/entries/{entry["id"]}')
        assert res.status_code == 204

        # Verify entry is gone but item persists
        items = client.get('/api/items').get_json()
        assert len(items) == 1
        assert len(items[0]['entries']) == 0

    def test_delete_nonexistent_returns_404(self, client):
        res = client.delete('/api/entries/9999')
        assert res.status_code == 404
