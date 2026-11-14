# Prints Clerk sign-in ticket tokens for UI testing (does not print secret key)
import sys
import requests
from conftest import CH, CLERK, USERS

for role in sys.argv[1:] or ["client", "admin", "designer"]:
    r = requests.post(f"{CLERK}/sign_in_tokens", headers=CH, json={"user_id": USERS[role][0], "expires_in_seconds": 3600}, timeout=20)
    r.raise_for_status()
    print(f"{role}={r.json()['token']}")
