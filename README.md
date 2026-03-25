# AI Journal

A lightweight, high-density journaling and task management application designed for developers and power users. AI Journal combines high-level objective tracking with deep, rich-text daily logging, featuring a custom-built collapsible interface that maximizes screen real estate.

## Architecture

The project is built around a lightweight footprint, utilizing a standard Python backend and a vanilla JavaScript frontend SPA (Single Page Application) architecture.

### Backend Stack
* **Framework:** Flask (Python)
* **Database:** SQLite via SQLAlchemy ORM
* **Data Layer:** A localized `journal.db` tracking relational models.
* **API:** RESTful JSON endpoints manipulating models (`/api/items`, `/api/entries`)

### Frontend Stack
* **Language:** Vanilla JavaScript (ES6+), HTML5, Custom CSS3
* **Rich Text Editor:** TinyMCE (configured strictly in `inline` mode for seamless global layout integration rather than boxed iframes).
* **Icons:** Phosphor Icons

The frontend communicates seamlessly with the local backend via asynchronous `fetch` calls hooked tightly to DOM interactions. By skipping heavyweight frontend UI frameworks like React or Vue, the application ensures hyper-fast execution utilizing native ES6 template strings and direct DOM patching.

## Core Concepts & How It Works

### 1. Work Items (Top-Level Tasks)
At the highest structural level are your "Work Items", representing overarching workflows or features (e.g., "Refactor Database Mapping"). 
- Clicking an item's title allows you to dynamically natively edit it.
- Items carry operational state tracking (`TODO`, `WIP`, `DONE`). 
- When marked `DONE`, the task and all of its extensive history are immediately archived out of the main dashboard to keep your active workspace decluttered.

### 2. Journal Entries
Inside each Work Item, you can create infinite chronological "Journal Entries".
- **Global Toolbar:** Formatting functions are offloaded into a shared sticky toolbar at the top of the app. The moment an entry is clicked, the toolbar dynamically maps itself to that specific editor.
- **Robust Autosaving:** Entries feature a resilient intercept-optimized autosave engine. Stop typing for roughly 2 seconds, or click away out of the editor, and the specific node triggers an isolated database update in the background.

### 3. The Hierarchical Timeline
The left-hand sidebar features a native HTML collapsible timeline aggregating operations across all tasks.
- **Recursive Mapping:** The JavaScript engine intercepts all journal entries in the database, corrects UTC offsets into localized timestamps, and maps them mathematically into a recursive chronological tree: `Year > Month > Date`.
- **Color Coding:** Timeline nodes explicitly trace operational status: Blue (`TODO`), Orange (`WIP`), and Green (`DONE`).
- **Archival Rehydration:** If you click an entry on the timeline belonging to a historically `DONE` task, the interface sweeps through the archived history, intercepts the old task data, and dynamically rehydrates it in a specific reading-zone at the bottom of the dashboard.

## Setup & Running Locally

1. Create a virtual environment and install dependencies:
```bash
pip install -r requirements.txt
```
2. Run the internal Flask webserver:
```bash
python app.py
```
3. Open `http://127.0.0.1:5000` in your web browser. A local `journal.db` SQLite file will automatically establish itself in your root directory upon initialization alongside your tables.
