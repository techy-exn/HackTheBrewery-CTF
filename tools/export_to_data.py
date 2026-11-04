"""Convert a CTFd export (db/*.json + uploads/) into the NSK/Hack the Brewery data/ layout.
usage: python3 export_to_data.py <export_dir> <data_dir>"""
import json, os, re, sys, shutil, hashlib

src, dst = sys.argv[1], sys.argv[2]
def L(n):
    s = open(f"{src}/db/{n}.json", encoding="utf-8").read()
    return json.loads(s)["results"] if s.strip() else []

chals = {c["id"]: c for c in L("challenges")}
flags = L("flags"); pages = L("pages"); files = L("files")
dyn = {d["id"]: d for d in L("dynamic_challenge")}
hints = L("hints")

os.makedirs(f"{dst}/images", exist_ok=True)
# ---- images: keep file name, de-duplicate clashing names --------------------
img_map, used = {}, {}
for f in files:
    loc = f["location"]; name = os.path.basename(loc)
    data = open(f"{src}/uploads/{loc}", "rb").read(); h = hashlib.sha1(data).hexdigest()
    if name in used and used[name] != h:
        stem, ext = os.path.splitext(name); i = 2
        while f"{stem}-{i}{ext}" in used: i += 1
        name = f"{stem}-{i}{ext}"
    used.setdefault(name, h)
    open(f"{dst}/images/{name}", "wb").write(data)
    img_map[loc] = name

def rewrite(text):
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"/files/([0-9a-f]{32}/[^\s\"')?<>]+)",
                  lambda m: "/images/" + img_map.get(m.group(1), os.path.basename(m.group(1))), text)
    return fix_links(text)

def slug(t):
    return re.sub(r"[^a-zA-Z0-9]+", "-", t.strip().lower()).strip("-")
PAGE_ROUTES = {p["route"]: slug(p["title"]) for p in pages if p["route"] != "index"}

def fix_links(text):
    for old, new in PAGE_ROUTES.items():
        for o in {old, old.replace(" ", "%20")}:
            text = re.sub(r'(href=")/?' + re.escape(o) + '"', r'\g<1>/' + new + '"', text, flags=re.I)
            text = re.sub(r'(\]\()/?' + re.escape(o) + r'\)', r'\g<1>/' + new + ')', text, flags=re.I)
    return text

def q(v):
    v = str(v)
    if '"' in v: raise SystemExit(f"double quote in front-matter value: {v!r}")
    return f'"{v}"'

def clean_cat(cat):
    m = re.match(r"^\s*(\d+[a-z]?)\s*[.\-]?\s*(.*)$", cat)
    return f"{m.group(1)}. {m.group(2).strip()}" if m else cat.strip()

def safe(name):
    return re.sub(r'[\\/:*?"<>|]+', "-", name).strip()

# ---- workshop order: by category number, then by prerequisite chain ---------
def catkey(c):
    m = re.match(r"^\s*(\d+)([a-z]?)", c["category"])
    return (int(m.group(1)), m.group(2)) if m else (999, "")
def depth(c, seen=()):
    pre = (c.get("requirements") or {}).get("prerequisites") or []
    pre = [p for p in pre if p in chals and p not in seen]
    return 0 if not pre else 1 + max(depth(chals[p], seen + (c["id"],)) for p in pre)
seq = sorted(chals.values(), key=lambda c: (catkey(c), depth(c), c["id"]))
N = len(seq)
report = []
cat_index = {}
for pos, c in enumerate(seq):
    cat = clean_cat(c["category"])
    cat_index.setdefault(cat, len(cat_index))
    short = safe(re.sub(r"^[0-9a-z]+\. ", "", cat))
    folder = f"{dst}/{cat_index[cat]:02d} {short}"
    os.makedirs(folder, exist_ok=True)
    cf = [f for f in flags if f["challenge_id"] == c["id"]]
    fm = ["---", f"title: {q(c['name'])}", f"category: {q(cat)}",
          f"value: {dyn[c['id']]['initial'] if c['id'] in dyn else c['value']}",
          f"order: {(N - pos) * 100}", f"state: {c['state']}"]
    if cf:
        f0 = cf[0]
        fm.append(f"flag: {q(f0['content'])}")
        if f0["type"] != "static": fm.append(f"flag_type: {f0['type']}")
        if f0.get("data") != "case_insensitive": fm.append("case_insensitive: false")
        if len(cf) > 1: report.append(f"#{c['id']} has {len(cf)} flags - only the first is synced")
    else:
        fm.append("requires_approval: true   # no flag in the old export: answer is reviewed by a proctor")
    pre = [chals[p]["name"] for p in ((c.get("requirements") or {}).get("prerequisites") or []) if p in chals]
    if pre:
        fm.append("requires:"); fm += [f"  - {q(p)}" for p in pre]
        if (c.get("requirements") or {}).get("anonymize"): fm.append("requires_anonymize: true")
    if c.get("next_id") in chals:
        fm.append(f"next: {q(chals[c['next_id']]['name'])}")
    if c["max_attempts"]: report.append(f"#{c['id']} max_attempts={c['max_attempts']} not supported by the loader")
    if c["type"] == "dynamic": report.append(f"#{c['id']} was dynamic (decay) - now static {dyn[c['id']]['initial']} pts")
    if [h for h in hints if h["challenge_id"] == c["id"]]: report.append(f"#{c['id']} has hints - not converted")
    fm.append(f"# migrated from CTFd export challenge id {c['id']}")
    fm.append("---")
    fname = f"{folder}/{cat_index[cat]:02d}.{pos:02d} {safe(c['name'])}.md"
    open(fname, "w", encoding="utf-8").write("\n".join(fm) + "\n\n" + rewrite(c["description"]).strip() + "\n")

# ---- pages -------------------------------------------------------------------
for p in pages:
    if p["route"] == "index":
        os.makedirs(f"{dst}/../docs", exist_ok=True)
        open(f"{dst}/../docs/legacy-home-from-export.html.txt", "w").write(rewrite(p["content"]))
        continue
    fm = ["---", f"title: {q(p['title'])}"]
    if p.get("hidden"): fm.append("hidden: true")
    if p["route"].lower() == "credentials": fm.append("auth_required: true")
    fm.append(f"# old route: /{p['route']}")
    fm.append("---")
    open(f"{dst}/{safe(p['title'])}.md", "w", encoding="utf-8").write("\n".join(fm) + "\n\n" + rewrite(p["content"]).strip() + "\n")

print(f"{len(seq)} challenges, {len(pages)} pages, {len(img_map)} images ({len(set(img_map.values()))} files)")
print("\n".join(report))
