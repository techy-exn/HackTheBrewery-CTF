# G2 – Challenge logic: NSK-CTF vs stock CTFd 3.7.7

Scope: `CTFd/api/v1/challenges.py`, `CTFd/models/__init__.py`, `CTFd/utils/challenges/__init__.py`,
`CTFd/utils/scores/__init__.py`, `CTFd/plugins/flags/__init__.py` (modified), plus the new flag-type
templates (`plugins/flags/assets/choice|manual/*.html`) and the two NSK Alembic migrations.

## How the diffs were made

Upstream files were fetched from `raw.githubusercontent.com/CTFd/CTFd/3.7.7/...`. For each file, the
upstream text was rebuilt by reverting the NSK edits, then compared with `diff -u`.

- **Byte-exact check against the git blob SHA-1 from the 3.7.7 tree:** `api/v1/challenges.py`
  (8cf797a2…), `models/__init__.py` (3065317a…) and `plugins/flags/__init__.py` (a468d111…). All
  three rebuilt files hash to the upstream blob, so these hunks cannot contain transcription errors.
- **Checked line by line against the fetched text instead:** `utils/challenges/__init__.py` and
  `utils/scores/__init__.py`. Their blob SHAs were not in the tree listing.

The full unified diffs are in the **Appendix** at the end of this file.

| File | Hunks | +/- lines |
|---|---|---|
| CTFd/api/v1/challenges.py | 15 | +253 / -36 |
| CTFd/models/__init__.py | 2 | +13 / -0 |
| CTFd/utils/challenges/__init__.py | 5 | +28 / -3 |
| CTFd/utils/scores/__init__.py | 4 | +12 / -0 |
| CTFd/plugins/flags/__init__.py | 1 | +55 / -1 |

Some hunks look like **backports from upstream CTFd 3.8.x**, not NSK features. They are marked
**[BACKPORT?]** below. They are not in 3.7.7, but they match later upstream behaviour:
- the `max_attempts_behavior` / `max_attempts_timeout` "timeout" mode
- `title` returned with unlocked hints
- "Correct/Incorrect but you already solved this"
- bracket columns in team/user standings
- `get_submissions_for_user_id_for_challenge_id`

If the Brewery build is based on CTFd ≥ 3.8, these may already be present.

**No Netskope / NSK strings** appear in any of these files. The text worth reviewing for rebranding
or wording is listed under each file. Most of it is the word "instructor" and the "student/workshop"
tone.

---

## 1. `CTFd/models/__init__.py`

### Hunk 1 – `class Challenges`: two new columns (after `next_id`)
```python
+    # Controls the order challenges are displayed in. Higher values appear
+    # first, so the newest activity a student should tackle is at the top.
+    order_id = db.Column(db.Integer, default=0, index=True)
+    # Seconds a student must wait between submissions on this challenge.
+    # 0 disables the wait. Used to stop rapid guessing on multiple choice.
+    cooldown = db.Column(db.Integer, default=0)
```
- **New DB columns:** `challenges.order_id` (INT, default 0, indexed as `ix_challenges_order_id`) and
  `challenges.cooldown` (INT, default 0). They are created by migrations n5001/n5002.
- `ChallengeSchema` is an auto `ModelSchema`, so both fields show up automatically in admin
  challenge JSON and the CSV/JSON export. They can also be PATCHed through `/api/v1/challenges/<id>`.
  `BaseChallenge.update` setattr's every key.
- Neither field is exposed in the stock admin challenge editor UI. In NSK they are set by the
  markdown content sync, `CTFd/utils/content/__init__.py` (outside this group): `challenge.order_id =
  item["order"]`, `challenge.cooldown = item["cooldown"]`. Defaults there are
  `DEFAULT_CHOICE_COOLDOWN = 30` and `DEFAULT_COOLDOWN = 0`.

### Hunk 2 – new submission subclass `Pending` (between `Fails` and `Discards`)
```python
+class Pending(Submissions):
+    """A submission that requires manual review by an administrator. ...
+    stored with type "pending" until an admin approves it (converted to a Solve and
+    awarded points) or rejects it (converted to a Fail)."""
+    __mapper_args__ = {"polymorphic_identity": "pending"}
```
- **No new table.** It is a new polymorphic value `submissions.type = 'pending'`, so no migration is
  needed.
- `Submissions.get_child("pending")` now resolves.
- Upstream code that counts `Submissions` without a type filter now also counts pending rows. For
  example, `attempts` in the challenge-detail API (see §2) counts them.
- **Scoring is unchanged:** `Users.get_score` and the standings only sum `Solves` and `Awards`, so a
  Pending row gives 0 points until it is converted to a Solve.
- Used by: `api/v1/challenges.py` (this group), plus `api/v1/submissions.py` (`/submissions/pending`
  list, `/<id>/approve` → creates a `Solves` row and deletes the Pending row, `/<id>/reject` → creates
  a `Fails` row and deletes the Pending row), `admin/submissions.py` (review queue page) and
  `utils/initialization/__init__.py` (pending count for the admin navbar badge). All of those are
  outside this group.

---

## 2. `CTFd/api/v1/challenges.py`

### Hunk 1 (L1) – imports
`import math` and `from datetime import datetime, timedelta`. These are used by cooldown and by the
max-attempts timeout.

### Hunk 2 (L16) – imports
- The models import is expanded to a multi-line form and adds **`Pending`**.
- New imports: **`from CTFd.plugins.flags import challenge_requires_review`** and
  **`from CTFd.utils.content import decode_choices`**. The second is a hard dependency on NSK's new
  `CTFd/utils/content` module.
- Cosmetic: the `CTFd.utils.content` import breaks isort ordering.

### Hunk 3 (L55) – imports
`get_ip` is added to the `CTFd.utils.user` import. It is used to store the IP on Pending rows.

### Hunks 4–7 – `GET /api/v1/challenges` (`ChallengeList.get`)

1. **Challenge-name map (Hunk 4).** `all_challenge_ids` is now built from
   `challenge_names = dict(Challenges.query.with_entities(Challenges.id, Challenges.name))`. The map
   is used to name the missing prerequisites.

2. **Pending lookup (Hunk 4).** For authed users it collects
   `pending_ids = {Pending.challenge_id for this account}`. One extra query per list call.

3. **Locked tiles (Hunk 5).** This replaces upstream behaviour.
   - **Upstream:** when prerequisites are unmet, an anonymized challenge is returned as a
     `type:"hidden"` "???" stub, and a non-anonymized one is **omitted entirely**.
   - **NSK:** every challenge with unmet prerequisites is **always** returned as a locked tile:
     ```python
     {"id", "type": "locked", "name": "???" if anonymize else name,
      "value": 0 if anonymize else value, "order_id", "solves": None,
      "solved_by_me": False, "pending_review": False, "locked": True,
      "requires": [names of unsolved prerequisite challenges],
      "category": "???" if anonymize else category, "tags": [], "template": "", "script": ""}
     ```
   - **`requires_anonymize` semantics:** the existing CTFd `requirements.anonymize` flag now only
     masks name, value and category. It no longer decides whether the tile is shown.
   - ⚠ **Information leaks:**
     - `requires` lists the *names* of the missing prerequisites even when the locked challenge
       itself is anonymized.
     - `challenge_names` includes hidden and locked-state challenges, so the name of a *hidden*
       prerequisite can leak.
     - Non-anonymized locked challenges reveal their name, value and category. This is intended.

4. **Tags (Hunk 6).** Tags whose `value` is empty are dropped from the list response. Cosmetic/UI.

5. **New fields on normal entries (Hunk 7):**
   - `order_id` (int, 0 if NULL)
   - `pending_review` (bool: this account has a Pending row for the challenge)
   - `locked: False`

6. **Ordering (Hunk 7).** After building the list:
   ```python
   response.sort(key=lambda x: (-(x.get("order_id") or 0), x.get("name") or ""))
   ```
   The highest `order_id` comes first, and ties are broken by **name**. This overrides the SQL order
   from `get_all_challenges` (`order_id desc, value, id`), so the effective tiebreak is name, not
   value. Anonymized locked tiles sort as "???".

7. **Cosmetic (Hunk 7):** a blank line containing trailing whitespace before `return`.

New API response fields (list): **`order_id`, `pending_review`, `locked`, `requires`**, and the new
`type` value **`"locked"`**. The theme (`core-beta/templates/challenges.html` and
`assets/js/challenges.js`) relies on these: `c.locked`, `c.requires`, `c.pending_review`, and the
CSS classes `ns-tile--locked` and `ns-tile--pending`. The `ns-` prefix is the NSK CSS namespace and
is a rebrand candidate in the theme.

### Hunks 8–11 – `GET /api/v1/challenges/<id>` (`Challenge.get`)

- **Locked / 403 behaviour is unchanged from upstream.**
  - Unmet prerequisites with `anonymize` → returns the 200 `type:"hidden"` "???" stub.
  - Unmet prerequisites otherwise → `abort(403)`.
  - Challenges in `state == "locked"` or `"hidden"` → 404 for non-admins.
  - So the "403 on locked challenge" comes from upstream code. NSK's theme only prevents clicking
    locked tiles (`:disabled="c.locked"`).
- **Hunk 8 [BACKPORT?]:** unlocked hints now include `"title"` in addition to `content`.
- **Hunk 9 [BACKPORT?]:** `attempts` honours the new global config
  `max_attempts_behavior == "timeout"`. In that mode it only counts Submissions from the last
  `max_attempts_timeout` seconds (default 300). The config fields live in `forms/config.py` and
  `admin/templates/configs/challenges.html`, outside this group.
  - Upstream quirk kept: `challenge_id` is the URL string unless solves exist.
  - `attempts` counts every submission type, including pending and discard.
- **Hunk 10 (NSK features):** adds these keys to the JSON response:

  | Key | Meaning |
  |---|---|
  | `choices` | list from `decode_choices(chal.connection_info)`, sent only if choices exist **and** the challenge's *first* flag (`Flags.query.filter_by(challenge_id).first()`, no ORDER BY) has `type == "choice"`; otherwise `[]` |
  | `requires_approval` | first flag `type == "manual"` |
  | `awaiting_review` | this account has a Pending row |
  | `cooldown` | `chal.cooldown or 0` |
  | `cooldown_remaining` | `ceil(cooldown - (utcnow - last Fail.date))`, clamped at 0; computed only when authed and not solved |

  - **Multiple-choice options are stored in `connection_info`** with the prefix `"choices:"`
    followed by one option per line. This repurposes the stock *Connection Info* field, so the two
    cannot both be used on a challenge.
  - `multi_select` = first flag's `data == "multiple"`.
  - ⚠ The response's `requires_approval` only looks at the first flag, while attempt routing
    (`challenge_requires_review`) looks at *any* flag. Mixed-flag challenges are inconsistent.
- **Hunk 11:** passes `choices`, `multi_select`, `requires_approval`, `awaiting_review`, `cooldown`
  and `cooldown_remaining` into `render_template(view template)`. The theme's `challenge.html` uses
  them to render radio buttons/checkboxes, the "awaiting review" state and the cooldown bar
  (`ns-cooldown*`).

### Hunk 12 (L553) – `POST /api/v1/challenges/attempt`
The upstream early `fails = Fails...count()` (run before the challenge lookup) is removed. It moves
into the max-attempts block.

### Hunk 13 (L617) – attempt flow for "not solved yet"

Order of the checks:

1. `fails = 0` default.

2. **Answer cooldown, enforced server-side (NSK).**
   - If `challenge.cooldown > 0` and the account's latest `Fails` row on this challenge is younger
     than `cooldown` seconds, the endpoint returns **HTTP 200**:
     ```json
     {"status":"cooldown","cooldown":<remaining s>,
      "message":"Take a moment to think it through - you can try again in N second(s)."}
     ```
   - It logs "`[date] name tried <id> during cooldown`".
   - No Fail is recorded, so a blocked attempt does not extend the wait.
   - The check runs before max-attempts and before manual review. It is keyed on `account_id`, so
     in teams mode the whole team shares the wait.
   - Fails are only written when `ctftime()` or the user is admin.
   - The KPM rate-limit path also writes a Fail, which re-arms the cooldown.
   - A rejected manual answer becomes a Fail dated at rejection time, so the cooldown starts then.

3. **Max attempts [BACKPORT?].**
   - `lockout` (default) counts all Fails. Message: "Not accepted. You have 0 tries remaining".
   - `timeout` counts Fails in the last `max_attempts_timeout` s. Message: "Not accepted. Try again
     in N minutes".
   - Response is `status:"ratelimited"` with HTTP 403. Upstream returned `status:"incorrect"` with
     "You have 0 tries remaining".

4. **Manual review (NSK).** If `challenge_requires_review(challenge_id)` (any flag of type
   `manual`):
   - If a Pending row already exists for this account → returns
     `{"status":"pending","message":"Your answer is already awaiting review by an instructor."}`.
   - If the stripped submission is empty → `status:"incorrect"`, "Please provide an answer before
     submitting."
   - Otherwise, when `ctftime()` or admin: inserts
     `Pending(user_id, team_id, challenge_id, ip=get_ip(), provided=<stripped>)`, commits, and calls
     `clear_challenges()`. Outside CTF time nothing is stored, but the user still gets the "pending"
     reply (this mirrors upstream solve semantics).
   - Logs `[PENDING REVIEW]`.
   - Returns `{"status":"pending","message":"Answer submitted. An instructor will review it shortly -
     you will receive your points once it is approved."}`.
   - The flag plugin's `compare` is never called here, and **no points are awarded until an admin
     approves**. Approval lives in `api/v1/submissions.py`, which converts the row to a Solve.
   - **New attempt status values: `cooldown`, `pending`.**

5. Normal `chal_class.attempt` follows, unchanged.

### Hunk 14 (L679) – wrong answer with `max_attempts` [BACKPORT?]
The message is built once. When `attempts_left == 0` and the behaviour is `timeout`, it appends
" Try again in N minutes." The response structure is otherwise the same.

### Hunk 15 (L704) – already-solved branch [BACKPORT?]
It now runs `chal_class.attempt()` and returns `"{message} but you already solved this"`, for
example "Correct but you already solved this". Upstream returned the fixed text "You already solved
this". This reveals whether a re-submission is correct.

Unchanged endpoints in this file: `POST` and `PATCH` and `DELETE /challenges/<id>`, `/types`,
`/<id>/solves`, `/files`, `/tags`, `/topics`, `/hints`, `/flags`, `/requirements`.

**"Next challenge":** nothing in these files changes it. `Challenges.next_id` and the `next_id`
handling are stock 3.7.7. Any next-challenge UX in NSK is theme-only (`challenges.js`
`nextChallenge()`), outside this group.

**Admin preview note:** with `?preview=true` an admin attempt on a manual challenge calls
`WorkshopManualFlag.compare`. Any non-empty text then reports "correct".

**Wording to rebrand or review:** "instructor" (×2), "Take a moment to think it through…", the
`[PENDING REVIEW]` log tag.

---

## 3. `CTFd/utils/challenges/__init__.py`

| Hunk | Change |
|---|---|
| 1 (imports) | Adds `Submissions` to the models import; adds `from CTFd.schemas.submissions import SubmissionSchema` |
| 2 (`Challenge` namedtuple) | Adds the field **`order_id`**. The multi-line reformat is cosmetic |
| 3 (`get_all_challenges`) | `.order_by(Challenges.order_id.desc(), Challenges.value, Challenges.id)`. Upstream was `value, id`. **Highest order_id first** |
| 4 (`get_all_challenges`) | Fills `order_id=c.order_id or 0` |
| 5 (new function) **[BACKPORT?]** | `@cache.memoize(60) get_submissions_for_user_id_for_challenge_id(user_id, challenge_id)` returns `SubmissionSchema(view="self", many=True).dump(...)` of the account's submissions on a challenge, newest first. Used by `api/v1/users.py` (`/users/me/submissions?challenge_id=`-style endpoint, L27/L357) and invalidated in `cache/__init__.py::clear_challenges` |

The memoized `get_all_challenges` result now carries `order_id`, which the list API reads as
`challenge.order_id`.

---

## 4. `CTFd/utils/scores/__init__.py`

There is **no change to how scores are calculated.** Sums, freeze handling, value-0 filtering and
tie-breaks are identical to upstream. The only change, applied four times (team standings
admin/public, user standings admin/public):
```python
+                Teams.bracket_id.label("bracket_id"),   # resp. Users.bracket_id
+                Brackets.name.label("bracket_name"),
 ...
+            .join(Brackets, isouter=True)
```
`get_team_standings` and `get_user_standings` now return `bracket_id` and `bracket_name` like
`get_standings` already did, so scoreboards can show and filter brackets in both modes. This is
probably an upstream 3.8 backport **[BACKPORT?]**.

Scoring for manual challenges works because approval creates a normal `Solves` row. Pending rows are
not joined into the standings.

---

## 5. `CTFd/plugins/flags/__init__.py` (verified against the upstream blob)

There is one hunk. Between `CTFdRegexFlag` and `get_flag_class` it adds:

**`WorkshopChoiceFlag`** (`name = "choice"`, templates `choice/create.html` and `choice/edit.html`)
- `content` = the accepted answer(s), separated by `|`.
- `data` = `""` (single answer, radio buttons) or `"multiple"` (checkboxes).
- `compare` behaviour:
  - Lower-cases and strips the values.
  - The submitted value is split on `,` (multi-select answers arrive comma-joined).
  - Empty accepted or empty given → False.
  - If `len(accepted) > 1 and data == "multiple"` → `set(given) == set(accepted)`, so the order
    does not matter and the selection must be exact.
  - Otherwise it requires exactly one given value that is in `accepted`. A single-select question
    with several acceptable answers is allowed.
- ⚠ Options that contain commas can never match, because the submission is comma-split.
- ⚠ `data == "multiple"` with only one accepted value falls back to single mode.
- Comparison is not constant-time. That is irrelevant here.

**`WorkshopManualFlag`** (`name = "manual"`, templates `manual/create.html` and `manual/edit.html`)
- `requires_review = True` is a class attribute read by the API.
- `compare` returns True for any non-empty input. `content` is only a reviewer note.

**Registry** – `FLAG_CLASSES` gains `"choice"` and `"manual"`. This is a reformat to multiple lines.

**New helper** `challenge_requires_review(challenge_id)` returns True if *any* flag on the challenge
belongs to a class with `requires_review`. It uses a lazy `from CTFd.models import Flags` to avoid a
circular import.

Class names use the "Workshop" prefix. Rename them if desired, but keep the type ids
`choice`/`manual`, because flag rows store them.

---

## 6. New templates `CTFd/plugins/flags/assets/{choice,manual}/{create,edit}.html`

These are Nunjucks/Jinja-style admin flag forms, loaded by the admin flag editor through
`FLAG_CLASSES[...].templates`. They follow the structure of stock `static/*.html`.

- **choice/create.html**
  - Label "Multiple choice" with help text: "separate several accepted answers with a pipe
    `Option A|Option B`".
  - `content` text input.
  - `data` select with `""` = "Single answer (radio buttons)" and `multiple` = "Several answers
    required (checkboxes)".
  - Help text: "The options shown to the student are defined on the challenge itself", meaning
    `connection_info` with `choices:`.
  - Hidden field `type=choice`.
- **choice/edit.html** – same form, plus:
  - `selected` on `multiple` when `data == "multiple"`
  - hidden `id`
  - `<hr>` and an "Update" button
- **manual/create.html**
  - Label "Requires approval" with an explanation: the answer is not auto-checked, it goes to the
    review queue, and points are awarded on approval.
  - Optional `content` input, placeholder "Optional note for reviewers (e.g. the expected answer)".
  - Hidden `data=""` and `type=manual`.
- **manual/edit.html** – same form, plus hidden `id` and the Update button.

These templates contain no branding. They use "student" wording.

---

## 7. Migrations

**`migrations/versions/n5001workshop_add_order_id_to_challenges.py`**
- `revision = "n5001workshop"`, `down_revision = "a49ad66aa0f1"`. a49ad66aa0f1 is the upstream 3.7.7
  head, `add_title_to_hint`.
- `upgrade`:
  - `add_column challenges.order_id INTEGER NULL server_default '0'`
  - `create_index ix_challenges_order_id`
  - `UPDATE challenges SET order_id = id WHERE order_id IS NULL`
- `downgrade`: drops the index and the column.
- ⚠ Because of `server_default="0"`, existing rows already get 0 (on SQLite, MySQL and Postgres), so
  the seeding `UPDATE … WHERE order_id IS NULL` is effectively a no-op. Existing challenges all end
  up with order 0 and sort by name.

**`migrations/versions/n5002workshop_add_cooldown_to_challenges.py`**
- `revision = "n5002workshop"`, `down_revision = "n5001workshop"`.
- Adds `challenges.cooldown INTEGER NULL server_default '0'`.
- `downgrade` drops it.

**Chain check:** the NSK tree has the 21 stock migrations plus these two. The computed Alembic heads
= {`n5002workshop`}, so the chain is linear and there is no branch. For the Brewery build, if it is
based on a newer CTFd whose head is not a49ad66aa0f1, change `down_revision` of n5001 to that head.
The non-hex revision ids are legal in Alembic.

---

## Cross-file dependency summary (needed to port this group)

- `api/v1/challenges.py` → `models.Pending`, `plugins.flags.challenge_requires_review`,
  `utils.content.decode_choices` (NSK module, prefix `choices:`), `utils.user.get_ip`, and the
  config keys `max_attempts_behavior` / `max_attempts_timeout` (from `forms/config.py` and the admin
  config template).
- The list API's `order_id` field requires `Challenge` namedtuple support in
  `utils/challenges.get_all_challenges`, plus the model column and migration n5001.
- Cooldown requires the model column, migration n5002, a value set by the content sync or the API,
  and theme JS that handles `status:"cooldown"`, `cooldown_remaining` and the countdown.
- The manual/pending flow requires:
  - the flag plugin (`manual` class)
  - the `Pending` model
  - the admin review endpoints in `api/v1/submissions.py` (`/pending`, `/approve`, `/reject`)
  - `admin/submissions.py` (queue page) and `utils/initialization` (badge)
  - theme handling of `pending_review`, `awaiting_review` and `status:"pending"`
- Multiple choice requires the flag plugin (`choice` class), `connection_info` holding `choices:\n…`,
  and theme `challenge.html` rendering radios/checkboxes and joining checkbox values with `,`.
- Locked tiles require theme support for `type:"locked"`, `locked`, and `requires`.
- `cache/__init__.py::clear_challenges` must also clear `get_submissions_for_user_id_for_challenge_id`.

---

## Appendix – full unified diffs (upstream 3.7.7 → NSK)

### CTFd/api/v1/challenges.py

```diff
--- a/CTFd/api/v1/challenges.py (CTFd 3.7.7)
+++ b/CTFd/api/v1/challenges.py (NSK)
@@ -1,3 +1,5 @@
+import math
+from datetime import datetime, timedelta
 from typing import List  # noqa: I001
 
 from flask import abort, render_template, request, url_for
@@ -16,8 +18,20 @@
 from CTFd.models import ChallengeFiles as ChallengeFilesModel
 from CTFd.models import Challenges
 from CTFd.models import ChallengeTopics as ChallengeTopicsModel
-from CTFd.models import Fails, Flags, Hints, HintUnlocks, Solves, Submissions, Tags, db
+from CTFd.models import (
+    Fails,
+    Flags,
+    Hints,
+    HintUnlocks,
+    Pending,
+    Solves,
+    Submissions,
+    Tags,
+    db,
+)
 from CTFd.plugins.challenges import CHALLENGE_CLASSES, get_chal_class
+from CTFd.plugins.flags import challenge_requires_review
+from CTFd.utils.content import decode_choices
 from CTFd.schemas.challenges import ChallengeSchema
 from CTFd.schemas.flags import FlagSchema
 from CTFd.schemas.hints import HintSchema
@@ -55,6 +69,7 @@
     get_current_team_attrs,
     get_current_user,
     get_current_user_attrs,
+    get_ip,
     is_admin,
 )
 
@@ -172,9 +187,22 @@
         tag_schema = TagSchema(view="user", many=True)
 
         # Gather all challenge IDs so that we can determine invalid challenge prereqs
-        all_challenge_ids = {
-            c.id for c in Challenges.query.with_entities(Challenges.id).all()
-        }
+        challenge_names = dict(
+            Challenges.query.with_entities(Challenges.id, Challenges.name).all()
+        )
+        all_challenge_ids = set(challenge_names)
+
+        # Challenges for which this account has a submission awaiting approval.
+        pending_ids = set()
+        if authed():
+            pending_ids = {
+                p.challenge_id
+                for p in Pending.query.filter_by(
+                    account_id=current_user.get_current_user().account_id
+                )
+                .with_entities(Pending.challenge_id)
+                .all()
+            }
         for challenge in chal_q:
             if challenge.requirements:
                 requirements = challenge.requirements.get("prerequisites", [])
@@ -183,21 +211,33 @@
                 if user_solves >= prereqs or admin_view:
                     pass
                 else:
-                    if anonymize:
-                        response.append(
-                            {
-                                "id": challenge.id,
-                                "type": "hidden",
-                                "name": "???",
-                                "value": 0,
-                                "solves": None,
-                                "solved_by_me": False,
-                                "category": "???",
-                                "tags": [],
-                                "template": "",
-                                "script": "",
-                            }
-                        )
+                    # The challenge stays on the board as a locked tile so
+                    # students can see what is still ahead of them. Its content
+                    # is never sent: the detail endpoint refuses it too.
+                    # "anonymize" additionally masks the name and category.
+                    missing = [
+                        challenge_names[i]
+                        for i in sorted(prereqs - user_solves)
+                        if i in challenge_names
+                    ]
+                    response.append(
+                        {
+                            "id": challenge.id,
+                            "type": "locked",
+                            "name": "???" if anonymize else challenge.name,
+                            "value": 0 if anonymize else challenge.value,
+                            "order_id": challenge.order_id or 0,
+                            "solves": None,
+                            "solved_by_me": False,
+                            "pending_review": False,
+                            "locked": True,
+                            "requires": missing,
+                            "category": "???" if anonymize else challenge.category,
+                            "tags": [],
+                            "template": "",
+                            "script": "",
+                        }
+                    )
                     # Fallthrough to continue
                     continue
 
@@ -207,6 +247,12 @@
                 # Challenge type does not exist. Fall through to next challenge.
                 continue
 
+            # Only emit tags when they actually carry a value, so unused
+            # tagging does not clutter the interface.
+            challenge_tags = [
+                t for t in tag_schema.dump(challenge.tags).data if t.get("value")
+            ]
+
             # Challenge passes all checks, add it to response
             response.append(
                 {
@@ -214,16 +260,26 @@
                     "type": challenge_type.name,
                     "name": challenge.name,
                     "value": challenge.value,
+                    "order_id": challenge.order_id or 0,
                     "solves": solve_counts.get(challenge.id, solve_count_dfl),
                     "solved_by_me": challenge.id in user_solves,
+                    "pending_review": challenge.id in pending_ids,
+                    "locked": False,
                     "category": challenge.category,
-                    "tags": tag_schema.dump(challenge.tags).data,
+                    "tags": challenge_tags,
                     "template": challenge_type.templates["view"],
                     "script": challenge_type.scripts["view"],
                 }
             )
+        # Sort the response by display order
+        # Order challenges by their configured order_id. Highest first, so the
+        # activity a student should tackle next appears at the top of the list.
+        response.sort(
+            key=lambda x: (-(x.get("order_id") or 0), x.get("name") or "")
+        )
 
         db.session.close()
+        
         return {"success": True, "data": response}
 
     @admins_only
@@ -396,7 +452,12 @@
         for hint in Hints.query.filter_by(challenge_id=chal.id).all():
             if hint.id in unlocked_hints or ctf_ended():
                 hints.append(
-                    {"id": hint.id, "cost": hint.cost, "content": hint.content}
+                    {
+                        "id": hint.id,
+                        "cost": hint.cost,
+                        "title": hint.title,
+                        "content": hint.content,
+                    }
                 )
             else:
                 hints.append({"id": hint.id, "cost": hint.cost, "title": hint.title})
@@ -424,9 +485,19 @@
 
         if authed():
             # Get current attempts for the user
-            attempts = Submissions.query.filter_by(
+            attempts_query = Submissions.query.filter_by(
                 account_id=user.account_id, challenge_id=challenge_id
-            ).count()
+            )
+            max_attempts_behavior = get_config("max_attempts_behavior", "lockout")
+            if max_attempts_behavior == "timeout":
+                max_attempts_timeout = int(get_config("max_attempts_timeout", 300))
+                timeout_delta = datetime.utcnow() - timedelta(
+                    seconds=max_attempts_timeout
+                )
+                attempts_query = attempts_query.filter(
+                    Submissions.date >= timeout_delta
+                )
+            attempts = attempts_query.count()
         else:
             attempts = 0
 
@@ -437,6 +508,46 @@
         response["tags"] = tags
         response["hints"] = hints
 
+        # Multiple-choice options (if any) and whether this challenge is
+        # answered by free text or by picking from a list.
+        choices = decode_choices(chal.connection_info)
+        flag_row = Flags.query.filter_by(challenge_id=chal.id).first()
+        flag_kind = flag_row.type if flag_row else "static"
+        multiple_choice = bool(choices) and flag_kind == "choice"
+        multi_select = bool(flag_row and flag_row.data == "multiple")
+
+        # Does this account already have an answer waiting for approval?
+        awaiting_review = False
+        if authed():
+            awaiting_review = (
+                Pending.query.filter_by(
+                    account_id=user.account_id, challenge_id=chal.id
+                ).first()
+                is not None
+            )
+
+        # How long the student must wait after a wrong answer, and how much of
+        # that wait is still outstanding right now.
+        cooldown = chal.cooldown or 0
+        cooldown_remaining = 0
+        if cooldown > 0 and authed() and not solved_by_user:
+            last_wrong = (
+                Fails.query.filter_by(
+                    account_id=user.account_id, challenge_id=chal.id
+                )
+                .order_by(Fails.date.desc())
+                .first()
+            )
+            if last_wrong is not None:
+                elapsed = (datetime.utcnow() - last_wrong.date).total_seconds()
+                cooldown_remaining = max(0, int(math.ceil(cooldown - elapsed)))
+
+        response["choices"] = choices if multiple_choice else []
+        response["requires_approval"] = flag_kind == "manual"
+        response["awaiting_review"] = awaiting_review
+        response["cooldown"] = cooldown
+        response["cooldown_remaining"] = cooldown_remaining
+
         response["view"] = render_template(
             chal_class.templates["view"].lstrip("/"),
             solves=solve_count,
@@ -447,6 +558,12 @@
             max_attempts=chal.max_attempts,
             attempts=attempts,
             challenge=chal,
+            choices=choices if multiple_choice else [],
+            multi_select=multi_select,
+            requires_approval=flag_kind == "manual",
+            awaiting_review=awaiting_review,
+            cooldown=cooldown,
+            cooldown_remaining=cooldown_remaining,
         )
 
         db.session.close()
@@ -553,10 +670,6 @@
         if config.is_teams_mode() and team is None:
             abort(403)
 
-        fails = Fails.query.filter_by(
-            account_id=user.account_id, challenge_id=challenge_id
-        ).count()
-
         challenge = Challenges.query.filter_by(id=challenge_id).first_or_404()
 
         if challenge.state == "hidden":
@@ -617,22 +730,126 @@
         solves = Solves.query.filter_by(
             account_id=user.account_id, challenge_id=challenge_id
         ).first()
+        # We default fails to 0 as it's not needed unless we are working with max attempts
+        fails = 0
 
         # Challenge not solved yet
         if not solves:
+            # Anti-guessing wait. Enforced here, on the server, so it cannot
+            # be bypassed by reloading the page or calling the API directly.
+            cooldown = challenge.cooldown or 0
+            if cooldown > 0:
+                last_wrong = (
+                    Fails.query.filter_by(
+                        account_id=user.account_id, challenge_id=challenge_id
+                    )
+                    .order_by(Fails.date.desc())
+                    .first()
+                )
+                if last_wrong is not None:
+                    elapsed = (datetime.utcnow() - last_wrong.date).total_seconds()
+                    remaining = int(math.ceil(cooldown - elapsed))
+                    if remaining > 0:
+                        log(
+                            "submissions",
+                            "[{date}] {name} tried {challenge_id} during cooldown",
+                            name=user.name,
+                            challenge_id=challenge_id,
+                        )
+                        return {
+                            "success": True,
+                            "data": {
+                                "status": "cooldown",
+                                "cooldown": remaining,
+                                "message": "Take a moment to think it through - "
+                                f"you can try again in {remaining} second"
+                                f"{'' if remaining == 1 else 's'}.",
+                            },
+                        }
+
             # Hit max attempts
             max_tries = challenge.max_attempts
-            if max_tries and fails >= max_tries > 0:
-                return (
-                    {
+            if max_tries and max_tries > 0:
+                max_attempts_behavior = get_config("max_attempts_behavior", "lockout")
+                fails_query = Fails.query.filter_by(
+                    account_id=user.account_id, challenge_id=challenge_id
+                )
+                if max_attempts_behavior == "timeout":  # Use timeout behavior
+                    max_attempts_timeout = int(get_config("max_attempts_timeout", 300))
+                    timeout_delta = datetime.utcnow() - timedelta(
+                        seconds=max_attempts_timeout
+                    )
+                    fails = fails_query.filter(Fails.date >= timeout_delta).count()
+                    response = f"Not accepted. Try again in {math.ceil(max_attempts_timeout / 60)} minutes"
+                else:  # Use lockout behavior
+                    fails = fails_query.count()
+                    response = "Not accepted. You have 0 tries remaining"
+
+                if fails >= max_tries:
+                    return (
+                        {
+                            "success": True,
+                            "data": {
+                                "status": "ratelimited",
+                                "message": response,
+                            },
+                        },
+                        403,
+                    )
+
+            # Challenges whose flag requires manual approval never resolve
+            # immediately: the answer is queued for an administrator to review.
+            if challenge_requires_review(challenge_id):
+                existing_pending = Pending.query.filter_by(
+                    account_id=user.account_id, challenge_id=challenge_id
+                ).first()
+                if existing_pending:
+                    return {
+                        "success": True,
+                        "data": {
+                            "status": "pending",
+                            "message": "Your answer is already awaiting review by an instructor.",
+                        },
+                    }
+
+                submission_value = (request_data.get("submission") or "").strip()
+                if not submission_value:
+                    return {
                         "success": True,
                         "data": {
                             "status": "incorrect",
-                            "message": "You have 0 tries remaining",
+                            "message": "Please provide an answer before submitting.",
                         },
-                    },
-                    403,
+                    }
+
+                if ctftime() or current_user.is_admin():
+                    pending = Pending(
+                        user_id=user.id,
+                        team_id=team.id if team else None,
+                        challenge_id=challenge_id,
+                        ip=get_ip(req=request),
+                        provided=submission_value,
+                    )
+                    db.session.add(pending)
+                    db.session.commit()
+                    clear_challenges()
+
+                log(
+                    "submissions",
+                    "[{date}] {name} submitted {submission} on {challenge_id} with kpm {kpm} [PENDING REVIEW]",
+                    name=user.name,
+                    submission=request_data.get("submission", "").encode("utf-8"),
+                    challenge_id=challenge_id,
+                    kpm=kpm,
                 )
+                return {
+                    "success": True,
+                    "data": {
+                        "status": "pending",
+                        "message": "Answer submitted. An instructor will review it shortly - "
+                        "you will receive your points once it is approved.",
+                    },
+                }
 
             status, message = chal_class.attempt(challenge, request)
             if status:  # The challenge plugin says the input is right
@@ -679,13 +896,23 @@
                     # Add a punctuation mark if there isn't one
                     if message[-1] not in "!().;?[]{}":
                         message = message + "."
+                    message = "{} You have {} {} remaining.".format(
+                        message, attempts_left, tries_str
+                    )
+                    if attempts_left == 0:
+                        max_attempts_behavior = get_config(
+                            "max_attempts_behavior", "lockout"
+                        )
+                        if max_attempts_behavior == "timeout":
+                            max_attempts_timeout = int(
+                                get_config("max_attempts_timeout", 300)
+                            )
+                            message += f" Try again in {math.ceil(max_attempts_timeout / 60)} minutes."
                     return {
                         "success": True,
                         "data": {
                             "status": "incorrect",
-                            "message": "{} You have {} {} remaining.".format(
-                                message, attempts_left, tries_str
-                            ),
+                            "message": message,
                         },
                     }
                 else:
@@ -704,11 +931,12 @@
                 challenge_id=challenge_id,
                 kpm=kpm,
             )
+            status, message = chal_class.attempt(challenge, request)
             return {
                 "success": True,
                 "data": {
                     "status": "already_solved",
-                    "message": "You already solved this",
+                    "message": f"{message} but you already solved this",
                 },
             }
 
```

### CTFd/models/__init__.py

```diff
--- a/CTFd/models/__init__.py (CTFd 3.7.7)
+++ b/CTFd/models/__init__.py (NSK)
@@ -115,6 +115,12 @@
     attribution = db.Column(db.Text)
     connection_info = db.Column(db.Text)
     next_id = db.Column(db.Integer, db.ForeignKey("challenges.id", ondelete="SET NULL"))
+    # Controls the order challenges are displayed in. Higher values appear
+    # first, so the newest activity a student should tackle is at the top.
+    order_id = db.Column(db.Integer, default=0, index=True)
+    # Seconds a student must wait between submissions on this challenge.
+    # 0 disables the wait. Used to stop rapid guessing on multiple choice.
+    cooldown = db.Column(db.Integer, default=0)
     max_attempts = db.Column(db.Integer, default=0)
     value = db.Column(db.Integer)
     category = db.Column(db.String(80))
@@ -915,6 +921,17 @@
     __mapper_args__ = {"polymorphic_identity": "incorrect"}
 
 
+class Pending(Submissions):
+    """A submission that requires manual review by an administrator.
+
+    Used by challenges whose flag type is "manual". The submission is stored
+    with type "pending" until an admin approves it (converted to a Solve and
+    awarded points) or rejects it (converted to a Fail).
+    """
+
+    __mapper_args__ = {"polymorphic_identity": "pending"}
+
+
 class Discards(Submissions):
     __mapper_args__ = {"polymorphic_identity": "discard"}
 
```

### CTFd/utils/challenges/__init__.py

```diff
--- a/CTFd/utils/challenges/__init__.py (CTFd 3.7.7)
+++ b/CTFd/utils/challenges/__init__.py (NSK)
@@ -5,7 +5,8 @@
 from sqlalchemy.sql import and_, false, true
 
 from CTFd.cache import cache
-from CTFd.models import Challenges, Solves, Users, db
+from CTFd.models import Challenges, Solves, Submissions, Users, db
+from CTFd.schemas.submissions import SubmissionSchema
 from CTFd.schemas.tags import TagSchema
 from CTFd.utils import get_config
 from CTFd.utils.dates import isoformat, unix_time_to_utc
@@ -13,7 +14,17 @@
 from CTFd.utils.modes import generate_account_url, get_model
 
 Challenge = namedtuple(
-    "Challenge", ["id", "type", "name", "value", "category", "tags", "requirements"]
+    "Challenge",
+    [
+        "id",
+        "type",
+        "name",
+        "value",
+        "category",
+        "tags",
+        "requirements",
+        "order_id",
+    ],
 )
 
 
@@ -29,7 +40,7 @@
     chal_q = (
         chal_q.filter_by(**query_args)
         .filter(*filters)
-        .order_by(Challenges.value, Challenges.id)
+        .order_by(Challenges.order_id.desc(), Challenges.value, Challenges.id)
     )
     tag_schema = TagSchema(view="user", many=True)
 
@@ -43,6 +54,7 @@
             category=c.category,
             requirements=c.requirements,
             tags=tag_schema.dump(c.tags).data,
+            order_id=c.order_id or 0,
         )
         results.append(ct)
     return results
@@ -87,6 +99,21 @@
 
 
 @cache.memoize(timeout=60)
+def get_submissions_for_user_id_for_challenge_id(user_id, challenge_id):
+    user = Users.query.filter_by(id=user_id).first()
+    submissions = (
+        Submissions.query.join(Users)
+        .filter(
+            Submissions.challenge_id == challenge_id,
+            Submissions.account_id == user.account_id,
+        )
+        .order_by(Submissions.date.desc())
+    )
+    response = SubmissionSchema(view="self", many=True).dump(submissions)
+    return response
+
+
+@cache.memoize(timeout=60)
 def get_solve_ids_for_user_id(user_id):
     user = Users.query.filter_by(id=user_id).first()
     solve_ids = (
```

### CTFd/utils/scores/__init__.py

```diff
--- a/CTFd/utils/scores/__init__.py (CTFd 3.7.7)
+++ b/CTFd/utils/scores/__init__.py (NSK)
@@ -185,12 +185,15 @@
                 Teams.id.label("team_id"),
                 Teams.oauth_id.label("oauth_id"),
                 Teams.name.label("name"),
+                Teams.bracket_id.label("bracket_id"),
+                Brackets.name.label("bracket_name"),
                 Teams.hidden,
                 Teams.banned,
                 sumscores.columns.score,
                 *fields,
             )
             .join(sumscores, Teams.id == sumscores.columns.team_id)
+            .join(Brackets, isouter=True)
             .order_by(
                 sumscores.columns.score.desc(),
                 sumscores.columns.date.asc(),
@@ -203,10 +206,13 @@
                 Teams.id.label("team_id"),
                 Teams.oauth_id.label("oauth_id"),
                 Teams.name.label("name"),
+                Teams.bracket_id.label("bracket_id"),
+                Brackets.name.label("bracket_name"),
                 sumscores.columns.score,
                 *fields,
             )
             .join(sumscores, Teams.id == sumscores.columns.team_id)
+            .join(Brackets, isouter=True)
             .filter(Teams.banned == False)
             .filter(Teams.hidden == False)
             .order_by(
@@ -279,12 +285,15 @@
                 Users.oauth_id.label("oauth_id"),
                 Users.name.label("name"),
                 Users.team_id.label("team_id"),
+                Users.bracket_id.label("bracket_id"),
+                Brackets.name.label("bracket_name"),
                 Users.hidden,
                 Users.banned,
                 sumscores.columns.score,
                 *fields,
             )
             .join(sumscores, Users.id == sumscores.columns.user_id)
+            .join(Brackets, isouter=True)
             .order_by(
                 sumscores.columns.score.desc(),
                 sumscores.columns.date.asc(),
@@ -298,10 +307,13 @@
                 Users.oauth_id.label("oauth_id"),
                 Users.name.label("name"),
                 Users.team_id.label("team_id"),
+                Users.bracket_id.label("bracket_id"),
+                Brackets.name.label("bracket_name"),
                 sumscores.columns.score,
                 *fields,
             )
             .join(sumscores, Users.id == sumscores.columns.user_id)
+            .join(Brackets, isouter=True)
             .filter(Users.banned == False, Users.hidden == False)
             .order_by(
                 sumscores.columns.score.desc(),
```

### CTFd/plugins/flags/__init__.py

```diff
--- a/CTFd/plugins/flags/__init__.py (CTFd 3.7.7)
+++ b/CTFd/plugins/flags/__init__.py (NSK)
@@ -69,7 +69,78 @@
         return res and res.group() == provided
 
 
-FLAG_CLASSES = {"static": CTFdStaticFlag, "regex": CTFdRegexFlag}
+class WorkshopChoiceFlag(BaseFlag):
+    """Multiple-choice answer.
+
+    The flag content holds the accepted choice(s). Several accepted answers can
+    be separated by "|". Comparison is case-insensitive and whitespace-tolerant
+    so that the value submitted by the radio/checkbox UI always matches.
+    """
+
+    name = "choice"
+    templates = {
+        "create": "/plugins/flags/assets/choice/create.html",
+        "update": "/plugins/flags/assets/choice/edit.html",
+    }
+
+    @staticmethod
+    def compare(chal_key_obj, provided):
+        saved = chal_key_obj.content or ""
+        accepted = [c.strip().lower() for c in saved.split("|") if c.strip()]
+
+        # Multi-select answers arrive comma separated; compare as a set so the
+        # order the student clicked the options in does not matter.
+        given = [c.strip().lower() for c in (provided or "").split(",") if c.strip()]
+
+        if not accepted or not given:
+            return False
+
+        if len(accepted) > 1 and chal_key_obj.data == "multiple":
+            return set(given) == set(accepted)
+
+        return len(given) == 1 and given[0] in accepted
+
+
+class WorkshopManualFlag(BaseFlag):
+    """An answer that an administrator must approve.
+
+    Nothing is compared automatically: any non-empty submission is accepted
+    into the review queue. The API turns this into a "pending" submission
+    rather than a solve, and points are awarded once an admin approves it.
+    """
+
+    name = "manual"
+    templates = {
+        "create": "/plugins/flags/assets/manual/create.html",
+        "update": "/plugins/flags/assets/manual/edit.html",
+    }
+    # Marks this flag type as requiring review. Read by the challenges API.
+    requires_review = True
+
+    @staticmethod
+    def compare(chal_key_obj, provided):
+        # A non-empty answer is enough to be queued for review.
+        return bool((provided or "").strip())
+
+
+FLAG_CLASSES = {
+    "static": CTFdStaticFlag,
+    "regex": CTFdRegexFlag,
+    "choice": WorkshopChoiceFlag,
+    "manual": WorkshopManualFlag,
+}
+
+
+def challenge_requires_review(challenge_id):
+    """True when a challenge has at least one flag needing manual approval."""
+    from CTFd.models import Flags
+
+    flags = Flags.query.filter_by(challenge_id=challenge_id).all()
+    for flag in flags:
+        cls = FLAG_CLASSES.get(flag.type)
+        if cls is not None and getattr(cls, "requires_review", False):
+            return True
+    return False
 
 
 def get_flag_class(class_id):
```
