"""
API Tests — Search & Filtering (FTS5 + BM25)

Tests for the search endpoint with text queries, state filters, date ranges,
porter stemming, HTML-stripped content, multi-word matching, and the reindex
admin endpoint.
"""
import pytest
from datetime import datetime


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_item(client, heading, state='TODO'):
    return client.post('/api/items', json={'heading': heading, 'state': state}).get_json()


def _make_entry(client, item_id, title='Entry', content=''):
    return client.post(
        f'/api/items/{item_id}/entries',
        json={'title': title, 'content': content}
    ).get_json()


# ===========================================================================
# TestSearchTextQuery — basic substring and case behaviour
# ===========================================================================

class TestSearchTextQuery:
    """GET /api/search?q=..."""

    def _seed(self, client):
        """Create a few items and entries for search testing."""
        # Item 1: "Bug Fix" with entry about database
        item1 = _make_item(client, 'Bug Fix')
        _make_entry(client, item1['id'], 'Day 1', '<p>Fixed the database connection issue</p>')

        # Item 2: "Feature Request" with entry about UI
        item2 = _make_item(client, 'Feature Request')
        _make_entry(client, item2['id'], 'Design notes', '<p>New UI for the dashboard</p>')

        # Item 3: "Database Migration" with no entries
        item3 = _make_item(client, 'Database Migration')

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
        res = client.get('/api/search?q=nonexistent+term+xyzzy')
        data = res.get_json()
        assert len(data) == 0

    def test_search_returns_filtered_entries(self, client):
        """When query matches entry content but not heading, only matching entries are returned."""
        self._seed(client)
        res = client.get('/api/search?q=connection')
        data = res.get_json()
        assert len(data) == 1
        assert len(data[0]['entries']) == 1

    def test_empty_query_returns_all(self, client):
        self._seed(client)
        res = client.get('/api/search?q=')
        data = res.get_json()
        assert len(data) == 3


# ===========================================================================
# TestSearchFTS — FTS5-specific behaviour (stemming, HTML stripping, etc.)
# ===========================================================================

class TestSearchFTS:
    """FTS5 porter stemmer, HTML stripping, multi-word all-words-match, BM25."""

    def test_stemming_matches_different_word_forms(self, client):
        """Porter stemmer: searching 'fix' should match 'Fixed', 'fixes', 'fixing'."""
        item = _make_item(client, 'Patch Work')
        _make_entry(client, item['id'], 'Notes', '<p>Fixed the broken login flow</p>')

        res = client.get('/api/search?q=fix')
        data = res.get_json()
        assert len(data) == 1, "Stemming should match 'Fixed' when querying 'fix'"

    def test_stemming_running_matches_run(self, client):
        """'running' and 'run' stem to the same root."""
        item = _make_item(client, 'Performance')
        _make_entry(client, item['id'], 'Perf notes', '<p>The process is running slowly</p>')

        res = client.get('/api/search?q=run')
        data = res.get_json()
        assert len(data) == 1

    def test_html_stripped_before_indexing(self, client):
        """Tags in TinyMCE content must not interfere with FTS matching."""
        item = _make_item(client, 'Rich Text Test')
        _make_entry(
            client, item['id'], 'Styled entry',
            '<p><strong>Important:</strong> <em>deadline</em> tomorrow</p>'
        )

        # 'deadline' is buried inside HTML — it must be found
        res = client.get('/api/search?q=deadline')
        data = res.get_json()
        assert len(data) == 1

    def test_multi_word_all_words_must_match(self, client):
        """Multi-word query requires ALL tokens to be present (FTS5 default)."""
        item1 = _make_item(client, 'Project Alpha')
        _make_entry(client, item1['id'], 'Notes', '<p>memory leak in authentication module</p>')

        item2 = _make_item(client, 'Project Beta')
        _make_entry(client, item2['id'], 'Notes', '<p>performance issue in rendering layer</p>')

        # Only item1 has both 'memory' and 'authentication'
        res = client.get('/api/search?q=memory+authentication')
        data = res.get_json()
        assert len(data) == 1
        assert data[0]['heading'] == 'Project Alpha'

    def test_results_include_relevance_score(self, client):
        """Each result in a text query includes a relevance_score field."""
        item = _make_item(client, 'Score Test')
        _make_entry(client, item['id'], 'Notes', '<p>database query optimisation</p>')

        res = client.get('/api/search?q=database')
        data = res.get_json()
        assert len(data) == 1
        assert 'relevance_score' in data[0]
        assert data[0]['relevance_score'] >= 1

    def test_heading_match_keeps_all_entries(self, client):
        """When the heading matches, all entries are included (not just matching ones)."""
        item = _make_item(client, 'Auth Refactor')
        _make_entry(client, item['id'], 'Day 1', '<p>unrelated content about cats</p>')
        _make_entry(client, item['id'], 'Day 2', '<p>also unrelated content about dogs</p>')

        # heading 'Auth Refactor' contains 'Auth' — all entries should be kept
        res = client.get('/api/search?q=Auth')
        data = res.get_json()
        assert len(data) == 1
        assert len(data[0]['entries']) == 2

    def test_fts_special_chars_do_not_crash(self, client):
        """FTS5 special characters in the query (*, :, (, )) must not cause a 500."""
        _make_item(client, 'Some item')
        for special_q in ['*', '(open', 'col:val', 'a OR b', '"phrase"']:
            res = client.get(f'/api/search?q={special_q}')
            assert res.status_code == 200

    def test_matched_terms_returned_for_stemmed_matches(self, client):
        """Entries include matched_terms showing the actual document words that matched."""
        item = _make_item(client, 'Patch Work')
        _make_entry(client, item['id'], 'Notes', '<p>Fixed the broken login flow</p>')

        # Searching 'fix' matches 'Fixed' via porter stemming
        res = client.get('/api/search?q=fix')
        data = res.get_json()
        assert len(data) == 1
        entry = data[0]['entries'][0]
        assert 'matched_terms' in entry
        # The matched term should be the original word from the document
        terms_lower = [t.lower() for t in entry['matched_terms']]
        assert 'fixed' in terms_lower or 'fix' in terms_lower

    def test_matched_terms_contains_all_query_tokens(self, client):
        """Multi-word query: matched_terms includes a word for each query token."""
        item = _make_item(client, 'Performance')
        _make_entry(client, item['id'], 'Notes', '<p>Optimized the database queries for speed</p>')

        res = client.get('/api/search?q=optimized+database')
        data = res.get_json()
        assert len(data) == 1
        entry = data[0]['entries'][0]
        assert 'matched_terms' in entry
        terms_lower = [t.lower() for t in entry['matched_terms']]
        # Both words should appear in matched_terms
        assert any('optim' in t for t in terms_lower)  # optimized/optimize stem
        assert 'database' in terms_lower or any('databas' in t for t in terms_lower)



# ===========================================================================
# TestSearchStateFilter
# ===========================================================================

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


# ===========================================================================
# TestSearchCombined
# ===========================================================================

class TestSearchCombined:
    """GET /api/search with multiple filters."""

    def test_text_and_state_combined(self, client):
        _make_item(client, 'Bug in Auth', 'TODO')
        _make_item(client, 'Bug in UI', 'DONE')

        # "Bug" matches both, but state=TODO filters to one
        res = client.get('/api/search?q=Bug&state=TODO')
        data = res.get_json()
        assert len(data) == 1
        assert data[0]['heading'] == 'Bug in Auth'

    def test_no_filters_returns_all(self, client):
        _make_item(client, 'A')
        _make_item(client, 'B')

        res = client.get('/api/search')
        data = res.get_json()
        assert len(data) == 2


# ===========================================================================
# TestAdminReindex
# ===========================================================================

class TestAdminReindex:
    """POST /api/admin/reindex"""

    def test_reindex_returns_ok(self, client):
        _make_item(client, 'Task One')
        _make_item(client, 'Task Two')

        res = client.post('/api/admin/reindex')
        assert res.status_code == 200
        data = res.get_json()
        assert data['status'] == 'ok'
        assert data['indexed_items'] == 2

    def test_reindex_rebuilds_index_so_search_still_works(self, client):
        item = _make_item(client, 'Deployment Pipeline')
        _make_entry(client, item['id'], 'Notes', '<p>container orchestration failure</p>')

        # Rebuild the index
        client.post('/api/admin/reindex')

        # Search should still find it
        res = client.get('/api/search?q=orchestration')
        data = res.get_json()
        assert len(data) == 1
        assert data[0]['heading'] == 'Deployment Pipeline'


# ===========================================================================
# TestHTMLStripper (unit-level)
# ===========================================================================

class TestStripHtml:
    """Unit tests for the strip_html utility."""

    def test_strips_basic_tags(self):
        from app import strip_html
        assert strip_html('<p>Hello world</p>') == 'Hello world'

    def test_strips_nested_tags(self):
        from app import strip_html
        assert strip_html('<p><strong>Bold</strong> and <em>italic</em></p>') == 'Bold and italic'

    def test_handles_empty_string(self):
        from app import strip_html
        assert strip_html('') == ''

    def test_handles_none(self):
        from app import strip_html
        assert strip_html(None) == ''

    def test_strips_table_html(self):
        from app import strip_html
        html = '<table><tr><td>cell one</td><td>cell two</td></tr></table>'
        text = strip_html(html)
        assert 'cell one' in text
        assert 'cell two' in text
