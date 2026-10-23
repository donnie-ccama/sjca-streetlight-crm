"""Aplos Open API client (read-only source).

Auth model (RSA public-key):
  GET /auth/{clientId} -> envelope whose data carries a base64, RSA-encrypted token.
  Decrypt locally with the PKCS#8 private key (RSA/ECB/PKCS1Padding == PKCS1 v1.5).
  Use the decrypted string as `Authorization: Bearer <token>`.

Hard rules baked in here:
  - Token TTL is 30 min and re-requesting too often can DEACTIVATE the account, so a
    decrypted token is cached to .token.json and reused while < TOKEN_REUSE_SECONDS old.
    /auth is only ever hit when there is no fresh cached token.
  - Read-only: this client exposes GET + pagination only.
"""

from __future__ import annotations

import base64
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Iterator

from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import (
    load_der_private_key,
    load_pem_private_key,
)

from .env import PROJECT_ROOT, load_env, require

BASE_URL = "https://app.aplos.com/hermes/api/v1"
TOKEN_CACHE = PROJECT_ROOT / ".token.json"
TOKEN_REUSE_SECONDS = 29 * 60  # < 30 min TTL, with a safety margin
API_DELAY_SEC = 0.3  # gentle pacing between calls
USER_AGENT = "Streetlight-CRM-aplos-migration/1.0 (Aplos Open API; read-only)"


class AplosError(RuntimeError):
    pass


class AplosClient:
    def __init__(self, env: dict[str, str] | None = None) -> None:
        self.env = env or load_env()
        require(self.env, "APLOS_CLIENT_ID", "APLOS_PRIVATE_KEY_PATH")
        self.client_id = self.env["APLOS_CLIENT_ID"]
        self.account_id = self.env.get("APLOS_ACCOUNT_ID") or ""
        self.key_path = (PROJECT_ROOT / self.env["APLOS_PRIVATE_KEY_PATH"]).resolve()
        self._token: str | None = None

    # ---- token lifecycle -------------------------------------------------

    def _load_cached_token(self) -> str | None:
        if not TOKEN_CACHE.is_file():
            return None
        try:
            cache = json.loads(TOKEN_CACHE.read_text())
        except (ValueError, OSError):
            return None
        if cache.get("client_id") != self.client_id:
            return None
        age = time.time() - float(cache.get("fetched_at", 0))
        if age >= TOKEN_REUSE_SECONDS:
            return None
        return cache.get("token")

    def _load_private_key(self):
        if not self.key_path.is_file():
            raise AplosError(
                f"Private key not found at {self.key_path}. "
                "Place the Aplos RSA private key there."
            )
        raw = self.key_path.read_bytes()
        text = raw.decode("utf-8", "ignore").strip()
        if "BEGIN" in text:
            return load_pem_private_key(raw, password=None)
        # Aplos hands out a raw base64 DER (PKCS#8) key with no PEM armor.
        try:
            der = base64.b64decode("".join(text.split()))
        except ValueError as exc:
            raise AplosError(
                f"Key at {self.key_path} is neither PEM nor base64 DER: {exc}"
            ) from exc
        return load_der_private_key(der, password=None)

    def _decrypt_token(self, encrypted_b64: str) -> str:
        private_key = self._load_private_key()
        cipher = base64.b64decode(encrypted_b64)
        plaintext = private_key.decrypt(cipher, padding.PKCS1v15())
        return plaintext.decode("utf-8").strip()

    def _request_new_token(self) -> str:
        url = f"{BASE_URL}/auth/{urllib.parse.quote(self.client_id)}"
        req = urllib.request.Request(
            url,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            method="GET",
        )
        try:
            with urllib.request.urlopen(req) as resp:
                payload = json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")
            raise AplosError(f"/auth HTTP {exc.code}: {detail}") from exc

        # Envelope: { version, status, meta, links, data: { token: <b64 rsa> } }.
        # Be tolerant of where the encrypted token sits.
        data = payload.get("data", payload)
        encrypted = (
            (data.get("token") if isinstance(data, dict) else None)
            or payload.get("token")
            or (data.get("api_token") if isinstance(data, dict) else None)
        )
        if not encrypted:
            raise AplosError(
                "Could not find encrypted token in /auth response. Raw envelope keys: "
                f"{list(payload.keys())}; data keys: "
                f"{list(data.keys()) if isinstance(data, dict) else type(data).__name__}"
            )
        token = self._decrypt_token(encrypted)
        TOKEN_CACHE.write_text(
            json.dumps(
                {"token": token, "fetched_at": time.time(), "client_id": self.client_id}
            )
        )
        try:
            TOKEN_CACHE.chmod(0o600)
        except OSError:
            pass
        return token

    def get_token(self, *, force: bool = False) -> str:
        if not force:
            cached = self._token or self._load_cached_token()
            if cached:
                self._token = cached
                return cached
        self._token = self._request_new_token()
        return self._token

    # ---- read-only data access ------------------------------------------

    def get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        token = self.get_token()
        url = f"{BASE_URL}/{path.lstrip('/')}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        headers = {
            "Authorization": f"Bearer {token}",
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        }
        if self.account_id:
            headers["aplos-account-id"] = self.account_id
        time.sleep(API_DELAY_SEC)
        req = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")
            raise AplosError(f"GET {path} HTTP {exc.code}: {detail}") from exc

    def paginate(self, path: str, params: dict[str, Any] | None = None,
                 page_size: int = 100) -> Iterator[dict[str, Any]]:
        """Yield every record across pages. Follows links.next when present,
        otherwise walks page_num until a short/empty page."""
        params = dict(params or {})
        params.setdefault("page_size", page_size)
        page_num = 1
        while True:
            params["page_num"] = page_num
            payload = self.get(path, params)
            data = payload.get("data")
            if isinstance(data, list):
                records = data
            elif isinstance(data, dict):
                # Prefer a list keyed by the entity name, else any list value.
                records = data.get(path.strip("/"))
                if not isinstance(records, list):
                    records = next(
                        (v for v in data.values() if isinstance(v, list)), []
                    )
            else:
                records = []
            for rec in records:
                yield rec
            has_next = bool((payload.get("links") or {}).get("next"))
            if not has_next and len(records) < params["page_size"]:
                return
            if not records:
                return
            page_num += 1
