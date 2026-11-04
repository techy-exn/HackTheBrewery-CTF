# Hack the Brewery

Exclusive Networks' hands-on **OT/IT red and blue team workshop** platform. Participants
attack a brewery from IT down to the PLC, then defend it with Fortinet, Nozomi Networks
and EDR (SentinelOne, Palo Alto Cortex XDR or FortiEDR). They work through ordered
activities, submit answers, and are scored automatically or after proctor approval.

Built on CTFd 3.7.7 with the workshop features of the NSK-CTF fork (content from Markdown,
locked/ordered activities, multiple choice, review queue, answer cooldown). See
`docs/NSK_CHANGES.md` for every change against stock CTFd. Deployment is Docker Compose only.

---

## Table of contents

- [Quick start](#quick-start)
- [Branding: colours and fonts](#branding-colours-and-fonts)
- [Authoring challenges](#authoring-challenges)
  - [Folder layout](#folder-layout)
  - [Ordering](#ordering)
  - [Images](#images)
  - [Front matter reference](#front-matter-reference)
  - [Answer types](#answer-types)
- [Approving submissions](#approving-submissions)
- [Administration](#administration)
- [Operations](#operations)
- [Project layout](#project-layout)
- [Troubleshooting](#troubleshooting)

---

## Quick start

Requirements: Docker with the Compose plugin. Nothing else.

```bash
cp .env.example .env          # set SECRET_KEY (and STUDENT_PASSWORD)
docker compose up -d --build
```

Open <http://localhost:81> (production: `http://ctf.exn.be:81`) and complete the one-time
setup screen (admin account, event name "Hack the Brewery", visibility). Then load the
workshop content:

```bash
docker compose exec app python manage.py sync-content
docker compose exec app python manage.py list-content     # dry run: what data/ defines
```

`sync-content` reads `data/` and creates/updates challenges and pages, matching challenges
on their **title**. Use `--no-overwrite` to keep edits made in the admin UI. **Never use
`--prune` on a database that also holds challenges created by hand or by import: it deletes
every challenge without a file in `data/`, including its solves.**

Participant accounts (`Student1..N`, password from `STUDENT_PASSWORD` or `--password`):

```bash
docker compose exec app python manage.py create-students 20
```

| URL | Purpose |
| --- | --- |
| `/` | Landing page with the start button |
| `/challenges` | The workshop activities |
| `/scoreboard` | Live ranking |
| `/admin` | Admin panel |



### Stopping and updating

```bash
docker compose down                # stop
docker compose up -d --build       # rebuild after code changes
docker compose logs -f app         # follow logs
```

---

## Branding: colours and fonts

Everything visual is driven by **one file**:

```
CTFd/themes/core-beta/assets/scss/includes/_brand.scss
```

Change a value there and rebuild the theme:

```bash
make theme
# or: cd CTFd/themes/core-beta && npm install && npm run build
```

The palette is Exclusive Networks (brand guidelines, April 2019). Variable names are kept from the original theme:

| Variable | Value | Used for |
| --- | --- | --- |
| `$brand-orange` | `#a4027d` | EXN purple: primary accent, buttons, links, highlights |
| `$brand-navy` | `#2b0b26` | Navbar, hero, page headers (derived dark purple, not an official colour) |
| `$brand-blue` | `#839fad` | EXN blue: secondary accents, gradients |
| `$brand-offwhite` | `#f5f6f7` | Light surfaces |
| `$brand-grey` | `#5b6770` | Body text, muted labels |
| `$brand-pending` | `#ff9933` | "Awaiting review" state (EXN gold) |
| `$brand-accent-on-dark` | `#d580c2` | Accent text on the dark hero (purple tint) |

Fonts are set in the same file:

| Variable | Default | Used for |
| --- | --- | --- |
| `$font-body` | Helvetica Neue stack | Body copy, tables, forms |
| `$font-heading` | Helvetica Neue stack | Headings, hero, navbar brand |
| `$font-mono` | system mono | Code, flags, terminal text |
| `$font-size-root` | `16px` | Base size everything scales from |

These values are mapped onto Bootstrap's own variables, so buttons, alerts,
badges and forms all inherit the palette automatically. They are also exposed as
CSS custom properties (`--ns-orange`, `--ns-navy`, `--ns-font-body`, ...) for use
in templates and JavaScript without recompiling.

The Docker build compiles **both** the student and the admin theme, so colour changes
only need `docker compose up -d --build`. The navbar shows the Exclusive Networks white
logo from `data/images/brand/` until a logo is uploaded under Admin > Config > Logo.

### The admin theme

The admin panel has its own compiled stylesheet with the same palette applied
(`CTFd/themes/admin/assets/css/main.scss`). It is built separately:

```bash
cd CTFd/themes/admin && npm install && npm run build
```

The Docker build runs this step automatically. Note the admin theme still uses
Bootstrap 4, so its variables (`$primary`, `darken()`) follow Bootstrap 4
syntax, unlike the student theme on Bootstrap 5.

### Using a different font family

1. Add the package: `cd CTFd/themes/core-beta && npm install @fontsource/inter`
2. Import it in `assets/scss/includes/utils/_fonts.scss`
3. Name it in `_brand.scss`: `$font-body: "Inter", sans-serif;`
4. `make theme`

---

## Authoring challenges

Challenge content lives in `data/` as Markdown files. **You never have to use
the admin UI to write a challenge**, and you never have to upload an image.

### Folder layout

```
data/
|-- images/                        <- all screenshots, served at /images/
|-- 0. Welcome.md                  <- top-level file  = a page
|-- 1. Warming Up/                 <- folder          = a category
|   |-- 1.1 Rules of Engagement.md    <- file in folder  = a challenge
|   `-- 1.2 User Portal App.md
|-- 2.Publisher/
|   `-- 2.1 Deploy Publisher.md
|-- Inventory.md                   <- page at /inventory
`-- topology.md                    <- page at /topology
```

Rules:

- A **folder** becomes a category. Its name (minus the number) is the category title.
- A **file inside a folder** becomes a challenge.
- A **file at the top level** becomes a page, reachable at its slug
  (`0. Welcome.md` -> `/welcome`).
- `TEMPLATE.md` is ignored - it is scaffolding for you to copy.

After editing anything in `data/`, apply it:

```bash
docker compose exec app python manage.py sync-content
```

Preview what would be imported, without touching the database:

```bash
docker compose exec app python manage.py list-content
```

### Ordering

The number prefix controls the order. `3. Private App/3.2 ...` sorts after
`3. Private App/3.1 ...`. This is stored as `order_id` on each challenge.

**Challenges are displayed highest-first**, so the next activity a student
should tackle is always at the top of the list, and categories are ordered by
the highest activity they contain.

To reorder, either renumber the files, or override a single activity without
renaming anything:

```yaml
---
order: 2500
---
```

You can also edit `order_id` directly on a challenge in the admin panel.

### Stopping guesswork: the answer cooldown

Multiple-choice questions can be brute forced by clicking through the options,
so after a wrong answer the student must wait before trying again. The wait is
enforced **on the server**, so reloading the page or calling the API directly
does not skip it - even a correct answer is refused until the wait is over.

While it runs, the options and the submit button are disabled and the button
shows a countdown.

**The default is 30 seconds for every multiple-choice question.** To change it
for all of them at once, edit one line in
`CTFd/utils/content/__init__.py`:

```python
DEFAULT_CHOICE_COOLDOWN = 30      # change to 60 for a one minute wait
```

then re-run `sync-content`. Free-text and regex answers have no wait by
default (`DEFAULT_COOLDOWN = 0`), since they are not guessable the same way.

Any single challenge can override it in its front matter:

```yaml
---
cooldown: 60      # this question waits a minute
---
```

```yaml
---
cooldown: 0       # no wait on this one
---
```

### Images

Drop image files into `data/images/` and reference them by filename:

```markdown
![Publisher status](/images/publisher_status.jpg)
```

That is the whole workflow - no uploads, no hashed URLs. Images are served
straight from disk at `/images/<filename>` and cached by the browser for a day.

> Legacy `/files/<hash>/name.jpg` URLs from the old upload system are rewritten
> to `/images/name.jpg` automatically on import, matching by filename.

### Front matter reference

An optional block at the very top of a file sets metadata. Every key is
optional - with no front matter at all, sensible defaults apply.

```yaml
---
title: Locate the User Portal      # defaults to the filename
category: Warming Up               # defaults to the folder name
value: 100                         # points, default 100
order: 1200                        # display order, default from the filename
state: visible                     # visible | hidden
page: false                        # true to publish as a page instead

flag: 8.8.8.8                      # the expected answer
flag_type: static                  # static | regex | choice | manual
case_insensitive: true             # default true

requires_approval: false           # true = instructor must approve

choices:                           # presence of choices = multiple choice
  - SAML Forward Proxy
  - Reverse Proxy
  - Explicit Proxy
answer: SAML Forward Proxy         # accepted choice(s), "|" for alternatives
multiple: false                    # true = several choices must be selected

requires: User Portal App          # must be solved first (name, or a list)
requires_anonymize: false          # true = mask the locked tile's name as "???"
next: Steering Configuration       # target of the "Next Challenge" button

cooldown: 30                       # seconds to wait after a wrong answer

hint: hints/3.1 Walkthrough.md     # a hint file students can unlock
hint_cost: 25                      # points it costs, default 10
---
```

> Inline `# comments` are supported and stripped, as in YAML: a `#` only starts
> a comment when a space precedes it. So `grade: C#` and `answer: pass#1` keep
> their hash, while `answer: Yes   # the answer` stores just `Yes`. If a value
> must *begin* with a hash, quote it: `colour: "#ff8300"`.

### Linking challenges: `requires` and `next`

Both keys refer to challenges by **name** - that is the `title`, which defaults
to the filename without its number prefix. `1.2 User Portal App.md` is named
`User Portal App`.

**`requires`** gates a challenge until its prerequisites are solved. The gated
challenge **stays on the board as a locked tile** - greyed out, with a padlock,
a `LOCKED` badge and a line naming what to solve first - so students can see
what is coming without being able to open it.

Locked means locked: the tile is not clickable, and the API refuses the
challenge's content with a `403` even if someone requests it by id, so the text
and answer cannot be read ahead of time.

Add `requires_anonymize: true` to mask the tile's name and points as `???`
while still showing the prerequisite. To remove a challenge from the board
altogether, use `state: hidden` instead of `requires`.

```yaml
---
requires: User Portal App
---
```

Several prerequisites, all of which must be solved:

```yaml
---
requires:
  - Rules of Engagement
  - User Portal App
requires_anonymize: true
---
```

**`next`** sets which challenge the "Next Challenge" button opens after a
correct answer, so students can walk the workshop without returning to the
board each time.

```yaml
---
next: Steering Configuration
---
```

Names are matched case-insensitively. If a name does not match any challenge,
`sync-content` prints a warning and skips that link rather than failing - check
its output after editing. Removing the key from a file clears the link on the
next sync.

`list-content` shows the links it parsed:

```bash
docker compose exec app python manage.py list-content
```

### Hints

A hint is its own Markdown file, linked from the challenge's front matter.
Students see it as a collapsed card under the challenge text showing its title
and cost; opening it asks them to confirm, deducts the points, and reveals the
hint with the same styling as the challenge (screenshots, numbered steps, code
blocks, tables). Once paid for, a hint stays unlocked.

Put hint files in a `hints/` folder next to the challenges. Anything inside a
`hints/` folder is never imported as a challenge.

```
data/3. Private App/
|-- 3.1 create private app.md
`-- hints/
    `-- 3.1 Walkthrough.md
```

Link it from the challenge:

```yaml
---
hint: hints/3.1 Walkthrough.md
hint_cost: 25
---
```

Several hints, cheapest first is a good pattern (a nudge, then the full
walkthrough). Each line is `file | cost | title`; cost and title are optional:

```yaml
---
hints:
  - hints/3.1 Nudge.md | 5
  - hints/3.1 Walkthrough.md | 25 | Step by step
---
```

The hint file itself can set `title` and `cost` in its own front matter; values
in the challenge win. Without a title the filename is used, minus its number.
Without any cost the default is 10 points (`DEFAULT_HINT_COST` in
`CTFd/utils/content/__init__.py`). Copy `data/hints/TEMPLATE.md` to start.

Images work as in challenges: `![](/images/name.jpg)`. Relative paths such as
`../../images/name.jpg` are rewritten too, so the file also previews correctly
in an editor.

Path lookup: the hint path is tried next to the challenge, then in its
`hints/` folder, then from `data/` and `data/hints/`. The `.md` may be left
off. A missing file is reported as a warning by `sync-content`.

Re-syncing updates hint text and cost in place, so students keep hints they
already unlocked. Removing a hint from the front matter deletes it (points
already spent are not refunded). A challenge with no `hint`/`hints` key keeps
any hints you added by hand in the admin UI.

### Answer types

**1. Static text** (the default). The answer can also simply be the last line of
the file, after the closing `</div>` - the convention the existing content uses:

```markdown
<div class="challenge-container">
  <div class="challenge-label">CHALLENGE</div>
  What is the DNS server IP address on the Windows VM?
</div>

8.8.8.8
```

> **Note:** `|` alternatives only work for multiple-choice (`answer:`). A static flag is
> compared literally, so for several accepted spellings use a regex, e.g.
> `flag_type: regex` + `flag: ^(yes|yeah|correct)$`. Quote values that look like
> numbers or yes/no (`flag: "10"`, `flag: "No"`), otherwise they are converted.

**2. Regex**

```yaml
flag_type: regex
flag: ^BREW-\d+$
```

**3. Multiple choice** - rendered as radio buttons:

```yaml
choices:
  - SAML Forward Proxy
  - Reverse Proxy
  - Explicit Proxy
answer: SAML Forward Proxy
```

Several required answers become checkboxes; the order the student clicks them
does not matter:

```yaml
choices:
  - Publisher
  - Nozomi Guardian
  - Steering configuration
  - Physical firewall rule
answer: Publisher|Nozomi Guardian|Steering configuration
multiple: true
```

**4. Requires approval** - no automatic checking. The student writes a free-text
answer, it enters the review queue, and points are awarded when an instructor
approves it:

```yaml
requires_approval: true
```

Use this for "show me your policy screenshot", feedback, or anything judged by a
human. The student sees **Awaiting review** and cannot resubmit while it is
queued.

---

## Approving submissions

Answers that need review appear in the admin panel under **Submissions ->
Awaiting review**.

For each entry you see who submitted it, which activity, what they answered and
when. Then:

- **Approve** - creates the solve and awards the points. The student's tile
  turns green and they continue.
- **Reject** - records it as an incorrect answer. The student can try again.

Students see an "In review" badge on the activity tile while they wait, so it is
obvious nothing is stuck.

The same actions are available over the API:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/submissions/pending` | List everything awaiting review |
| `POST` | `/api/v1/submissions/<id>/approve` | Approve and award points |
| `POST` | `/api/v1/submissions/<id>/reject` | Reject |

---

## Administration

The admin panel is at `/admin`.

| Section | What it does |
| --- | --- |
| Statistics | Solve counts, submission activity, per-activity breakdown |
| Challenges | Create and edit activities, flags, hints, files, ordering |
| Users | Accounts, promote to admin, reset passwords |
| Scoreboard | Live ranking, hide or show accounts |
| Submissions | All answers, plus the **Awaiting review** queue |
| Notifications | Broadcast a message to everyone |
| Pages | Static pages (also generated from `data/`) |
| Config | Event name, logo, visibility, timing, backup |

Config sections that do not apply to a private internal deployment (Security /
Sanitize, Legal & Robots pages, Integrations, Localization) have been removed.

Content precedence: `sync-content` **updates** existing activities by default.
To make file changes without overwriting edits made in the admin UI:

```bash
docker compose exec app python manage.py sync-content --no-overwrite
```

To delete activities whose source file is gone:

```bash
docker compose exec app python manage.py sync-content --prune
```

---

## Operations

### Configuration

Set in `docker-compose.yml` under the `app` service:

| Variable | Default | Notes |
| --- | --- | --- |
| `SECRET_KEY` | generated | **Set this explicitly for a real deployment** |
| `DATABASE_URL` | MariaDB service | e.g. `mysql+pymysql://user:pass@db/ctfd` |
| `REDIS_URL` | Redis service | Cache and sessions |
| `WORKERS` | `1` | Gunicorn workers; raise for larger classes |
| `REVERSE_PROXY` | `true` | Keep on behind the bundled nginx |
| `UPLOAD_FOLDER` | `/var/uploads` | Logos and any UI-uploaded files |

### Backups

The database holds accounts, solves and scores. Content lives in `data/` and
should be in version control.

```bash
# Back up
docker compose exec db mysqldump -uctfd -pctfd ctfd > backup-$(date +%F).sql

# Restore
docker compose exec -T db mysql -uctfd -pctfd ctfd < backup-2026-09-09.sql
```

A full zip export (including uploads) is also available in the admin panel under
**Config -> Backup**, or:

```bash
docker compose exec app python manage.py export_ctf /tmp/export.zip
```

### Resetting between sessions

To run the workshop again with a fresh set of students, use **Config -> Reset**
in the admin panel. It can clear accounts and submissions while keeping your
challenges. Re-run `sync-content` afterwards if you also cleared challenges.

---

## Project layout

```
.
|-- docker-compose.yml     Deployment (app + nginx + MariaDB + Redis)
|-- Dockerfile
|-- Makefile               Shortcuts: up, down, logs, theme, sync
|-- data/                  YOUR CONTENT - challenges, pages, images
|-- conf/nginx/            Reverse proxy config
|-- migrations/            Database schema migrations
`-- CTFd/
    |-- api/v1/            REST API
    |-- admin/             Admin views
    |-- models/            Database models
    |-- plugins/
    |   |-- challenges/    Challenge types
    |   `-- flags/         Answer types: static, regex, choice, manual
    |-- utils/
    |   `-- content/       The data/ loader
    `-- themes/
        |-- admin/         Admin theme
        `-- core-beta/     Student theme
            `-- assets/scss/includes/_brand.scss   <- COLOURS AND FONTS
```

---

## Troubleshooting

**Challenges did not appear after editing `data/`**
Run `docker compose exec app python manage.py sync-content`. Check what the
loader sees with `list-content`.

**An image shows as broken**
Confirm the file exists in `data/images/` and that the filename matches exactly,
including case and extension. The reference should be `/images/<filename>`.

**Colour or font change had no effect**
Rebuild the theme (`make theme`) - SCSS is compiled, not read at runtime. Then
hard-refresh the browser, as the compiled filename is content-hashed.

**Ordering looks wrong**
Remember it is highest-first by design. Check the values with `list-content`; a
file with no number prefix gets order `0` and sorts last.

**A student is stuck on "Awaiting review"**
That activity needs approval. Approve it in **Submissions -> Awaiting review**.

**Theme build fails with a permission error on `static/`**
The build must replace the previously compiled files. Ensure the checkout is
writable, then re-run `make theme`.

**`npm install` hangs**
It occasionally stalls on slow or filtered networks. Interrupt it and retry
with `npm install --no-audit --no-fund`, or `npm ci` if a lockfile is present.
The application runs fine meanwhile: it serves the stylesheet that is already
compiled in `static/`, so only new colour or font changes are missing.
