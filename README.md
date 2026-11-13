# Hack the Brewery — Node.js CTF

A local-first capture-the-flag workshop for the Hack the Brewery OT/IT lab. The app is a small Node.js server with a responsive participant site and a complete admin studio. It does not need Python, Docker, npm packages, or an internet connection to run.

## Run on Windows

Install Node.js 24 LTS or later for Windows ARM64 or x64, then double-click start.bat. The app opens at http://localhost:3000.

The launcher checks the Node version, waits for the workshop to be ready, and reuses a running instance of this same project folder. If another service or workshop occupies the port, it reports that conflict. It honors the PORT and HOST environment variables.

You can also open PowerShell in this folder and run:

    node server.mjs

Then browse to http://localhost:3000. On first start, the app imports the workshop Markdown from data/ and asks you to create the administrator account. Use a password with at least 12 characters.

## Offline use

After Node.js is installed, the app runs offline. There are no package downloads, build steps, external fonts, or remote services. The workshop data is stored in data/workshop.sqlite.

The first run imports the current brewery challenges, objectives, progressive hints, full lab guides, vendor pages, and reference pages from data/. After that, edit content in the Admin studio. The database is the live copy; edits to the original Markdown files do not overwrite the database.

## Participant experience

- Challenge board grouped by workshop section
- Hidden activities and prerequisite unlocks
- Text flags, regular-expression answers, multiple choice, and instructor review
- Sequential hints with configurable point costs
- Scoreboard, teams, submissions, answer cooldowns, and participant accounts
- Workshop pages for vendors, products, and reference material

## Admin studio

Sign in with the administrator account and open Admin studio.

- Challenges: edit title, objective, flag question, answer format guidance, category, points, ordering, visibility, accepted answer, answer type, prerequisites, cooldown, and any number of hints and costs. The question and format guidance appear directly above the participant's flag field and are included in workshop exports.
- Pages & vendors: edit the landing copy, vendor/product explanations, and other workshop pages
- Media library: upload, replace, copy paths for, and remove workshop images from the GUI
- Participants: create accounts, assign teams and roles, reset passwords, or remove accounts
- Submissions: review and approve or reject free-text responses
- Workshop settings: edit the event identity, colors, rules reminder, registration, cooldown, and scoreboard settings

The Export workshop pack button creates a portable JSON file containing workshop settings, challenges, flags, hints, and pages. Import that pack into another copy of the app to reuse it for a different workshop. Participant accounts and scores are kept separate from the pack. If your pages use images, copy the data/images folder to the other project too.

## Workshop database and backup

The local database contains workshop content, accounts, sessions, hint unlocks, and scores. Stop the server before copying data/workshop.sqlite for a full local backup. Keep this file private because it contains account and challenge data.

## Create a fresh workshop copy

1. Export the current content with **Admin studio → Workshop settings → Export workshop pack**.
2. In a new folder, copy `server.mjs`, `start.bat`, `public/`, `tools/start-local.mjs`, this README, and `data/images/`. Keep the same folder layout.
3. Start the new copy, create its own administrator account, and import the exported JSON from Workshop settings.

Start with an empty database in the new folder. Leave `data/workshop.sqlite`, its `-wal` and `-shm` sidecars, `data/backups/`, and `.data/` in the original workshop. Those files contain its participants, progress, backups, or local checks. Importing content into an existing database deliberately retains that database's accounts and scores.

When running both copies on this computer, give the new one a different port. In PowerShell, set `$env:PORT=3002` before running `./start.bat`.

The JSON pack includes content and hints; images still need the `data/images/` copy described above. Topology machines, phases, and routes are currently configured in `public/app.js`.

Edit console and configured PLC addresses in **Admin studio → Topology addresses**. Selecting a device on the topology shows its known addresses. The PLC's changed address and the Engineering Station address come from their challenge answers and appear only after those challenges are solved.

## Access from another lab computer

The default server listens only on this Windows computer (127.0.0.1). To make it reachable from a lab network, set the HOST environment variable to 0.0.0.0 before starting, choose a reachable port with PORT, and allow that port through Windows Firewall. Keep it on the isolated workshop network.

## Project files

- server.mjs — Node.js server, local database, sign-in, scoring, and content import
- public/ — participant site and Admin studio
- data/ — original workshop Markdown, hints, guides, product notes, and live SQLite database
- start.bat — Windows launcher
- tools/start-local.mjs — runtime check, workshop identification, and ready-state browser launch

The root `Dockerfile`, `docker-compose.yml`, `CTFd/`, and Python scripts are from the earlier CTFd implementation. Use `server.mjs` and `start.bat` for the current Node application.

See [the platform review](docs/PLATFORM_REVIEW.md) for implemented fixes and the next improvements for workshop reuse.

The app is designed for local testing first. It does not publish or push workshop data anywhere.

