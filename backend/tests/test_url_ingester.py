import pytest
import unittest.mock as mock
from backend.services.url_ingester import ingest_url, scrape_url

class MockCursor:
    def __init__(self):
        self.executed = []
        
    async def __aenter__(self):
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass
        
    async def execute(self, query, params=None):
        self.executed.append((query, params))
        
    async def fetchone(self):
        return (201,)

class MockConnection:
    def __init__(self):
        self.cursor_inst = MockCursor()
        
    def cursor(self):
        return self.cursor_inst
        
    async def commit(self):
        pass

@pytest.fixture
def mock_deps(monkeypatch):
    mock_cascade = mock.MagicMock()
    mock_cascade.summarise = mock.AsyncMock(return_value={"summary": "Mock summary", "tags": ["url", "test"], "context_prompt": "Mock question?"})
    monkeypatch.setattr("backend.services.url_ingester.AICascade", lambda: mock_cascade)
    monkeypatch.setattr("backend.services.url_ingester.embed_text", mock.AsyncMock(return_value=[0.1]*384))
    monkeypatch.setattr("backend.services.url_ingester.encrypt", lambda x: "encrypted_" + x)
    return mock_cascade

@pytest.mark.asyncio
async def test_scrape_url_success(monkeypatch):
    mock_resp = mock.Mock()
    mock_resp.status_code = 200
    mock_resp.text = "<html><head><title>Test Title</title></head><body><p>Hello World</p></body></html>"
    
    async def mock_get(*args, **kwargs):
        return mock_resp
        
    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)
    title, text = await scrape_url("https://example.com")
    assert title == "Test Title"
    assert "Hello World" in text

@pytest.mark.asyncio
async def test_scrape_url_failure(monkeypatch):
    mock_resp = mock.Mock()
    mock_resp.status_code = 404
    
    async def mock_get(*args, **kwargs):
        return mock_resp
        
    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)
    title, text = await scrape_url("https://example.com")
    assert title == "https://example.com"
    assert text == "https://example.com"

@pytest.mark.asyncio
async def test_ingest_url_success(monkeypatch, mock_deps):
    mock_resp = mock.Mock()
    mock_resp.status_code = 200
    mock_resp.text = "<html><head><title>Success Title</title></head><body><p>Clean text</p></body></html>"
    
    async def mock_get(*args, **kwargs):
        return mock_resp
        
    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)
    
    conn = MockConnection()
    item_id = await ingest_url("https://example.com", user_id=4, db=conn)
    assert item_id == 201
    
    # Verify execute calls
    executed = conn.cursor_inst.executed
    assert len(executed) == 1
    query, params = executed[0]
    assert "INSERT INTO items" in query
    assert params[0] == 4
    assert params[1] == "https://example.com"
    assert params[3] == "Mock summary"
    assert params[4] == "Success Title"
    assert params[6] == ["url", "test"]
    assert params[7] == "Mock question?"

@pytest.mark.asyncio
async def test_ingest_url_fallback(monkeypatch, mock_deps):
    mock_resp = mock.Mock()
    mock_resp.status_code = 403
    
    async def mock_get(*args, **kwargs):
        return mock_resp
        
    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)
    
    mock_embed = mock.AsyncMock(return_value=[0.5]*384)
    monkeypatch.setattr("backend.services.url_ingester.embed_text", mock_embed)
    
    conn = MockConnection()
    item_id = await ingest_url("https://example.com/blocked", user_id=4, db=conn)
    assert item_id == 201
    
    # Verify embed_text was called with the summary + title fallback string
    mock_embed.assert_called_with("https://example.com/blocked\nMock summary")

@pytest.mark.asyncio
async def test_scrape_url_private_google_drive(monkeypatch):
    mock_resp = mock.Mock()
    mock_resp.status_code = 200
    mock_resp.url = "https://accounts.google.com/v3/signin/identifier?..."
    mock_resp.text = "Sign in - Google Accounts"
    
    async def mock_get(*args, **kwargs):
        return mock_resp
        
    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)
    
    with pytest.raises(ValueError) as exc_info:
        await scrape_url("https://drive.google.com/file/d/12345/view")
        
    assert "private Google Drive link" in str(exc_info.value)


@pytest.mark.asyncio
async def test_scrape_url_public_google_doc(monkeypatch):
    mock_title_resp = mock.Mock()
    mock_title_resp.status_code = 200
    mock_title_resp.text = "<html><head><title>Project Brain v2 - Google Docs</title></head><body></body></html>"
    
    mock_export_resp = mock.Mock()
    mock_export_resp.status_code = 200
    mock_export_resp.text = "\ufeffThis is the Google Doc content plain text."
    
    calls = []
    async def mock_get(self, url, *args, **kwargs):
        calls.append(url)
        if "export?format=txt" in url:
            return mock_export_resp
        return mock_title_resp
        
    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)
    
    title, text = await scrape_url("https://docs.google.com/document/d/18viTGbbuzt7ojoSCyMtxr26VhcU_F9L_/edit")
    
    assert title == "Project Brain v2"
    assert text == "This is the Google Doc content plain text."
    assert any("export?format=txt" in c for c in calls)


@pytest.mark.asyncio
async def test_scrape_url_private_google_doc_authenticated(monkeypatch):
    class MockDocCursor:
        async def __aenter__(self): return self
        async def __aexit__(self, exc_type, exc_val, exc_tb): pass
        async def execute(self, query, params=None): pass
        async def fetchone(self):
            return ("encrypted_fake_refresh_token",)
            
    class MockDocConnection:
        def cursor(self): return MockDocCursor()
        
    monkeypatch.setattr("backend.services.encryption.decrypt", lambda x: "fake_refresh_token")
    
    mock_token_resp = mock.Mock()
    mock_token_resp.status_code = 200
    mock_token_resp.json = mock.Mock(return_value={"access_token": "fake_access_token"})
    
    mock_meta_resp = mock.Mock()
    mock_meta_resp.status_code = 200
    mock_meta_resp.json = mock.Mock(return_value={"name": "Authored Doc", "mimeType": "application/vnd.google-apps.document"})
    
    mock_export_resp = mock.Mock()
    mock_export_resp.status_code = 200
    mock_export_resp.text = "This is authenticated doc content."
    
    async def mock_post(self_client, url, *args, **kwargs):
        return mock_token_resp
        
    async def mock_get(self_client, url, *args, **kwargs):
        if "export" in url:
            return mock_export_resp
        return mock_meta_resp
        
    monkeypatch.setattr("httpx.AsyncClient.post", mock_post)
    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)
    
    title, text = await scrape_url(
        "https://drive.google.com/file/d/doc_file_id/view",
        user_id=4,
        db=MockDocConnection()
    )
    assert title == "Authored Doc"
    assert text == "This is authenticated doc content."


@pytest.mark.asyncio
async def test_scrape_url_private_google_spreadsheet_authenticated(monkeypatch):
    class MockDocCursor:
        async def __aenter__(self): return self
        async def __aexit__(self, exc_type, exc_val, exc_tb): pass
        async def execute(self, query, params=None): pass
        async def fetchone(self):
            return ("encrypted_fake_refresh_token",)
            
    class MockDocConnection:
        def cursor(self): return MockDocCursor()
        
    monkeypatch.setattr("backend.services.encryption.decrypt", lambda x: "fake_refresh_token")
    
    mock_token_resp = mock.Mock()
    mock_token_resp.status_code = 200
    mock_token_resp.json = mock.Mock(return_value={"access_token": "fake_access_token"})
    
    mock_meta_resp = mock.Mock()
    mock_meta_resp.status_code = 200
    mock_meta_resp.json = mock.Mock(return_value={"name": "Authored Sheet", "mimeType": "application/vnd.google-apps.spreadsheet"})
    
    mock_export_resp = mock.Mock()
    mock_export_resp.status_code = 200
    mock_export_resp.text = "row1,row2,row3"
    
    async def mock_post(self_client, url, *args, **kwargs):
        return mock_token_resp
        
    async def mock_get(self_client, url, *args, **kwargs):
        if "export" in url:
            return mock_export_resp
        return mock_meta_resp
        
    monkeypatch.setattr("httpx.AsyncClient.post", mock_post)
    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)
    
    title, text = await scrape_url(
        "https://drive.google.com/file/d/doc_file_id/view",
        user_id=4,
        db=MockDocConnection()
    )
    assert title == "Authored Sheet"
    assert text == "row1,row2,row3"

