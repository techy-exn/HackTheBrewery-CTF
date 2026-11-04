"""Parse data/ with the real loader code (DB layer stubbed) and check links, flags, images."""
import sys, types, os, re
root = sys.argv[1]; code = sys.argv[2]
m = types.ModuleType("CTFd.models")
for n in ["Challenges", "Flags", "Hints", "Pages", "db"]: setattr(m, n, None)
sys.modules["CTFd"] = types.ModuleType("CTFd"); sys.modules["CTFd.models"] = m
ns = {"__name__": "content"}; exec(compile(open(code).read(), code, "exec"), ns)
items = ns["discover_content"](root=root)
chal = [i for i in items if not i["is_page"]]; pages = [i for i in items if i["is_page"]]
names = {i["title"].lower() for i in chal}; errs = []
for i in items:
    errs += i["warnings"]
    for r in i["requires"] + ([i["next"]] if i["next"] else []):
        if r.lower() not in names: errs.append(f"{i['title']}: unresolved link {r!r}")
    for img in re.findall(r"/images/([^\s\"')<>]+)", i["body"]):
        if not os.path.exists(os.path.join(root, "images", img)): errs.append(f"{i['rel']}: missing image {img}")
    if re.search(r"/files/[0-9a-f]{8,}/", i["body"]): errs.append(f"{i['rel']}: legacy /files/ URL left")
for i in chal:
    if i["flag_type"] != "manual" and not i["flag"]: errs.append(f"{i['title']}: no flag")
print(f"{len(chal)} challenges, {len(pages)} pages")
for i in sorted(chal, key=lambda x: -x["order"]):
    print(f"{i['order']:>5} | {i['category'][:28]:28} | {i['title'][:40]:40} | {i['value']:>3} | {i['state']:7} | {i['flag_type']:6} | {str(i['flag'])[:24]:24} | ci={i['case_insensitive']} | req={i['requires']} | next={i['next']}")
for p in pages: print("page", p["slug"], p["title"], "hidden=", p.get("hidden"), "auth=", p.get("auth_required"))
print("ERRORS:" if errs else "No errors."); print("\n".join(errs))
