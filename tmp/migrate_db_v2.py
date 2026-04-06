import sqlite3
import os

db_path = 'journal.db'

if os.path.exists(db_path):
    print(f"Connecting to {db_path}...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # 1. Add the parent_id column to memo_folder
        print("Adding parent_id to memo_folder table...")
        cursor.execute('ALTER TABLE memo_folder ADD COLUMN parent_id INTEGER REFERENCES memo_folder(id) ON DELETE CASCADE')
        print("Column added successfully.")
    except sqlite3.OperationalError as e:
        if 'duplicate column name' in str(e).lower():
            print("Column parent_id already exists.")
        else:
            print(f"Error adding column: {e}")
    
    conn.commit()
    conn.close()
    print("Migration complete.")
else:
    print(f"Database {db_path} not found.")
