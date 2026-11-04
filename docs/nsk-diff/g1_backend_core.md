# G1 - Backend core: NSK-CTF vs stock CTFd 3.7.7

Method: each upstream file was fetched from `https://raw.githubusercontent.com/CTFd/CTFd/3.7.7/<path>` and compared line by line with the NSK copy (`_nskdiff/NSK-CTF-main/`). Every hunk is listed below. Lines marked `-` are upstream and `+` are NSK.

Summary table

| File | Nature of change | Netskope-specific strings |
|---|---|---|
| CTFd/__init__.py | Removes the DB-upgrade prompt and the update phone-home | none |
| CTFd/views.py | Removes the stock banner index page and `/setup/integrations` (MLC). Adds the `index.html` landing override and a new `/images/<path>` route | none (only comments that mention "workshop") |
| CTFd/cache/__init__.py | `clear_challenges()` also clears the per-user submissions memo | none |
| CTFd/cli/__init__.py | Removes `build jsenums`. Adds `sync-content`, `create-students`, `list-content` | **`Netskope1!`** default password, `Student` prefix, `@workshop.local` |
| CTFd/constants/themes.py | `DEFAULT_THEME` "core" -> "core-beta" | none |
| CTFd/forms/auth.py | Button labels "Create account" / "Sign in" | none |
| CTFd/forms/config.py | New `ChallengeSettingsForm` (backport from 3.8) | none |
| CTFd/utils/initialization/__init__.py | New Jinja global `pending_review_count`. The setup whitelist drops `views.integrations` and adds `views.images` | none |
| CTFd/utils/security/sanitize.py | pybluemonday replaced by nh3 (exact copy of CTFd 3.8.0 file) | none |
| CTFd/utils/uploads/uploaders.py | `S3Uploader.open()` creates the local dir before download | none |

---

## 1. CTFd/__init__.py

### Hunk 1.1: imports (top of file)
```diff
 import datetime
 import os
-import sys
 import time
 import weakref
-from distutils.version import StrictVersion
 ...
 from CTFd.utils.sessions import CachingSessionInterface
-from CTFd.utils.updates import update_check
 from CTFd.utils.user import get_locale
```
These imports are removed because the code that used them is gone. A side effect is that CTFd no longer depends on `distutils`, which is removed in Python 3.12.

### Hunk 1.2: module functions `confirm_upgrade()` and `run_upgrade()` removed
```diff
-def confirm_upgrade():
-    if sys.stdin.isatty():
-        print("/*\\ CTFd has updated and must update the database! /*\\")
-        ...
-        if input("Run database migrations (Y/N)").lower().strip() == "y":  # nosec B322
-            return True
-        ...
-
-def run_upgrade():
-    upgrade()
-    utils.set_config("ctf_version", __version__)
```
No other NSK file references them (checked with grep).

### Hunk 1.3: `create_app()`, SQLite branch comment (cosmetic only)
```diff
-            # Enable foreign keys for SQLite. This must be before the
-            # db.create_all call because tests use the in-memory SQLite
-            # database (each connection, including db creation, is a new db).
+            # Enable foreign keys for SQLite.
             # https://docs.sqlalchemy.org/...
```
This changes a comment only and has no behaviour change.

### Hunk 1.4: `create_app()` removes the version-upgrade block and `update_check`
```diff
         version = utils.get_config("ctf_version")

-        # Upgrading from an older version of CTFd
-        if version and (StrictVersion(version) < StrictVersion(__version__)):
-            if confirm_upgrade():
-                run_upgrade()
-            else:
-                exit()
-
         if not version:
             utils.set_config("ctf_version", __version__)

         if not utils.get_config("ctf_theme"):
             utils.set_config("ctf_theme", "core-beta")

-        update_check(force=True)
-
         init_request_processors(app)
```
Behaviour:
- The app no longer runs `flask_migrate.upgrade()` or prompts "Run database migrations (Y/N)" when the stored `ctf_version` is older than the code. Non-SQLite databases still run `upgrade()` earlier in `create_app` (that part is unchanged). SQLite databases still use `create_all` + `stamp_latest_revision`.
- Startup no longer calls `update_check(force=True)`, so the instance does not contact the CTFd update server at boot. `CTFd/admin/statistics.py` still calls `update_check()` when an admin opens the statistics page; that file is outside G1.
- Unchanged: `__version__ = "3.7.7"`, and the `ctf_theme` fallback "core-beta", which upstream 3.7.7 also uses.

Rebrand: nothing.

---

## 2. CTFd/views.py

Imports are identical to upstream. `is_admin` and `is_setup` are still imported but are now unused because `integrations()` was deleted. This only produces a lint warning.

### Hunk 2.1: `setup()` no longer writes the stock CTFd banner index page
```diff
             # Splice in our banner
-            index = f"""<div class="row">
-    <div class="col-md-6 offset-md-3">
-        <img class="w-100 mx-auto d-block" ... src="{default_ctf_banner_location}" />
-        <h3 class="text-center">
-            <p>A cool CTF platform from <a href="https://ctfd.io">ctfd.io</a></p>
-            ... twitter/facebook/github links ...
-        <h4 class="text-center">
-            <a href="admin">Click here</a> to login and setup your CTF
-        ...
-</div>"""
-            page.content = index
+            # The landing page content comes from data/Home.md (synced with
+            # `manage.py sync-content`). Leaving it empty here shows the
+            # workshop's built-in welcome screen until then, instead of the
+            # stock CTFd banner page.
```
Behaviour: setup still creates `Pages(route="index", content="")`, but leaves the content empty. The banner upload (`ctf_banner`) is still processed and stored in config. `default_ctf_banner_location` is still computed but is now unused (dead variable).

### Hunk 2.2: route `/setup/integrations` (`integrations()`) removed
```diff
-@views.route("/setup/integrations", methods=["GET", "POST"])
-def integrations():
-    if is_admin() or is_setup() is False:
-        ... MajorLeagueCyber (mlc) oauth_client_id / oauth_client_secret ...
```
The MLC OAuth integration endpoint no longer exists. The matching endpoint was also removed from the setup whitelist in initialization (see 8.2). Grep found no `url_for('views.integrations')` anywhere in NSK, so nothing breaks.

### Hunk 2.3: `static_html()` serves a template-based landing page for `/`
```diff
     page = get_page(route)
+
+    # The landing page is a purpose-built template rather than a database
+    # page, so the workshop always has a proper welcome screen. Any content
+    # authored for the "index" page is rendered inside it.
+    if route == "index":
+        try:
+            return render_template("index.html", page=page)
+        except TemplateNotFound:
+            if page is None:
+                abort(404)
+
     if page is None:
```
Behaviour: `/` always renders the theme's `index.html` (NSK ships `CTFd/themes/core-beta/templates/index.html`) and passes the DB `page`, which may be `None`. That bypasses `auth_required` for the index page. If the theme has no `index.html`, the route falls back to the stock page logic.

Dependency: the `core-beta/templates/index.html` template, which is where the landing branding lives (not in G1).

### Hunk 2.4: new route `/images/<path:path>` (`views.images`)
```diff
+@views.route("/images/<path:path>")
+def images(path):
+    """Serve workshop images straight from the content directory.
+    Images are managed by dropping files into ``data/images/`` ...
+    Reference them in challenge Markdown as ``![alt](/images/my-screenshot.png)``.
+    """
+    from CTFd.utils.content import get_images_dir
+
+    images_dir = get_images_dir(app)
+    full_path = safe_join(images_dir, path)
+    if full_path is None or not os.path.isfile(full_path):
+        abort(404)
+    response = send_file(full_path, conditional=True)
+    response.headers["Cache-Control"] = "public, max-age=86400"
+    return response
```
Behaviour: a public route that needs no authentication and serves files from `<CONTENT_FOLDER or <project_root>/data>/images/`. It is protected against path traversal by `safe_join` and uses 1-day caching.

Dependency: `CTFd/utils/content/__init__.py` (`get_images_dir` -> `get_content_dir`), which reads the optional `app.config["CONTENT_FOLDER"]`. That key is not defined in `CTFd/config.py`; it defaults to `../data`. The endpoint is whitelisted pre-setup in initialization (8.2). `content.rewrite_image_urls()` probably produces these URLs.

All other routes (`notifications`, `settings`, `tos`, `privacy`, `files`, `themes`, `themes_beta`, `healthcheck`, `debug`, `robots`) are byte-identical to upstream.

Rebrand: nothing literal. The comments mention "workshop" and `data/Home.md`.

---

## 3. CTFd/cache/__init__.py

### Hunk 3.1: `clear_challenges()`
```diff
     from CTFd.utils.challenges import (
         get_solve_counts_for_challenges,
         get_solve_ids_for_user_id,
         get_solves_for_challenge_id,
+        get_submissions_for_user_id_for_challenge_id,
     )

     cache.delete_memoized(get_all_challenges)
     cache.delete_memoized(get_solves_for_challenge_id)
+    cache.delete_memoized(get_submissions_for_user_id_for_challenge_id)
     cache.delete_memoized(get_solve_ids_for_user_id)
```
Behaviour: it also invalidates the memoised per-user/per-challenge submission list.

Dependency: `CTFd/utils/challenges/__init__.py:102 get_submissions_for_user_id_for_challenge_id` (new in NSK, a 3.8-style backport), which is consumed by `CTFd/api/v1/users.py` (the "view self submissions" feature). The rest of the file is identical.

---

## 4. CTFd/cli/__init__.py

### Hunk 4.1: imports
```diff
-from flask import Blueprint, current_app
+from flask import Blueprint
```

### Hunk 4.2: `jsenums()` build command removed
```diff
-def jsenums():
-    ... writes themes/core/assets/js/constants.js from CTFd.constants.JS_ENUMS
-
-BUILD_COMMANDS = {"jsenums": jsenums}
+BUILD_COMMANDS = {}
```
This is needed because the `themes/core` directory was removed in NSK; only `admin` and `core-beta` remain. Side effect: `flask build <anything>` now raises `TypeError: 'NoneType' object is not callable`.

`get_config`, `set_config`, `build`, `export_ctf` and `import_ctf` are unchanged.

### Hunk 4.3: new CLI command `sync-content`
```python
@_cli.cli.command("sync-content")
@click.option("--prune", is_flag=True, help="Delete challenges that no longer have a file in data/")
@click.option("--no-overwrite", is_flag=True, help="Only create missing challenges; leave existing ones untouched")
def sync_content(prune=False, no_overwrite=False):
    from CTFd.utils.content import sync_content as sync_content_util
    summary = sync_content_util(prune=prune, overwrite=not no_overwrite)
    # prints challenges_created/updated, pages_created/updated, links, hints, skipped, pruned, warnings
```
Behaviour: imports Markdown files in `data/` (challenges, pages, flags, hints, prerequisites/"next" links) into the DB.

Dependency: `CTFd.utils.content.sync_content`. The summary keys it relies on are `challenges_created`, `challenges_updated`, `pages_created`, `pages_updated`, `links`, `hints`, `skipped`, `pruned` and `warnings`.

### Hunk 4.4: new CLI command `create-students`
```python
@_cli.cli.command("create-students")
@click.argument("count", type=click.IntRange(min=1))
@click.option("--password", default="Netskope1!", show_default=True, ...)
@click.option("--start", default=1, type=click.IntRange(min=1), ...)
@click.option("--prefix", default="Student", ...)
def create_students(count, password, start, prefix):
    for number in range(start, start + count):
        name = f"{prefix}{number}"
        email = f"{name.lower()}@workshop.local"
        # skip if name or email already exists (idempotent)
        db.session.add(Users(name=name, email=email, password=password, verified=True))
    db.session.commit(); clear_standings()
```
Behaviour: bulk-creates verified user accounts `Student<N>` / `student<N>@workshop.local` with a shared password. It skips existing accounts and clears the standings cache.

**Rebrand:** the default password **`Netskope1!`** must be changed (for example to a brewery or Exclusive Networks password). Also review the `Student` prefix, the `@workshop.local` email domain, and the help texts.

Dependencies: `CTFd.models.Users`, `CTFd.cache.clear_standings`.

### Hunk 4.5: new CLI command `list-content`
```python
@_cli.cli.command("list-content")
def list_content():
    from CTFd.utils.content import discover_content
    items = discover_content()
    # table: ORDER KIND CATEGORY TITLE FLAG LINKS (requires / next / hint title(cost) / ! warnings)
```
Behaviour: a dry-run listing of what `data/` defines.

Dependency: `CTFd.utils.content.discover_content`. The item keys it relies on are `is_page`, `order`, `category`, `title`, `flag_type`, `requires`, `next`, `hints[{title,cost}]` and `warnings`.

Usage is documented in NSK `commands.md` / `README.md` as `docker compose exec app python manage.py <cmd>`. The commands are registered via `init_cli` with `cli_group=None`.

---

## 5. CTFd/constants/themes.py

### Hunk 5.1
```diff
 ADMIN_THEME = "admin"
-DEFAULT_THEME = "core"
+DEFAULT_THEME = "core-beta"
```
Behaviour: the fallback/default theme becomes `core-beta`, which is the only player theme left in NSK because `themes/core` is deleted. This affects `THEME_FALLBACK` loading, `ctf_theme_candidates()`, the setup form default, the setup `TemplateNotFound` reset, and the export/reset `set_config("ctf_theme", DEFAULT_THEME)`.

---

## 6. CTFd/forms/auth.py

### Hunk 6.1: `RegistrationForm._RegistrationForm.submit`
```diff
-        submit = SubmitField(_l("Submit"))
+        submit = SubmitField(_l("Create account"))
```
### Hunk 6.2: `LoginForm.submit`
```diff
-    submit = SubmitField(_l("Submit"))
+    submit = SubmitField(_l("Sign in"))
```
These are UI text changes only. The new strings are not in the CTFd translation catalogues, so they stay English in every locale. `ResetPasswordRequestForm` and `ResetPasswordForm` still say "Submit".

---

## 7. CTFd/forms/config.py

### Hunk 7.1: new class `ChallengeSettingsForm` (inserted between `LegalSettingsForm` and `VisibilitySettingsForm`)
```python
class ChallengeSettingsForm(BaseForm):
    view_self_submissions = SelectField("View Self Submissions",
        description="Allow users to view their previous submissions",
        choices=[("true","Enabled"),("false","Disabled")], default="false")
    max_attempts_behavior = SelectField("Max Attempts Behavior",
        description="Set Max Attempts behavior to be a lockout or a timeout",
        choices=[("lockout","lockout"),("timeout","timeout")], default="lockout")
    max_attempts_timeout = IntegerField("Max Attempts Timeout Duration",
        description="... Default is 300 seconds", default=300)
    hints_free_public_access = SelectField("Hints Free Public Access",
        description="Control whether users must be logged in to see free hints ...",
        choices=[("true","Enabled"),("false","Disabled")], default="false")
```
This is a backport of the CTFd 3.8 challenge settings and has no submit button (the template provides it).

New config keys: `view_self_submissions`, `max_attempts_behavior`, `max_attempts_timeout`, `hints_free_public_access`.

Dependencies:
- The form is rendered by `CTFd/themes/admin/templates/configs/challenges.html` (`Forms.config.ChallengeSettingsForm`).
- The keys are consumed by `CTFd/api/v1/challenges.py`, `CTFd/api/v1/hints.py`, `CTFd/api/v1/users.py` and `core-beta/templates/challenge.html`, which are all in other groups.

The rest of the file is identical. The MLC registration-visibility choice is still present.

---

## 8. CTFd/utils/initialization/__init__.py

### Hunk 8.1: `init_template_globals()`, new Jinja global `pending_review_count`
```diff
     from CTFd.utils.countries.geoip import lookup_ip_address, lookup_ip_address_city

+    def pending_review_count():
+        """Number of submissions awaiting administrator approval."""
+        from CTFd.models import Pending
+
+        try:
+            return Pending.query.count()
+        except Exception:
+            return 0
+
+    app.jinja_env.globals.update(pending_review_count=pending_review_count)
     app.jinja_env.globals.update(config=config)
```
Behaviour: templates can show the number of submissions awaiting manual review. This supports the manual-review flag type.

Dependencies:
- `CTFd/models/__init__.py:924 class Pending(Submissions)`, which is a new NSK model (submission type "pending").
- It is used in `CTFd/themes/admin/templates/base.html:72` to show a review-count badge in the admin navbar.

### Hunk 8.2: `init_request_processors()` -> `needs_setup()` endpoint whitelist
```diff
             if request.endpoint in (
                 "views.setup",
-                "views.integrations",
                 "views.themes",
                 "views.files",
+                "views.images",
                 "views.healthcheck",
                 "views.robots",
             ):
```
These changes follow from the removed `integrations` route and the new `images` route (section 2).

Everything else (`init_cli`, filters, logs, events, tracker, banned, tokens, csrf, headers, subdirectory) is identical. The `integrations` Jinja global is still registered, which is harmless.

---

## 9. CTFd/utils/security/sanitize.py

### Hunk 9.1: whole-file rewrite, sanitizer engine pybluemonday -> nh3
The NSK file is **identical to upstream CTFd 3.8.0** `CTFd/utils/security/sanitize.py` (verified against `https://raw.githubusercontent.com/CTFd/CTFd/3.8.0/...`). Key differences from 3.7.7:
```diff
-from pybluemonday import UGCPolicy
+from copy import deepcopy
+import nh3
+from nh3 import Cleaner
+HTML_ALLOWED_ATTRIBUTES = deepcopy(nh3.ALLOWED_ATTRIBUTES)
+ALLOWED_TAGS = deepcopy(nh3.ALLOWED_TAGS)
 SAFE_ATTRS = ( ...
-    'rel', 'rev', ...
+    'rev', ...                         # 'rel' removed so nh3 link_rel can set it
 PAGE_STRUCTURE_TAGS = {
     "title": [],
+    "section": [],                     # <section> now allowed
 }
-SANITIZER = UGCPolicy()  + AllowElements/AllowAttrs/AllowStyling/AllowStandardURLs/
-  AllowDataAttributes/AllowDataURIImages/AllowRelativeURLs/RequireNoFollow.../AllowComments
+SANITIZER = Cleaner(
+    tags=ALLOWED_TAGS, attributes=HTML_ALLOWED_ATTRIBUTES,
+    link_rel="noopener noreferrer nofollow", strip_comments=False,
+    generic_attribute_prefixes={"data-", "aria-"},
+    url_schemes={"data", "http", "https", "tel", "mailto"},
+)
 def sanitize_html(html):
-    return SANITIZER.sanitize(html)
+    return SANITIZER.clean(html)
```
Behaviour:
- The sanitizer runs on nh3 (a Rust library), which removes the pybluemonday/Go dependency and so builds on ARM and newer Python.
- `<section>` is now allowed, along with `aria-*` attributes.
- All links get `rel="noopener noreferrer nofollow"`.
- Comments are kept.
- The allowed URL schemes are `data`, `http`, `https`, `tel` and `mailto`. Relative URLs are still allowed by nh3.

Dependency: `requirements.txt` has `nh3==0.3.0`, and pybluemonday should be removed. Likely motivation: the HTML in challenge and landing content uses `<section>`.

---

## 10. CTFd/utils/uploads/uploaders.py

### Hunk 10.1: `S3Uploader.open()`
```diff
     def open(self, filename, mode="rb"):
         local_folder = current_app.config.get("UPLOAD_FOLDER")
         local_path = os.path.join(local_folder, filename)
+        directory = os.path.dirname(local_path)
+        if not os.path.exists(directory):
+            os.makedirs(directory)
         self.s3.download_file(self.bucket, filename, local_path)
         return Path(local_path).open(mode=mode)
```
This is a bug fix: it creates the local `<hash>/` directory before an S3 download, so it no longer fails with FileNotFoundError. It is only relevant when the S3 upload provider is used. `FilesystemUploader` and the rest of the file are identical.

---

## Cross-file dependency summary (for porting)
- `CTFd/utils/content/__init__.py` (new NSK module) provides `get_images_dir`, `get_content_dir` (`CONTENT_FOLDER` app config, default `<root>/data`), `sync_content` and `discover_content`. It is used by views (`/images`) and by the CLI (`sync-content`, `list-content`).
- `CTFd/models/__init__.py` defines `Pending` (manual-review submissions), which feeds `pending_review_count` -> `admin/templates/base.html`.
- `CTFd/utils/challenges/__init__.py` provides `get_submissions_for_user_id_for_challenge_id`, which is used by `cache.clear_challenges` and `api/v1/users.py`.
- `ChallengeSettingsForm` is used by `admin/templates/configs/challenges.html`, and its config keys are read by `api/v1/challenges.py`, `hints.py`, `users.py` and `core-beta/challenge.html`.
- The theme `core-beta/templates/index.html` is required for the new `/` landing behaviour.
- `requirements.txt` needs `nh3==0.3.0` for sanitize.py.
- `themes/core` was removed, which is why `DEFAULT_THEME` became core-beta and the `jsenums` build command was dropped.

## Rebrand checklist (G1 files)
- `CTFd/cli/__init__.py` `create-students`: change the default `--password "Netskope1!"`. Optionally change the `Student` prefix and the `@workshop.local` domain.
- Comments in `views.py` mention "workshop" and `data/Home.md`. These are cosmetic only.
- No colours, logos or "Netskope" text otherwise appear in these 10 files.
