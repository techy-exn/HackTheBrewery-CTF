# G6 – Root/infra diffs + `data/` content loader (NSK-CTF vs CTFd 3.7.7)

Scope: root files, Docker/compose/nginx, requirements, migrations, the new `CTFd/utils/content/__init__.py` loader (+ CLI commands and `/images/` route that depend on it), the `data/` authoring conventions, and Netskope-specific defaults to rebrand.
Upstream reference fetched from `raw.githubusercontent.com/CTFd/CTFd/3.7.7/…` and diffed.

---

## 1. Root / infrastructure

### 1.1 Unchanged vs upstream (byte-identical)
`docker-entrypoint.sh`, `export.py`, `import.py`, `manage.py`, `ping.py`, `serve.py`, `wsgi.py`,
`migrations/env.py`, `migrations/script.py.mako`, `migrations/alembic.ini`.
(`manage.py` is still the plain `FlaskGroup(app)` – all new commands live in `CTFd/cli/__init__.py`.)

### 1.2 Removed from root vs upstream
Upstream dev/CI files are absent: `tests/`, `scripts/`, `.github/`, `development.txt`, `linting.txt`, `setup.cfg`, `.isort.cfg`, `.flaskenv`, `.gitignore`, `.prettierignore`, `.codecov.yml`, `babel.cfg`, `populate.py`, `package.json`, `CHANGELOG.md`, `LICENSE`, `SECURITY.md`. Added: `commands.md` (operator cheat-sheet), `data/`, `ztna-workshop/` (older content set), `infrastructure/` (checklist xlsx, automation, instructor notes).

### 1.3 `.gitattributes`
Upstream: `*.sh text eol=lf`. NSK: `* text=auto` (LF normalisation for all text). **Risk:** drops the explicit LF rule for `docker-entrypoint.sh`; on a Windows checkout with `core.autocrlf=true` the entrypoint can get CRLF and fail with `/bin/bash^M`. Keep upstream's line in the new project.

### 1.4 `Dockerfile`
Only change: a new first stage builds the student theme with npm and its output overwrites the committed static assets.
```dockerfile
FROM node:20-bookworm-slim AS theme
WORKDIR /theme
COPY CTFd/themes/core-beta/package.json CTFd/themes/core-beta/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY CTFd/themes/core-beta/ ./
RUN npm run build
...
COPY --chown=1001:1001 . /opt/CTFd
COPY --chown=1001:1001 --from=theme /theme/static /opt/CTFd/CTFd/themes/core-beta/static
```
Notes: requires `package-lock.json` (npm, not upstream yarn) in core-beta. Admin theme is **not** rebuilt in Docker (only via `make theme-admin`) – its committed `static/` must be up to date. Build needs internet for `npm ci`.

### 1.5 `.dockerignore` (rewritten)
Upstream list replaced by a commented list: `**/node_modules`, `**/.vite`, yarn/npm logs, `.data`, `*.db`, `*.sqlite*`, `.ctfd_secret_key`, `CTFd/uploads/*`, `CTFd/logs/*`, `__pycache__`, `*.py[cod]`, pytest/ruff caches, `.venv`, `venv`, `.DS_Store`, `Thumbs.db`, `.idea`, `.vscode`, `.git`, `.gitignore`, `.gitattributes`, `_preview`, `_render_*.html`, `*.tgz`.
Dropped vs upstream: `CTFd/static/uploads`, `.codecov.yml`, `.dockerignore`, `.github`, `.prettierignore`, `.travis.yml`.
**Gap:** `data/`, `infrastructure/` (instructor notes, xlsx incl. `~$` lock file), `ztna-workshop/` and `README.md` are **baked into the image**. `data/` is then shadowed by the compose bind-mount, but instructor material still ships inside the image. For the new project add `infrastructure/`, `*.xlsx`, `~$*` (and optionally `data/`) to `.dockerignore`.

### 1.6 `docker-compose.yml`
| Item | Upstream 3.7.7 | NSK |
|---|---|---|
| header | none | `# Netskope ZTNA Workshop - deployment` + usage comments |
| app service name | `ctfd` | **`app`** (all docs/Makefile use `docker compose exec app …`) |
| `user: root` | yes | removed (runs as uid 1001 from Dockerfile) |
| `ports: 8000:8000` | exposed | **removed** – only nginx :80 published |
| `SECRET_KEY` | not set | `SECRET_KEY=${SECRET_KEY:-}` (empty unless set in shell/.env) |
| other env | – | identical (UPLOAD_FOLDER, DATABASE_URL `ctfd:ctfd@db/ctfd`, REDIS_URL, WORKERS=1, LOG_FOLDER, ACCESS_LOG, ERROR_LOG, REVERSE_PROXY=true) |
| volumes | bind mounts `.data/CTFd/logs`, `.data/CTFd/uploads`, **`.:/opt/CTFd:ro`** | named volumes `uploads`, `logs`; **`./data:/opt/CTFd/data:ro`**; source tree no longer mounted (code is baked into the image → every code/theme change needs `--build`) |
| depends_on | `db` | `db: condition: service_healthy` |
| nginx | `nginx:stable`, conf rw, no networks key | `nginx:stable-alpine`, conf `:ro`, `"80:80"`, `depends_on: app`, `networks: default` |
| db | mariadb:10.11, creds `ctfd/ctfd`, bind `.data/mysql` | same image/creds; named volume `mysql`; command reformatted; **healthcheck** `healthcheck.sh --connect --innodb_initialized` (10s/5s/12 retries/30s start) |
| cache | `redis:4`, bind `.data/redis` | **`redis:7-alpine`**, named volume `redis` |
| top-level `volumes:` | – | `uploads`, `logs`, `mysql`, `redis` |

Notes: empty `SECRET_KEY` → CTFd writes `.ctfd_secret_key` inside the container filesystem (not a volume) → sessions are invalidated on every image rebuild/recreate. Set a real `SECRET_KEY` in the new project. For Hack the Brewery the published port must change to **81** (`"81:80"`) to match ctf.exn.be:81.

### 1.7 `conf/nginx/http.conf`
Single change: `server ctfd:8000;` → `server app:8000;` (follows the service rename). Everything else identical (4 workers, SSE `/events` block, `client_max_body_size 4G`).

### 1.8 `Makefile` (rewritten)
Upstream targets `lint`, `format`, `test`, `coverage`, `translations-*` removed. New `.PHONY` targets:
`help`, `up` (`docker compose up -d`), `down`, `logs` (`docker compose logs -f app`), `rebuild` (`up -d --build`), `theme` (`cd CTFd/themes/core-beta && npm install && npm run build`), `theme-admin` (same for admin theme), `reload-content` (`docker compose exec app python manage.py sync-content`); `serve`, `shell` kept. Header comment "Netskope ZTNA Workshop".

### 1.9 `requirements.in` / `requirements.txt`
| Package | Upstream | NSK |
|---|---|---|
| `pybluemonday` | 0.0.14 | **removed** |
| `nh3` | – | **0.3.0 added** (used by `CTFd/utils/security/sanitize.py`: `import nh3`, `from nh3 import Cleaner`, `nh3.ALLOWED_ATTRIBUTES/ALLOWED_TAGS`) |
| `requests` | 2.32.3 | **2.32.4** |
All other pins identical. `requirements.txt` was hand-edited to match (header still says pip-compile; `cffi` "via pybluemonday" comment may be stale). No YAML library added – the loader parses front matter itself.

### 1.10 `migrations/`
`env.py`, `script.py.mako`, `alembic.ini`, `1_2_0_upgrade_2_0_0.py` unchanged. All 21 upstream revisions present; chain is linear ending at upstream head `a49ad66aa0f1`, plus two new revisions:

```
a49ad66aa0f1 (upstream head: add title to hint)
  └─ n5001workshop  add challenges.order_id  INTEGER NULL server_default '0' + index ix_challenges_order_id
                    then: UPDATE challenges SET order_id = id WHERE order_id IS NULL
       └─ n5002workshop  add challenges.cooldown INTEGER NULL server_default '0'
```
Models: `Challenges.order_id = db.Column(db.Integer, default=0, index=True)`, `Challenges.cooldown = db.Column(db.Integer, default=0)`.
Bug: because the column is added with `server_default '0'`, existing rows get 0, so the "seed order_id = id" UPDATE never matches anything (harmless, but the comment is wrong).
Migration impact for importing a stock CTFd export: the export's `alembic_version` will be `a49ad66aa0f1` (3.7.7). CTFd's import runs `upgrade()` after loading, so the two extra columns are added and filled with 0. Exports from this fork carry `order_id`/`cooldown` columns and `n5002workshop` and will **not** import into stock CTFd.

---

## 2. `CTFd/utils/content/__init__.py` – the `data/` loader (new, 792 lines)

### 2.1 Content root
`get_content_dir()` → `app.config["CONTENT_FOLDER"]` if set (note: **not** wired to an env var in `config.py`/`config.ini`; only settable programmatically), else `<project root>/data` (= `/opt/CTFd/data` in Docker, bind-mounted read-only). `get_images_dir()` = `<content>/images`.

### 2.2 Discovery (`discover_content`)
- `os.walk` over the content dir. Directories skipped at **any depth**: `images`, `files`, any dir whose lowercase name is `hints`, any dot-dir. (`drawings/` is walked but contains no .md.)
- Files imported: `*.md`, `*.markdown`, `*.html`; dot-files skipped. Read as UTF-8 with `errors="replace"`.
- Items sorted by `(order, title)` ascending (only affects processing order; display order is `order_id DESC`).

### 2.3 Kind / naming rules (`parse_content_file`)
- **Page** if the file is at the top level of `data/` (no folder) **or** front matter `page: true`. Otherwise **challenge**.
- `title` = front matter `title`, else file stem minus numeric prefix (`"1.2 SCIM.md"` → `SCIM`).
- `category` = front matter `category`, else folder name minus numeric prefix (`"3. NG-SWG"` → `NG-SWG`), else `General`. Nested folders give `category = "X/sub"` (prefix stripped only from the first segment).
- Numeric prefix regex: `^\s*(\d+(?:\.\d+)*)[.)]?\s*(.*)$` – accepts `1.`, `1)`, `1.2`, `1.2.3`.
- Page slug (route) = stem minus prefix, lower-cased, non-alnum → `-` (`"0. Welcome"` → `welcome`). Top-level `Home.md`/`Index.md` → route **`index`** (landing page). Slug `template` is reserved and skipped (applies to challenges too: a challenge file named `Template.md` is skipped).

### 2.4 Order (`order_id`)
- Computed: `major*1000 + minor` from the **file** prefix (only first two components; `3.2.1` → 3002); if the file has no prefix, the **folder** prefix is used; else 0. Front matter `order:` overrides.
- UI sorts `order_id DESC` (`CTFd/utils/challenges/__init__.py`, `api/v1/challenges.py`), i.e. **highest first**. The computed default therefore shows later sections on top (8.4 above 1.0). The NSK content works around this by setting explicit, descending `order:` on every challenge: `0.1`=10900, `0.2`=10800, `1.0`=10500 … `8.4`=3500, `Feedback`=100 (i.e. `(11 - section)*1000 - step*100` roughly). Carry this convention over (or invert the computation).

### 2.5 Front-matter parser (`parse_front_matter`) – exact behaviour
- Block must start the file: `\A\s*---\s*\n(.*?)\n---\s*\n` (DOTALL). The closing `---` **must be followed by a newline**; a UTF-8 **BOM** breaks detection (tested: both return `{}` and the whole text becomes body).
- Lines: `key: value` where key matches `^[A-Za-z_][A-Za-z0-9_-]*` at column 0 (indented keys ignored); key lower-cased, `-`→`_`. Full-line `#` comments ignored.
- `key:` with empty value (or only a comment) starts a list; following `- item` lines (any indent) append. Nested maps/multi-line strings unsupported.
- Inline comments: ` #…` (hash preceded by whitespace) stripped; quoted values keep everything inside the quotes.
- Value coercion (`_coerce`): `true/yes/on/1` → `True`, `false/no/off/0` → `False`, `-?\d+` → int, `"…"`/`'…'` → unquoted string, else string. Applies to list items too.

### 2.6 Front-matter keys (complete) and defaults
| Key | Default | Effect |
|---|---|---|
| `title` | stem without numeric prefix | Challenge name (= **identity key**) / page title |
| `category` | folder name without prefix, else `General` | |
| `value` | `100` (`int()`, non-numeric aborts the whole sync) | Points – **only applied on creation** |
| `order` | computed (2.4) | `order_id` |
| `state` | `visible` | Only applied on creation |
| `page` | false (true for top-level files) | Publish as page |
| `flag` | trailing-text flag (2.7) | Flag content |
| `flag_type` | `choice` if `choices` present, else `static` | `static` / `regex` / `choice` / `manual` |
| `case_insensitive` | **true** | Flag `data="case_insensitive"` for static/regex |
| `requires_approval` | – | `true` forces `flag_type: manual` (false does nothing) |
| `choices` | `[]` | List → stored in `challenges.connection_info` as `"choices:" + "\n".join(items)` |
| `answer` | falls back to `flag`/trailing text | For `choice`: accepted choice(s), `|`-separated |
| `multiple` | false | Choice flag `data="multiple"` → all `|` answers must be selected (set compare; submission comma-separated) |
| `cooldown` | `30` for choice, `0` otherwise | Seconds after a wrong answer; `max(0,int())` |
| `requires` (alias `requirements`) | none | Challenge name or list → `requirements={"prerequisites":[ids],"anonymize":…}` |
| `requires_anonymize` | false | Locked tile shown as "???" |
| `next` | none | Challenge name → `next_id` |
| `hint` | – | One hint file path |
| `hint_cost` | hint file `cost`, else `10` | Cost for the `hint:` entry only |
| `hint_title` | hint file `title`, else hint stem w/o prefix | Title for the `hint:` entry only |
| `hints` | – | List of `file | cost | title` (cost/title optional) |
Hint-file front matter: `title`, `cost`. Page front matter: effectively `title` (+ `page`).

### 2.7 Flags
- **Trailing flag** (`extract_trailing_flag`): only if no `flag:` key and not a page. Takes the text after the **last** `</div>`; drops blank lines and lines that are a single HTML tag; joins remaining lines with a space. Rejected (kept as body) if > 120 chars or contains `<`. On success that text is removed from the description and `</div>` re-appended. Body gets `.strip()`-ed.
- Flag type resolution: `flag_type` key → `requires_approval: true` overrides to `manual` → default `choice` if `choices` else `static`. For `choice`, content = `answer` (fallback flag).
- Flag classes (`CTFd/plugins/flags/__init__.py`): `static` (exact, constant-time, optional case-insensitive – **no `|` alternatives**), `regex` (`re.match` and full-match check, `IGNORECASE` if case-insensitive), new `choice` (`|`-separated accepted values, case/whitespace-insensitive; single answer must be one of them; with `multiple` the set must match exactly), new `manual` (`requires_review=True`, any non-empty answer → Pending queue).
- `_sync_flag` keeps **one** flag per challenge: updates the first `Flags` row (type/content/data) or creates it; additional flags created in the admin UI are left untouched. No flag key and no trailing text → nothing written and **no warning** (challenge is unsolvable unless manual).
- Flag `data`: choice → `"multiple"`/`""`; manual → `""`; static/regex → `"case_insensitive"`/`""`.

### 2.8 Hints
- Sources: `hint:` (+`hint_cost`, `hint_title`) and/or `hints:` list entries `path | cost | title`.
- Path resolution order (extension `.md` optional): `<challenge dir>/ref`, `<challenge dir>/hints/ref`, `data/ref`, `data/hints/ref`; anything resolving outside `data/` is refused. Missing file → warning, skipped.
- Cost precedence: entry cost → hint file `cost` → 10; non-numeric → warning + 10. Title precedence: entry title → hint file `title` → stem without prefix; truncated to 80 chars. Content = hint body with image rewriting.
- Sync (`_sync_hints`): if neither `hint` nor `hints` key exists → existing hints untouched (admin-made hints survive). Otherwise hints are matched **positionally** to existing `Hints` ordered by id, updated in place (so unlocks survive), extra rows created (`type="standard"`), surplus rows **deleted** (their unlocks go with them via FK cascade). `hints:` with no items deletes all hints.

### 2.9 `requires` / `next` linking (`_link_challenges`, second pass after flush)
Names matched **case-insensitively** against all challenges in DB (including non-file ones). Unknown name → warning; self-reference → warning. If the file has no `requires`, any existing `requirements` on that challenge are **cleared**; same for `next_id`. This pass runs even with `--no-overwrite`.

### 2.10 Image path rewriting (`rewrite_image_urls`) – challenges, pages and hints
```python
re.sub(r"/files/[0-9a-fA-F]{8,}/([^)\s\"'>]+)", r"/images/\1", body)      # CTFd upload URLs
re.sub(r"(\]\(|src=[\"'])(?:\.\./|\./)*images/", r"\1/images/", body)    # relative ](images/..) and src="../images/.."
```
So `/files/<md5>/user_portal.jpg` → `/images/user_portal.jpg` (any sub-path after the hash is kept, e.g. `/images/sub/pic.png`). Not rewritten: `href="images/…"`, unquoted `src=images/…`, reference-style links, CSS `url(images/…)`. For a migrated CTFd export: copy the export's `uploads/<hash>/<file>` into `data/images/<file>` (flat), filenames must be unique.

### 2.11 `/images/<path>` route (`CTFd/views.py`)
`@views.route("/images/<path:path>")` → `safe_join(get_images_dir(), path)`, 404 if missing, `send_file(conditional=True)`, `Cache-Control: public, max-age=86400`. **No authentication or CTF-time check** (public, like theme assets), and it is whitelisted in `needs_setup` (`CTFd/utils/initialization/__init__.py`) so it works before setup.

### 2.12 Database sync (`sync_content(root, app, prune=False, overwrite=True)`)
- Pages (`_sync_page`): lookup by `route`; create with `draft=False, hidden=False, auth_required=False`; on overwrite update only `title` + `content`. Pages are never pruned.
- Challenges (`_sync_challenge`): lookup by **exact `name`**. New → `type="standard"`, value, state, description, category. Existing + `overwrite=False` → skipped entirely. Existing + overwrite → description, category, `order_id`, `cooldown`, choices (`connection_info`), flag, hints updated; **value and state never updated after creation**.
- `prune=True`: deletes **every** challenge whose name is not in this run's file set (including admin-made or imported challenges and files skipped as `template`); explicitly deletes Flags/Hints; solves/submissions/unlocks go via FK cascade.
- Commits once; then clears `clear_challenges()`, `clear_pages()`, `clear_standings()` caches (errors swallowed).
- Returns summary: `challenges_created/updated`, `pages_created/updated`, `skipped`, `pruned`, `links`, `hints`, `warnings`.

### 2.13 CLI (`CTFd/cli/__init__.py`, run as `docker compose exec app python manage.py …`)
- `sync-content [--prune] [--no-overwrite]` – prints the summary and warnings.
- `list-content` – dry run; prints `ORDER KIND CATEGORY TITLE FLAG(type) LINKS` (requires, next, hints with costs, warnings).
- `create-students COUNT [--password Netskope1!] [--start 1] [--prefix Student]` – creates users `<prefix><n>` with email `<name lower>@workshop.local`, `verified=True`; skips if name or email exists; prints the password. Users only – no teams (team mode would need extra work).
- Also changed vs upstream: `jsenums` build command and `current_app` import removed (`BUILD_COMMANDS = {}` → `manage.py build x` now crashes with `NoneType not callable`).

### 2.14 Related front-end behaviour (outside this module, for context)
- `api/v1/challenges.py` decodes `connection_info` choices, exposes `choices`, `multiple_choice`, `multi_select`, `cooldown`, `cooldown_remaining`, `awaiting_review`, and enforces the cooldown at attempt time.
- `index.html`: if the `index` page has content it is rendered with every `<!-- buttons -->` marker replaced by Start/Sign-in buttons; if empty, a built-in hero is shown. `setup` creates an empty `index` page (upstream inserts a default banner page).

### 2.15 Bugs / edge cases found (verified by running the parser)
1. **Coercion of flags/choices**: `flag: 007` → `7`; `answer: No` / `choices: - Yes - No` → booleans → stored and shown as `True`/`False`. Any flag that is `yes/no/on/off/true/false/0/1` or numeric with leading zeros must be **quoted**.
2. Inline-comment stripping eats regex flags containing ` #` (`flag: a #b` → `a`). Quote such values.
3. Front matter ignored if file starts with a BOM or the closing `---` is the last line without newline.
4. Trailing-flag heuristic: any short closing sentence after the last `</div>` (e.g. "Thanks for playing!") becomes the flag and is removed from the description when no `flag:` key exists.
5. Challenge identity = title. Renaming → duplicate challenge; `--prune` then deletes the old one with its solves. Duplicate titles across files silently overwrite each other.
6. `--prune` deletes all non-file challenges – dangerous after importing a CTFd export. Never prune on a DB that contains imported challenges not represented in `data/`.
7. `--no-overwrite` still rewrites/clears `requirements` and `next_id` for every file-backed challenge.
8. Removing `choices` from an existing challenge leaves stale `connection_info` (only cleared on creation) → UI may still render options.
9. `value`/`state` changes in files never propagate to existing challenges (documented as intended, but surprising).
10. No validation that `answer` is one of `choices`; choice text containing commas breaks multi-select comparison (submission split on `,`).
11. Only one flag synced per challenge; static flags do not support `|` alternatives (use `regex` with `(a|b)`).
12. Order uses only two prefix levels; minor ≥ 1000 collides; default direction is reversed relative to the numbering.
13. Non-integer `value`/`order`/`cooldown` raise and abort the whole sync (atomic, but no friendly error).
14. `CONTENT_FOLDER` is not configurable via env/config.ini.
15. Migration `n5001workshop` seeding UPDATE is a no-op (server_default 0).
16. Challenges with no flag get no warning.

---

## 3. `data/` conventions (from `/tmp/nsk/NSK-CTF-main/data`)

Tree: `0. Introduction/` … `8. NPA/`, `10. Feedback/`, top-level pages `Home.md` (→ `/` index), `Credentials.md` (→ `/credentials`), `Inventory.md` (→ `/inventory`), `topology.md` (→ `/topology`), `hints/` (56 files incl. `TEMPLATE.md`, two per challenge: `<n.m> <Name> Tip.md` and `… Walkthrough.md`), `images/` (png/jpg), `drawings/` (`.drawio`, ignored).
Front-matter keys actually used: `order` (37), `next` (36), `flag` (35), `requires` (35), `value` (27), `hints` (26), `case_insensitive` (25), `flag_type: regex` (13), `choices`/`answer` (1: 8.2), `requires_approval` (1: Feedback, `value: 0`, `order: 100`). Objective files (`n.0 Objective n.md`) are gate challenges whose flag is a "secret key shown on the presentation" (e.g. `flag: 1983`), `requires` the last challenge of the previous section, and are `requires`d by the section's first challenge.
Pages have no front matter (only `Home.md` has `title: Home`) and are raw HTML/`<style>` blocks using `--ns-*` CSS variables.

### 3.1 Example challenge (`data/3. NG-SWG/3.2 Custom Category.md`, abridged)
```markdown
---
order: 8700
value: 300
flag: block-gambling-[0-9]+
flag_type: regex
case_insensitive: true
requires: URL Lookup
next: User Alert
hints:
  - hints/3.2 Custom Category Tip.md | 45 | Tip 1 - Where to look
  - hints/3.2 Custom Category Walkthrough.md | 135 | Hint 2 - Step by step
---

<br>

**Category:** SWG &middot; **Difficulty:** … &middot; **Points:** 300 &middot; **Estimated time:** …

<div class="defender-container">
    <div class="defender-label">OBJECTIVE</div>
    <p>…</p>
</div>
### Scenario / ### Concept in 30 seconds / ### Your mission / **Documentation**
---
<div class="challenge-container">
    <div class="challenge-label">CHALLENGE</div>
    <!-- CHALLENGE-->

Find the event for your blocked visit to `www.unibet.be` in Netskope. Which **policy** blocked it?

</div>
```
Multiple-choice example (8.2): `choices:` list of 4 strings + `answer: Steering for private apps is not enabled` (cooldown defaults to 30 s).
Hint costs follow `Tip = 15% of value`, `Walkthrough = 45% of value` (100 → 15/45; 300 → 45/135).

### 3.2 Example hint (`data/hints/3.1 URL Lookup Tip.md`, verbatim)
```markdown
---
title: Tip 1 - Where to look
cost: 15
---

**What you are aiming for:** the category of two websites, read from Netskope itself.

1. **Netskope One:** `Skope IT > Tools > URL Lookup`.
1. Enter **one** domain or URL at a time.
1. Read the **category table**: it says whether each category is *predefined* (Netskope's) or *custom* (yours).
```
(The challenge's `| 15 | Tip 1 …` entry overrides the file values.)

### 3.3 `Home.md`
Front matter `title: Home`; a big HTML comment with authoring tips; a `<style>` block (`.ns-journey`, `.ns-hero`, `.ns-section`, uses `--ns-orange`, `--ns-navy`, `--ns-radius`, `--ns-shadow`, `--ns-font-heading`); `<section>` blocks; `<!-- buttons -->` markers (2x) replaced by login/register buttons by `index.html`. Rules from the file: no blank lines inside HTML blocks (Markdown resumes and indented lines become code); images via `/images/<file>`. Admin edits to page `index` are overwritten by the next `sync-content`.

---

## 4. Netskope-specific defaults to rebrand

| Where | Value | Suggested for Hack the Brewery |
|---|---|---|
| `CTFd/cli/__init__.py` `create-students --password` | `Netskope1!` | e.g. `Brewery1!` |
| `CTFd/cli/__init__.py` email | `<name>@workshop.local` | keep or `@brewery.local` |
| `CTFd/cli/__init__.py` prefix | `Student` | `Team`/`Brewer` as needed |
| `commands.md` | `Netskope1!`, `ReadyForAnything!`, Student1..30 | update |
| `docker-compose.yml` header | "Netskope ZTNA Workshop" | rename |
| `docker-compose.yml` nginx port | `"80:80"` | **`"81:80"`** (ctf.exn.be:81) |
| `docker-compose.yml` DB creds | `ctfd/ctfd` (root `ctfd`) | change for real deployments |
| `docker-compose.yml` `SECRET_KEY` | empty | set |
| `Makefile` header | "Netskope ZTNA Workshop" | rename |
| `README.md` | title, `netskope-ctfd-main`, "Netskope One palette", `ns-*` fonts/colours, examples (`Netskope Any App`, `ZTNA-\d+$`) | rewrite |
| `CTFd/utils/content/__init__.py` docstring | `1.1 Netskope Any App.md` example | cosmetic |
| `data/**` | all content, `Home.md` hero text ("Cloud Defenders"), CSS vars `--ns-*` (#ff8300 orange, #081a59 navy), `.fos-page` styles with `#fa582d` | replace with migrated content |
| theme | `ns-*` class names (`ns-hero`, `ns-btn-hero`), `workshop.css` | rebrand (other report) |
| `CTFd/utils/social/__init__.py` | `ns-Bold` font reference | rebrand |
| `.dockerignore` / image | ships `infrastructure/`, `ztna-workshop/` | exclude |
