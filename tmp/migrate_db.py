import sqlite3
import os

db_path = 'journal.db'

if os.path.exists(db_path):
    print(f"Connecting to {db_path}...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # 1. Add the memo_folder_id column to work_item
        print("Adding memo_folder_id to work_item table...")
        cursor.execute('ALTER TABLE work_item ADD COLUMN memo_folder_id INTEGER REFERENCES memo_folder(id)')
        print("Column added successfully.")
    except sqlite3.OperationalError as e:
        if 'duplicate column name' in str(e).lower():
            print("Column memo_folder_id already exists.")
        else:
            print(f"Error adding column: {e}")
    
    conn.commit()
    conn.close()
    print("Migration complete.")
else:
    print(f"Database {db_path} not found. db.create_all() will handle it on next run.")
