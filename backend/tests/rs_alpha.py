# Inspect raw render PNG alpha channel (local-edit transparency artifact check)
import io, sys
import numpy as np
from PIL import Image
from conftest import ClerkClient, USERS

a = ClerkClient(USERS["admin"][0])
for rid in sys.argv[1:]:
    r = a.get(f"/api/rs/renders/{rid}").json()
    raw = a.get(f"/api/rs/renders/{rid}/download?variant=raw&fmt=png").content
    im = Image.open(io.BytesIO(raw))
    print(rid, r["kind"], "mode", im.mode, im.size)
    if im.mode in ("RGBA", "LA", "P"):
        al = np.asarray(im.convert("RGBA"))[..., 3]
        ys, xs = np.where(al < 250)
        print("  alpha<250 px:", len(ys), "of", al.size, ("bbox x%.2f-%.2f y%.2f-%.2f" % (xs.min()/al.shape[1], xs.max()/al.shape[1], ys.min()/al.shape[0], ys.max()/al.shape[0])) if len(ys) else "")
    w = a.get(r["raw"]["url"].replace(a.get("/api/rs/settings").url.split("/api")[0], "") if r["raw"]["url"].startswith("http") else r["raw"]["url"])
    print("  web variant status", w.status_code, w.headers.get("content-type"), len(w.content))
    if w.status_code == 200:
        wi = Image.open(io.BytesIO(w.content)); print("  web mode", wi.mode, wi.size)
