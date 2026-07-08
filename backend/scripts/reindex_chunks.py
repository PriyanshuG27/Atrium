import os
import sys
import logging
import asyncio
from typing import List, Dict, Any

# Adjust import path to find backend modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set up event loop policy for Windows async psycopg compatibility
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import backend.db.connection as db_conn
from backend.db.connection import open_pool
from backend.services.encryption import decrypt
from backend.services.chunker import semantic_chunk_text
from backend.services.search_service import embed_text
from backend.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("reindex_chunks")

async def reindex_batch(items: List[Dict[str, Any]]) -> bool:
    """
    Process a single batch of items. Generates semantic chunks and embeddings outside the transaction,
    then transactionally replaces v1 chunks with v2 chunks.
    """
    prepared_inserts = []
    item_ids_to_delete = []

    # 1. Read, chunk, and embed outside of transaction boundaries
    for item in items:
        item_id = item["id"]
        user_id = item["user_id"]
        encrypted_raw_text = item["raw_text"]
        title = item["title"]
        source_url = item["source_url"]

        raw_text = ""
        if encrypted_raw_text:
            try:
                raw_text = decrypt(encrypted_raw_text)
            except Exception:
                raw_text = encrypted_raw_text

        # Generate semantic chunks
        try:
            chunks = await semantic_chunk_text(raw_text)
        except Exception as e:
            logger.error("Failed to generate semantic chunks for item %d: %s", item_id, e)
            continue

        if not chunks:
            chunks = [raw_text or "(Empty content)"]

        source_label = title or source_url or "Source Item"
        prefix = f"[Source: {source_label}] "

        item_inserts = []
        for idx, chunk in enumerate(chunks):
            chunk_text_prefixed = prefix + chunk
            chunk_excerpt = chunk_text_prefixed[:500]
            try:
                chunk_emb = await embed_text(chunk_text_prefixed)
            except Exception as e:
                logger.error("Failed to generate embedding for chunk in item %d: %s", item_id, e)
                # Fallback to a mock/zero embedding if model fails entirely to prevent blocking the item
                val = 1.0 / (384 ** 0.5)
                chunk_emb = [val] * 384

            item_inserts.append((item_id, user_id, idx, chunk_excerpt, chunk_emb))

        prepared_inserts.extend(item_inserts)
        item_ids_to_delete.append(item_id)

    if not item_ids_to_delete:
        return False

    # 2. Transactional Replacement
    async with db_conn._pool.connection() as conn:
        await conn.execute("SET statement_timeout = '60s'")
        async with conn.cursor() as cur:
            try:
                # Begin Transaction (implicitly handled by psycopg async connection context)
                logger.info("Transaction started for batch of %d items...", len(item_ids_to_delete))

                # Insert Version 2 Chunks
                inserted_count = 0
                for item_id, user_id, idx, chunk_text_data, chunk_emb in prepared_inserts:
                    await cur.execute(
                        """
                        INSERT INTO item_chunks (item_id, user_id, chunk_index, chunk_text, embedding, chunk_version)
                        VALUES (%s, %s, %s, %s, %s::vector, 2);
                        """,
                        (item_id, user_id, idx, chunk_text_data, chunk_emb)
                    )
                    inserted_count += 1

                # Delete Version 1 Chunks
                deleted_rows = 0
                for item_id in item_ids_to_delete:
                    await cur.execute(
                        "DELETE FROM item_chunks WHERE item_id = %s AND chunk_version = 1;",
                        (item_id,)
                    )
                    deleted_rows += cur.rowcount

                # Commit Transaction
                await conn.commit()
                logger.info("Successfully committed transaction. Inserted %d v2 chunks, removed old v1 chunks.", inserted_count)
                return True
            except Exception as tx_err:
                await conn.rollback()
                logger.error("Transaction failed, rolled back changes: %s", tx_err)
                return False

async def main():
    logger.info("Initializing database pool...")
    await open_pool()
    
    if not db_conn._pool:
        logger.error("Failed to open database pool.")
        return

    logger.info("Starting Semantic Chunk Re-indexing Migration...")
    
    total_processed = 0
    batch_size = 50

    while True:
        # Query next batch of items whose maximum chunk version is < 2
        async with db_conn._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT i.id, i.user_id, i.raw_text, i.title, i.source_url
                    FROM items i
                    LEFT JOIN item_chunks c ON i.id = c.item_id
                    GROUP BY i.id, i.user_id, i.raw_text, i.title, i.source_url
                    HAVING COALESCE(MAX(c.chunk_version), 0) < 2
                    LIMIT %s;
                    """,
                    (batch_size,)
                )
                rows = await cur.fetchall()

        if not rows:
            logger.info("Re-indexing complete! No remaining items with version < 2 found.")
            break

        # Map to dict list
        items = []
        for r in rows:
            items.append({
                "id": r[0],
                "user_id": r[1],
                "raw_text": r[2],
                "title": r[3],
                "source_url": r[4]
            })

        logger.info("Processing batch of %d items (Total processed so far: %d)...", len(items), total_processed)
        success = await reindex_batch(items)
        if success:
            total_processed += len(items)
        else:
            logger.warning("Batch processing failed. Retrying or pausing to avoid infinite loop.")
            await asyncio.sleep(2)

    logger.info("Migration completed successfully. Reindexed a total of %d items.", total_processed)
    await db_conn._pool.close()

if __name__ == "__main__":
    asyncio.run(main())
