"""
API Tests — Work Items CRUD

Tests for creating, reading, updating, and deleting work items.
"""
import json
import pytest


class TestGetItems:
    """GET /api/items"""

    def test_returns_empty_list_initially(self, client):
        res = client.get('/api/items')
        assert res.status_code == 200
        assert res.get_json() == []

    def test_returns_items_after_creation(self, client):
        client.post('/api/items', json={'heading': 'Item A'})
        client.post('/api/items', json={'heading': 'Item B'})

        res = client.get('/api/items')
        data = res.get_json()
        assert len(data) == 2
        # Newest first
        assert data[0]['heading'] == 'Item B'
        assert data[1]['heading'] == 'Item A'

    def test_items_include_entries(self, client):
        res = client.post('/api/items', json={'heading': 'Parent'})
        item_id = res.get_json()['id']
        client.post(f'/api/items/{item_id}/entries', json={'title': 'Entry 1'})

        items = client.get('/api/items').get_json()
        assert len(items[0]['entries']) == 1
        assert items[0]['entries'][0]['title'] == 'Entry 1'


class TestCreateItem:
    """POST /api/items"""

    def test_creates_item_with_default_state(self, client):
        res = client.post('/api/items', json={'heading': 'My Task'})
        assert res.status_code == 201
        data = res.get_json()
        assert data['heading'] == 'My Task'
        assert data['state'] == 'TODO'
        assert data['id'] is not None

    def test_creates_item_with_custom_state(self, client):
        res = client.post('/api/items', json={'heading': 'Note', 'state': 'MEMO'})
        assert res.status_code == 201
        assert res.get_json()['state'] == 'MEMO'

    def test_rejects_empty_heading(self, client):
        res = client.post('/api/items', json={'heading': ''})
        assert res.status_code == 400

    def test_rejects_missing_heading(self, client):
        res = client.post('/api/items', json={})
        assert res.status_code == 400


class TestUpdateItem:
    """PUT /api/items/<id>"""

    def test_updates_heading(self, client):
        item = client.post('/api/items', json={'heading': 'Old'}).get_json()

        res = client.put(f'/api/items/{item["id"]}', json={'heading': 'New'})
        assert res.status_code == 200
        assert res.get_json()['heading'] == 'New'

    def test_updates_state(self, client):
        item = client.post('/api/items', json={'heading': 'Task'}).get_json()

        res = client.put(f'/api/items/{item["id"]}', json={'state': 'WIP'})
        assert res.status_code == 200
        assert res.get_json()['state'] == 'WIP'

    def test_update_nonexistent_returns_404(self, client):
        res = client.put('/api/items/9999', json={'heading': 'X'})
        assert res.status_code == 404


class TestDeleteItem:
    """DELETE /api/items/<id>"""

    def test_deletes_item(self, client):
        item = client.post('/api/items', json={'heading': 'Doomed'}).get_json()

        res = client.delete(f'/api/items/{item["id"]}')
        assert res.status_code == 204

        # Verify it's gone
        items = client.get('/api/items').get_json()
        assert len(items) == 0

    def test_cascades_entries(self, client):
        """Deleting a work item should also delete all its entries."""
        item = client.post('/api/items', json={'heading': 'Parent'}).get_json()
        client.post(f'/api/items/{item["id"]}/entries', json={'title': 'Child'})

        client.delete(f'/api/items/{item["id"]}')

        # Item and entry are both gone
        items = client.get('/api/items').get_json()
        assert len(items) == 0

    def test_delete_nonexistent_returns_404(self, client):
        res = client.delete('/api/items/9999')
        assert res.status_code == 404
