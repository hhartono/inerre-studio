# Cleanup: delete given TEST material ids (only if code starts with TEST-) plus their versions/tests/file docs
import asyncio
import sys
from pathlib import Path
from dotenv import load_dotenv
import os
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


async def main(ids):
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    for mid in ids:
        m = await db.rs_materials.find_one({"id": mid}, {"_id": 0})
        if not m or not m["code"].startswith("TEST-"):
            print(mid, "skipped", m and m["code"])
            continue
        vs = await db.rs_material_versions.find({"material_id": mid}, {"_id": 0}).to_list(100)
        vids = [v["id"] for v in vs]
        fids = [v.get(k) for v in vs for k in ("sketchup_file_id", "photo_file_id", "approved_file_id") if v.get(k)]
        fids += [x["id"] for v in vs for x in v.get("extra_imgs", []) if isinstance(x, dict) and x.get("id")]
        tests = await db.rs_material_tests.find({"material_version_id": {"$in": vids}}, {"_id": 0}).to_list(100) if vids else []
        r1 = await db.files.delete_many({"id": {"$in": fids}}) if fids else None
        r2 = await db.rs_material_tests.delete_many({"id": {"$in": [t["id"] for t in tests]}}) if tests else None
        r3 = await db.rs_material_versions.delete_many({"id": {"$in": vids}})
        r4 = await db.rs_materials.delete_one({"id": mid})
        print(m["code"], "files", r1 and r1.deleted_count, "tests", r2 and r2.deleted_count, "versions", r3.deleted_count, "material", r4.deleted_count)
    print("TEST materials left:", [x["code"] async for x in db.rs_materials.find({"code": {"$regex": "^TEST-"}}, {"_id": 0, "code": 1})])
    print("MAT count:", await db.rs_materials.count_documents({"code": {"$regex": "^MAT-"}}))

asyncio.run(main(sys.argv[1:]))
