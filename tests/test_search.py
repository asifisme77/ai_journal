"""
API Tests — Search & Filtering

Tests for the search endpoint with text queries, state filters, and date ranges.
"""
import pytest
from datetime import datetime


class TestSearchTextQuery:
    """GET /api/search?q=..."""

    def _seed(self, client):
        """Create a few items and entries for search testing."""
        # Item 1: "Bug Fix" with entry about database
        item1 = client.post('/api/items', json={'heading': 'Bug Fix'}).get_json()
        client.post(f'/api/items/{item1["id"]}/entries',
                    json={'title': 'Day 1', 'content': '<p>Fixed the database connection issue</p>'})

        # Item 2: "Feature Request" with entry about UI
        item2 = client.post('/api/items', json={'heading': 'Feature Request'}).get_json()
        client.post(f'/api/items/{item2["id"]}/entries',
                    json={'title': 'Design notes', 'content': '<p>New UI for the dashboard</p>'})

        # Item 3: "Database Migration" with no entries
        item3 = client.post('/api/items', json={'heading': 'Database Migration'}).get_json()

        return item1, item2, item3

    def test_search_matches_heading(self, client):
        self._seed(client)

        res = client.get('/api/search?q=Bug+Fix')
        data = res.get_json()
        assert len(data) == 1
        assert data[0]['heading'] == 'Bug Fix'

    def test_search_matches_entry_content(self, client):
        self._seed(client)

        res = client.get('/api/search?q=dashboard')
        data = res.get_json()
        assert len(data) == 1
        assert data[0]['heading'] == 'Feature Request'

    def test_search_matches_entry_title(self, client):
        self._seed(client)

        res = client.get('/api/search?q=Design+notes')
        data = res.get_json()
        assert len(data) == 1

    def test_search_is_case_insensitive(self, client):
        self._seed(client)

        res = client.get('/api/search?q=DATABASE')
        data = res.get_json()
        # Should match both "Bug Fix" (entry content) and "Database Migration" (heading)
        assert len(data) == 2

    def test_search_no_results(self, client):
        self._seed(client)

        res = client.get('/api/search?q=nonexistent+term')
        data = res.get_json()
        assert len(data) == 0

    def test_search_returns_filtered_entries(self, client):
        """When query matches entry content but not heading, only matching entries are included."""
        self._seed(client)

        res = client.get('/api/search?q=connection')
        data = res.get_json()
        assert len(data) == 1
        assert len(data[0]['entries']) == 1
        assert 'connection' in data[0]['entries'][0]['content'].lower()

    def test_empty_query_returns_all(self, client):
        self._seed(client)

        res = client.get('/api/search?q=')
        data = res.get_json()
        assert len(data) == 3


class TestSearchStateFilter:
    """GET /api/search?state=..."""

    def _seed_with_states(self, client):
        client.post('/api/items', json={'heading': 'Todo item', 'state': 'TODO'})
        client.post('/api/items', json={'heading': 'WIP item', 'state': 'WIP'})
        client.post('/api/items', json={'heading': 'Done item', 'state': 'DONE'})
        client.post('/api/items', json={'heading': 'Memo item', 'state': 'MEMO'})

    def test_filter_single_state(self, client):
        self._seed_with_states(client)

        res = client.get('/api/search?state=WIP')
        data = res.get_json()
        assert len(data) == 1
        assert data[0]['state'] == 'WIP'

    def test_filter_multiple_states(self, client):
        self._seed_with_states(client)

        res = client.get('/api/search?state=TODO,WIP')
        data = res.get_json()
        assert len(data) == 2
        states = {d['state'] for d in data}
        assert states == {'TODO', 'WIP'}

    def test_filter_done_state(self, client):
        self._seed_with_states(client)

        res = client.get('/api/search?state=DONE')
        data = res.get_json()
        assert len(data) == 1
        assert data[0]['heading'] == 'Done item'


class TestSearchCombined:
    """GET /api/search with multiple filters."""

    def test_text_and_state_combined(self, client):
        client.post('/api/items', json={'heading': 'Bug in Auth', 'state': 'TODO'})
        client.post('/api/items', json={'heading': 'Bug in UI', 'state': 'DONE'})

        # Search for "Bug" but only in TODO state
        res = client.get('/api/search?q=Bug&state=TODO')
        data = res.get_json()
        assert len(data) == 1
        assert data[0]['heading'] == 'Bug in Auth'

    def test_no_filters_returns_all(self, client):
        client.post('/api/items', json={'heading': 'A'})
        client.post('/api/items', json={'heading': 'B'})

        res = client.get('/api/search')
        data = res.get_json()
        assert len(data) == 2
