# AI Journal Application Overview

You are an expert full-stack developer working on the **AI Journal**, a web application built for seamless, categorized daily journaling.

## Application Architecture

The application is built on a lightweight, modern tech stack:
*   **Backend Framework:** Flask (Python)
*   **Database:** SQLite using SQLAlchemy ORM
*   **Frontend UI:** Vanilla HTML, CSS, and Javascript
*   **Rich Text Editor:** TinyMCE (via CDN, version 6.8.3)
*   **Icons:** Phosphor Icons (via CDN)

### Data Models & Relationships

The database (`journal.db`) consists of two primary models utilizing a one-to-many relationship:

1.  **WorkItem:** The top-level entity representing a project, epic, or general category of work.
    *   `id`: Integer (Primary Key)
    *   `heading`: String (Required, title of the work item)
    *   `state`: String (Enum-like string: 'TODO', 'WIP', 'DONE')
    *   `created_at`: DateTime (Defaults to current UTC time)
    *   `entries`: SQLAlchemy relationship bridging to JournalEntry models (Cascade deletes are enabled).

2.  **JournalEntry:** The nested children belonging to a specific WorkItem representing daily progress.
    *   `id`: Integer (Primary Key)
    *   `work_item_id`: Integer (Foreign Key to WorkItem)
    *   `title`: String (Required, defaults to the human-readable date of creation)
    *   `content`: Text (Optional, stores raw HTML output from the TinyMCE editor)
    *   `created_at`: DateTime (Defaults to current UTC time)

### Backend API Structure ([app.py](file:///c:/Users/asifa/OneDrive/Documents/Projects/Python/ai_journal/app.py))

The Flask backend serves the main HTML template and provides a RESTful JSON API:

*   `GET /`: Serves [index.html](file:///c:/Users/asifa/OneDrive/Documents/Projects/Python/ai_journal/templates/index.html).
*   `GET /api/items`: Returns all WorkItems (and their nested JournalEntries via the [to_dict](file:///c:/Users/asifa/OneDrive/Documents/Projects/Python/ai_journal/app.py#23-31) serialization method) ordered descending by creation date.
*   `POST /api/items`: Creates a new WorkItem. Requires a `heading`.
*   `PUT /api/items/<id>`: Updates a WorkItem's `heading` or `state`.
*   `DELETE /api/items/<id>`: Safely deletes a WorkItem and cascade deletes its associated Journal Entries.
*   `POST /api/items/<id>/entries`: Creates a new JournalEntry under a specific WorkItem. Accepts an optional `title` and `content`.
*   `PUT /api/entries/<id>`: Updates a JournalEntry's `title` or `content` (HTML string).
*   `DELETE /api/entries/<id>`: Deletes a specific JournalEntry.

### Frontend Logic ([static/js/app.js](file:///c:/Users/asifa/OneDrive/Documents/Projects/Python/ai_journal/static/js/app.js))

The client side is entirely driven by Vanilla JS and the Fetch API, emphasizing a Single Page Application (SPA) feel without heavy frameworks.

*   **Initialization:** On load, [fetchItems()](file:///c:/Users/asifa/OneDrive/Documents/Projects/Python/ai_journal/static/js/app.js#38-55) grabs the entire nested JSON state and dynamically builds the DOM.
*   **Work Item Rendering:** Work Items are rendered as collapsible panels. The state (TODO/WIP/DONE) is controlled via a `<select>` dropdown that immediately triggers a `PUT` request and updates its own color-coding class upon success.
*   **Journal Entry Rendering:** Inside a Work Item, clicking "Add New Entry" triggers a POST request. The response returns the new Journal Entry which is then injected into the DOM.
*   **TinyMCE Integration:** For every rendered Journal Entry, a new `tinymce` instance is initialized. 
    *   The toolbar is customized to include basic formatting, lists, indents, tables, links, and a custom `collapsible` log block button.
    *   The Tab key is overridden to execute native Indent/Outdent commands, matching toolbar behavior and preserving state.
    *   A custom `collapsible` button allows inserting `<details>` blocks for code/logs, dynamically calculating and applying the current line's margin and list depth to perfectly respect visual structure.
    *   Auto-save is implemented to periodically save the editor's content.
*   **Saving Content:** Instead of forms, saving a Journal Entry explicitly calls the API with the editor's HTML and PUTs it to the server.

### UI / UX Aesthetics ([static/css/style.css](file:///c:/Users/asifa/OneDrive/Documents/Projects/Python/ai_journal/static/css/style.css))

The app prioritizes a premium, modern aesthetic:
*   **Dark Mode:** The base theme is dark (`#0d1117`) with subtle colored gradients in the background.
*   **Glassmorphism:** Panels utilize translucent backgrounds with `backdrop-filter: blur(12px)`.
*   **Interactions:** Micro-animations (CSS animated grid expansions, hover states, and smooth slide-ins) are used heavily.
*   **Theme Integration:** The default TinyMCE `oxide-dark` theme is used, with its UI overridden to be transparent (`.tox-tinymce`, `.tox-toolbar`), status bars hidden, and SVG icons restyled so the editor seamlessly blends into the dark, compact, glassmorphic design. 

## Your Task

When interacting with this codebase, you should adhere to the established Vanilla JS structure, utilize the existing CSS variables for styling, and ensure any data model changes handle SQLAlchemy migrations / recreations appropriately. Priority should always be given to maintaining the fast, SPA-like feel and the high-fidelity dark mode aesthetic.
