"""
API Tests — Memo Folders

Tests for creating, listing, and deleting memo folders,
including hierarchical nesting and item assignment.
"""
import pytest


class TestCreateMemoFolder:
    """POST /api/memo-folders"""

    def test_creates_root_folder(self, client):
        res = client.post('/api/memo-folders', json={'name': 'Work'})
        assert res.status_code == 201
        data = res.get_json()
        assert data['name'] == 'Work'
        assert data['parent_id'] is None

    def test_creates_subfolder(self, client):
        parent = client.post('/api/memo-folders', json={'name': 'Work'}).get_json()

        res = client.post('/api/memo-folders',
                          json={'name': 'Projects', 'parent_id': parent['id']})
        assert res.status_code == 201
        assert res.get_json()['parent_id'] == parent['id']

    def test_rejects_empty_name(self, client):
        res = client.post('/api/memo-folders', json={'name': ''})
        assert res.status_code == 400

    def test_rejects_whitespace_only_name(self, client):
        res = client.post('/api/memo-folders', json={'name': '   '})
        assert res.status_code == 400

    def test_rejects_duplicate_name_in_same_parent(self, client):
        client.post('/api/memo-folders', json={'name': 'Work'})

        res = client.post('/api/memo-folders', json={'name': 'work'})  # case-insensitive
        assert res.status_code == 409

    def test_allows_same_name_in_different_parents(self, client):
        parent1 = client.post('/api/memo-folders', json={'name': 'A'}).get_json()
        parent2 = client.post('/api/memo-folders', json={'name': 'B'}).get_json()

        res1 = client.post('/api/memo-folders',
                           json={'name': 'Notes', 'parent_id': parent1['id']})
        res2 = client.post('/api/memo-folders',
                           json={'name': 'Notes', 'parent_id': parent2['id']})
        assert res1.status_code == 201
        assert res2.status_code == 201


class TestGetMemoFolders:
    """GET /api/memo-folders"""

    def test_returns_empty_structure(self, client):
        res = client.get('/api/memo-folders')
        assert res.status_code == 200
        data = res.get_json()
        assert data['folders'] == []
        assert data['root_memos'] == []

    def test_returns_folder_hierarchy(self, client):
        parent = client.post('/api/memo-folders', json={'name': 'Work'}).get_json()
        client.post('/api/memo-folders',
                     json={'name': 'Projects', 'parent_id': parent['id']})

        res = client.get('/api/memo-folders')
        data = res.get_json()
        assert len(data['folders']) == 1
        assert data['folders'][0]['name'] == 'Work'
        assert len(data['folders'][0]['children']) == 1
        assert data['folders'][0]['children'][0]['name'] == 'Projects'

    def test_returns_items_in_folders(self, client):
        folder = client.post('/api/memo-folders', json={'name': 'Work'}).get_json()

        # Create a MEMO item and assign it to the folder
        item = client.post('/api/items', json={'heading': 'My Memo', 'state': 'MEMO'}).get_json()
        client.put(f'/api/items/{item["id"]}', json={'memo_folder_id': folder['id']})

        res = client.get('/api/memo-folders')
        data = res.get_json()
        assert len(data['folders'][0]['items']) == 1
        assert data['folders'][0]['items'][0]['heading'] == 'My Memo'

    def test_root_memos_are_items_without_folder(self, client):
        # Create a MEMO item without a folder
        client.post('/api/items', json={'heading': 'Orphan Memo', 'state': 'MEMO'})

        res = client.get('/api/memo-folders')
        data = res.get_json()
        assert len(data['root_memos']) == 1
        assert data['root_memos'][0]['heading'] == 'Orphan Memo'

    def test_non_memo_items_excluded(self, client):
        """Only MEMO-state items should show up in memo folders."""
        folder = client.post('/api/memo-folders', json={'name': 'Work'}).get_json()

        # Create a TODO item and assign it to the folder
        item = client.post('/api/items', json={'heading': 'Not a memo', 'state': 'TODO'}).get_json()
        client.put(f'/api/items/{item["id"]}', json={'memo_folder_id': folder['id']})

        res = client.get('/api/memo-folders')
        data = res.get_json()
        # The folder should NOT include non-MEMO items
        assert len(data['folders'][0]['items']) == 0


class TestDeleteMemoFolder:
    """DELETE /api/memo-folders/<folder_id>"""

    def test_deletes_folder(self, client):
        folder = client.post('/api/memo-folders', json={'name': 'Doomed'}).get_json()

        res = client.delete(f'/api/memo-folders/{folder["id"]}')
        assert res.status_code == 204

        data = client.get('/api/memo-folders').get_json()
        assert len(data['folders']) == 0

    def test_unassigns_items_on_folder_delete(self, client):
        """Items in a deleted folder should move to root (folder_id = NULL)."""
        folder = client.post('/api/memo-folders', json={'name': 'Work'}).get_json()
        item = client.post('/api/items', json={'heading': 'Memo', 'state': 'MEMO'}).get_json()
        client.put(f'/api/items/{item["id"]}', json={'memo_folder_id': folder['id']})

        # Delete folder
        client.delete(f'/api/memo-folders/{folder["id"]}')

        # Item should now be a root memo
        data = client.get('/api/memo-folders').get_json()
        assert len(data['root_memos']) == 1
        assert data['root_memos'][0]['heading'] == 'Memo'

    def test_delete_nonexistent_returns_404(self, client):
        res = client.delete('/api/memo-folders/9999')
        assert res.status_code == 404


class TestItemFolderAssignment:
    """PUT /api/items/<id> — memo_folder_id assignment"""

    def test_assign_item_to_folder(self, client):
        folder = client.post('/api/memo-folders', json={'name': 'Work'}).get_json()
        item = client.post('/api/items', json={'heading': 'Task', 'state': 'MEMO'}).get_json()

        res = client.put(f'/api/items/{item["id"]}',
                         json={'memo_folder_id': folder['id']})
        assert res.status_code == 200
        assert res.get_json()['memo_folder_id'] == folder['id']

    def test_unassign_item_from_folder(self, client):
        folder = client.post('/api/memo-folders', json={'name': 'Work'}).get_json()
        item = client.post('/api/items', json={'heading': 'Task', 'state': 'MEMO'}).get_json()
        client.put(f'/api/items/{item["id"]}', json={'memo_folder_id': folder['id']})

        res = client.put(f'/api/items/{item["id"]}', json={'memo_folder_id': None})
        assert res.status_code == 200
        assert res.get_json()['memo_folder_id'] is None

    def test_assign_to_nonexistent_folder_ignored(self, client):
        """Assigning to a folder that doesn't exist should be silently ignored."""
        item = client.post('/api/items', json={'heading': 'Task'}).get_json()

        res = client.put(f'/api/items/{item["id"]}', json={'memo_folder_id': 9999})
        assert res.status_code == 200
        # Should remain unassigned
        assert res.get_json()['memo_folder_id'] is None
