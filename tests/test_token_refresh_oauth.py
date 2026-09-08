from datetime import datetime, timezone
import traceback

import pytest
import requests


class Response:
    def __init__(self, status_code=200, payload=None, json_error=None):
        self.status_code = status_code
        self.payload = payload
        self.json_error = json_error

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError("raw error with https://example.invalid/?access_token=secret")

    def json(self):
        if self.json_error:
            raise self.json_error
        return self.payload


def test_refresh_long_lived_token_requires_valid_response(monkeypatch):
    import src.oauth as oauth

    calls = []

    def fake_get(url, params=None, timeout=None, allow_redirects=None):
        calls.append(
            {
                "url": url,
                "params": params,
                "timeout": timeout,
                "allow_redirects": allow_redirects,
            }
        )
        return Response(payload={"access_token": "new-token", "expires_in": 3600})

    monkeypatch.setattr(oauth.requests, "get", fake_get)
    before = datetime.now(timezone.utc)

    result = oauth.refresh_long_lived_token("old-token")

    assert result["access_token"] == "new-token"
    assert result["expires_at"] > before
    assert calls == [
        {
            "url": f"{oauth.config.INSTAGRAM_API_BASE_URL}/refresh_access_token",
            "params": {
                "grant_type": "ig_refresh_token",
                "access_token": "old-token",
            },
            "timeout": 10,
            "allow_redirects": False,
        }
    ]


@pytest.mark.parametrize(
    "response",
    [
        Response(status_code=302, payload={"access_token": "new-token", "expires_in": 3600}),
        Response(status_code=500, payload={"access_token": "new-token", "expires_in": 3600}),
        Response(payload={"expires_in": 3600}),
        Response(payload={"access_token": "new-token"}),
        Response(payload={"access_token": "new-token", "expires_in": 0}),
        Response(payload={"access_token": "new-token", "expires_in": True}),
        Response(payload=["not", "a", "dict"]),
        Response(payload=None, json_error=ValueError("bad json")),
    ],
)
def test_refresh_long_lived_token_rejects_bad_response(monkeypatch, response):
    import src.oauth as oauth

    monkeypatch.setattr(oauth.requests, "get", lambda *args, **kwargs: response)

    with pytest.raises(oauth.TokenRefreshError) as excinfo:
        oauth.refresh_long_lived_token("old-token")

    assert "old-token" not in str(excinfo.value)
    assert "access_token" not in str(excinfo.value)


def test_refresh_long_lived_token_traceback_does_not_chain_raw_http_error(monkeypatch):
    import src.oauth as oauth

    monkeypatch.setattr(oauth.requests, "get", lambda *args, **kwargs: Response(500, {}))

    token = "old-token"
    with pytest.raises(oauth.TokenRefreshError) as excinfo:
        oauth.refresh_long_lived_token(token)

    rendered = "".join(
        traceback.format_exception(
            type(excinfo.value),
            excinfo.value,
            excinfo.value.__traceback__,
        )
    )
    assert "old-token" not in rendered
    assert "access_token=secret" not in rendered
