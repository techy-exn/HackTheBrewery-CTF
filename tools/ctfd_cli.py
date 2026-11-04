#!/usr/bin/env python3
"""Minimal CTFd admin CLI for Hack the Brewery.

Auth (first match wins):
  CTFD_TOKEN            -> "Authorization: Token <token>" (preferred)
  CTFD_USER + CTFD_PASS -> session login (needed for /admin/* UI actions)
Base URL: CTFD_URL (default http://ctf.exn.be:81)

Usage:
  ctfd_cli.py get   /api/v1/challenges?view=admin
  ctfd_cli.py post  /api/v1/challenges '{"name":"x","category":"Blue","description":"..","value":100,"state":"hidden"}'
  ctfd_cli.py patch /api/v1/challenges/5 '{"state":"visible"}'
  ctfd_cli.py delete /api/v1/flags/12
  ctfd_cli.py upload <challenge_id> <file>
  ctfd_cli.py dump  [outfile.json]        # all challenges + flags + hints + files + tags + reqs
  ctfd_cli.py qa                          # completeness / leak checks
"""
import json, os, re, sys
import requests

URL = os.environ.get("CTFD_URL", "http://ctf.exn.be:81").rstrip("/")
S = requests.Session()
S.headers["User-Agent"] = "htb-ctfd-agent"


def auth():
    tok = os.environ.get("CTFD_TOKEN")
    if tok:
        S.headers["Authorization"] = f"Token {tok}"
        S.headers["Content-Type"] = "application/json"
        return
    u, p = os.environ.get("CTFD_USER"), os.environ.get("CTFD_PASS")
    if not (u and p):
        sys.exit("Set CTFD_TOKEN, or CTFD_USER + CTFD_PASS")
    r = S.get(f"{URL}/login")
    nonce = re.search(r'name="nonce"(?:[^>]*?)value="([^"]+)"', r.text).group(1)
    r = S.post(f"{URL}/login", data={"name": u, "password": p, "nonce": nonce})
    if "/login" in r.url:
        sys.exit("Login failed")
    csrf = re.search(r'csrfNonce[\'"]?\s*[:=]\s*[\'"]([0-9a-f]+)', S.get(f"{URL}/admin/statistics").text)
    if csrf:
        S.headers["CSRF-Token"] = csrf.group(1)


def call(method, path, body=None):
    r = S.request(method, URL + path, json=body)
    try:
        data = r.json()
    except ValueError:
        sys.exit(f"{r.status_code} non-JSON response from {path}")
    if r.status_code >= 400 or data.get("success") is False:
        sys.exit(f"{r.status_code} {json.dumps(data)[:800]}")
    return data


def get_all(path):
    out, page = [], 1
    sep = "&" if "?" in path else "?"
    while True:
        d = call("GET", f"{path}{sep}page={page}&per_page=100")
        out += d["data"] if isinstance(d["data"], list) else [d["data"]]
        nxt = (d.get("meta") or {}).get("pagination", {}).get("next")
        if not nxt:
            return out
        page = nxt


def dump():
    chals = get_all("/api/v1/challenges?view=admin")
    full = []
    for c in chals:
        cid = c["id"]
        d = call("GET", f"/api/v1/challenges/{cid}?view=admin")["data"]
        for k in ("flags", "hints", "files", "tags", "requirements"):
            d[k] = call("GET", f"/api/v1/challenges/{cid}/{k}")["data"]
        full.append(d)
    return full


def qa():
    issues = []
    chals = dump()
    for c in chals:
        tag = f"[{c['id']}] {c['category']} / {c['name']}"
        desc = c.get("description") or ""
        if not c["flags"]:
            issues.append(f"{tag}: NO FLAG")
        if not desc.strip():
            issues.append(f"{tag}: empty description")
        if c.get("value") in (None, 0) and c.get("type") == "standard":
            issues.append(f"{tag}: 0 points")
        for f in c["flags"]:
            content = (f.get("content") or "").strip()
            if f.get("type") == "regex":
                try:
                    re.compile(content)
                except re.error as e:
                    issues.append(f"{tag}: bad regex flag {content!r}: {e}")
            elif content and len(content) >= 4:
                # leak check: flag text visible to players?
                hay = [desc, c.get("connection_info") or ""]
                hay += [h.get("content") or "" for h in c["hints"] if not h.get("cost")]
                if any(content.lower() in h.lower() for h in hay):
                    issues.append(f"{tag}: flag text appears in description/free hint")
            if content != (f.get("content") or ""):
                issues.append(f"{tag}: flag has leading/trailing whitespace")
        prereqs = (c.get("requirements") or {}).get("prerequisites") or []
        ids = {x["id"] for x in chals}
        for p in prereqs:
            if p not in ids:
                issues.append(f"{tag}: prerequisite {p} does not exist")
        for m in re.findall(r"!\[[^\]]*\]\(([^)]+)\)", desc):
            if m.startswith("/files/"):
                r = S.head(URL + m.split("?")[0], allow_redirects=True)
                if r.status_code >= 400:
                    issues.append(f"{tag}: broken image {m} ({r.status_code})")
    print(f"{len(chals)} challenges checked, {len(issues)} issues")
    print("\n".join(issues))


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    auth()
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd in ("get", "post", "patch", "delete"):
        body = json.loads(args[1]) if len(args) > 1 else None
        print(json.dumps(call(cmd.upper(), args[0], body), indent=2))
    elif cmd == "upload":
        hdr = {k: v for k, v in S.headers.items() if k != "Content-Type"}
        with open(args[1], "rb") as fh:
            r = requests.post(f"{URL}/api/v1/files", headers=hdr, cookies=S.cookies,
                              files={"file": fh}, data={"challenge": args[0], "challenge_id": args[0], "type": "challenge"})
        print(r.status_code, r.text[:800])
    elif cmd == "dump":
        out = json.dumps(dump(), indent=2)
        if args:
            open(args[0], "w").write(out)
            print(f"written {args[0]}")
        else:
            print(out)
    elif cmd == "qa":
        qa()
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
