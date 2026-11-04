# G3: Submissions, the review queue, flags, hints and users API (NSK-CTF compared with CTFd 3.7.7)

**Scope:** `CTFd/admin/submissions.py`, `CTFd/api/v1/submissions.py`, `CTFd/api/v1/flags.py`, `CTFd/api/v1/hints.py`, `CTFd/api/v1/users.py`, `CTFd/schemas/submissions.py`, plus the new `CTFd/themes/admin/templates/review.html`.
**Method:** I fetched each upstream file from `raw.githubusercontent.com/CTFd/CTFd/3.7.7/...` and compared it line by line with the NSK copy. Some hunks did not match 3.7.7. I fetched those files from the **3.8.0** tag as well, to confirm where they came from.

## Key finding: there are two kinds of change

| File | NSK custom ("workshop review queue") | Taken unchanged from upstream **CTFd 3.8.0** |
|---|---|---|
| admin/submissions.py | **YES**: new `/admin/submissions/review` route | – |
| api/v1/submissions.py | **YES**: `/pending`, `/<id>/approve`, `/<id>/reject` | – |
| themes/admin/templates/review.html | **YES** (new file) | – |
| api/v1/flags.py | no | **YES**: whitespace strip on static/regex flags |
| api/v1/hints.py | no | **YES**: the whole file matches 3.8.0 exactly (`hints_free_public_access`, explicit unlock for free hints, `?preview` for prerequisites) |
| api/v1/users.py | no | **YES**: new `/api/v1/users/me/submissions` (3.8.0) |
| schemas/submissions.py | no | **YES**: new `"self"` view (3.8.0) |

`CTFd/__init__.py` still says `__version__ = "3.7.7"`, but these four files are the **3.8.0 versions**. For hints.py, flags.py and the `self` schema view I confirmed this by comparing against the fetched 3.8.0 source. For users.py I compared section by section; the only differences from 3.7.7 are the 3.8.0 hunks. Other parts of the fork probably carry 3.8.0 code too: `forms/config.py` (`hints_free_public_access`, `view_self_submissions`), `admin/templates/configs/challenges.html`, `utils/challenges.get_submissions_for_user_id_for_challenge_id`. Those files belong to other groups. **Porting advice for "Hack the Brewery":** if the new platform runs CTFd >= 3.8.0, the 3.8.0 hunks are already there and only the NSK review-queue code has to be ported. If it runs stock 3.7.7, you must bring over the backports and the files they depend on (see the "Depends on" notes in each section).

---

## 1. `CTFd/admin/submissions.py` (NSK custom, +15 lines)

Lines 1–65 are identical to 3.7.7. One hunk adds a new view at the end of the file:

```diff
+@admin.route("/admin/submissions/review")
+@admins_only
+def submissions_review():
+    """Queue of answers waiting for an administrator to approve or reject."""
+    from CTFd.models import Pending
+
+    pending = (
+        Pending.query.join(Challenges, Pending.challenge_id == Challenges.id)
+        .order_by(Pending.date.asc())
+        .all()
+    )
+
+    return render_template("admin/review.html", pending=pending)
```

- **Behaviour:** an admin-only HTML page listing every `Pending` submission, oldest first (FIFO). There is no pagination.
- **Auth:** `@admins_only`, the same as every other admin view.
- **Routing note:** the existing rule `/admin/submissions/<submission_type>` would also match the string "review". Werkzeug gives static rules priority over converter rules, so `/review` resolves to the new view. The upstream listing is still available at `/admin/submissions/pending`, because the `type` filter is generic.
- **Quirks:**
  - The INNER JOIN on Challenges drops pending rows whose challenge has been deleted. The FK has `ondelete=CASCADE`, so this should not happen in practice.
  - `Pending` is imported locally, inside the function.
- **Depends on:**
  - `Pending` model (`CTFd/models/__init__.py`, polymorphic identity `"pending"`).
  - `admin/review.html`.
  - Admin `base.html` navbar link `url_for('admin.submissions_review')`.
  - Jinja global `pending_review_count()` (`utils/initialization/__init__.py`).

## 2. `CTFd/api/v1/submissions.py` (NSK custom, +110 lines)

### Hunk 2a: imports
```diff
-from CTFd.models import Solves, Submissions, db
+from CTFd.models import Fails, Pending, Solves, Submissions, db
 from CTFd.schemas.submissions import SubmissionSchema
+from CTFd.utils.dates import isoformat
```

### Unchanged code
These are byte-identical to 3.7.7:
- `SubmissionsList.get/post`
- `Submission.get/patch/delete`

Note that the stock `PATCH /api/v1/submissions/<id>` with `{"type":"correct"}` also works on a pending row: it creates a Solve that keeps the original date, and re-types the pending row to `discard`. This gives a second, unofficial way to approve.

### Hunk 2b: new `GET /api/v1/submissions/pending` (`PendingSubmissionsList`)
```python
@submissions_namespace.route("/pending")
class PendingSubmissionsList(Resource):
    @admins_only
    def get(self):
        pending = Pending.query.order_by(Pending.date.asc()).all()
        ... data.append({ "id", "provided", "date": isoformat(...), "ip", "challenge_id",
                          "challenge": {id,name,value,category} (or "(deleted)"/0/""),
                          "account_id", "account": {id,name} (or "(deleted)") })
        return {"success": True, "data": data}
```
- Admin-only. The JSON is built by hand; it does not use `SubmissionSchema`. It is not paginated.
- `account` / `account_id` follow `user_mode`: in teams mode they hold the team, otherwise the user.
- The `.doc` advertises `SubmissionListSuccessResponse`, but the actual shape is different (cosmetic).
- The NSK admin UI does **not** call this endpoint; it is server-rendered. It exists for API or automation clients, such as a hint bot or an external grader.
- **Routing:** this rule is registered after `/<submission_id>`. Werkzeug still matches the static `/pending` first for GET. A PATCH or DELETE to `/pending` falls through to `/<submission_id>`, which returns 404 (harmless).

### Hunk 2c: new `POST /api/v1/submissions/<int:id>/approve` (`SubmissionApprove`)
```python
submission = Pending.query.filter_by(id=submission_id).first_or_404()
already = Solves.query.filter_by(account_id=submission.account_id,
                                 challenge_id=submission.challenge_id).first()
if already is None:
    db.session.add(Solves(user_id=..., team_id=..., challenge_id=..., ip=..., provided=...))
db.session.delete(submission)         # pending row consumed either way
db.session.commit(); clear_standings(); clear_challenges(); db.session.close()
return {"success": True}
```
- **Behaviour:** turns a pending row into a solve (points through the normal Solves/score path) and removes the row from the queue.
- **Guard:**
  - If the account has already solved the challenge (for example a double click or two admins), no second Solve is created. Without this check the `UniqueConstraint(challenge_id,user_id/team_id)` would fail.
  - In that case the pending row is deleted **without** any record: no Discard is kept and the answer text is lost.
- **Semantic differences from a normal solve:**
  - **Solve date = approval time.** `date` is not copied, unlike the stock PATCH, which copies `submission.date`. Scoreboard order and tie-breaks therefore depend on how quickly the admin acts.
  - `chal_class.solve()` is **not** called. Challenge-type hooks do not run; in particular, **dynamic-value challenges do not recalculate their decay**, and plugin `solve()` side-effects are skipped.
  - There is no `ctftime()` / freeze check, because this is an admin action.
- **Auth:** `@admins_only`. CSRF is handled by CTFd's standard API nonce check; the UI uses `CTFd.fetch`, which sends the `CSRF-Token` header.

### Hunk 2d: new `POST /api/v1/submissions/<int:id>/reject` (`SubmissionReject`)
- Creates a `Fails` row (type `incorrect`) with the same user/team/challenge/ip/provided values, deletes the pending row, clears caches and returns `{"success":true}`.
- The Fail's date is the rejection time.
- **Side-effect:** a rejection counts as a wrong attempt. It is therefore included in the `max_attempts` lockout/timeout counting in `challenges.py` (`fails_query`) and in the NSK cooldown feature. The student can resubmit, because the pending row is gone.

### Security summary
- All three endpoints are `@admins_only`, and no existing decorator was changed.
- The only data exposed is the participants' answers and IPs, to admins only.

### Depends on
- `models.Pending`.
- `plugins/flags.WorkshopManualFlag` (`name="manual"`, `requires_review=True`, which accepts any non-empty answer).
- `plugins/flags.challenge_requires_review()`.
- `api/v1/challenges.py`:
  - The attempt endpoint creates the `Pending` rows and returns `status:"pending"`.
  - The listing and detail endpoints expose `pending_review` / `awaiting_review` flags.
- Plus the front-end assets for the manual flag (`plugins/flags/assets/manual/*`).

## 3. `CTFd/api/v1/flags.py` (upstream 3.8.0 backport, not NSK-specific)

Two hunks, both identical to CTFd 3.8.0.

**3a, `FlagList.post`, after the schema has loaded:**
```diff
+        # We only want to operate on flag types where are have
+        # high confidence a leading/trailing space was not intentional
+        if response.data.type in ("static", "regex"):
+            response.data.content = response.data.content.strip()
```

**3b, `Flag.patch`, before the schema loads:**
```diff
+        if flag.type in ("static", "regex") and req.get("content"):
+            req["content"] = req["content"].strip()
```

- **Behaviour:** leading and trailing whitespace is removed from static and regex flag content when the flag is created or edited. The NSK flag types `choice` and `manual` are left untouched. In PATCH, the check uses the flag's *existing* type.
- There are no changes to authentication, endpoints or fields.

## 4. `CTFd/api/v1/hints.py` (upstream 3.8.0 backport; the file is identical to the 3.8.0 tag)

**4a, imports:** adds `from CTFd.utils import get_config`.

**4b, `Hint.get`, anonymous user and a free hint with no prerequisites:**
```diff
         if user is None:
             if hint.cost or hint.prerequisites:
                 return {... "You must login to unlock this hint"}, 403
+            else:
+                # Allow admins to allow public CTFs to see free hints if they wish
+                if bool(get_config("hints_free_public_access", False)) is True:
+                    response = HintSchema(view="unlocked").dump(hint)
+                    return {"success": True, "data": response.data}
+                else:
+                    return ({... "You must login to unlock this hint"}, 403)
```
In 3.7.7, anonymous users could read free hints whenever challenges were public. Now this is **denied by default** and allowed only when the config key `hints_free_public_access` is set. The admin form/template for that key lives in other files. *This is a security tightening.*

**4c, prerequisite check:**
```diff
-            # Get the IDs of all free hints
-            free_hints = Hints.query.filter_by(cost=0).all()
-            free_ids = {h.id for h in free_hints}
-            # Add free hints to unlocked IDs
-            unlock_ids.update(free_ids)
 ...
-            if unlock_ids >= prereqs or is_admin():
-                pass
-            else:
-                return 403 ...
+            if unlock_ids >= prereqs:
+                pass
+            else:
+                if is_admin() and request.args.get("preview", False):
+                    pass
+                else:
+                    return 403 ...
```
- Free hints no longer count automatically toward prerequisites. They must actually be unlocked (there must be a `HintUnlocks` row).
- Admins now bypass prerequisites only when they pass `?preview=...`.

**4d, choosing the view:**
```diff
-        view = "unlocked"
-        if hint.cost:
-            view = "locked"
-            unlocked = HintUnlocks.query.filter_by(account_id=user.account_id, target=hint.id).first()
-            if unlocked:
-                view = "unlocked"
+        view = "locked"
+        unlocked = HintUnlocks.query.filter_by(account_id=user.account_id, target=hint.id).first()
+        if unlocked:
+            view = "unlocked"
```
- **Behaviour change:** free (cost 0) hints now come back **locked**, with no content, until the user creates an unlock with `POST /api/v1/unlocks`, which is free because the cost is 0.
- This is the 3.8.0 "click to reveal, even when free" model. The theme JavaScript must unlock before it displays the hint. Check that core-beta `challenge.html` / `challenges.js` is the matching version; those files belong to another group.

**Unchanged:**
- List, POST, PATCH and DELETE (still `@admins_only`).
- The decorators on GET (`during_ctf_time_only`, `check_challenge_visibility`).

**Security note:** neither 3.7.7, 3.8.0 nor NSK checks `hint.challenge.state == "hidden"` or `can_access_challenge` in `Hint.get`. Upstream **master** later added both checks: the hint of a hidden or prerequisite-locked challenge can be read by ID. Consider adding them on the new platform.

## 5. `CTFd/api/v1/users.py` (upstream 3.8.0 backport)

**5a, imports:**
```diff
+from CTFd.utils.challenges import get_submissions_for_user_id_for_challenge_id
-from CTFd.utils.config import get_mail_provider
+from CTFd.utils.config import get_config, get_mail_provider
```

**5b, new endpoint `GET /api/v1/users/me/submissions`:**
```python
@users_namespace.route("/me/submissions")
class UserPrivateSubmissions(Resource):
    @authed_only
    def get(self):
        # TODO: CTFd 4.0 Self viewing submissions should not be enabled by default until further notice
        if bool(get_config("view_self_submissions")) is False:
            abort(403)
        user = get_current_user()
        challenge_id = request.args.get("challenge_id")
        response = get_submissions_for_user_id_for_challenge_id(user_id=user.id, challenge_id=challenge_id)
        ...
        return {"success": True, "data": response.data, "meta": {"count": count}}
```
- **Behaviour:** a logged-in player can list their own account's submissions for one challenge, including the `provided` answer text. In teams mode this covers the whole team, because the helper filters on `account_id`.
- The results include **all** submission types, so players also see their own `pending` and `discard` rows.
- It is gated by the config key `view_self_submissions`, which is off by default and returns 403 when off. The NSK `forms/config.py` and the core-beta `challenge.html` reference this key.
- **Auth:** `@authed_only`; the endpoint only reads the current user's own data.
- **Depends on:**
  - `utils/challenges.get_submissions_for_user_id_for_challenge_id` (from 3.8.0; it uses the `"self"` schema view).
  - The config form and template.

All other endpoints are unchanged from 3.7.7, and no decorators were changed. The file does not reference `Pending`; pending rows are not counted in `/me/fails` or `/me/solves`.

## 6. `CTFd/schemas/submissions.py` (upstream 3.8.0 backport)
```diff
         "user": ["challenge_id", "challenge", "user", "team", "date", "type", "id"],
+        "self": [
+            "challenge_id", "challenge", "user", "team", "date", "type", "id", "provided",
+        ],
     }
```
- A new view `self` is the same as `user` plus `provided`. It does not include `ip`.
- It is used only by `get_submissions_for_user_id_for_challenge_id`, which serves `/users/me/submissions`.
- Nothing else changed.

## 7. `CTFd/themes/admin/templates/review.html` (NEW, NSK custom, 162 lines)

`{% extends "admin/base.html" %}`, rendered by `admin.submissions_review` with the `pending` list.

**Content block:**
- Jumbotron with the heading "Awaiting review" and the subtitle "Answers submitted for activities that an instructor must approve." The wording follows NSK's workshop vocabulary: "student", "activity", "instructor".
- If `pending` is not empty:
  - The counter text "N answer(s) waiting. Approving awards the points and lets the student continue."
  - A `table.table-striped` with the columns **ID | Student | Activity | Answer | Points | Submitted | Action**. Each row has `id="review-row-{{id}}"`.
  - **Student:** `item.account.name`, linked to `url_for('admin.users_detail', user_id=item.user_id)`. *Quirk:* in teams mode the link text is the team name but the link opens the user page. Shows "(deleted)" if the account is gone.
  - **Activity:** the challenge name, linked to `admin.challenges_detail`, with the category in small muted text below it.
  - **Answer:** `<code class="ns-review-answer">{{ item.provided }}</code>`. Jinja autoescaping prevents XSS. The CSS class `.ns-review-answer` (monospace, light navy background, block, padded) is defined in `themes/admin/assets/css/main.scss` around line 242, so that SCSS must be carried over too.
  - **Points:** `challenge.value`.
  - **Submitted:** `{{ item.date | isoformat }}` (the stock Jinja filter).
  - **Action:** a `btn-group-sm` with **Approve** (`btn-success review-approve`, `fa-check`) and **Reject** (`btn-outline-danger review-reject`, `fa-times`), both carrying `data-submission-id`.
- If `pending` is empty: a centred `fa-check-circle` icon with "Nothing waiting / Answers that need approval will appear here. Mark an activity's flag as **Requires approval** to use this queue."

**Scripts block:** inline vanilla JavaScript (an IIFE, no build step).
- `act(id, action, button)`:
  1. Disables both buttons in the group.
  2. Calls `CTFd.fetch("/api/v1/submissions/"+id+"/"+action, {method:"POST"})`.
  3. On `success`, fades the row out (opacity transition 0.2s) and removes it.
  4. Otherwise it shows `alert("Could not <action> this submission.")` and re-enables the buttons. The same happens in `.catch`.
- The Approve buttons call `act(...,"approve")` immediately, with no confirmation.
- The Reject buttons first ask `confirm("Reject this answer? It will be recorded as incorrect and the student can try again.")`.
- The page does not poll or refresh itself. New submissions appear only after a reload. The navbar badge count is also only computed when a page renders.

**Related changes (owned by other groups):**
- Admin `base.html`: the Submissions dropdown gains a bold "Awaiting review" entry with the badge `pending_review_count()`, followed by a divider.
- `utils/initialization` registers the Jinja global `pending_review_count`. It runs `Pending.query.count()` with a try/except fallback to 0, on every admin page render.

---

## Porting checklist for Hack the Brewery

### Review queue: everything needed
1. `Pending(Submissions)` model with polymorphic identity `"pending"`. **No migration is needed**: it reuses the `submissions` table and its `type` column.
2. Flag type `manual` (`WorkshopManualFlag`, `requires_review=True`), the `challenge_requires_review()` helper, and the flag-type templates `plugins/flags/assets/manual/{create,edit}.html`.
3. The attempt branch in `api/v1/challenges.py`:
   - Creates the Pending row and returns `status:"pending"`.
   - Allows only one pending row per account and challenge.
   - Rejects empty answers.
   - Logs `[PENDING REVIEW]`.
   - Adds the `pending_review` / `awaiting_review` fields to the listing and detail responses.
4. The three API endpoints from section 2, plus the admin route from section 1, `review.html`, the navbar entry and badge, the `pending_review_count` Jinja global, and the `.ns-review-answer` CSS.
5. Front end (core-beta): handle `status:"pending"` and show the "awaiting review" state. This belongs to the theme groups.

### Improvements to consider
- Copy `date` from the pending row on approve, or make this a deliberate choice.
- Call `chal_class.solve()` so dynamic scoring and plugin hooks run.
- Record a `Discard` instead of silently deleting when the challenge is already solved.
- Decide whether rejections should count toward attempt limits.
- Fix the teams-mode Student link.
- Add the master-branch hidden-challenge check to `Hint.get`.
- Base the platform on CTFd 3.8.x rather than 3.7.7 + backports: the fork already behaves like 3.8.0 in hints, flags, `users/me/submissions` and the submission schema.
