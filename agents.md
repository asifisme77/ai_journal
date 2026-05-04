# AI Journal Project - Agents Context

This file contains important information and context for AI agents working on the `ai_journal` project.

## How to Run and Test the Project

The project is a Flask application with a Python backend and a Vanilla JS/HTML/CSS frontend. It uses a virtual environment managed via `workon`. Since the user's OS is Windows, we must use Windows-compatible commands (like `cmd /c`) to ensure the virtual environment is activated before running tests or the app.

### Activating the Environment and Running Tests

To run pytest (such as when adding new playwright tests for the frontend editor), use the `cmd /c` prefix and `workon` to activate the `ai_journal` environment in the same shell execution:

```powershell
# Run a specific test
cmd /c "workon ai_journal && pytest tests/test_table_pre_escape.py"

# Run all tests with verbose output
cmd /c "workon ai_journal && pytest -v"
```

### Starting the Application

There is a workflow available for starting the application: `/run_app` (`c:\\Users\\asifa\\OneDrive\\Documents\\Projects\\Python\\ai_journal\\.agents\\workflows\\run_app.md`).
To run it manually:

```powershell
cmd /c "workon ai_journal && python app.py"
```

## Important Development Details

- **Frontend Editor**: The project uses TinyMCE for rich text editing. Configuration and custom event listeners (like keydown handlers, auto-save, and outliner tools) are located in `static/js/app.js`.
- **Database**: SQLite is used for persistent storage, with SQLAlchemy as the ORM.
- **Testing**: We use `pytest` and `playwright` for end-to-end testing of the web application. When writing tests that interact with TinyMCE, use `page.evaluate()` to run JS within the editor context to set or verify content, and use `force=True` on `locator.click()` to avoid click interception by overlapping UI elements.
- **Features**: Features include document ingestion, LLM integrations (for processing text), interactive timeline sidebar, and journal entry editing.
