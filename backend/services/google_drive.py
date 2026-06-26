import logging
import httpx
from datetime import datetime
from backend.config import settings
from backend.services.encryption import decrypt

logger = logging.getLogger(__name__)

async def run_google_drive_sync(user_id: int) -> None:
    """
    Background task to sync all items of a user to Google Drive as a unified markdown file.
    """
    logger.info("Starting Google Drive sync for user %d", user_id)
    import backend.db.connection as db_conn
    if db_conn._pool is None:
        logger.error("DB connection pool is not initialized")
        return

    try:
        # 1. Fetch user refresh token and items
        async with db_conn._pool.connection() as conn:
            async with conn.cursor() as cur:
                # Fetch token
                await cur.execute(
                    "SELECT google_refresh_token FROM users WHERE id = %s;",
                    (user_id,)
                )
                user_row = await cur.fetchone()
                if not user_row or not user_row[0]:
                    logger.warning("No Google refresh token found for user %d", user_id)
                    return
                
                encrypted_token = user_row[0]
                
                # Fetch items
                await cur.execute(
                    """
                    SELECT source_type, title, summary, raw_text, created_at 
                    FROM items 
                    WHERE user_id = %s 
                    ORDER BY created_at DESC;
                    """,
                    (user_id,)
                )
                items = await cur.fetchall()

        # Decrypt refresh token
        refresh_token = decrypt(encrypted_token)

        # 2. Build Markdown content
        date_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        md_lines = [
            "# Recall Backup",
            f"Generated on {date_str} (UTC)",
            f"Total items: {len(items)}",
            "",
            "This document is a unified backup of all your saved items in Recall.",
            "---",
            ""
        ]

        for item in items:
            source_type, title, summary, raw_text, created_at = item
            title = title or "Untitled Item"
            created_str = created_at.strftime("%Y-%m-%d %H:%M:%S") if created_at else "Unknown Date"
            
            md_lines.append(f"## {title}")
            md_lines.append(f"- **Source Type**: {source_type.upper()}")
            md_lines.append(f"- **Saved At**: {created_str}")
            if summary:
                md_lines.append(f"- **Summary**: {summary}")
            md_lines.append("")
            if raw_text:
                try:
                    decrypted_text = decrypt(raw_text)
                except Exception as dec_err:
                    logger.error("Failed to decrypt raw_text for item: %s", dec_err)
                    decrypted_text = "[Decryption Failed]"
                # Truncate raw text if it's exceptionally long to keep the doc clean
                text_to_show = decrypted_text[:5000] + "\n...(truncated for backup clarity)" if len(decrypted_text) > 5000 else decrypted_text
                md_lines.append("### Content")
                md_lines.append(text_to_show)
                md_lines.append("")
            md_lines.append("---")
            md_lines.append("")

        markdown_content = "\n".join(md_lines)

        # 3. Exchange refresh token for access token
        async with httpx.AsyncClient(timeout=15.0) as client:
            token_resp = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                }
            )
            token_resp.raise_for_status()
            access_token = token_resp.json().get("access_token")
            if not access_token:
                logger.error("Failed to get access token for user %d", user_id)
                return

            headers = {"Authorization": f"Bearer {access_token}"}

            # 4. Search for existing "Recall" folder
            folder_resp = await client.get(
                "https://www.googleapis.com/drive/v3/files",
                params={
                    "q": "name = 'Recall' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
                    "spaces": "drive",
                    "fields": "files(id)"
                },
                headers=headers
            )
            folder_resp.raise_for_status()
            folders = folder_resp.json().get("files", [])
            
            folder_id = None
            if folders:
                folder_id = folders[0]["id"]
                logger.info("Found existing Recall folder with ID %s", folder_id)
            else:
                logger.info("Creating new Recall folder")
                create_folder_resp = await client.post(
                    "https://www.googleapis.com/drive/v3/files",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "name": "Recall",
                        "mimeType": "application/vnd.google-apps.folder"
                    }
                )
                create_folder_resp.raise_for_status()
                folder_id = create_folder_resp.json().get("id")
                logger.info("Created new Recall folder with ID %s", folder_id)

            if not folder_id:
                logger.error("No folder ID available")
                return

            # 5. Search for existing "Recall Backup.md" file in user's Recall folder
            files_resp = await client.get(
                "https://www.googleapis.com/drive/v3/files",
                params={
                    "q": f"name = 'Recall Backup.md' and '{folder_id}' in parents and trashed = false",
                    "spaces": "drive",
                    "fields": "files(id, name)"
                },
                headers=headers
            )
            files_resp.raise_for_status()
            files = files_resp.json().get("files", [])
            
            file_id = None
            if files:
                file_id = files[0]["id"]
                logger.info("Found existing Recall Backup.md with ID %s, updating content", file_id)
            else:
                # 6. File does not exist, create it with parent folder metadata
                logger.info("Creating new Recall Backup.md file")
                create_resp = await client.post(
                    "https://www.googleapis.com/drive/v3/files",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "name": "Recall Backup.md",
                        "mimeType": "text/markdown",
                        "parents": [folder_id]
                    }
                )
                create_resp.raise_for_status()
                file_id = create_resp.json().get("id")
                logger.info("Created new file with ID %s", file_id)

            if not file_id:
                logger.error("No file ID available for upload")
                return

            # 6. Upload/Overwrite the media content using simple upload
            upload_resp = await client.patch(
                f"https://www.googleapis.com/upload/drive/v3/files/{file_id}?uploadType=media",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "text/markdown"
                },
                content=markdown_content
            )
            upload_resp.raise_for_status()
            
            # Update user's last sync time in database
            async with db_conn._pool.connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        """
                        UPDATE users
                        SET google_last_sync = CURRENT_TIMESTAMP
                        WHERE id = %s;
                        """,
                        (user_id,)
                    )
                    await conn.commit()
                    
            logger.info("Google Drive sync completed successfully for user %d", user_id)

    except httpx.HTTPStatusError as e:
        logger.error("Google Drive sync HTTP error (status %d): %s", e.response.status_code, e.response.text)
        logger.error("Google Drive sync failed for user %d: %s", user_id, str(e), exc_info=True)
    except Exception as e:
        logger.error("Google Drive sync failed for user %d: %s", user_id, str(e), exc_info=True)
