# Hack the Brewery – changes on top of NSK-CTF

## Removed from the NSK base
- Netskope content: `data/`, `ztna-workshop/`, `infrastructure/` and `commands.md`
- Committed runtime logs (`CTFd/logs/*.log`), `__pycache__`, `.DS_Store` and `node_modules`

## Rebrand to Exclusive Networks (brand guidelines, April 2019)

| Where | Change |
|---|---|
| `core-beta/assets/scss/includes/_brand.scss` | Purple `#a4027d` primary, blue `#839fad`, green/gold as success/warning/pending, surfaces and greys, Helvetica Neue stack. The dark surface `#2b0b26` and the on-dark accent `#d580c2` are derived tints, not official colours. Variable names are unchanged |
| `_hero.scss`, `_auth.scss`, `_fonts.scss`, `main.scss`, `workshop.css` | Contrast-safe accent on the dark hero; dark-mode card colour; fonts; comments |
| `admin/assets/css/main.scss` | Same palette and fonts for the admin panel |
| `templates/index.html`, `register.html` | Built-in landing copy for Hack the Brewery; placeholder `e.g. brewer7` |
| `templates/components/navbar.html` | Shows the Exclusive Networks white logo (`/images/brand/…`) and the CTF name when no logo is uploaded |
| `assets/img/favicon.ico`, `static/img/favicon.ico` | Exclusive Networks favicon. Note that the guidelines reserve the X icon for app icons, so this is a judgement call |
| `data/images/brand/` | Exclusive Networks logos (white and colour horizontal, icon, favicon) |

## Fixes and improvements
- **`setup.js`:** removed the dead newsletter code.
- **Admin `base.html`:** Bootstrap 4 classes for the review menu item.
- **`Dockerfile`:** new `admintheme` stage that runs `yarn build` for the admin theme.
- **`docker-compose.yml`:**
  - Port `${HTTP_PORT:-81}:80`.
  - `SECRET_KEY` is required.
  - `STUDENT_PASSWORD` is passed through.
- **New files:**
  - `.env.example`
  - `.gitignore`, which keeps `.env`, logs and `node_modules` out of git
  - `.gitattributes` with `*.sh eol=lf`
- **`cli/__init__.py`:** `create-students` uses `$STUDENT_PASSWORD` (fallback `Brewery-ChangeMe1!`) and `@hackthebrewery.local`.
- **`utils/content/__init__.py`:** pages support the front-matter keys `hidden: true` and `auth_required: true`.
- **`README.md`:**
  - Rewritten intro and quick start.
  - Exclusive Networks palette table.
  - Corrected flag `|` documentation.
  - `--prune` warning.

## Content migrated from "From Blackout To Lockout" (CTFd export 2026-11-04)
- **Converter:** `tools/export_to_data.py`. **Validator:** `tools/validate_data.py`, which runs the real loader code.
- **27 challenges** in `data/NN <category>/NN.MM <title>.md`. Every value is quoted.
  - Kept: category numbering (`0. Introduction` … `18. Feedback`), points, hidden state, prerequisites and the "next" chain.
  - Order runs 2700 → 100, so the workshop reads top to bottom.
- **Flags:** static and case-insensitive, except #17 `10`, which is case-sensitive as in the original.
- **#30 Feedback** had no flag. It is now a **manual-review** answer, which uses the new review queue.
- **#5–#8** were dynamic (10 → 7 linear decay). They are now static at 10 pts, because the loader only creates standard challenges.
- **Pages:**
  - `Credentials`, `IP addresses`, `Products` and `Windows10` became top-level `.md` files.
  - Routes are now lower-case slugs (`/credentials`, `/ip-addresses`, …), and links in the challenges were rewritten to match.
  - `Credentials` requires login. `Windows10` stays hidden.
  - The old Cyberhell home page is kept for reference in `docs/legacy-home-from-export.html.txt`.
  - The new `data/Home.md` is the Hack the Brewery landing page.
- **Images:** 169 images (only the referenced ones) are in `data/images/` under their original names.
  - Two different files shared a name; the second copy is saved with a `-2` suffix and its links point to it.
