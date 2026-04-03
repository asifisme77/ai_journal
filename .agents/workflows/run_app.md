---
description: Start the AI Journal Flask Application
---

To launch the local Flask development server for the AI Journal, run the following command. It will activate the proper `ai_journal` virtual environment natively in a separate shell background process.

1. Start the Flask Application
// turbo-all
2. `cmd /c "workon ai_journal && python app.py"`

## Development & Testing Workflow

### Launching the Application
- Always use the `workon ai_journal` command to activate the virtual environment.
- Run `python app.py` to start the development server at `http://127.0.0.1:5000`.

### Manual Testing
1. Open the application in a browser.
2. Perform UI actions like adding work items, entries, and markers.
3. Verify that changes are saved and persist after a page refresh.

### Automated Testing
- To run the test suite, ensure the virtual environment is active and run:
  `cmd /c "workon ai_journal && pytest"`
- Tests are located in the `tests/` directory and use a separate test database when `TEST_DATABASE_URI` is set.
