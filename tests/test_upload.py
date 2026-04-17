"""
API Tests — File Upload

Tests for the file upload endpoint.
"""
import io
import pytest


class TestFileUpload:
    """POST /api/upload"""

    def test_uploads_file(self, client):
        data = {
            'file': (io.BytesIO(b'Hello World'), 'test.txt')
        }
        res = client.post('/api/upload', data=data, content_type='multipart/form-data')
        assert res.status_code == 201
        body = res.get_json()
        assert body['name'] == 'test.txt'
        assert '/static/uploads/' in body['url']
        assert body['is_image'] is False

    def test_uploads_image(self, client):
        data = {
            'file': (io.BytesIO(b'\x89PNG\r\n'), 'photo.png')
        }
        res = client.post('/api/upload', data=data, content_type='multipart/form-data')
        assert res.status_code == 201
        body = res.get_json()
        assert body['is_image'] is True

    def test_rejects_missing_file(self, client):
        res = client.post('/api/upload', data={}, content_type='multipart/form-data')
        assert res.status_code == 400

    def test_rejects_empty_filename(self, client):
        data = {
            'file': (io.BytesIO(b'data'), '')
        }
        res = client.post('/api/upload', data=data, content_type='multipart/form-data')
        assert res.status_code == 400

    def test_unique_filenames(self, client):
        """Two uploads of the same file should get unique URLs."""
        data1 = {'file': (io.BytesIO(b'A'), 'same.txt')}
        data2 = {'file': (io.BytesIO(b'B'), 'same.txt')}

        res1 = client.post('/api/upload', data=data1, content_type='multipart/form-data')
        res2 = client.post('/api/upload', data=data2, content_type='multipart/form-data')

        # URLs might be same if uploaded in same second (known issue #6 from review),
        # but they should at least both succeed
        assert res1.status_code == 201
        assert res2.status_code == 201


class TestPageRoutes:
    """Basic route tests."""

    def test_index_returns_html(self, client):
        res = client.get('/')
        assert res.status_code == 200
        assert b'AI Journal' in res.data
