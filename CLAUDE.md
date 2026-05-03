# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Panda Assistant** is a dual-platform calendar event creation tool. Users provide text (e.g., an email or webpage snippet), Google Gemini AI extracts event details, and the event is created in Google Calendar. It ships as two separate products:

- **Chrome Extension** — captures selected text from any webpage via a popup
- **Mobile PWA** — standalone web app deployed to GitHub Pages, supports Android Share Target

## No Build System

This is vanilla JavaScript (ES6), HTML, and CSS with no bundler, transpiler, or package manager. There are no build, lint, or test commands. Edit files directly and load the extension or open the HTML file to test.

To load the Chrome extension locally: open `chrome://extensions`, enable Developer Mode, click "Load unpacked", and select the repo root.

The PWA deploys automatically via GitHub Actions (`.github/workflows/deploy-pwa.yml`) when any file under `mobile-pwa/` changes on the `main` branch.

## Architecture

### Chrome Extension (`/`)

- `manifest.json` — Manifest V3; declares OAuth2 config, permissions, and scripts
- `popup.html` / `popup.js` — Main extension UI and all business logic (~520 lines)
- `content.js` — Injected into active tabs; captures selected text via `mouseup` and relays it to the popup via `chrome.runtime.sendMessage()`
- `background.js` — Minimal service worker; handles context menu creation and message passing to the popup

### Mobile PWA (`mobile-pwa/`)

- `app.js` — Near-identical logic to `popup.js`, adapted for a standalone page (~510 lines)
- `service-worker.js` — Enables offline support and handles the Share Target API (so other Android apps can share text directly into the PWA)
- `manifest.json` — PWA manifest with Share Target registration

### Shared Data Flow

1. User provides text (selected in browser, pasted, or shared via Share Target)
2. User authenticates via Google OAuth 2.0
3. `getEventDetailsFromGemini()` sends the text to **Gemini 2.0 Flash** with a structured prompt; response is parsed JSON with event fields
4. Form is pre-populated for user review/edit
5. On submit, `createCalendarEvent()` calls **Google Calendar API v3** to create the event

### Credentials & Storage

- Two separate OAuth2 Client IDs: one for the extension, one for the PWA (see `manifest.json` in each)
- Gemini API key is user-supplied; stored in `chrome.storage.local` (extension) or `localStorage` (PWA)
- Google OAuth tokens are managed by Chrome's `chrome.identity` API (extension) or a manual OAuth popup flow (PWA)
