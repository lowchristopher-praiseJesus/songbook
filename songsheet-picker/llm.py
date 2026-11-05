"""Claude Haiku through Abacus RouteLLM (OpenAI-compatible chat/completions).

Key handling follows /home/ubuntu/adams-chart/times/llm.py on the VM: the key comes from
$ABACUS_API_KEY or the VM metadata service, is re-read after a 401 (the env snapshot goes
stale), and metadata fetches are serialised because concurrent ones have returned empty bodies.
"""
import os
import threading
import time

import httpx

METADATA = "http://169.254.169.254/latest"
BASE_URL = "https://routellm.abacus.ai/v1"
MODEL = "claude-haiku-5-5"
# Haiku 5.5 reasons before it writes; a small budget can go entirely on reasoning.
MAX_TOKENS = 16000
REASONING_EFFORT = "low"

_KEY_LOCK = threading.Lock()


def _metadata_key() -> str:
    with _KEY_LOCK:
        for attempt in range(3):
            try:
                with httpx.Client(timeout=5) as c:
                    token = c.put(f"{METADATA}/api/token",
                                  headers={"X-abacus-vm-metadata-token-ttl-seconds": "21600"}).text
                    data = c.get(f"{METADATA}/user-data", headers={"X-abacus-vm-metadata-token": token}).json()
                return data["abacus_api_key"]
            except (httpx.HTTPError, ValueError, KeyError):
                if attempt == 2:
                    raise
                time.sleep(1)


class LLM:
    def __init__(self, transport=None, key: str | None = None):
        self._key = key or os.environ.get("ABACUS_API_KEY") or None
        self._client = httpx.Client(transport=transport)

    def _post(self, messages, timeout: float):
        if not self._key:
            self._key = _metadata_key()
        return self._client.post(
            f"{BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {self._key}"},
            json={"model": MODEL, "messages": messages, "max_tokens": MAX_TOKENS,
                  "reasoning_effort": REASONING_EFFORT},
            timeout=httpx.Timeout(timeout, connect=min(10, timeout)),
        )

    def complete(self, messages: list, timeout: float) -> str:
        start = time.monotonic()
        r = self._post(messages, timeout)
        if r.status_code == 401:
            self._key = _metadata_key()
            r = self._post(messages, max(1.0, timeout - (time.monotonic() - start)))
        r.raise_for_status()
        choice = r.json()["choices"][0]
        if choice.get("finish_reason") == "length":
            raise ValueError("reply cut off (finish_reason length)")
        return choice["message"]["content"] or ""
