"""
API Tests — Task Folders & State Boundary Validation

Tests for task folder creation, task folder organization, and folder clearing when
work items transition between memo and task states.
"""
import pytest


def test_system_roots_exist(client):
    res = client.get('/api/folders')
    assert res.status_code == 200
    data = res.get_json()
    assert len(data['folders']) == 2
    assert data['folders'][0]['name'] == 'Memos'
    assert data['folders'][1]['name'] == 'Tasks'


def test_create_task_folder(client):
    res = client.get('/api/folders')
    tasks_root_id = res.get_json()['folders'][1]['id']

    # Create folder under Tasks system root
    res = client.post('/api/folders', json={'name': 'Sprint 1', 'parent_id': tasks_root_id})
    assert res.status_code == 201
    data = res.get_json()
    assert data['name'] == 'Sprint 1'
    assert data['parent_id'] == tasks_root_id


def test_assign_task_to_task_folder(client):
    res = client.get('/api/folders')
    tasks_root_id = res.get_json()['folders'][1]['id']

    folder = client.post('/api/folders', json={'name': 'Sprint 1', 'parent_id': tasks_root_id}).get_json()

    # Create TODO task
    item = client.post('/api/items', json={'heading': 'Fix login bug', 'state': 'TODO'}).get_json()
    assert item['state'] == 'TODO'
    assert item['folder_id'] is None

    # Assign to task folder
    res = client.put(f'/api/items/{item["id"]}', json={'folder_id': folder['id']})
    assert res.status_code == 200
    updated_item = res.get_json()
    assert updated_item['folder_id'] == folder['id']

    # Retrieve folders and verify task is listed in the folder items
    res = client.get('/api/folders')
    data = res.get_json()
    tasks_tree = data['folders'][1]
    assert len(tasks_tree['children'][0]['items']) == 1
    assert tasks_tree['children'][0]['items'][0]['heading'] == 'Fix login bug'


def test_state_change_todo_to_memo_clears_folder(client):
    res = client.get('/api/folders')
    tasks_root_id = res.get_json()['folders'][1]['id']
    memos_root_id = res.get_json()['folders'][0]['id']

    task_folder = client.post('/api/folders', json={'name': 'Sprint 1', 'parent_id': tasks_root_id}).get_json()

    # Create a TODO item assigned to the task folder
    item = client.post('/api/items', json={'heading': 'Design schema', 'state': 'TODO'}).get_json()
    client.put(f'/api/items/{item["id"]}', json={'folder_id': task_folder['id']})

    # Verify assigned
    res = client.get('/api/folders')
    assert len(res.get_json()['folders'][1]['children'][0]['items']) == 1

    # Transition TODO -> MEMO
    res = client.put(f'/api/items/{item["id"]}', json={'state': 'MEMO'})
    assert res.status_code == 200
    updated_item = res.get_json()
    assert updated_item['state'] == 'MEMO'
    assert updated_item['folder_id'] is None  # Should be cleared!

    # Verify not in task folder items, instead under Memos root as an unfoldered item
    res = client.get('/api/folders')
    data = res.get_json()
    assert len(data['folders'][1]['children'][0]['items']) == 0
    assert len(data['folders'][0]['root_items']) == 1
    assert data['folders'][0]['root_items'][0]['heading'] == 'Design schema'


def test_state_change_memo_to_todo_clears_folder(client):
    res = client.get('/api/folders')
    memos_root_id = res.get_json()['folders'][0]['id']

    memo_folder = client.post('/api/folders', json={'name': 'Docs', 'parent_id': memos_root_id}).get_json()

    # Create a MEMO item assigned to the memo folder
    item = client.post('/api/items', json={'heading': 'Release notes', 'state': 'MEMO'}).get_json()
    client.put(f'/api/items/{item["id"]}', json={'folder_id': memo_folder['id']})

    # Verify assigned
    res = client.get('/api/folders')
    assert len(res.get_json()['folders'][0]['children'][0]['items']) == 1

    # Transition MEMO -> TODO
    res = client.put(f'/api/items/{item["id"]}', json={'state': 'TODO'})
    assert res.status_code == 200
    updated_item = res.get_json()
    assert updated_item['state'] == 'TODO'
    assert updated_item['folder_id'] is None  # Should be cleared!

    # Verify not in memo folder items, instead under Tasks root as an unfoldered item
    res = client.get('/api/folders')
    data = res.get_json()
    assert len(data['folders'][0]['children'][0]['items']) == 0
    assert len(data['folders'][1]['root_items']) == 1
    assert data['folders'][1]['root_items'][0]['heading'] == 'Release notes'


def test_state_change_todo_to_wip_retains_folder(client):
    res = client.get('/api/folders')
    tasks_root_id = res.get_json()['folders'][1]['id']

    task_folder = client.post('/api/folders', json={'name': 'Sprint 1', 'parent_id': tasks_root_id}).get_json()

    # Create a TODO item assigned to the task folder
    item = client.post('/api/items', json={'heading': 'Fix login bug', 'state': 'TODO'}).get_json()
    client.put(f'/api/items/{item["id"]}', json={'folder_id': task_folder['id']})

    # Transition TODO -> WIP (retains folder since both are task states)
    res = client.put(f'/api/items/{item["id"]}', json={'state': 'WIP'})
    assert res.status_code == 200
    updated_item = res.get_json()
    assert updated_item['state'] == 'WIP'
    assert updated_item['folder_id'] == task_folder['id']  # Should be retained!


def test_state_change_wip_to_done_retains_folder(client):
    res = client.get('/api/folders')
    tasks_root_id = res.get_json()['folders'][1]['id']

    task_folder = client.post('/api/folders', json={'name': 'Sprint 1', 'parent_id': tasks_root_id}).get_json()

    # Create a WIP item assigned to the task folder
    item = client.post('/api/items', json={'heading': 'Fix login bug', 'state': 'WIP'}).get_json()
    client.put(f'/api/items/{item["id"]}', json={'folder_id': task_folder['id']})

    # Transition WIP -> DONE (retains folder since both are task states)
    res = client.put(f'/api/items/{item["id"]}', json={'state': 'DONE'})
    assert res.status_code == 200
    updated_item = res.get_json()
    assert updated_item['state'] == 'DONE'
    assert updated_item['folder_id'] == task_folder['id']


def test_done_tasks_shown_in_tasks_folder(client):
    res = client.get('/api/folders')
    tasks_root_id = res.get_json()['folders'][1]['id']

    task_folder = client.post('/api/folders', json={'name': 'Sprint 1', 'parent_id': tasks_root_id}).get_json()

    # Create foldered DONE task and unfoldered DONE task
    item_in_folder = client.post('/api/items', json={'heading': 'Completed task 1', 'state': 'DONE'}).get_json()
    client.put(f'/api/items/{item_in_folder["id"]}', json={'folder_id': task_folder['id']})
    item_unfoldered = client.post('/api/items', json={'heading': 'Completed task 2', 'state': 'DONE'}).get_json()

    res = client.get('/api/folders')
    assert res.status_code == 200
    tasks_tree = res.get_json()['folders'][1]

    # Verify foldered DONE task appears in folder items
    assert len(tasks_tree['children'][0]['items']) == 1
    assert tasks_tree['children'][0]['items'][0]['heading'] == 'Completed task 1'

    # Verify unfoldered DONE task appears in root_items
    root_item_headings = [i['heading'] for i in tasks_tree['root_items']]
    assert 'Completed task 2' in root_item_headings


def test_move_folder_to_another_folder(client):
    res = client.get('/api/folders')
    memos_root_id = res.get_json()['folders'][0]['id']

    # Create folder A
    folder_a = client.post('/api/folders', json={'name': 'A', 'parent_id': memos_root_id}).get_json()
    # Create folder B
    folder_b = client.post('/api/folders', json={'name': 'B', 'parent_id': memos_root_id}).get_json()

    # Move A under B
    res = client.put(f'/api/folders/{folder_a["id"]}', json={'parent_id': folder_b['id']})
    assert res.status_code == 200
    data = res.get_json()
    assert data['parent_id'] == folder_b['id']


def test_move_folder_into_itself_fails(client):
    res = client.get('/api/folders')
    memos_root_id = res.get_json()['folders'][0]['id']

    folder = client.post('/api/folders', json={'name': 'A', 'parent_id': memos_root_id}).get_json()

    # Move A into A
    res = client.put(f'/api/folders/{folder["id"]}', json={'parent_id': folder['id']})
    assert res.status_code == 400
    assert 'Cannot move folder into itself' in res.get_json()['error']


def test_move_folder_into_descendant_fails(client):
    res = client.get('/api/folders')
    memos_root_id = res.get_json()['folders'][0]['id']

    parent = client.post('/api/folders', json={'name': 'Parent', 'parent_id': memos_root_id}).get_json()
    child = client.post('/api/folders', json={'name': 'Child', 'parent_id': parent['id']}).get_json()

    # Try moving Parent into Child
    res = client.put(f'/api/folders/{parent["id"]}', json={'parent_id': child['id']})
    assert res.status_code == 400
    assert 'Cannot move folder into one of its subfolders' in res.get_json()['error']


def test_move_folder_across_boundary_fails(client):
    res = client.get('/api/folders')
    memos_root_id = res.get_json()['folders'][0]['id']
    tasks_root_id = res.get_json()['folders'][1]['id']

    memo_folder = client.post('/api/folders', json={'name': 'MemoFolder', 'parent_id': memos_root_id}).get_json()
    task_folder = client.post('/api/folders', json={'name': 'TaskFolder', 'parent_id': tasks_root_id}).get_json()

    # Try moving memo_folder into task_folder
    res = client.put(f'/api/folders/{memo_folder["id"]}', json={'parent_id': task_folder['id']})
    assert res.status_code == 400
    assert 'Cannot move folders across Memos/Tasks boundary' in res.get_json()['error']

