# AI Journal Project Setup Steps

## Quick Start
1. Activate virtual environment: `workon ai_journal`
2. Install dependencies: `pip install -r requirements.txt`
3. Run application: `python app.py`
4. Access at: http://localhost:5000

## Command Execution
- Use `cmd /s` for executing commands in terminals
- Virtual environment: `workon ai_journal`

## Key Technical Details
- **Framework**: Flask (Python)
- **Database**: SQLite (journal.db auto-created)
- **Frontend**: Vanilla JavaScript + TinyMCE editor
- **Testing**: pytest with `python -m pytest`

## Environment Variables
- `TEST_DATABASE_URI`: Override for testing (optional)

## File Structure
- `app.py`: Main Flask app with API routes
- `requirements.txt`: Python dependencies
- `static/`: CSS, JS, uploads
- `templates/index.html`: SPA template
- `tests/`: Test suite

## Development Notes
- Database tables auto-create on first run
- Debug mode enabled by default
- SQLite persists data between runs
- CSRF protection on API routes