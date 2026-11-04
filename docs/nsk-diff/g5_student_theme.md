# G5 – Student theme (`CTFd/themes/core-beta`) – NSK-CTF vs stock CTFd 3.7.7

Scope: every changed or added file in the student theme. Each file was diffed by hand against `https://raw.githubusercontent.com/CTFd/CTFd/3.7.7/CTFd/themes/core-beta/<path>`. For the hunks that come from newer upstream code, I also compared against `CTFd/core-beta@master`.

Legend: **[FUNC]** functional change · **[COS]** cosmetic only · **[BACKPORT]** taken from a newer upstream core-beta, not NSK-specific · **[NSK]** Netskope-specific text or branding that must be replaced.

---

## 0. Executive summary

| Area | What NSK changed | Files |
|---|---|---|
| Branding system | One SCSS variable file (`_brand.scss`) drives Bootstrap `$primary/$secondary/...`, fonts, radius and shadows. It also emits unused `--ns-*` CSS custom properties. Palette: Netskope orange `#ff8300`, navy `#081a59`, blue `#00a7ce`. | `_brand.scss`, `main.scss` |
| Fonts | **No new fonts.** Lato (body) and Raleway (headings) are the **stock CTFd fonts**; NSK only made them variables. Only Raleway **400** is shipped (vite copy rule unchanged), so headings at 700/800 are browser faux-bold. | `_brand.scss`, `vite.config.js` (unchanged rules) |
| Landing page | New `templates/index.html`: navy "cyber grid" hero, 4 feature cards and a CTA. It can also render the DB page `index` (from `data/Home.md`) and splice in auth-aware buttons at `<!-- buttons -->` markers. Needs the backend change in `CTFd/views.py`, which renders `index.html` for `/`. | `index.html`, `_hero.scss` |
| Challenge board | Rewritten tiles (CSS grid, not Bootstrap buttons). Categories and tiles are sorted **highest `order_id` first**. Per-category `solved/total` counter. Tile states: solved (green check), **pending review** (purple hourglass + "IN REVIEW" pill), **locked** (padlock, grey "LOCKED" pill, "First solve <names>", disabled button). Empty-state message. Modal width forced to `min(1400px, 94vw)`. | `challenges.html`, `challenges.js`, `_board.scss` |
| Challenge modal | MCQ radio/checkbox rendering. Free-text `textarea` for manually-reviewed flags ("Submit for review"). "Awaiting review" banner that replaces the whole input block. **Cooldown** countdown on the submit button plus a progress bar. New statuses `cooldown`/`pending`/`ratelimited`. Hint cards with title + cost pill (the confirm dialog is stock ctfd-js). Empty tags filtered out. `choices:` connection_info hidden. Social share buttons removed. Submissions tab added [BACKPORT]. | `challenge.html`, `challenges.js`, `_mcq.scss`, `_board.scss` |
| Auth pages | Centred card layout with logo, "Welcome back" / "Create your account", divider + switch link. MLC login button removed. | `login.html`, `register.html`, `_auth.scss` |
| Chrome | Footer "Powered by CTFd" → `{{ ctf_name }} · Internal training environment`. Event sounds disabled. Language dropdown removed from navbar. `workshop.css` (no-rebuild override file) loaded after the theme CSS. | `base.html`, `navbar.html`, `static/workshop.css` |
| Setup wizard | MLC "Integrations" tab → "Finish" tab with a `sync-content` instruction. CTFd newsletter checkbox removed. MLC JS removed. **Latent bug:** `setup.js` still reads `#newsletter-checkbox`. | `setup.html`, `setup.js` |
| Build | `ctfd-js` 0.0.14 → 0.0.15. `emptyOutDir:false` so `static/workshop.css` survives `vite build`. Lockfiles regenerated (`package-lock.json` added). | `package.json`, `vite.config.js`, `yarn.lock`, `package-lock.json` |

**Rebuild:** every SCSS and JS change only reaches the browser after `cd CTFd/themes/core-beta && npm install && npm run build` (NSK wrapper: `make theme`). The output goes to `static/assets/*` plus `static/manifest.json`, which `Assets.css()/Assets.js()` resolve. Template (`*.html`) changes and `static/workshop.css` do **not** need a rebuild, only a container restart or redeploy plus a hard refresh (`workshop.css` is served with `max_age=3600`).

---

## 1. `package.json` [FUNC, small]

```diff
-    "@ctfdio/ctfd-js": "^0.0.14",
+    "@ctfdio/ctfd-js": "^0.0.15",
```
The only change. ctfd-js 0.0.15 provides `CTFd.pages.users.userSubmissions(...)`, which the backported **Submissions** tab in `challenges.js` uses. Scripts, devDependencies and the other dependencies are identical. No new font packages.

## 2. `vite.config.js` [FUNC, build]

```diff
     outDir: "static",
+    // static/ also holds hand-written files such as workshop.css, so build
+    // on top of it instead of wiping it first.
+    emptyOutDir: false,
```
Without this, `vite build` wipes `static/` and deletes the hand-written `static/workshop.css`. Side effect: old hashed bundles pile up in `static/assets/` (harmless, because the manifest points at the current ones). The copy targets (FontAwesome, Lato 400/700, **Raleway 400 only**, `assets/img/**`) and the entry points are unchanged.

## 3. `yarn.lock` (modified) / `package-lock.json` (added)

- `yarn.lock` was regenerated: `@ctfdio/ctfd-js@^0.0.15` and all `resolved` URLs switched from `registry.yarnpkg.com` to `registry.npmjs.org` (105 entries). The resolved versions of the main packages are unchanged (sass 1.49.9, vite 3.0.5, bootstrap 5.3.3, alpinejs 3.9.5).
- `package-lock.json` (lockfileVersion 3, about 1,675 lines) was added because `make theme` runs `npm install` rather than yarn. Its only purpose is to pin npm installs to the same dependency set. You can keep either lockfile, but keep only one in the new project.

## 4. `templates/base.html` [FUNC + NSK]

```diff
   {% block stylesheets %}
     {{ Assets.css("assets/scss/main.scss") }}
+    <link rel="stylesheet" href="{{ url_for('views.themes', path='workshop.css') }}">
   {% endblock %}
...
-          'eventSounds': [
-            "/themes/core/static/sounds/notification.webm",
-            "/themes/core/static/sounds/notification.mp3",
-          ],
+          'eventSounds': [],
...
-    <a href="https://ctfd.io" class="text-secondary">
-      <small class="text-muted">
-        {% trans %}Powered by CTFd{% endtrans %}
-      </small>
-    </a>
+    <small class="text-muted">
+      {{ Configs.ctf_name }} &middot; Internal training environment
+    </small>
```
- `workshop.css` is loaded on every page after the compiled theme. It resolves to `/themes/core-beta/static/workshop.css`, because `theme` is injected by CTFd's url_defaults.
- `eventSounds: []` mutes the notification sound. The legacy `themes/core/` theme that hosted the sound files was deleted in NSK.
- Footer: CTFd attribution removed; the text **"Internal training environment"** is [NSK] wording.

## 5. `templates/components/navbar.html` [FUNC]

The only hunk: the whole **language-switcher dropdown** (`<li class="nav-item dropdown">… LanguageForm …</li>`, about 20 lines) was removed. This matches NSK deleting `CTFd/translations/`. The brand/logo block is unchanged (it shows `Configs.ctf_logo` if set, otherwise `ctf_name`). Navbar colours come from SCSS (`main.scss`) and are not in this file.

## 6. `templates/challenges.html` [FUNC + COS + NSK]

Upstream is a jumbotron plus a Bootstrap `row` of `.challenge-button btn btn-dark` buttons. NSK rewrote the whole body.

1. **New `stylesheets` block** (inline, survives a stale build or cache):
   ```html
   <style>#challenge-window .modal-dialog { max-width: min(1400px, 94vw) !important; }</style>
   ```
   This effectively overrides the `challenge_window_size` theme setting.
2. **Header**: `.jumbotron` → `<section class="ns-page-head">` with title and subtitle **"Work from the top down — the next activity is always first."** [NSK wording, generic enough to keep]
3. **Empty state**: `x-if="challenges.length === 0"` → flag icon + "No challenges are available yet."
4. **Category block** `.ns-category`: title plus a counter `x-text="getSolvedCount(category) + '/' + getChallenges(category).length"`.
5. **Tiles** (`<button class="ns-tile">` inside a `.ns-challenge-grid` CSS grid):
   ```html
   :class="{ 'ns-tile--solved': c.solved_by_me,
             'ns-tile--pending': c.pending_review && !c.solved_by_me && !c.locked,
             'ns-tile--locked': c.locked }"
   :disabled="c.locked" :aria-disabled="c.locked"
   :title="c.locked ? 'Locked - solve the listed activity first' : null"
   @click="!c.locked && loadChallenge(c.id)"
   ```
   - Status icon (top-right): `fa-lock` (locked), `fa-circle-check` (solved), `fa-hourglass-half` (pending).
   - `c.locked && c.requires.length` → "↳ First solve **A, B**".
   - Meta row: the **"Locked"** pill (locked), or `c.value + ' pts'`, plus an **"In review"** pill (pending).
   - **Removed:** the upstream `tag-<value>` CSS classes on the tile (tags no longer influence tile styling).

**Backend fields relied on** (from `GET /api/v1/challenges`, NSK `CTFd/api/v1/challenges.py`): `id, name, value, category, solved_by_me`, plus **NSK-only** `order_id`, `pending_review` (from the new `Pending` model), `locked` (bool), `requires` (list of prerequisite challenge **names** still missing). Locked entries come back with `type:"locked"`, `tags:[]`, `template:""`, and with name and category masked as `???` when `requirements.anonymize` is set. Stock CTFd simply omits challenges whose prerequisites are unmet (or shows them anonymised as hidden), so **the locked-tile UX depends entirely on the backend change**.

## 7. `assets/js/challenges.js` [FUNC]

| Hunk | Type | Detail |
|---|---|---|
| `Hint.showHint`: `if (response.errors) { event.target.open=false; displayUnlockError(response); return; }` | BACKPORT | Same as core-beta master. Handles hint prerequisites or access errors from `/api/v1/hints/<id>`. |
| Removed duplicate `async init(){highlight();}` in `Challenge` | COS | Upstream defines it twice. |
| New state `submissions: []` + `showSubmissions()` → `CTFd.pages.users.userSubmissions("me", this.id)` | BACKPORT | Needs ctfd-js 0.0.15, the `view_self_submissions` config and the `/api/v1/users/me/submissions` gate (NSK `api/v1/users.py`). |
| New state `chosen: []`, `cooldown_total`, `cooldown_left`, `cooldown_timer` | NSK | |
| `startCooldown(remaining,total)` / `tickCooldown(seconds)` | NSK | 1 s `setInterval` countdown. Called from `x-init` in `challenge.html` with server values. |
| `isChosen(value)` | NSK | **Dead code**, not referenced anywhere. |
| `toggleChoice(value)` | NSK | Multi-select: maintains `chosen`, sets `submission = chosen.join(",")`. A choice containing a comma would break, so the backend `choice` flag must parse the same way. |
| `renderSubmissionResponse()` rewritten | NSK | See below. |
| `getCategories()` ranks categories by **max `order_id`, descending** | NSK | The theme setting `challenge_category_order` can still override it. |
| `getChallenges()` sorts a **copy** by `order_id` descending | NSK | `challenge_order` can still override it. The copy avoids mutating `this.challenges`. |
| `getSolvedCount(category)` | NSK | Board counter. |

```js
async renderSubmissionResponse() {
  const status = this.response.data.status;
  if (status === "correct" || status === "pending") { this.submission = ""; this.chosen = []; }
  if (status === "cooldown") { this.tickCooldown(this.response.data.cooldown); return; }
  if (status === "incorrect" && this.cooldown_total > 0) {
    this.submission = ""; this.chosen = [];
    document.querySelectorAll(".ns-choice input").forEach(i => (i.checked = false));
    this.tickCooldown(this.cooldown_total);
  }
  if (this.max_attempts > 0 && status != "already_solved" && status != "ratelimited") this.attempts += 1;
  this.$dispatch("load-challenges");
}
```
**API fields:** `POST /api/v1/challenges/attempt` response `data.status` ∈ {correct, incorrect, already_solved, paused, ratelimited [backport], **cooldown** (+ `data.cooldown` = seconds left), **pending**}, plus `data.message`. "Next Challenge" (`getNextId()` → `data.next_id`) and `nextChallenge()` are **unchanged stock code**. `getShareUrl/copyShareUrl` are still in the JS but no longer reachable from the template (dead).

## 8. `templates/challenge.html` (modal body, extended by `plugins/challenges/assets/view.html`) [FUNC]

1. **`x-init`** adds `startCooldown({{ cooldown_remaining | default(0) }}, {{ cooldown | default(0) }})`.
2. **Submissions tab** `{% block submissions %}{% if Configs.view_self_submissions %}…` [BACKPORT, identical to core-beta master], plus the `#submissions` tab pane (masked `*****` value with an eye toggle). NSK wraps the table in `.table-responsive-wrap`; the solves table also gets that wrapper [COS].
3. **Tags**: `{% set real_tags = tags | select | list if tags else [] %}` hides empty or blank tags.
4. **Description**: `<span class="challenge-desc">` → `<div class="challenge-desc">` [COS/valid HTML, so block content renders properly].
5. **Connection info** hidden when it starts with `choices:`. NSK stores MCQ options in `connection_info` as `choices:\n<opt>\n<opt>`, decoded by `CTFd/utils/content.decode_choices`.
6. **Hints** rewritten as cards:
   ```html
   <div class="challenge-hints hint-row">
     <div class="ns-hints__heading"><i class="fas fa-lightbulb"></i> Hints</div>
     <div class="ns-hint" x-data="Hint" …><details @toggle="showHint(event)">
       <summary><span class="ns-hint__title">{{ hint.title or "Hint" }}</span>
         <span class="ns-hint__cost"><i class="fas fa-lock"></i> N points</span> | "Free" | "Unlocked"</summary>
       <div class="ns-hint__body challenge-desc" x-html="html"></div>
   ```
   The unlock **confirm dialog** is stock behaviour (`CTFd.pages.challenge.displayUnlock` in ctfd-js); NSK only restyled it. The Bootstrap `row/col-12` wrapper was dropped.
7. **Awaiting review**: `{% if awaiting_review %}` shows a `.ns-status--pending` banner ("Awaiting review – … waiting for an instructor to approve it…") and **hides all input, submit and cooldown UI**.
8. **MCQ** `{% if choices %}`: a `.ns-choices` list of `<label class="ns-choice">` with `checkbox` (when `multi_select`) or `radio name="challenge-choice-<id>"`. Values are read through `$el.value` (an explicit XSS and quote-safety comment). All inputs are `:disabled="cooldown_left > 0"`. The real `#challenge-input` becomes `type=hidden x-model="submission"`, with helper text "Select every answer that applies…" or "Select your answer…".
9. **Manual review** `{% elif requires_approval %}`: a `<textarea rows=3>` with placeholder "Type your answer - an instructor will review it". The button label changes to **"Submit for review"**, and a note reads "This activity is checked by an instructor rather than automatically."
10. **Flag input**: `:disabled="cooldown_left > 0"`.
11. **Submit button**: `btn-outline-secondary` → **`btn-primary`** (brand orange) and `:disabled="cooldown_left > 0"`. Its label shows two spans: `⏳ <n>s` during cooldown, otherwise the label. Both use `x-show`, with `style="display:none"` on the countdown so the button is never empty before Alpine boots.
12. **Cooldown panel** `<template x-if="cooldown_left > 0">`: `.ns-cooldown` with "Have another look at the question — you can answer again in **Ns**" and a progress bar `width = 100 - left/total*100 %`.
13. **Alert classes**: `alert-warning` also for `cooldown`; new `alert-secondary` for `pending`.
14. **Removed**: the entire `{% if Configs.social_shares %}` Share block (Twitter, Facebook, LinkedIn).

**Template variables relied on** (NSK `api/v1/challenges.py` `ChallengeDetail.get` → `render_template(...)`): `choices` (list), `multi_select` (flag `data == "multiple"`), `requires_approval` (flag type `manual`), `awaiting_review` (Pending row exists), `cooldown` (`Challenges.cooldown` column, migration `n5002`), `cooldown_remaining` (computed from the last `Fails` row). The same values are also in the JSON `data`. Flag types `choice` and `manual` are NSK plugins (`CTFd/plugins/flags`).

## 9. `templates/login.html` [FUNC + COS + NSK]

The jumbotron and `col-md-8` form were replaced by `.ns-auth > .ns-auth__card`:
- Logo (`Configs.ctf_logo`, max 46 px), H1 "Welcome back", sub "Sign in to continue the workshop" [NSK wording].
- Labels `fw-semibold` instead of `<b>`, placeholders "Username or email" / "Password", full-width submit (`d-grid`), "Forgot your password?" link below it.
- **Removed:** the MajorLeagueCyber login button (`integrations.mlc()`).
- **Added:** `{% if registration_visible() %}` "or" divider + "New here? Create an account".

## 10. `templates/register.html` [FUNC + COS + NSK]

The same card layout. H1 "Create your account", sub "Register to start the workshop and track your progress".
- Name placeholder **`e.g. netskope7`** [NSK], help text "Shown on the scoreboard" (was "Your username on the site").
- Email placeholder `you@company.com`, help "Never shown publicly".
- Password placeholder "Choose a password"; the help text was removed.
- MLC button removed. ToS/privacy block kept (restyled). Footer "Already registered? Sign in".
- `render_extra_fields(form.extra)` kept, so custom registration fields still work.

## 11. `templates/setup.html` [FUNC + NSK]

- The tab "Integrations" (`#integrations`) was renamed to **"Finish"** (`#finish`). The Date & Time "Next" button now targets `#finish`.
- The MLC integration panel was replaced by: "Ready to go – After finishing setup, load the workshop content from the `data/` folder with: `docker compose exec app python manage.py sync-content`" (NSK `manage.py sync-content` command).
- **Removed:** the "Subscribe … CTFd LLC Newsletter" checkbox (`#newsletter-checkbox`).
- Text: "…sections of CTFd" → "…sections of the workshop".

## 12. `assets/js/setup.js` [FUNC]

- Removed: the `storage` listener for the MLC integration (in `init`) and the whole `mlcSetup()`.
- **Bug (latent):** `submitSetup()` is unchanged and still does `document.querySelector("#newsletter-checkbox").checked`. That element no longer exists, so the code throws a `TypeError` on submit. The handler is not `.prevent`, so the native POST still goes through and setup works, with a console error. **In the new project, delete `submitSetup` (and `@submit="submitSetup"`) entirely.** That also removes the leftover call to `newsletters.ctfd.io`.

## 13. `assets/scss/main.scss` [FUNC + COS + NSK]

Upstream: `@use bootstrap with ($info:#5c728f)` plus a few global rules. NSK:

1. Header comment "Netskope ZTNA Workshop - main stylesheet" [NSK].
2. `@use "sass:color"; @use "includes/brand" as brand;`
3. Bootstrap configured from the brand variables:
   `$primary, $secondary, $success, $info, $warning, $danger, $light: offwhite, $dark: navy, $font-family-sans-serif, $font-family-monospace, $headings-font-family, $headings-font-weight, $border-radius(-sm/-lg), $link-color, $link-hover-color: scale(primary, -15% lightness), $body-color:#212529, $enable-shadows:false, $enable-negative-margins:true`.
   Because `$dark` is navy, `navbar-dark bg-dark` and `btn-dark` become navy.
4. New `@use` lines: `components/hero`, `auth`, `mcq`, `board`.
5. `:root` custom properties `--ns-orange … --ns-gradient`. **None are referenced** in any template, SCSS or JS (dead, but harmless).
6. Global type: `html{font-size:16px}`, `body{font-family:Lato; overflow-x:hidden}`, all h1–h6 in Raleway 700 with 0.5 px letter-spacing (upstream: only h1 and h2, weight 500, 2 px), and `code/kbd/pre/samp` in the mono font.
7. `blockquote`: primary-colour left border with a 5 % tint (upstream: `$secondary` border) [COS].
8. **Navbar**: navy background plus a shadow, brand in the heading font at 700, logo max-height 34 px, nav-link hover in primary colour, `.active::after` 2 px underline [COS].
9. `.btn` weight 600 with transitions; `.btn-primary` white text and a lift-plus-glow on hover; `.card` gets a brand border, radius and shadow [COS].
10. Responsive: `img{max-width:100%}`, `pre{overflow-x:auto}`, `.table-responsive-wrap`, `<md` → root 15 px with tighter container padding.
Unchanged upstream rules are kept: the `input/select` padding, `.spinner`, `.badge-notification` and `.form-select` arrow.

## 14. ADDED `assets/scss/includes/_brand.scss` (single source of brand truth)

```scss
$brand-orange:#ff8300;  $brand-navy:#081a59;  $brand-blue:#00a7ce;
$brand-white:#ffffff;   $brand-offwhite:#e8fcff;  $brand-grey:#53565a;
$brand-success:#2eb872; $brand-warning:#ffb020; $brand-danger:#e5484d;
$brand-info:$brand-blue; $brand-pending:#a855f7;          // review workflow purple
$font-body:"Lato",…;  $font-heading:"Raleway","Lato",…;  $font-mono:"SFMono-Regular",Menlo,…;
$font-size-root:16px; $font-weight-heading:700; $letter-spacing-heading:0.5px;
$brand-radius:.625rem; $brand-radius-sm:.375rem; $brand-radius-lg:1rem;
$brand-shadow:0 4px 16px rgba(8,26,89,.08); $brand-shadow-lg:0 12px 32px rgba(8,26,89,.14);  // navy rgb hardcoded
$brand-content-width:1240px;   // only exported to --ns-content-width, unused
$brand-primary:$brand-orange;  $brand-secondary:$brand-navy;
```
All values are `!default`. Comment: "Current palette: Netskope One (SASE) - orange / blue / white." [NSK]. Instructions: edit this file, then `make theme`. Note that a new font family also needs a `@fontsource` package, `includes/utils/_fonts.scss` (unchanged stock file, which hard-codes `font-family: "Lato"` on `html, body, .container` and `"Raleway"` on `.jumbotron .container`) and a vite copy rule.

## 15. ADDED `assets/scss/includes/components/_hero.scss` (landing page)

- `.ns-hero`: navy section, white text, `clamp()` padding. `::before` is a perspective "network grid" (44 px lines, `rotateX(58deg)`, masked fade). `::after` is a 46 rem radial **orange** glow at the top right.
- `.ns-hero__eyebrow`: a mono, uppercase pill in orange with a pulsing dot (`.ns-pulse`, `@keyframes ns-pulse`).
- `.ns-hero__title` (Raleway 800, `clamp(2.1rem,5.4vw,3.9rem)`), `.ns-accent` (orange), `.ns-hero__lead`, `.ns-hero__actions` (flex wrap).
- Buttons: `.ns-btn-hero` (orange, glow, hover lift) and `.ns-btn-ghost` (transparent, white outline).
- `.ns-feature-grid` (auto-fit, min 15 rem) with `.ns-feature` cards (white, 3 px orange left border, icon chip, title in navy, text in grey) plus dark-mode variants.
- `.ns-section`, `.ns-section__title`, `.ns-section__sub` (+ dark).
- Uses `$brand-orange` **directly** rather than `$brand-primary`. Changing only `$brand-primary` would therefore leave the hero orange. Rebrand by changing `$brand-orange`'s value, or replace these references with `$brand-primary`.

## 16. ADDED `components/_auth.scss`

`.ns-auth` (full-height grid, centred) with two background radial glows (orange 10 %, blue 12 %). `.ns-auth__card`: max 27 rem, white, lg radius, lg shadow; dark mode uses a hardcoded `#14203f`. Also `__brand img` (46 px), `__title`, `__sub`, `.form-control` focus ring in orange, full-width `.btn-primary`, `__footer`, and an `__divider` ("or" with lines). Also uses `$brand-orange`/`$brand-blue` directly.

## 17. ADDED `components/_board.scss`

- `.ns-page-head` (navy banner with an orange glow) replaces the jumbotron on the challenges page.
- `.ns-category` header with a 4 px orange bar before the title, `__count` pill (mono). Dark variants.
- `.ns-challenge-grid`: `repeat(auto-fill, minmax(min(100%,13.5rem),1fr))`.
- `.ns-tile`: card with a 3 px left border (navy 25 %), hover lift with an orange left border. `__name`, `__meta`, `__value` (mono, orange), `__status` (absolute, top-right), `__pending-label` (purple pill), `--solved` (green), `--pending` (purple), `--locked` (grey, `cursor:not-allowed`, no hover effect), `__locked-label` (grey "LOCKED" pill), `__requires`. Full dark-mode set.
- `.challenge-desc` readability: wrap, line-height 1.7, bordered images, `pre` tint, **tables become scrollable blocks** with cell borders.
- Content blocks used by the workshop markdown: `.challenge-container`, `.attacker-container`, `.defender-container` and the matching `*-label` pills (challenge = orange, attacker = danger red, defender = success green). These classes are generic and fit an attacker/defender OT scenario like Hack the Brewery well.
- Phone tweaks (<576 px) for the modal body, challenge name and tabs.
- **Hints**: `.ns-hints__heading` (mono orange), `.ns-hint details` (4 px orange left border), custom `summary` with a ▸ marker that rotates when open, `.ns-hint__cost` (orange pill), `--free` (hardcoded `#1f8a4c` / dark `#5fd38d`), `.ns-hint__body`.

## 18. ADDED `components/_mcq.scss`

- `.ns-choices` grid, `.ns-choice` option cards (`accent-color` orange). The selected state uses `:has(input:checked)`, which needs Chrome 105+, Safari 15.4+ or Firefox 121+. The fallback `.is-selected` class is never set.
- `.ns-status` banners: `--pending` (purple), `--approved`, `--rejected`, `--locked`. Only `--pending` is used in the student templates.
- `.ns-badge-pending`, `.ns-review-dot` (blinking), `.ns-review-row--pending`, `.ns-review-answer`. These are only used by the admin `review.html`, which loads the **admin** CSS, so they are effectively dead in this theme (the admin theme defines its own copies).
- `.ns-cooldown` panel (warning tint, text `#7a4b00` / dark `#ffd79a`, `__track` / `__bar` with a 1 s linear width transition).
- Disabled options during the cooldown: opacity 0.55, `not-allowed`.

## 19. ADDED `static/workshop.css` (plain CSS, no rebuild)

Loaded last (from `base.html`). Its only rule: keep `#challenge-window .challenge-submit` text white in hover, focus and **disabled** states, because Bootstrap would otherwise dim it on orange. A header comment explains it is the "no theme rebuild needed" tweak file (`docker compose up -d --build app`, then hard refresh). `vite.config.js emptyOutDir:false` exists to protect this file.

## 20. ADDED `templates/index.html` (landing page)

Rendered for `/` by the **modified `CTFd/views.py` `static_html`**: `if route == "index": return render_template("index.html", page=page)`. It falls back to `page.html` and returns 404 if the theme has no `index.html`.

- `home_buttons()` macro, which depends on authentication state:
  - authenticated: "▶ Start the workshop" → `/challenges` and "Scoreboard".
  - anonymous with registration open: "Create your account" and "I already have an account".
  - anonymous with registration closed: "Sign in to start".
- **Mode A** (the DB page `index` has content, e.g. from `data/Home.md` via `manage.py sync-content`, or Admin › Pages › index): output `page.html` split on `<!-- buttons -->`, with the buttons inserted at each marker. This depends on the sanitiser keeping HTML comments (`strip_comments=False` in `utils/security/sanitize.py`).
- **Mode B** (built-in fallback): hard-coded Netskope content:
  - Eyebrow "Zero Trust Network Access · Hands-on Lab".
  - Title `Configs.ctf_name` (unless it is "CTFd"), else "Netskope <span class=ns-accent>ZTNA</span> Workshop".
  - Lead paragraph about Netskope Private Access, Publisher, Advanced Analytics.
  - 4 feature cards: "Deploy a Publisher", "Zero Trust policies", "Real private apps", "Prove it in the logs" (NPA logs).
  - Closing CTA section "Ready when you are" / "Activities are ordered so the next one is always at the top…" with "Go to the challenges" or "Sign in to start".
- The button markup is duplicated between the macro and the Mode B hero (it could call `home_buttons()`). The `{% block stylesheets %}{{ super() }}` block is a no-op.

---

## 21. Things to note or fix when porting

1. `setup.js` `submitSetup` references the removed `#newsletter-checkbox` (TypeError on submit). Remove it.
2. Dead code: `isChosen`, `getShareUrl` / `copyShareUrl` (the share UI was removed), the `--ns-*` CSS variables, `.is-selected`, and the admin-only review classes in the student CSS.
3. Raleway ships at weight 400 only, but headings use 700/800 (synthesised bold). If the new brand wants real bold headings, add weight files to the vite copy rule and to `_fonts.scss`.
4. Hardcoded colours outside `_brand.scss`: `#14203f` (dark auth card), `#1f8a4c` / `#5fd38d` (free hint), `#7a4b00` / `#ffd79a` (cooldown text), `#212529` (body colour in `main.scss`), `#a3d39c` (stock setup card highlight), and the `rgba(8,26,89,…)` navy inside the shadow variables.
5. Many components reference `$brand-orange`, `$brand-navy` and `$brand-blue` directly instead of the semantic `$brand-primary` / `$brand-secondary`. Rebrand by re-valuing those three variables (simplest), not only `$brand-primary`.
6. The modal width is hard-set inline in `challenges.html` (1400 px). The `challenge_window_size` theme setting no longer has a visible effect.
7. All board and modal features depend on NSK backend changes: `order_id` and `cooldown` columns (migrations n5001 and n5002), the `Pending` model, the `choice` and `manual` flag plugins, locked-challenge output in `/api/v1/challenges`, the `cooldown` / `pending` attempt statuses, the `view_self_submissions` config, and the hints `errors` path. Porting the theme alone gives broken or empty states. For example, `order_id` would be `undefined`, so the sort falls back to 0 and keeps API order. `c.locked` would be undefined, so no tiles get locked, but nothing crashes. Missing `choices` / `cooldown*` template vars are guarded by `| default(0)` and `{% if %}`.
8. Locked tiles keep the real challenge `id` in `:value` (low risk; the backend detail endpoint refuses locked challenges).
9. Stock features silently dropped: language switcher, social share, MLC login and setup, CTFd newsletter, notification sound, "Powered by CTFd" link, and `tag-*` tile classes.

## 22. Rebrand checklist – Exclusive Networks "Hack the Brewery"

**Rebuild required (SCSS/JS → `npm run build` / `make theme`):**
- `assets/scss/includes/_brand.scss`: set `$brand-orange` (rename it in spirit to the EXN primary accent), `$brand-navy` (EXN dark), `$brand-blue` (EXN secondary accent), `$brand-offwhite`, `$brand-grey`, optionally `$brand-success/warning/danger/pending`, the fonts `$font-body` / `$font-heading` / `$font-mono` and `$font-weight-heading`, and the shadow rgba (currently Netskope navy `8,26,89`). Update the "Netskope One" comment.
- If the EXN fonts differ from Lato/Raleway: add the `@fontsource/<font>` dependency to `package.json`, update `includes/utils/_fonts.scss` (also the hard-coded `"Lato"` / `"Raleway"` there), and add copy rules for the needed weights in `vite.config.js`.
- `main.scss`: header comment and `$body-color`. Optionally replace the hardcoded hexes in `_auth.scss`, `_board.scss` and `_mcq.scss` (§21.4).
- `_hero.scss`: you may want a brewery visual instead of the network grid (`.ns-hero::before`), e.g. a background image under `assets/img/` (copied to `static/img/`).
- Optional cleanup: rename the `ns-` prefix (cosmetic; it touches all templates and SCSS, so it can stay as is).

**No rebuild (templates and static CSS; restart or redeploy the app and hard-refresh):**
- `templates/index.html`: replace the eyebrow, the "Netskope ZTNA Workshop" fallback title, the lead text, the 4 feature cards (icons and text, e.g. IT/OT, PLC/SCADA, brewery process, detection) and the CTA copy. Or keep them generic and drive the content from `data/Home.md` with `<!-- buttons -->`.
- `templates/register.html`: placeholder `e.g. netskope7` → e.g. `brewer42`. Revisit "workshop" wording in `login.html` and `register.html` subtitles.
- `templates/base.html`: footer "Internal training environment" (e.g. "Exclusive Networks · Hack the Brewery").
- `templates/challenges.html`: subtitle wording, and the modal width if wanted.
- `templates/setup.html`: "Finish" tab text (the `sync-content` command; keep only if the data/ loader is ported) and the "workshop" wording.
- `static/workshop.css`: fine as is (white text on the primary button). Add quick EXN tweaks here.

**Admin/config (no code):** `ctf_name` (drives the hero title, the footer and the navbar when there is no logo), `ctf_logo` (navbar + auth cards), `ctf_small_icon` (favicon; `assets/img/favicon.ico` is the stock icon), `theme_header` / `theme_footer`, `view_self_submissions`, and the Pages › `index` content.
