import pytest
import unittest.mock as mock
from datetime import datetime, timezone
from cryptography.fernet import Fernet, InvalidToken

from backend.scripts.rotate_fernet_key import run_rotation, KeyRotationError

class MockAsyncCursor:
    def __init__(self, conn):
        self.conn = conn
        self.current_query = None
        self.current_params = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

    async def execute(self, query, params=None):
        self.conn.executed_commands.append((query, params))
        self.current_query = query
        self.current_params = params

        # Intercept and perform in-memory updates
        if "UPDATE items" in query:
            # params: (new_text, item_id, created_at)
            new_text, item_id, created_at = params
            for i, row in enumerate(self.conn.items_rows):
                if row[0] == item_id:
                    self.conn.items_rows[i] = (item_id, created_at, new_text)
        elif "UPDATE users" in query:
            # params: (new_token, u_id)
            new_token, u_id = params
            for i, row in enumerate(self.conn.users_rows):
                if row[0] == u_id:
                    self.conn.users_rows[i] = (u_id, new_token)

    async def fetchone(self):
        if "COUNT(*)" in self.current_query:
            if "items" in self.current_query:
                return (len(self.conn.items_rows),)
            elif "users" in self.current_query:
                return (len(self.conn.users_rows),)
        return (None,)

    async def fetchall(self):
        if "FROM items" in self.current_query:
            # Return list of (id, created_at, raw_text) or (id, raw_text)
            if "created_at" in self.current_query:
                return self.conn.items_rows
            else:
                return [(row[0], row[2]) for row in self.conn.items_rows]
        elif "FROM users" in self.current_query:
            return self.conn.users_rows
        return []

class MockAsyncConnection:
    def __init__(self, items_rows=None, users_rows=None):
        self.items_rows = items_rows if items_rows is not None else []
        self.users_rows = users_rows if users_rows is not None else []
        self.executed_commands = []
        self.is_closed = False

    async def execute(self, query, params=None):
        self.executed_commands.append((query, params))
        return None

    def cursor(self):
        return MockAsyncCursor(self)

    async def close(self):
        self.is_closed = True


@pytest.mark.anyio
async def test_key_rotation_invalid_fernet_keys():
    """Verify script aborts if keys are syntactically invalid."""
    with pytest.raises(KeyRotationError) as exc:
        await run_rotation("invalid-key-1", "invalid-key-2", True, False, "postgresql://localhost:5432/db")
    assert "not syntactically valid" in str(exc.value)


@pytest.mark.anyio
async def test_key_rotation_identical_keys():
    """Verify script aborts if old_key == new_key."""
    valid_key = Fernet.generate_key().decode()
    with pytest.raises(KeyRotationError) as exc:
        await run_rotation(valid_key, valid_key, True, False, "postgresql://localhost:5432/db")
    assert "cannot be the same" in str(exc.value)


@pytest.mark.anyio
async def test_key_rotation_production_safety():
    """Verify execution fails on production database without --force flag."""
    old_key = Fernet.generate_key().decode()
    new_key = Fernet.generate_key().decode()
    prod_url = "postgresql://prod-db.neon.tech/db?sslmode=require"

    with pytest.raises(KeyRotationError) as exc:
        await run_rotation(old_key, new_key, True, False, prod_url)
    assert "targets production" in str(exc.value) or "appears to target production" in str(exc.value)


@pytest.mark.anyio
async def test_key_rotation_rollback_on_decryption_failure():
    """Verify entire transaction is rolled back if decryption fails on any row."""
    old_key = Fernet.generate_key().decode()
    new_key = Fernet.generate_key().decode()
    
    # We encrypt a row with a third, unrelated key so decryption fails
    wrong_fernet = Fernet(Fernet.generate_key())
    ciphertext_wrong = wrong_fernet.encrypt(b"unreadable plaintext").decode()
    
    mock_conn = MockAsyncConnection(
        items_rows=[(1, datetime.now(timezone.utc), ciphertext_wrong)],
        users_rows=[]
    )

    with mock.patch("psycopg.AsyncConnection.connect", return_value=mock_conn):
        with pytest.raises(KeyRotationError) as exc:
            await run_rotation(old_key, new_key, False, False, "postgresql://localhost:5432/db")
        assert "Failed to decrypt" in str(exc.value)

    # Rollback must be called
    commands = [cmd[0] for cmd in mock_conn.executed_commands]
    assert "ROLLBACK;" in commands
    assert "COMMIT;" not in commands


@pytest.mark.anyio
async def test_key_rotation_dry_run():
    """Verify dry-run performs decryption and encryption, but explicitly rolls back."""
    old_key = Fernet.generate_key().decode()
    new_key = Fernet.generate_key().decode()

    old_fernet = Fernet(old_key.encode())
    plain_text = "secret diary entry"
    ciphertext = old_fernet.encrypt(plain_text.encode()).decode()

    mock_conn = MockAsyncConnection(
        items_rows=[(10, datetime.now(timezone.utc), ciphertext)],
        users_rows=[(5, old_fernet.encrypt(b"token123").decode())]
    )

    with mock.patch("psycopg.AsyncConnection.connect", return_value=mock_conn):
        n_items, m_users, was_dry_run = await run_rotation(old_key, new_key, True, False, "postgresql://localhost:5432/db")
        assert n_items == 1
        assert m_users == 1
        assert was_dry_run is True

    # Rollback must be called, and commit must not be called
    commands = [cmd[0] for cmd in mock_conn.executed_commands]
    assert "ROLLBACK;" in commands
    assert "COMMIT;" not in commands


@pytest.mark.anyio
async def test_key_rotation_success():
    """Verify successful key rotation commits and passes post-commit verification."""
    old_key = Fernet.generate_key().decode()
    new_key = Fernet.generate_key().decode()

    old_fernet = Fernet(old_key.encode())
    new_fernet = Fernet(new_key.encode())

    plain_item = "item plaintext"
    plain_token = "google token value"

    old_item_ciphertext = old_fernet.encrypt(plain_item.encode()).decode()
    old_token_ciphertext = old_fernet.encrypt(plain_token.encode()).decode()

    mock_conn = MockAsyncConnection(
        items_rows=[(100, datetime.now(timezone.utc), old_item_ciphertext)],
        users_rows=[(200, old_token_ciphertext)]
    )

    with mock.patch("psycopg.AsyncConnection.connect", return_value=mock_conn):
        n_items, m_users, was_dry_run = await run_rotation(old_key, new_key, False, False, "postgresql://localhost:5432/db")
        assert n_items == 1
        assert m_users == 1
        assert was_dry_run is False

    commands = [cmd[0] for cmd in mock_conn.executed_commands]
    assert "COMMIT;" in commands
    assert "ROLLBACK;" not in commands

    # Verify rows in mock connection got updated correctly
    new_item_ciphertext = mock_conn.items_rows[0][2]
    new_token_ciphertext = mock_conn.users_rows[0][1]

    # Verify they decrypt with new key
    assert new_fernet.decrypt(new_item_ciphertext.encode()).decode() == plain_item
    assert new_fernet.decrypt(new_token_ciphertext.encode()).decode() == plain_token

    # Verify they fail to decrypt with old key
    with pytest.raises(InvalidToken):
        old_fernet.decrypt(new_item_ciphertext.encode())
    with pytest.raises(InvalidToken):
        old_fernet.decrypt(new_token_ciphertext.encode())
