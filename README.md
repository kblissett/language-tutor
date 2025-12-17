# Spanish Tutor HTML Tool

A self-contained, single-file Spanish conversation partner and language coach.

## Features

- **Natural Conversation**: Practice Spanish with an AI that adapts to your level.
- **Real-time Corrections**: Get instant feedback on grammar, spelling, and phrasing.
- **Privacy First**: Your OpenAI API key is stored locally in your browser and never sent anywhere else.
- **No Setup Required**: No build steps, no dependencies, just a single HTML file.

## How to Use

1. Open `index.html` in any modern web browser.
2. Click the settings icon (cog) in the top right.
3. Enter your OpenAI API key.
4. Start typing in Spanish!

## Technical Details

This tool is built as a "Single-File HTML Tool". It combines HTML, CSS, and Vanilla JavaScript into one file for maximum portability and simplicity. It uses direct browser `fetch` calls to the OpenAI API with SSE for streaming responses.