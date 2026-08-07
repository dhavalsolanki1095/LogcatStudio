# Logcat Studio

Professional offline tool for extracting, cleaning, formatting, validating, exploring, and comparing JSON from **Android Studio Logcat**.

Paste Logcat / OkHttp / Retrofit / Timber / Volley / Ktor output — get clean, searchable JSON instantly. No build step. No backend.

**Live demo:** [https://dhavalsolanki1095.github.io/LogcatStudio/](https://dhavalsolanki1095.github.io/LogcatStudio/)

**Repository:** [https://github.com/dhavalsolanki1095/LogcatStudio](https://github.com/dhavalsolanki1095/LogcatStudio)

## Quick start

1. Open the [live demo](https://dhavalsolanki1095.github.io/LogcatStudio/) or open `index.html` in a modern browser (Chrome, Edge, Firefox).
2. Paste Logcat output into the left pane (or open / drag & drop a `.logcat` / `.log` / `.txt` / `.json` file).
3. JSON is cleaned, validated, beautified, and shown in Raw / Tree views.

Opening `index.html` directly supports paste, open file, and drag-and-drop. A local static server is optional for convenience.

### Local server (optional)

```bash
# Python
python -m http.server 8080

# Node
npx serve .
```

Then open `http://localhost:8080`.

## Features

### Core
- **Smart Paste** — auto-detect and process Logcat / JSON
- **Logcat Cleaner** — strips timestamps, PID/TID, levels, tags, package names
- **JSON Extraction** — multiple blocks with switcher chips
- **API Calls** — extract OkHttp/Retrofit method, URL, headers, request/response body, status, duration
- **Beautify / Minify** — 2-space, 4-space, or tabs
- **Validation** — line / column error reporting
- **Repair** — trailing commas, single quotes, unquoted keys, comments, and more
- **Tree View** — expand/collapse, edit values, copy/duplicate nodes, JSONPath
- **Search** — keys/values, regex, case-sensitive, match highlighting
- **Copy / Download** — formatted, minified, `.json`, `.txt`

### Advanced
- **JSON Compare** — added / removed / changed
- **Statistics** — type counts, depth, size, lines
- **History** — last 10 pastes (localStorage)
- **Themes** — dark (default) / light
- **Receipt Preview** — when JSON contains `receipt_html` / `receipt` / `html` / `print_data`
- **Smart previews** — URLs, images, Base64 images, hex colors, UUIDs, Unix timestamps

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Process input |
| `Ctrl+Shift+F` | Beautify |
| `Ctrl+M` | Minify |
| `Ctrl+F` | Focus search |
| `Ctrl+O` | Open file |
| `Esc` | Close modal / menus |

## Project structure

```text
LogcatStudio/
├── index.html
├── README.md
├── .nojekyll
├── .gitignore
├── assets/
│   ├── icons/icon.svg
│   └── images/
├── css/
│   ├── style.css
│   └── theme.css
├── js/
│   ├── app.js
│   ├── parser.js
│   ├── formatter.js
│   ├── validator.js
│   ├── tree.js
│   ├── compare.js
│   ├── storage.js
│   ├── ui.js
│   ├── highlighter.js
│   └── utils.js
```

## GitHub Pages

This project is static and Pages-ready (includes `.nojekyll`).

1. Push the repo to GitHub.
2. Settings → Pages → Deploy from branch (`main` / root).
3. Open the published URL.

## Supported input

- Android Studio Logcat
- Android Studio `.logcat` JSON export
- Pretty / minified JSON
- OkHttp Logging Interceptor (request + response)
- Retrofit / Timber / Volley / Ktor logs
- HTTP request / response logs
- Mixed text with embedded JSON

## Privacy

Everything runs in your browser. Pastes and history stay in `localStorage` on your machine — nothing is uploaded.

## License

MIT — use freely for personal or commercial projects.
