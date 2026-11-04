"""
File-based challenge and page content.

Challenges and informational pages are authored as Markdown/HTML files in the
``data/`` directory at the root of the project. This module reads that folder
and synchronises it into the database.

Layout
------

    data/
        images/                       <- served at /images/<filename>
        Home.md                       <- the landing page at /
        0. Welcome.md                 <- a top level file becomes a page
        1. Warming Up/                <- a folder becomes a category
            1.1 Rules of Engagement.md   <- a file becomes a challenge
            1.2 User Portal App.md
        Inventory.md
        topology.md

Ordering
--------

The numeric prefix of the folder and of the file name drives the display
order, so ``3. Private App/3.2 NPA traffic logs.md`` sorts after
``3. Private App/3.1 create private app.md``. The computed value is written to
``Challenges.order_id``; challenges are shown highest-first so the next
activity is always on top. Set ``order`` in the front matter to override it.

Front matter
------------

An optional front matter block at the top of a file sets challenge metadata.
Every key is optional::

    ---
    title: Locate the User Portal
    category: Warming Up
    value: 100
    order: 120
    flag: 8.8.8.8
    flag_type: static          # static | regex | choice | manual
    case_insensitive: true
    requires_approval: false   # shorthand for flag_type: manual
    choices:
        - Option A
        - Option B
        - Option C
    answer: Option B           # accepted choice(s), "|" separated
    multiple: false            # true when several choices must be selected
    state: visible             # visible | hidden
    page: false                # true to publish as a page instead
    hint: hints/3.1 Steps.md   # a hint file, unlocked for hint_cost points
    hint_cost: 25
    ---

Several hints use a list, each entry ``file | cost | title`` (cost and title
optional)::

    hints:
        - hints/3.1 Nudge.md | 10
        - hints/3.1 Full walkthrough.md | 50 | Step by step

Hint files live in a ``hints/`` folder (next to the challenge, or at the top of
``data/``). Those folders are never imported as challenges. A hint file may
carry its own ``title`` and ``cost`` front matter; the challenge's values win.

Flags may also be written the way the existing workshop files do it: as the
last block of text after the closing ``</div>`` of the challenge container. If
no front matter flag is given, that trailing text is used.
"""

import os
import re

from CTFd.models import Challenges, Flags, Hints, Pages, db

# =====================================================================
#  ANTI-GUESSING COOLDOWN
# =====================================================================
#  Seconds a student must wait after a wrong answer before they may
#  submit again. This stops multiple-choice questions being brute forced.
#
#  Change the number below to adjust it for every multiple-choice
#  question at once (for example 30 -> 60), then re-run:
#      docker compose exec app python manage.py sync-content
#
#  A single challenge can override it in its front matter:
#      cooldown: 60      # seconds, or 0 to switch it off here
# =====================================================================

DEFAULT_CHOICE_COOLDOWN = 30

# Free-text and regex answers are not guessable in the same way, so they
# have no wait unless a challenge asks for one explicitly.
DEFAULT_COOLDOWN = 0

# Points a hint costs when neither the challenge nor the hint file sets one.
DEFAULT_HINT_COST = 10

# Folders holding hint files. They are read through the challenge that links
# them and are never imported as challenges of their own.
HINT_DIRS = {"hints"}


# ---------------------------------------------------------------------------
# Locating the content directory
# ---------------------------------------------------------------------------


def get_content_dir(app=None):
    """Absolute path of the ``data`` directory."""
    from flask import current_app

    app = app or current_app
    configured = app.config.get("CONTENT_FOLDER")
    if configured:
        return os.path.abspath(configured)
    # CTFd/ -> project root -> data
    return os.path.abspath(os.path.join(os.path.dirname(app.root_path), "data"))


def get_images_dir(app=None):
    return os.path.join(get_content_dir(app), "images")


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

_FRONT_MATTER_RE = re.compile(r"\A\s*---\s*\n(.*?)\n---\s*\n", re.DOTALL)

_TRUE = {"true", "yes", "on", "1"}
_FALSE = {"false", "no", "off", "0"}


def _strip_inline_comment(value):
    """Drop a trailing ``# comment`` from a front matter value.

    Follows the YAML rule: a ``#`` only starts a comment when it is preceded by
    whitespace, so values such as ``#ff8300`` survive. Text inside matching
    quotes is left completely alone.
    """
    text = value.strip()
    if not text:
        return text

    # A quoted value ends at its closing quote; anything after it is a comment.
    if text[0] in "\"'":
        quote = text[0]
        end = text.find(quote, 1)
        if end != -1:
            return text[: end + 1]
        return text

    for index, char in enumerate(text):
        # A value that is nothing but a comment collapses to empty, which is
        # what makes "choices:   # note" still read as the start of a list.
        if char == "#" and (index == 0 or text[index - 1] in " \t"):
            return text[:index].rstrip()
    return text


def _coerce(value):
    """Turn a front matter string into a bool/int where that is unambiguous."""
    text = _strip_inline_comment(value)
    if text.lower() in _TRUE:
        return True
    if text.lower() in _FALSE:
        return False
    if re.fullmatch(r"-?\d+", text):
        return int(text)
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'":
        return text[1:-1]
    return text


def parse_front_matter(text):
    """Split a document into (metadata dict, body).

    Supports ``key: value`` pairs and simple ``- item`` lists, which is all the
    workshop content needs. Keeping this self-contained avoids adding a YAML
    dependency for a handful of keys.
    """
    match = _FRONT_MATTER_RE.match(text)
    if not match:
        return {}, text

    meta = {}
    current_list_key = None

    for raw_line in match.group(1).splitlines():
        line = raw_line.rstrip()
        if not line.strip() or line.strip().startswith("#"):
            continue

        list_item = re.match(r"^\s*-\s+(.*)$", line)
        if list_item and current_list_key:
            meta[current_list_key].append(_coerce(list_item.group(1)))
            continue

        pair = re.match(r"^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$", line)
        if pair:
            key = pair.group(1).strip().lower().replace("-", "_")
            # Strip any trailing comment first, so "choices:   # note" is still
            # recognised as the start of a list rather than a plain value.
            value = _strip_inline_comment(pair.group(2))
            if value == "":
                meta[key] = []
                current_list_key = key
            else:
                meta[key] = _coerce(value)
                current_list_key = None

    return meta, text[match.end() :]


_NUM_PREFIX_RE = re.compile(r"^\s*(\d+(?:\.\d+)*)[.)]?\s*(.*)$")


def _split_numeric_prefix(name):
    """``"1.2 User Portal"`` -> ((1, 2), "User Portal")."""
    match = _NUM_PREFIX_RE.match(name)
    if not match:
        return (), name.strip()
    parts = tuple(int(p) for p in match.group(1).split("."))
    return parts, match.group(2).strip()


def _order_from_parts(parts):
    """Turn (3, 2) into a sortable integer such as 3002."""
    if not parts:
        return 0
    major = parts[0]
    minor = parts[1] if len(parts) > 1 else 0
    return major * 1000 + minor


def extract_trailing_flag(body):
    """Pull the workshop-style flag that trails the challenge container.

    The existing content puts the expected answer as the last block of text
    after the final ``</div>``. Returns ``(body_without_flag, flag_or_None)``.
    """
    if "</div>" not in body:
        return body, None

    head, _, tail = body.rpartition("</div>")
    candidate_lines = [line for line in tail.splitlines() if line.strip()]

    meaningful = [
        line.strip()
        for line in candidate_lines
        if not re.fullmatch(r"<[^>]+>", line.strip())
    ]
    if not meaningful:
        return body, None

    flag = " ".join(meaningful).strip()

    # A long tail is prose, not a flag.
    if len(flag) > 120 or "<" in flag:
        return body, None

    return head + "</div>", flag


def rewrite_image_urls(body):
    """Point legacy upload URLs at the static images folder.

    ``/files/<md5>/user_portal.jpg`` becomes ``/images/user_portal.jpg`` so
    images can be managed by dropping files into ``data/images/``.
    """
    body = re.sub(r"/files/[0-9a-fA-F]{8,}/([^)\s\"'>]+)", r"/images/\1", body)
    # Relative links such as ``images/x.jpg`` or ``../../images/x.jpg`` work
    # in a Markdown preview of the file; on the site they live at /images/.
    return re.sub(r"(\]\(|src=[\"'])(?:\.\./|\./)*images/", r"\1/images/", body)


def _slugify(text):
    """Build a URL slug, dropping any leading numeric ordering prefix.

    ``"0. Welcome"`` becomes ``welcome`` so the numbering used to order files
    never leaks into the page URL.
    """
    _, title = _split_numeric_prefix(text)
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", (title or text).strip().lower()).strip("-")
    return slug or "page"


def parse_content_file(path, root):
    """Read one Markdown file into a description of what it should become."""
    with open(path, encoding="utf-8", errors="replace") as handle:
        raw = handle.read()

    meta, body = parse_front_matter(raw)

    rel = os.path.relpath(path, root)
    folder = os.path.dirname(rel)
    stem = os.path.splitext(os.path.basename(rel))[0]

    file_parts, file_title = _split_numeric_prefix(stem)
    folder_parts, folder_title = _split_numeric_prefix(folder) if folder else ((), "")

    if file_parts:
        order = _order_from_parts(file_parts)
    elif folder_parts:
        order = _order_from_parts(folder_parts)
    else:
        order = 0
    order = int(meta.get("order", order))

    title = meta.get("title") or file_title or stem
    category = meta.get("category") or folder_title or "General"

    body = rewrite_image_urls(body)

    is_page = bool(meta.get("page")) or not folder

    flag_value = meta.get("flag")
    if flag_value is None and not is_page:
        body, flag_value = extract_trailing_flag(body)

    flag_type = meta.get("flag_type")
    if meta.get("requires_approval") is True:
        flag_type = "manual"
    if flag_type is None:
        flag_type = "choice" if meta.get("choices") else "static"

    if flag_type == "choice":
        flag_value = meta.get("answer", flag_value)

    slug = _slugify(stem)
    if is_page and not folder and slug in HOME_PAGE_SLUGS:
        slug = HOME_PAGE_ROUTE

    # Prerequisites: challenges that must be solved before this one unlocks.
    # Written as challenge names, resolved to ids after every challenge exists.
    requires = meta.get("requires", meta.get("requirements"))
    if requires is None:
        requires = []
    elif not isinstance(requires, list):
        requires = [requires]
    requires = [str(r).strip() for r in requires if str(r).strip()]

    # The challenge offered by the "Next Challenge" button after a solve.
    next_challenge = meta.get("next")
    next_challenge = str(next_challenge).strip() if next_challenge else None

    # Wait between submissions. Multiple choice gets the anti-guessing
    # default; anything else only waits if the file asks for it.
    if "cooldown" in meta:
        cooldown = max(0, int(meta.get("cooldown") or 0))
    elif flag_type == "choice":
        cooldown = DEFAULT_CHOICE_COOLDOWN
    else:
        cooldown = DEFAULT_COOLDOWN

    warnings = []
    hints = [] if is_page else _parse_hints(meta, path, root, title, warnings)

    return {
        "path": path,
        "rel": rel.replace(os.sep, "/"),
        "slug": slug,
        "title": title,
        "category": category,
        "body": body.strip(),
        "order": order,
        "value": int(meta.get("value", 100)),
        "state": meta.get("state", "visible"),
        "flag": None if flag_value is None else str(flag_value).strip(),
        "flag_type": flag_type,
        "case_insensitive": bool(meta.get("case_insensitive", True)),
        "choices": list(meta.get("choices") or []),
        "multiple": bool(meta.get("multiple", False)),
        "cooldown": cooldown,
        "requires": requires,
        "requires_anonymize": bool(meta.get("requires_anonymize", False)),
        "next": next_challenge,
        "is_page": is_page,
        "hidden": bool(meta.get("hidden", False)),
        "auth_required": bool(meta.get("auth_required", False)),
        "hints": hints,
        "warnings": warnings,
    }


def _parse_hints(meta, path, root, challenge_title, warnings):
    """Read the hint files a challenge's front matter links to.

    Returns ``None`` when the front matter names no hints, so hints added in
    the admin UI are left alone; otherwise a list of dicts ready to sync.
    """
    entries = []
    if meta.get("hint"):
        entries.append(
            (meta["hint"], meta.get("hint_cost"), meta.get("hint_title"))
        )
    listed = meta.get("hints")
    if listed is not None:
        if not isinstance(listed, list):
            listed = [listed]
        for entry in listed:
            parts = [p.strip() for p in str(entry).split("|")]
            cost = parts[1] if len(parts) > 1 and parts[1] else None
            hint_title = parts[2] if len(parts) > 2 and parts[2] else None
            entries.append((parts[0], cost, hint_title))

    if not entries and "hint" not in meta and "hints" not in meta:
        return None

    hints = []
    for ref, cost, hint_title in entries:
        hint_path = _resolve_hint_path(str(ref).strip(), path, root)
        if hint_path is None:
            warnings.append(
                f"{challenge_title}: hint file {ref!r} not found - hint skipped"
            )
            continue

        with open(hint_path, encoding="utf-8", errors="replace") as handle:
            hint_meta, hint_body = parse_front_matter(handle.read())

        if cost is None:
            cost = hint_meta.get("cost", DEFAULT_HINT_COST)
        try:
            cost = max(0, int(cost))
        except (TypeError, ValueError):
            warnings.append(
                f"{challenge_title}: hint cost {cost!r} is not a number - "
                f"using {DEFAULT_HINT_COST}"
            )
            cost = DEFAULT_HINT_COST

        if not hint_title:
            hint_title = hint_meta.get("title")
        if not hint_title:
            stem = os.path.splitext(os.path.basename(hint_path))[0]
            hint_title = _split_numeric_prefix(stem)[1] or stem

        hints.append(
            {
                "title": str(hint_title)[:80],
                "cost": cost,
                "content": rewrite_image_urls(hint_body).strip(),
                "rel": os.path.relpath(hint_path, root).replace(os.sep, "/"),
            }
        )
    return hints


def _resolve_hint_path(ref, challenge_path, root):
    """Find a hint file: next to the challenge, in its hints/ folder, or
    relative to data/. The ``.md`` extension may be left off."""
    folder = os.path.dirname(challenge_path)
    candidates = []
    for base in (folder, os.path.join(folder, "hints"), root,
                 os.path.join(root, "hints")):
        candidates.append(os.path.join(base, ref))
        if not ref.lower().endswith((".md", ".markdown", ".html")):
            candidates.append(os.path.join(base, ref + ".md"))

    root_abs = os.path.abspath(root)
    for candidate in candidates:
        candidate = os.path.abspath(candidate)
        # Never read outside the content folder.
        if not candidate.startswith(root_abs + os.sep):
            continue
        if os.path.isfile(candidate):
            return candidate
    return None


def discover_content(root=None, app=None):
    """Parse every Markdown file under the content directory."""
    root = root or get_content_dir(app)
    if not os.path.isdir(root):
        return []

    items = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [
            d
            for d in dirnames
            if d not in {"images", "files"}
            and d.lower() not in HINT_DIRS
            and not d.startswith(".")
        ]
        for filename in sorted(filenames):
            if not filename.lower().endswith((".md", ".markdown", ".html")):
                continue
            if filename.startswith("."):
                continue
            items.append(parse_content_file(os.path.join(dirpath, filename), root))

    items.sort(key=lambda i: (i["order"], i["title"]))
    return items


# ---------------------------------------------------------------------------
# Choice storage
# ---------------------------------------------------------------------------

CHOICES_PREFIX = "choices:"


def _encode_choices(choices):
    """Store the choice list compactly on the challenge row."""
    cleaned = [str(c).strip() for c in choices if str(c).strip()]
    return CHOICES_PREFIX + "\n".join(cleaned)


def decode_choices(value):
    """Read a choice list back off a challenge row. Returns a list."""
    if not value or not str(value).startswith(CHOICES_PREFIX):
        return []
    body = str(value)[len(CHOICES_PREFIX) :]
    return [line.strip() for line in body.split("\n") if line.strip()]


# ---------------------------------------------------------------------------
# Synchronising into the database
# ---------------------------------------------------------------------------

# Files that are scaffolding rather than workshop activities.
RESERVED_PAGE_SLUGS = {"template"}

# A top level ``Home.md`` (or ``Index.md``) becomes the landing page at ``/``.
# CTFd stores the landing page as the page whose route is "index".
HOME_PAGE_ROUTE = "index"
HOME_PAGE_SLUGS = {"home", "index"}


def sync_content(root=None, app=None, prune=False, overwrite=True):
    """Import the content directory into the database.

    :param prune: remove file-backed challenges whose source file is gone.
    :param overwrite: update challenges that already exist. When False,
        existing rows are left untouched so admin edits survive a re-sync.
    :returns: a summary dict of what changed.
    """
    items = discover_content(root=root, app=app)

    summary = {
        "challenges_created": 0,
        "challenges_updated": 0,
        "pages_created": 0,
        "pages_updated": 0,
        "skipped": 0,
        "pruned": 0,
        "links": 0,
        "hints": 0,
        "warnings": [],
    }

    seen_challenge_names = set()
    challenge_items = []

    for item in items:
        summary["warnings"].extend(item.get("warnings") or [])
        if item["slug"] in RESERVED_PAGE_SLUGS:
            summary["skipped"] += 1
            continue

        if item["is_page"]:
            _sync_page(item, summary, overwrite)
        else:
            seen_challenge_names.add(item["title"])
            _sync_challenge(item, summary, overwrite)
            challenge_items.append(item)

    if prune:
        summary["pruned"] = _prune_challenges(seen_challenge_names)

    # Prerequisites and "next" links can only be resolved once every
    # challenge exists, so they are applied in a second pass.
    db.session.flush()
    _link_challenges(challenge_items, summary)

    db.session.commit()

    # The challenge list and standings are memoized, so drop those caches or
    # the site would keep serving the previous content for up to a minute.
    try:
        from CTFd.cache import clear_challenges, clear_pages, clear_standings

        clear_challenges()
        clear_pages()
        clear_standings()
    except Exception:  # pragma: no cover - caching must never break a sync
        pass

    return summary


def _link_challenges(items, summary):
    """Resolve the `requires` and `next` names in front matter into ids."""
    by_name = {}
    for challenge in Challenges.query.all():
        by_name[challenge.name.strip().lower()] = challenge

    def resolve(name, source_title):
        target = by_name.get(str(name).strip().lower())
        if target is None:
            summary["warnings"].append(
                f"{source_title}: no challenge named {name!r} - link ignored"
            )
        return target

    for item in items:
        challenge = by_name.get(item["title"].strip().lower())
        if challenge is None:
            continue

        # --- prerequisites -------------------------------------------------
        if item["requires"]:
            prereq_ids = []
            for name in item["requires"]:
                target = resolve(name, item["title"])
                if target is None:
                    continue
                if target.id == challenge.id:
                    summary["warnings"].append(
                        f"{item['title']}: cannot require itself - ignored"
                    )
                    continue
                prereq_ids.append(target.id)

            if prereq_ids:
                challenge.requirements = {
                    "prerequisites": prereq_ids,
                    "anonymize": item["requires_anonymize"],
                }
                summary["links"] += 1
        elif challenge.requirements:
            # The key was removed from the file, so drop the gate.
            challenge.requirements = None

        # --- next challenge ------------------------------------------------
        if item["next"]:
            target = resolve(item["next"], item["title"])
            if target is not None and target.id != challenge.id:
                challenge.next_id = target.id
                summary["links"] += 1
            elif target is not None:
                summary["warnings"].append(
                    f"{item['title']}: cannot point to itself as next - ignored"
                )
        elif challenge.next_id:
            challenge.next_id = None


def _sync_page(item, summary, overwrite):
    page = Pages.query.filter_by(route=item["slug"]).first()

    if page is None:
        db.session.add(
            Pages(
                title=item["title"],
                route=item["slug"],
                content=item["body"],
                draft=False,
                hidden=item.get("hidden", False),
                auth_required=item.get("auth_required", False),
            )
        )
        summary["pages_created"] += 1
        return

    if overwrite:
        page.title = item["title"]
        page.content = item["body"]
        page.hidden = item.get("hidden", False)
        page.auth_required = item.get("auth_required", False)
        summary["pages_updated"] += 1


def _sync_challenge(item, summary, overwrite):
    challenge = Challenges.query.filter_by(name=item["title"]).first()

    created = False
    if challenge is None:
        challenge = Challenges(
            name=item["title"],
            description=item["body"],
            category=item["category"],
            value=item["value"],
            type="standard",
            state=item["state"],
        )
        db.session.add(challenge)
        created = True
    elif not overwrite:
        summary["skipped"] += 1
        return

    challenge.description = item["body"]
    challenge.category = item["category"]
    challenge.order_id = item["order"]
    challenge.cooldown = item["cooldown"]
    if created:
        challenge.value = item["value"]
        challenge.state = item["state"]

    # The choices a student picks from live on the challenge row so the front
    # end can render them without a bespoke challenge type.
    if item["choices"]:
        challenge.connection_info = _encode_choices(item["choices"])
    elif created:
        challenge.connection_info = None

    db.session.flush()

    _sync_flag(challenge, item)
    summary["hints"] += _sync_hints(challenge, item)

    if created:
        summary["challenges_created"] += 1
    else:
        summary["challenges_updated"] += 1


def _sync_flag(challenge, item):
    """Make the challenge's flag match the file."""
    if item["flag"] is None and item["flag_type"] != "manual":
        return

    flag = Flags.query.filter_by(challenge_id=challenge.id).first()

    content = item["flag"] or ""
    flag_type = item["flag_type"]

    if flag_type == "choice":
        data = "multiple" if item["multiple"] else ""
    elif flag_type == "manual":
        data = ""
    else:
        data = "case_insensitive" if item["case_insensitive"] else ""

    if flag is None:
        db.session.add(
            Flags(
                challenge_id=challenge.id,
                type=flag_type,
                content=content,
                data=data,
            )
        )
    else:
        flag.type = flag_type
        flag.content = content
        flag.data = data


def _sync_hints(challenge, item):
    """Make the challenge's hints match the files its front matter links.

    Existing hints are updated in place, in order, rather than recreated, so a
    student who already paid for a hint keeps it after a re-sync. Returns the
    number of hints the challenge now has from files.
    """
    specs = item.get("hints")
    if specs is None:
        # No hint keys in the file: leave any admin-made hints untouched.
        return 0

    existing = (
        Hints.query.filter_by(challenge_id=challenge.id).order_by(Hints.id).all()
    )
    for index, spec in enumerate(specs):
        if index < len(existing):
            hint = existing[index]
        else:
            hint = Hints(challenge_id=challenge.id, type="standard")
            db.session.add(hint)
        hint.title = spec["title"]
        hint.content = spec["content"]
        hint.cost = spec["cost"]

    for stale in existing[len(specs) :]:
        db.session.delete(stale)

    return len(specs)


def _prune_challenges(seen_names):
    """Delete challenges that no longer have a source file."""
    removed = 0
    for challenge in Challenges.query.all():
        if challenge.name not in seen_names:
            Flags.query.filter_by(challenge_id=challenge.id).delete()
            Hints.query.filter_by(challenge_id=challenge.id).delete()
            db.session.delete(challenge)
            removed += 1
    return removed
