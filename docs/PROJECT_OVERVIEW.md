# AI Journal Repository Facts

## Project Type
- Flask web application with SQLite database
- Single-page application with vanilla JavaScript frontend
- Rich text editing with TinyMCE
- Task management and journaling system

## Key Technologies
- Backend: Flask, SQLAlchemy, SQLite
- Frontend: JavaScript ES6+, HTML5, CSS3, TinyMCE
- Testing: pytest (backend) + Playwright (frontend E2E)
- Build: No build step required (direct Python execution)

## Database Models
- WorkItem: Tasks with states (TODO, WIP, MEMO, DONE)
- JournalEntry: Rich text entries under work items
- Marker: Highlighted text spans with optional reminders
- MemoFolder: Hierarchical organization for MEMO items

## Testing Approach
- Backend API tests: pytest with Flask test client
- Frontend E2E tests: Playwright for browser automation
- Table resizing tests: Mouse interaction simulation and DOM verification

## Frontend Features
- Collapsible timeline sidebar
- Inline TinyMCE editors
- Table column resizing (recently fixed with comprehensive tests)
- Autosave functionality
- Theme switching (light/dark)
- File upload and embedding