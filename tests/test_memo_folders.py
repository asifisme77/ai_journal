"""
API Tests — Folders (Memos & Tasks)

Tests for creating, listing, and deleting folders under the unified Folders system,
including hierarchical nesting and item assignment.
"""
import pytest


class TestCreateFolder:
    """POST /api/folders"""

    def test_creates_folder_under_memos_root(self, client):
        # Find Memos system root first
        res = client.get('/api/folders')
        assert res.status_code == 200
        memos_root_id = res.get_json()['folders'][0]['id']

        res = client.post('/api/folders', json={'name': 'Work', 'parent_id': memos_root_id})
        assert res.status_code == 201
        data = res.get_json()
        assert data['name'] == 'Work'
        assert data['parent_id'] == memos_root_id

    def test_creates_subfolder(self, client):
        res = client.get('/api/folders')
        memos_root_id = res.get_json()['folders'][0]['id']

        parent = client.post('/api/folders', json={'name': 'Work', 'parent_id': memos_root_id}).get_json()

        res = client.post('/api/folders',
                          json={'name': 'Projects', 'parent_id': parent['id']})
        assert res.status_code == 201
        assert res.get_json()['parent_id'] == parent['id']

    def test_rejects_empty_name(self, client):
        res = client.get('/api/folders')
        memos_root_id = res.get_json()['folders'][0]['id']

        res = client.post('/api/folders', json={'name': '', 'parent_id': memos_root_id})
        assert res.status_code == 400

    def test_rejects_whitespace_only_name(self, client):
        res = client.get('/api/folders')
        memos_root_id = res.get_json()['folders'][0]['id']

        res = client.post('/api/folders', json={'name': '   ', 'parent_id': memos_root_id})
        assert res.status_code == 400

    def test_rejects_duplicate_name_in_same_parent(self, client):
        res = client.get('/api/folders')
        memos_root_id = res.get_json()['folders'][0]['id']

        client.post('/api/folders', json={'name': 'Work', 'parent_id': memos_root_id})

        res = client.post('/api/folders', json={'name': 'work', 'parent_id': memos_root_id})  # case-insensitive
        assert res.status_code == 409

    def test_allows_same_name_in_different_parents(self, client):
        res = client.get('/api/folders')
        memos_root_id = res.get_json()['folders'][0]['id']

        parent1 = client.post('/api/folders', json={'name': 'A', 'parent_id': memos_root_id}).get_json()
        parent2 = client.post('/api/folders', json={'name': 'B', 'parent_id': memos_root_id}).get_json()

        res1 = client.post('/api/folders',
                           json={'name': 'Notes', 'parent_id': parent1['id']})
        res2 = client.post('/api/folders',
                           json={'name': 'Notes', 'parent_id': parent2['id']})
        assert res1.status_code == 201
        assert res2.status_code == 201


class TestGetFolders:
    """GET /api/folders"""

    def test_returns_empty_structure_with_system_roots(self, client):
        res = client.get('/api/folders')
        assert res.status_code == 200
        data = res.get_json()
        assert len(data['folders']) == 2
        assert data['folders'][0]['name'] == 'Memos'
        assert data['folders'][0]['is_system'] is True
        assert data['folders'][0]['children'] == []
        assert data['folders'][0]['root_items'] == []

        assert data['folders'][1]['name'] == 'Tasks'
        assert data['folders'][1]['is_system'] is True
        assert data['folders'][1]['children'] == []
        assert data['folders'][1]['root_items'] == []

    def test_returns_folder_hierarchy(self, client):
        res = client.get('/api/folders')
        memos_root_id = res.get_json()['folders'][0]['id']

        parent = client.post('/api/folders', json={'name': 'Work', 'parent_id': memos_root_id}).get_json()
        client.post('/api/folders',
                     json={'name': 'Projects', 'parent_id': parent['id']})

        res = client.get('/api/folders')
        data = res.get_json()
        memos = data['folders'][0]
        assert len(memos['children']) == 1
        assert memos['children'][0]['name'] == 'Work'
        assert len(memos['children'][0]['children']) == 1
        assert memos['children'][0]['children'][0]['name'] == 'Projects'

    def test_returns_items_in_folders(self, client):
        res = client.get('/api/folders')
        memos_root_id = res.get_json()['folders'][0]['id']

        folder = client.post('/api/folders', json={'name': 'Work', 'parent_id': memos_root_id}).get_json()

        # Create a MEMO item and assign it to the folder
        item = client.post('/api/items', json={'heading': 'My Memo', 'state': 'MEMO'}).get_json()
        client.put(f'/api/items/{item["id"]}', json={'folder_id': folder['id']})

        res = client.get('/api/folders')
        data = res.get_json()
        memos = data['folders'][0]
        assert len(memos['children'][0]['items']) == 1
        assert memos['children'][0]['items'][0]['heading'] == 'My Memo'

    def test_root_memos_are_items_without_folder(self, client):
        # Create a MEMO item without a folder
        client.post('/api/items', json={'heading': 'Orphan Memo', 'state': 'MEMO'})

        res = client.get('/api/folders')
        data = res.get_json()
        memos = data['folders'][0]
        assert len(memos['root_items']) == 1
        assert memos['root_items'][0]['heading'] == 'Orphan Memo'

    def test_non_memo_items_excluded_from_memos(self, client):
        """Only MEMO-state items should show up in memo folders."""
        res = client.get('/api/folders')
        memos_root_id = res.get_json()['folders'][0]['id']

        folder = client.post('/api/folders', json={'name': 'Work', 'parent_id': memos_root_id}).get_json()

        # Create a TODO item and assign it to the folder
        item = client.post('/api/items', json={'heading': 'Not a memo', 'state': 'TODO'}).get_json()
        client.put(f'/api/items/{item["id"]}', json={'folder_id': folder['id']})

        res = client.get('/api/folders')
        data = res.get_json()
        memos = data['folders'][0]
        # The folder should NOT include non-MEMO items
        assert len(memos['children'][0]['items']) == 0


class TestDeleteFolder:
    """DELETE /api/folders/<folder_id>"""

    def test_deletes_folder(self, client):
        res = client.get('/api/folders')
        memos_root_id = res.get_json()['folders'][0]['id']

        folder = client.post('/api/folders', json={'name': 'Doomed', 'parent_id': memos_root_id}).get_json()

        res = client.delete(f'/api/folders/{folder["id"]}')
        assert res.status_code == 204

        data = client.get('/api/folders').get_json()
        assert len(data['folders'][0]['children']) == 0

    def test_unassigns_items_on_folder_delete(self, client):
        """Items in a deleted folder should move to root (folder_id = NULL)."""
        res = client.get('/api/folders')
        memos_root_id = res.get_json()['folders'][0]['id']

        folder = client.post('/api/folders', json={'name': 'Work', 'parent_id': memos_root_id}).get_json()
        item = client.post('/api/items', json={'heading': 'Memo', 'state': 'MEMO'}).get_json()
        client.put(f'/api/items/{item["id"]}', json={'folder_id': folder['id']})

        # Delete folder
        client.delete(f'/api/folders/{folder["id"]}')

        # Item should now be a root memo
        data = client.get('/api/folders').get_json()
        memos = data['folders'][0]
        assert len(memos['root_items']) == 1
        assert memos['root_items'][0]['heading'] == 'Memo'

    def test_delete_system_root_returns_403(self, client):
        res = client.get('/api/folders')
        memos_root_id = res.get_json()['folders'][0]['id']
        res = client.delete(f'/api/folders/{memos_root_id}')
        assert res.status_code == 403

    def test_delete_nonexistent_returns_404(self, client):
        res = client.delete('/api/folders/9999')
        assert res.status_code == 404


class TestItemFolderAssignment:
    """PUT /api/items/<id> — folder_id assignment"""

    def test_assign_item_to_folder(self, client):
        res = client.get('/api/folders')
        memos_root_id = res.get_json()['folders'][0]['id']

        folder = client.post('/api/folders', json={'name': 'Work', 'parent_id': memos_root_id}).get_json()
        item = client.post('/api/items', json={'heading': 'Task', 'state': 'MEMO'}).get_json()

        res = client.put(f'/api/items/{item["id"]}',
                         json={'folder_id': folder['id']})
        assert res.status_code == 200
        assert res.get_json()['folder_id'] == folder['id']

    def test_unassign_item_from_folder(self, client):
        res = client.get('/api/folders')
        memos_root_id = res.get_json()['folders'][0]['id']

        folder = client.post('/api/folders', json={'name': 'Work', 'parent_id': memos_root_id}).get_json()
        item = client.post('/api/items', json={'heading': 'Task', 'state': 'MEMO'}).get_json()
        client.put(f'/api/items/{item["id"]}', json={'folder_id': folder['id']})

        res = client.put(f'/api/items/{item["id"]}', json={'folder_id': None})
        assert res.status_code == 200
        assert res.get_json()['folder_id'] is None

    def test_assign_to_nonexistent_folder_ignored(self, client):
        """Assigning to a folder that doesn't exist should be silently ignored."""
        item = client.post('/api/items', json={'heading': 'Task'}).get_json()

        res = client.put(f'/api/items/{item["id"]}', json={'folder_id': 9999})
        assert res.status_code == 200
        # Should remain unassigned
        assert res.get_json()['folder_id'] is None
