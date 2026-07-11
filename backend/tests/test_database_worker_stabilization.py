import pytest
import asyncio
import os
import sys
import json
import time
from pathlib import Path
from unittest import mock
import psycopg

from backend.config import settings
from backend.db.connection import open_pool, close_pool, STARTUP_LOCK_ID
import backend.db.connection as db_conn

# 1. Enforce SelectorEventLoop policy on Windows for psycopg3 async compatibility
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# 2. Helper to load .env.local for database integration validation
def load_real_env():
    project_root = Path(__file__).resolve().parents[2]
    env_local_path = project_root / "backend" / ".env.local"
    if not env_local_path.exists():
        env_local_path = project_root / ".env.local"
    if env_local_path.exists():
        for line in env_local_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, val = line.split("=", 1)
                os.environ[key.strip()] = val.strip().strip('"').strip("'")

load_real_env()

# Apply the real DATABASE_URL if available
if "DATABASE_URL" in os.environ:
    settings.DATABASE_URL = os.environ["DATABASE_URL"]

# Helper to skip real DB tests if mock string is active
def is_mock_db():
    return "localhost:5432/db" in settings.DATABASE_URL or not settings.DATABASE_URL


@pytest.mark.anyio
async def test_migration_schema_equivalence():
    if is_mock_db():
        pytest.skip("Skipping real database migration equivalence test in mock environment.")
        
    db_url = settings.DATABASE_URL
    if "production" in db_url.lower() or "main" in db_url.lower():
        pytest.fail(f"Refusing test execution on production database: {db_url}")
        
    # Read schema.sql
    schema_path = Path(db_conn.__file__).parent / "schema.sql"
    schema_sql = schema_path.read_text(encoding="utf-8")
    
    # Read all migration files in alphabetical order
    migrations_dir = Path(db_conn.__file__).parent / "migrations"
    migration_files = sorted(migrations_dir.glob("*.sql"))
    
    extracted_sqls = []
    for m_path in migration_files:
        m_sql = m_path.read_text(encoding="utf-8")
        lines = []
        for line in m_sql.splitlines():
            if "-- migrate:down" in line:
                break
            if "-- migrate:up" in line:
                continue
            lines.append(line)
        extracted_sqls.append("\n".join(lines))
    extracted_migration_sql = "\n;\n".join(extracted_sqls)
    
    async with await psycopg.AsyncConnection.connect(db_url) as conn:
        # Create two isolated temporary schemas to verify equivalence
        await conn.execute("DROP SCHEMA IF EXISTS schema_legacy CASCADE;")
        await conn.execute("DROP SCHEMA IF EXISTS schema_migrated CASCADE;")
        await conn.execute("CREATE SCHEMA schema_legacy;")
        await conn.execute("CREATE SCHEMA schema_migrated;")
        await conn.commit()
        
        try:
            # 1. Apply schema.sql to legacy
            await conn.execute("SET search_path TO schema_legacy, public;")
            await conn.execute(schema_sql)
            await conn.commit()
            
            # 2. Apply extracted init_schema migration to migrated
            await conn.execute("SET search_path TO schema_migrated, public;")
            await conn.execute(extracted_migration_sql)
            await conn.commit()
            
            # 3. Query columns metadata and compare
            async def get_columns(schema):
                await conn.execute("SET search_path TO %s, public;" % schema)
                cur = await conn.execute(
                    "SELECT table_name, column_name, data_type, is_nullable "
                    "FROM information_schema.columns "
                    "WHERE table_schema = %s "
                    "ORDER BY table_name, column_name;",
                    (schema,)
                )
                return await cur.fetchall()
                
            cols_legacy = await get_columns("schema_legacy")
            cols_migrated = await get_columns("schema_migrated")
            assert cols_legacy == cols_migrated, "Columns mismatch between schema.sql and migrations."
            
            # 4. Query constraints metadata and compare
            async def get_constraints(schema):
                cur = await conn.execute(
                    "SELECT table_name, constraint_name, constraint_type "
                    "FROM information_schema.table_constraints "
                    "WHERE table_schema = %s "
                    "ORDER BY table_name, constraint_name;",
                    (schema,)
                )
                return await cur.fetchall()
                
            const_legacy = await get_constraints("schema_legacy")
            const_migrated = await get_constraints("schema_migrated")
            assert const_legacy == const_migrated, "Constraints mismatch between schema.sql and migrations."
            
            # 5. Query index metadata and compare
            async def get_indexes(schema):
                cur = await conn.execute(
                    "SELECT tablename, indexname, indexdef "
                    "FROM pg_indexes "
                    "WHERE schemaname = %s "
                    "ORDER BY tablename, indexname;",
                    (schema,)
                )
                rows = await cur.fetchall()
                normalized = []
                for tablename, indexname, indexdef in rows:
                    normalized.append((tablename, indexname, indexdef.replace(schema, "TARGET")))
                return normalized
                
            idx_legacy = await get_indexes("schema_legacy")
            idx_migrated = await get_indexes("schema_migrated")
            assert idx_legacy == idx_migrated, "Index definitions mismatch between schema.sql and migrations."
            
        finally:
            try:
                await conn.rollback()
            except Exception:
                pass
            await conn.execute("SET search_path TO public;")
            await conn.execute("DROP SCHEMA IF EXISTS schema_legacy CASCADE;")
            await conn.execute("DROP SCHEMA IF EXISTS schema_migrated CASCADE;")
            await conn.commit()


@pytest.mark.anyio
async def test_startup_concurrency_lock(monkeypatch):
    if is_mock_db():
        pytest.skip("Skipping startup concurrency lock test in mock environment.")
        
    db_url = settings.DATABASE_URL
    if "production" in db_url.lower() or "main" in db_url.lower():
        pytest.fail(f"Refusing test execution on production database: {db_url}")
        
    # Mock dynamic updates to track invocation count and timestamps
    ensure_called = []
    seed_called = []
    
    async def mock_ensure(conn):
        ensure_called.append(time.perf_counter())
        await asyncio.sleep(0.5)
        
    async def mock_seed(conn):
        seed_called.append(time.perf_counter())
        await asyncio.sleep(0.5)
        
    monkeypatch.setattr(db_conn, "ensure_partitions", mock_ensure)
    monkeypatch.setattr(db_conn, "seed_static_centroids", mock_seed)
    
    async def run_startup():
        await open_pool()
        await close_pool()
        
    tasks = [run_startup() for _ in range(5)]
    
    # Assert they serialize and exit within a reasonable 10s timeout
    await asyncio.wait_for(asyncio.gather(*tasks), timeout=10.0)
    
    assert len(ensure_called) == 5
    assert len(seed_called) == 5
    
    # Assert serial execution (diff >= 0.8s)
    ensure_called.sort()
    for i in range(1, len(ensure_called)):
        time_diff = ensure_called[i] - ensure_called[i - 1]
        assert time_diff >= 0.8, f"Concurrently starting tasks did not serialize! Diff: {time_diff}"


@pytest.mark.anyio
async def test_worker_semaphore_concurrency(monkeypatch):
    # Enqueue tasks in a mock Redis Client
    tasks_queue = [
        json.dumps({"chat_id": 12345, "update_id": 1000 + i, "text": "Task text"})
        for i in range(5)
    ]
    processing_queue = []
    
    class MockRedis:
        async def brpoplpush(self, source, dest, timeout):
            if tasks_queue:
                val = tasks_queue.pop(0)
                processing_queue.append(val)
                return val
            await asyncio.sleep(0.1)
            return None
            
        async def lrem(self, dest, count, val):
            if val in processing_queue:
                processing_queue.remove(val)
            return 1
            
        async def lrange(self, dest, start, stop):
            return []
            
    mock_redis = MockRedis()
    monkeypatch.setattr("backend.worker.redis", mock_redis)
    
    # Track active worker executions
    active_tasks = 0
    max_active_tasks = 0
    processed_count = 0
    
    async def mock_process_task(task, task_json, semaphore):
        nonlocal active_tasks, max_active_tasks, processed_count
        active_tasks += 1
        max_active_tasks = max(max_active_tasks, active_tasks)
        
        # Simulate processing duration
        await asyncio.sleep(0.2)
        
        active_tasks -= 1
        processed_count += 1
        semaphore.release()
        
    monkeypatch.setattr("backend.worker.process_task", mock_process_task)
    
    # Run the worker loop task in the background
    from backend.worker import start_worker_task
    worker_fut = asyncio.create_task(start_worker_task())
    
    # Wait until all 5 tasks are processed
    for _ in range(50):
        if processed_count == 5:
            break
        await asyncio.sleep(0.1)
        
    worker_fut.cancel()
    try:
        await worker_fut
    except asyncio.CancelledError:
        pass
        
    # Assertions
    assert processed_count == 5
    assert max_active_tasks == 3


@pytest.mark.anyio
async def test_worker_semaphore_leak_prevention(monkeypatch):
    # Capture Semaphore instances created during test run
    original_sem_class = asyncio.Semaphore
    captured_instances = []
    
    def mock_sem_class(*args, **kwargs):
        inst = original_sem_class(*args, **kwargs)
        captured_instances.append(inst)
        return inst
        
    monkeypatch.setattr(asyncio, "Semaphore", mock_sem_class)
    
    # Load invalid JSON tasks
    invalid_tasks = ["invalid-json-payload"]
    processing_queue = []
    
    class MockRedis:
        async def brpoplpush(self, source, dest, timeout):
            if invalid_tasks:
                val = invalid_tasks.pop(0)
                processing_queue.append(val)
                return val
            await asyncio.sleep(0.1)
            return None
            
        async def lrem(self, dest, count, val):
            if val in processing_queue:
                processing_queue.remove(val)
            return 1
            
        async def lrange(self, dest, start, stop):
            return []
            
    mock_redis = MockRedis()
    monkeypatch.setattr("backend.worker.redis", mock_redis)
    
    from backend.worker import start_worker_task
    worker_fut = asyncio.create_task(start_worker_task())
    await asyncio.sleep(0.5)
    worker_fut.cancel()
    try:
        await worker_fut
    except asyncio.CancelledError:
        pass
        
    # Assert that the semaphore value is still 3 (no slots leaked on json parsing error)
    assert len(captured_instances) > 0
    sem = captured_instances[0]
    assert sem._value == 3, f"Semaphore slot leaked on JSONDecodeError! Value: {sem._value}"
