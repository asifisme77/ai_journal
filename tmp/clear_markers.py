import re
import os
import sys

# Add current directory to path so we can import app
sys.path.append(os.getcwd())

from app import app, db, Marker, JournalEntry

def clear_markers():
    with app.app_context():
        # 1. Delete all rows from the Marker table
        num_markers = Marker.query.count()
        Marker.query.delete()
        
        # 2. Strip marker-related tags from JournalEntry.content
        entries = JournalEntry.query.all()
        modified_count = 0
        
        # Regex to match <span class="marker...">...</span> and <span class="marker-bubble...">...</span>
        # We unwrap the marker spans (keep the text inside) but remove the bubble spans entirely.
        
        marker_pattern = re.compile(r'<span[^>]*class="marker[^"]*"[^>]*>(.*?)</span>', re.DOTALL)
        bubble_pattern = re.compile(r'<span[^>]*class="marker-bubble[^"]*"[^>]*>.*?</span>', re.DOTALL)
        
        for entry in entries:
            if not entry.content:
                continue
                
            original_content = entry.content
            
            # Remove bubbles
            content = bubble_pattern.sub('', entry.content)
            
            # Unwrap markers (keep the content)
            # Using sub with a function or backreference to keep the inner text
            content = marker_pattern.sub(r'\1', content)
            
            if content != original_content:
                entry.content = content
                modified_count += 1
        
        db.session.commit()
        print(f"Deleted {num_markers} markers from the database.")
        print(f"Stripped markers from {modified_count} journal entries.")

if __name__ == "__main__":
    clear_markers()
