# G4 – Admin theme (`CTFd/themes/admin`) – NSK-CTF vs stock CTFd 3.7.7

Method: each upstream file was fetched from `raw.githubusercontent.com/CTFd/CTFd/3.7.7/...` and compared with `diff -u` (or line by line for the long Jinja templates) against the NSK copy. Every hunk is listed below. **[COSMETIC]** marks pure styling or text changes. **[FUNCTIONAL]** marks a change in behaviour or a dependency on other files. **[BRAND]** marks something that must be rebranded for Exclusive Networks "Hack the Brewery".

## Summary table

| File | Change type | What changed |
|---|---|---|
| assets/css/challenge-board.scss | COSMETIC | Preview modal max-width 1000px → 2000px |
| assets/css/main.scss | COSMETIC + BRAND | Netskope palette as Bootstrap variables, navy navbar and jumbotron, orange links, `.ns-review-answer` class used by the review page |
| assets/js/components/hints/HintCreationForm.vue | FUNCTIONAL (small) | The "create hint" modal is cleared after a successful submit |
| vite.config.js | build only | `core` alias removed (the legacy `themes/core` was deleted) |
| templates/base.html | FUNCTIONAL + BRAND | Brand shows CTF name; "Awaiting review" item with a pending count; update banner removed; footer reworded |
| templates/challenges/challenge.html | FUNCTIONAL | **Topics** and **Tags** tabs removed from the challenge editor |
| templates/config.html | FUNCTIONAL | Seven config panels removed; new **Challenges** section added |
| templates/configs/challenges.html | ADDED | Form for `view_self_submissions`, `max_attempts_behavior`, `max_attempts_timeout`, `hints_free_public_access` |
| templates/scoreboard/standings.html | FUNCTIONAL | New **Bracket** column |
| templates/scoreboard/users.html | FUNCTIONAL | New **Bracket** column |
| templates/configs/{email,legal,localization,mlc,robots,sanitize,social}.html | REMOVED | Their config UIs are gone |
| templates/integrations.html | REMOVED | MLC OAuth "Integration enabled" landing page (its route was removed from views.py) |

Also ADDED in this directory: `templates/review.html`. It belongs to another group but is linked from base.html and uses `.ns-review-answer` from main.scss.

---

## 1. `assets/css/challenge-board.scss` [COSMETIC]

```diff
 .modal-content {
   border-radius: 0px;
-  max-width: 1000px;
+  max-width: 2000px;
   padding: 1em;
   margin: 0 auto;
 }
```
- This is the only hunk. It makes the admin "Challenge Preview" modal (`modal-xl`, on `challenges/challenge.html`) use more of the screen width. The likely reason is that the wide NSK workshop challenge layouts (MCQ/manual flags, long markdown) look cramped at 1000px.
- No branding. **Needs a vite rebuild** (it compiles to `static/assets/challenge-board-css-*.css`).

## 2. `assets/css/main.scss` [COSMETIC + BRAND]

There are three hunks.

**Hunk 1, top of file (before the Bootstrap import).** This adds a Netskope header comment, brand variables and Bootstrap variable overrides:
```scss
// Admin theme - Netskope branding
// mirrors CTFd/themes/core-beta/assets/scss/includes/_brand.scss
// Rebuild after editing: cd CTFd/themes/admin && npm install && npm run build
$brand-orange: #ff8300;   $brand-navy: #081a59;   $brand-blue: #00a7ce;
$brand-grey: #53565a;     $brand-pending: #a855f7;
$primary: $brand-orange;  $secondary: $brand-navy; $info: $brand-blue;
$success: #2eb872; $warning: #ffb020; $danger: #e5484d; $dark: $brand-navy;
$border-radius: 0.5rem; $border-radius-sm: 0.3rem; $border-radius-lg: 0.8rem;
$link-color: $brand-orange;
```
- The overrides recolour every Bootstrap 4 component in the admin UI: btn-primary, badges, nav-pills, `bg-dark`, blockquote border (it uses `$secondary`), and so on. They also round the corners. Many admin rules still force `border-radius: 0`, so the rounding applies only partly.
- **[BRAND]** All five colours, the comment "Netskope branding", and the reference to `_brand.scss` (which comes from the student-theme group).

**Hunk 2, links:**
```diff
 a {
-  color: #337ab7;
+  color: $brand-orange;
   text-decoration: none;
 }
+a:hover { color: darken($brand-orange, 12%); }
```
**[BRAND]**

**Hunk 3, appended at the end of the file ("Netskope admin chrome"):**
- `:root { --ns-orange; --ns-navy; --ns-blue; --ns-pending }` adds CSS custom properties. The `ns-` prefix needs renaming. No other admin file references them, but plugins or review.html might.
- `.navbar.bg-dark, nav.navbar-dark { background-color: navy !important }` turns the admin top bar navy.
- `.navbar-dark .navbar-brand` uses Raleway 700 with letter-spacing 0.5px.
- `.navbar-dark .nav-link:hover/:focus` turns orange.
- `.jumbotron { background: navy !important; color: #fff; border-radius: 0 }` and `.jumbotron h1,h2,h3 { color:#fff }` make every admin page header a navy banner. Stock CTFd uses a light grey jumbotron.
- `.btn-primary { font-weight: 600 }`
- `.ns-review-answer { monospace; font-size .9rem; background: rgba(8,26,89,.05); padding; border-radius .3rem; display:block; overflow-wrap:anywhere; white-space:pre-wrap; max-width:100% }` is **used by `templates/review.html`** (`<code class="ns-review-answer">{{ item.provided }}</code>`). It mirrors `core-beta/.../components/_mcq.scss`. **[FUNCTIONAL dependency]** Keep or rename this class together with review.html. Its background colour `rgba(8,26,89,…)` is Netskope navy **[BRAND]**.

**Needs a vite rebuild.**

## 3. `assets/js/components/hints/HintCreationForm.vue` [FUNCTIONAL, small UX fix]

```diff
   methods: {
+    clearForm: function () {
+      this.$refs.title.value = "";
+      if (this.$refs.content && this.$refs.content.mde) {
+        this.$refs.content.mde.value("");
+        this.$refs.content.mde.codemirror.refresh();
+      }
+      this.$refs.content.value = "";
+      this.cost = 0;
+      this.selectedHints = [];
+    },
 ...
           if (response.success) {
             this.$emit("refreshHints", this.$options.name);
+            this.clearForm();
           }
```
- In stock CTFd, the "Create Hint" modal kept the last title, content, cost and requirements, so the next hint started pre-filled. NSK resets all fields after a successful POST, including the EasyMDE markdown editor if one is attached to the textarea.
- No branding. **Needs a vite rebuild** (compiled into `static/assets/pages/challenge-*.js`). This is worth carrying over: it is a generic bug fix.

## 4. `vite.config.js` [build only]

```diff
     alias: {
       "~": resolve(__dirname, "./node_modules/"),
-      core: resolve(__dirname, "../core/assets/js/"),
       vue: "@vue/compat"
```
- The alias pointed at the legacy `CTFd/themes/core` theme, which NSK deleted (see the inventory). No admin source imports `core/...` (checked with grep). Removing the alias is harmless and only needed if `themes/core` is removed too.
- package.json and yarn.lock were not changed in this group, and node_modules/ is committed in NSK.

## 5. `templates/base.html` [FUNCTIONAL + BRAND]

There are four hunks.

**5a. Navbar brand** [COSMETIC/BRAND-neutral]
```diff
-<a href="{{ url_for('views.static_html', route='/') }}" class="navbar-brand">CTFd</a>
+<a href="{{ url_for('views.static_html', route='/') }}" class="navbar-brand">{{ get_ctf_name() }}</a>
```
The brand now comes from the `ctf_name` config (stock Jinja global), so it is already brand-neutral. Set ctf_name to "Hack the Brewery".

**5b. Submissions dropdown: new "Awaiting review" entry** [FUNCTIONAL]
```diff
 <div class="dropdown-menu">
+    <a class="dropdown-item fw-bold" href="{{ url_for('admin.submissions_review') }}">
+        Awaiting review
+        {% set review_count = pending_review_count() %}
+        {% if review_count %}
+            <span class="badge bg-primary ms-1">{{ review_count }}</span>
+        {% endif %}
+    </a>
+    <div class="dropdown-divider"></div>
     <a class="dropdown-item" href="...submissions_listing">All Submissions</a>
```
Cross-file dependencies (all required, or the template raises an error on **every** admin page):
- Route `admin.submissions_review` is defined in `CTFd/admin/submissions.py:70` (`def submissions_review()`) and renders `admin/review.html`.
- Jinja global `pending_review_count()` is defined in `CTFd/utils/initialization/__init__.py:83-92` and returns `Pending.query.count()` (new `Pending` model in `CTFd/models`).
- Note: `fw-bold` and `ms-1` are Bootstrap 5 classes. The admin theme runs Bootstrap ~4.3.1, so they do nothing: the item is not bold and the badge has no left margin. Use `font-weight-bold` and `ml-1` when porting. `bg-primary` works and renders orange through the `$primary` override.

**5c. "New CTFd version available" banner removed** [FUNCTIONAL, minor]
```diff
 <main role="main">
-    {% if get_config('version_latest') %}
-    <div class="container-fluid bg-warning text-center py-3"> ... A new CTFd version is available! ... </div>
-    {% endif %}
     {% block content %}
```

**5d. Footer** [COSMETIC/de-CTFd branding]
```diff
-<a href="https://ctfd.io" class="text-secondary"><small class="text-muted">Powered by CTFd</small></a>
-<span><small class="text-muted"><br> Version {{ get_config('ctf_version') }}</small></span>
+<small class="text-muted">
+    {{ get_ctf_name() }} &middot; Administration
+</small>
```
The "Powered by CTFd" link and the version number are removed. Unchanged: the `<title>Admin Panel</title>`, the favicon (admin `img/favicon.ico`, stock), and the docs.ctfd.io help icon. Nothing Netskope-specific is hard-coded in base.html.

No vite rebuild needed (Jinja template).

## 6. `templates/challenges/challenge.html` [FUNCTIONAL]

There are two hunks. The **Topics** and **Tags** tabs are removed from the admin challenge editor:
```diff
 <a class="nav-item nav-link small" data-toggle="tab" href="#flags" role="tab">Flags</a>
-<a class="nav-item nav-link small" data-toggle="tab" href="#topics" role="tab">Topics</a>
-<a class="nav-item nav-link small" data-toggle="tab" href="#tags" role="tab">Tags</a>
 <a class="nav-item nav-link small" data-toggle="tab" href="#hints" role="tab">Hints</a>
...
-<div class="tab-pane fade" id="topics"> ... {% include "admin/modals/challenges/topics.html" %} ...</div>
-<div class="tab-pane fade" id="tags">   ... {% include "admin/modals/challenges/tags.html" %} ...</div>
```
- The remaining tabs are Files, Flags, Hints, Requirements and Next.
- `modals/challenges/topics.html` and `tags.html` still exist. `assets/js/pages/challenge.js` mounts TopicsList and TagsList only `if (document.querySelector("#challenge-topics"/"#challenge-tags"))`, so nothing errors. The components simply never load.
- Effect: admins cannot add or edit tags and topics in the UI. They are still possible through the API and import. This is a UX simplification for the workshop. Optional for Hack the Brewery: keep the stock tabs if tags are wanted (for example "OT", "IT").
- No branding, no rebuild.

## 7. `templates/config.html` [FUNCTIONAL]

Sidebar (left nav) changes compared with stock:

| Stock section | Stock entries | NSK |
|---|---|---|
| (top) | General | unchanged |
| Appearance | Logo, Theme, **Localization** | Localization **removed** |
| Access | Visibility, Start and End Time, Pause | unchanged |
| Users | Accounts, Scoreboard Brackets, Custom Fields, Registration Code | unchanged |
| — | — | **NEW section "Challenges"** → `#challenges` (icon `fa-users`, copy-paste leftover) |
| Backup | Import & Export | unchanged (a `<!-- Backup -->` comment was added) |
| **Security** | Sanitize | **whole section removed** |
| **Pages** | Legal, Robots.txt | **whole section removed** |
| **Integrations** | Email Notifications, Social Sharing, MajorLeagueCyber | **whole section removed** |
| Plugins | (dynamic) | unchanged |
| Danger zone | User Mode, Reset | unchanged |

Tab-content includes:
```diff
 {% include "admin/configs/theme.html" %}
-{% include "admin/configs/localization.html" %}
+
 ...
 {% include "admin/configs/registration_code.html" %}
-<!-- Security -->
+<!-- Challeges -->            (sic)
+{% include "admin/configs/challenges.html" %}
+<!-- Backup -->
 {% include "admin/configs/backup.html" %}
-{% include "admin/configs/sanitize.html" %}
-<!-- Pages --> legal.html, robots.html
-<!-- Integrations --> email.html, social.html, mlc.html
```
- No branding. No rebuild (configs.js is unchanged; it submits any `.config-section > form` to `PATCH /api/v1/configs`). Leftover handlers in configs.js for `#mail_useauth` and the legal CodeMirror are jQuery no-ops when the elements are missing.

## 8. `templates/configs/challenges.html` [ADDED – full description]

A new tab-pane `id="challenges"`, built from a new WTForm `Forms.config.ChallengeSettingsForm`, which is defined in NSK `CTFd/forms/config.py:141-164`. That form **does not exist in stock 3.7.7**. Logically this is a back-port of the CTFd 3.8 "Challenges" settings.

```jinja
<div role="tabpanel" class="tab-pane config-section" id="challenges">
  {% set view_self_submissions   = "true" if view_self_submissions == True else "false" %}
  {% set hints_free_public_access = "true" if hints_free_public_access == True else "false" %}
  {% set max_attempts_behavior   = "timeout" if max_attempts_behavior == "timeout" else "lockout" %}
  {% set max_attempts_timeout    = 300 if max_attempts_timeout is not defined else max_attempts_timeout %}
  {% with form = Forms.config.ChallengeSettingsForm(view_self_submissions=..., hints_free_public_access=...,
                                                     max_attempts_behavior=..., max_attempts_timeout=...) %}
  <form method="POST" autocomplete="off" class="w-100">
     form-group: view_self_submissions (select)     + description
     form-group: max_attempts_behavior (select)     + description
     form-group: max_attempts_timeout  (rendered with class "form-control custom-select" though it is an IntegerField – cosmetic quirk)
     form-group: hints_free_public_access (select)  + description
     <button type="submit" class="btn btn-md btn-primary float-right">Update</button>
  </form>{% endwith %}
</div>
```

The values come from the `**configs` that `admin.config()` passes to the template (stock behaviour).

| Config key | Choices / default | Consumed by (NSK backend / theme) |
|---|---|---|
| `view_self_submissions` | true/false, default false. "Allow users to view their previous submissions" | `CTFd/api/v1/users.py:353` (gate on `/users/me/submissions`), `core-beta/templates/challenge.html:16` (`Configs.view_self_submissions` shows a submissions tab) |
| `max_attempts_behavior` | lockout / timeout, default lockout | `CTFd/api/v1/challenges.py:491, 773, 903` |
| `max_attempts_timeout` | int seconds, default 300 | `challenges.py:493, 778, 907` ("Not accepted. Try again in N minutes") |
| `hints_free_public_access` | true/false, default false. Lets anonymous users see free hints | `CTFd/api/v1/hints.py:138` |

Porting requirements: `ChallengeSettingsForm` in forms/config.py, plus the API changes in challenges.py, hints.py and users.py (groups for the Python files), plus the core-beta template hook. No branding.

## 9. `templates/scoreboard/standings.html` and 10. `templates/scoreboard/users.html` [FUNCTIONAL]

There are two identical hunks in each file:
```diff
 <th class="sort-col"><b>{{ get_mode_as_word(capitalize=True) }}</b></th>   (users.html: <b>User</b>)
+<th class="sort-col"><b>Bracket</b></th>
 <th class="sort-col"><b>Score</b></th>
...
 </td>
+<td>
+    <span class="badge badge-secondary">{{ standing.bracket_name }}</span>
+</td>
 <td>{{ standing.score }}</td>
```
- The admin scoreboard (both the account standings and the per-user tab in teams mode) gains a Bracket column with a badge. With `$secondary` set to navy, the badge is navy.
- Dependency: `standing.bracket_name` must exist in the rows returned by `get_standings()` and `get_user_standings()`. NSK `CTFd/utils/scores/__init__.py` (lines 89, 110, 189, 210, 289, 311) selects `Brackets.name.label("bracket_name")`. This is MODIFIED in NSK (scores group), so make sure that change is carried over. If `bracket_name` is missing, Jinja renders an empty badge rather than an error.
- No branding, no rebuild.

## 11. Removed templates – what disappears

| Removed file | Stock UI / config keys lost from the admin | Note |
|---|---|---|
| `configs/localization.html` | Appearance → **Localization**: `default_locale` (LocalizationForm) | `CTFd/translations/` was also removed, so the UI is English only |
| `configs/sanitize.html` | Security → **Sanitize**: `html_sanitization` toggle (or "Required (Disable in config.ini)") | `utils/security/sanitize.py` is modified in NSK (other group) |
| `configs/legal.html` | Pages → **Legal**: `tos_url`, `tos_text`, `privacy_url`, `privacy_text` (LegalSettingsForm + CodeMirror) | `/tos` and `/privacy` routes still exist but return 404 unless the keys are set via the API |
| `configs/robots.html` | Pages → **Robots.txt**: `robots_txt` | `/robots.txt` still serves the default `Disallow: /admin` |
| `configs/email.html` | Integrations → **Email Notifications**: SMTP/Mailgun (`mail_server`, `mail_port`, `mail_useauth`, `mail_username`, `mail_password`, `mail_tls`, `mail_ssl`, `mailfrom_addr`, `mailgun_*`) and the email templates (verification, registration, user-creation, password reset, password change) | Mail can no longer be configured in the UI, so verify_emails and password reset are effectively unusable |
| `configs/social.html` | Integrations → **Social Sharing**: `social_shares` | Stock default is enabled. Set `social_shares=false` via the API if share buttons should be hidden |
| `configs/mlc.html` | Integrations → **MajorLeagueCyber**: `oauth_client_id`, `oauth_client_secret` | The Visibility tab still offers "MajorLeagueCyber Only" registration, which can no longer be configured |
| `templates/integrations.html` | "Integration enabled! You may now close this tab" page (MLC OAuth handshake, writes `localStorage.integrations`) | Rendered by stock `views.integrations` (`/setup/integrations`), **which NSK removed from `CTFd/views.py`** |

The forms (`SocialSettingsForm`, `LegalSettingsForm`, `LocalizationForm`) are still present in NSK forms/config.py. Only the templates and menu entries were removed. Nothing else in the admin templates links to `#email`, `#mlc`, `#legal` and so on (checked with grep).

Recommendation for Hack the Brewery: a single-day on-prem workshop needs no mail, MLC or legal, so the removals can be copied as they are. Keeping them is also harmless. Remove `integrations.html` only together with the `/setup/integrations` route.

## 12. Do the compiled admin assets need a rebuild?

- **Yes, for main.scss, challenge-board.scss and HintCreationForm.vue** (and vite.config.js). Admin pages load these through `Assets.css/js(..., theme="admin")`, which resolves via `static/manifest.json` to hashed files in `static/assets/`. Editing the sources does nothing until `cd CTFd/themes/admin && yarn install (or npm install) && yarn build` regenerates `static/`.
- NSK's **Dockerfile only builds `core-beta`** (stage `theme`). It does **not** build the admin theme. NSK therefore committed its rebuilt admin `static/` (inventory: "MODIF static/ (compiled output)"; current manifest entries such as `assets/main-css-CoszOyzj.css` and `challenge-board-css-CpAEjUPb.css`). Our local copy excludes `static/assets`, so the NSK compiled CSS/JS is not available here.
- For Hack the Brewery, do one of the following:
  - (a) Rebuild the admin theme locally after rebranding and commit `static/`.
  - (b) Add a second node build stage for `CTFd/themes/admin` to the Dockerfile, mirroring the core-beta stage.
- Template-only changes (base.html, config.html, challenge.html, scoreboard/*, configs/challenges.html) take effect without any rebuild.

## 13. Branding checklist (admin theme)

| Location | Netskope item | Exclusive Networks / Brewery action |
|---|---|---|
| main.scss header comment | "Admin theme - Netskope branding", "Netskope admin chrome" | Reword |
| main.scss `$brand-orange` #ff8300, `$brand-navy` #081a59, `$brand-blue` #00a7ce, `$brand-grey` #53565a, `$brand-pending` #a855f7 | Netskope palette | Replace with the EXN palette; keep it in sync with core-beta `_brand.scss` |
| main.scss `:root --ns-*` vars, `.ns-review-answer` (+ `rgba(8,26,89,.05)`) | `ns` prefix, navy rgba | Rename the prefix (also in review.html and core-beta `_mcq.scss`) and recolour |
| main.scss navbar, jumbotron, link and hover colours | via variables | Follow the variables automatically |
| base.html | none hard-coded (uses `get_ctf_name()`) | Set the `ctf_name` config. Optionally replace the admin favicon `static/img/favicon.ico` |
| challenge-board.scss, Vue, config, scoreboard templates | none | – |
