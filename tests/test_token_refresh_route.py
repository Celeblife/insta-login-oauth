from starlette.requests import Request

SECRET = "s" * 32
PRODUCTION_REF = "prodref"
PRODUCTION_URL = f"https://{PRODUCTION_REF}.supabase.co"


def _request(secret: str = SECRET) -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/internal/token-refresh",
            "query_string": b"",
            "headers": [(b"authorization", f"Bearer {secret}".encode("ascii"))],
            "server": ("testserver", 443),
            "scheme": "https",
        }
    )


def _configure_production(monkeypatch, route):
    monkeypatch.setenv("CRON_SECRET", SECRET)
    monkeypatch.delenv("TOKEN_REFRESH_ALERT_WEBHOOK_URL", raising=False)
    monkeypatch.setattr(route.config, "IS_VERCEL", True, raising=False)
    monkeypatch.setattr(route.config, "VERCEL_ENV", "production", raising=False)
    monkeypatch.setattr(route.config, "PREVIEW_SAFE_MODE", False, raising=False)
    monkeypatch.setattr(route.config, "SUPABASE_URL", PRODUCTION_URL, raising=False)
    monkeypatch.setattr(route.config, "SUPABASE_KEY", "sb_secret_test", raising=False)
    monkeypatch.setattr(
        route.config,
        "SUPABASE_PRODUCTION_PROJECT_REF",
        PRODUCTION_REF,
        raising=False,
    )
    monkeypatch.setattr(route.config, "validate_runtime", lambda: [], raising=False)


def test_token_refresh_requires_configured_cron_secret_before_job(monkeypatch):
    import src.token_refresh_route as route

    calls = []
    monkeypatch.delenv("CRON_SECRET", raising=False)
    monkeypatch.setattr(route, "_send_failure_alert", lambda payload: calls.append(payload))

    response = route.token_refresh(_request())

    assert response.status_code == 503
    assert calls == []


def test_token_refresh_rejects_short_cron_secret_before_job(monkeypatch):
    import src.token_refresh_route as route

    monkeypatch.setenv("CRON_SECRET", "short")
    monkeypatch.setattr(
        "jobs.refresh_tokens.run_token_refresh",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("job called")),
    )

    response = route.token_refresh(_request(secret="short"))

    assert response.status_code == 503


def test_token_refresh_rejects_bad_authorization_before_job(monkeypatch):
    import src.token_refresh_route as route

    _configure_production(monkeypatch, route)
    calls = []
    monkeypatch.setattr(route, "_production_config_errors", lambda: calls.append("config"))

    response = route.token_refresh(_request(secret="wrong"))

    assert response.status_code == 401
    assert calls == []


def test_token_refresh_blocks_preview_before_job_and_alert(monkeypatch):
    import src.token_refresh_route as route

    _configure_production(monkeypatch, route)
    monkeypatch.setattr(route.config, "VERCEL_ENV", "preview", raising=False)
    calls = []
    monkeypatch.setattr(route, "_send_failure_alert", lambda payload: calls.append(payload))

    response = route.token_refresh(_request())

    assert response.status_code == 403
    assert calls == []


def test_token_refresh_blocks_explicit_preview_safe_mode_before_job(monkeypatch):
    import src.token_refresh_route as route

    _configure_production(monkeypatch, route)
    monkeypatch.setattr(type(route.config), "PREVIEW_SAFE_MODE", True, raising=False)
    monkeypatch.setattr(
        "jobs.refresh_tokens.run_token_refresh",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("job called")),
    )

    response = route.token_refresh(_request())

    assert response.status_code == 403


def test_token_refresh_blocks_non_vercel_local_runtime_before_job(monkeypatch):
    import src.token_refresh_route as route

    _configure_production(monkeypatch, route)
    monkeypatch.setattr(route.config, "IS_VERCEL", False, raising=False)
    monkeypatch.setattr(
        "jobs.refresh_tokens.run_token_refresh",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("job called")),
    )

    response = route.token_refresh(_request())

    assert response.status_code == 403


def test_token_refresh_requires_exact_production_supabase_ref(monkeypatch):
    import src.token_refresh_route as route

    _configure_production(monkeypatch, route)
    monkeypatch.setattr(
        route.config,
        "SUPABASE_URL",
        "https://otherref.supabase.co",
        raising=False,
    )

    response = route.token_refresh(_request())

    assert response.status_code == 503


def test_token_refresh_requires_production_ref_before_job(monkeypatch):
    import src.token_refresh_route as route

    _configure_production(monkeypatch, route)
    monkeypatch.setattr(
        route.config,
        "SUPABASE_PRODUCTION_PROJECT_REF",
        "",
        raising=False,
    )
    monkeypatch.setattr(
        "jobs.refresh_tokens.run_token_refresh",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("job called")),
    )

    response = route.token_refresh(_request())

    assert response.status_code == 503


def test_token_refresh_requires_server_supabase_key_before_job(monkeypatch):
    import src.token_refresh_route as route

    _configure_production(monkeypatch, route)
    monkeypatch.setattr(
        route.config,
        "SUPABASE_KEY",
        "sb_publishable_test",
        raising=False,
    )
    monkeypatch.setattr(
        "jobs.refresh_tokens.run_token_refresh",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("job called")),
    )

    response = route.token_refresh(_request())

    assert response.status_code == 503


def test_token_refresh_allows_exact_production_supabase_url_with_trailing_slash(
    monkeypatch,
):
    import src.token_refresh_route as route

    _configure_production(monkeypatch, route)
    monkeypatch.setattr(
        route.config,
        "SUPABASE_URL",
        f"{PRODUCTION_URL}/",
        raising=False,
    )
    monkeypatch.setattr(
        "jobs.refresh_tokens.run_token_refresh",
        lambda days_before_expiry=7, *, dry_run=False: {
            "refreshed": 0,
            "failed": 0,
            "errors": [],
        },
    )

    response = route.token_refresh(_request())

    assert response.status_code == 200


def test_token_refresh_rejects_malformed_production_supabase_urls(monkeypatch):
    import src.token_refresh_route as route

    bad_urls = [
        f"http://{PRODUCTION_REF}.supabase.co",
        f"https://{PRODUCTION_REF}.supabase.co/rest/v1",
        f"https://user@{PRODUCTION_REF}.supabase.co",
        f"https://{PRODUCTION_REF}.supabase.co:443",
        f"https://{PRODUCTION_REF}.supabase.co?apikey=hidden",
        f"https://{PRODUCTION_REF}.supabase.co#fragment",
    ]

    for bad_url in bad_urls:
        _configure_production(monkeypatch, route)
        monkeypatch.setattr(route.config, "SUPABASE_URL", bad_url, raising=False)

        response = route.token_refresh(_request())

        assert response.status_code == 503, bad_url


def test_token_refresh_success_runs_job_once(monkeypatch):
    import src.token_refresh_route as route

    _configure_production(monkeypatch, route)
    calls = []

    def fake_run_token_refresh(days_before_expiry=7, *, dry_run=False):
        calls.append(
            {
                "days_before_expiry": days_before_expiry,
                "dry_run": dry_run,
            }
        )
        return {"refreshed": 1, "failed": 0, "errors": []}

    monkeypatch.setattr(
        "jobs.refresh_tokens.run_token_refresh",
        fake_run_token_refresh,
    )

    response = route.token_refresh(_request())

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert calls == [{"days_before_expiry": 7, "dry_run": False}]


def test_token_refresh_does_not_depend_on_interactive_login_settings(monkeypatch):
    import src.token_refresh_route as route

    _configure_production(monkeypatch, route)

    def unrelated_login_validator():
        raise AssertionError("Refresh must not validate interactive login settings")

    monkeypatch.setattr(route.config, "validate_runtime", unrelated_login_validator)
    monkeypatch.setattr(
        "jobs.refresh_tokens.run_token_refresh",
        lambda **kwargs: {"refreshed": 0, "failed": 0, "errors": []},
    )

    assert route.token_refresh(_request()).status_code == 200


def test_token_refresh_failure_returns_503_and_sanitized_alert(monkeypatch):
    import src.token_refresh_route as route

    _configure_production(monkeypatch, route)
    monkeypatch.setenv("TOKEN_REFRESH_ALERT_WEBHOOK_URL", "https://hooks.example/refresh")
    posts = []

    def fake_run_token_refresh(days_before_expiry=7, *, dry_run=False):
        return {
            "refreshed": 0,
            "failed": 1,
            "reauth_required": 1,
            "errors": ["token secret and username must not leave this process"],
        }

    def fake_post(url, *, json, timeout, allow_redirects):
        posts.append(
            {
                "url": url,
                "json": json,
                "timeout": timeout,
                "allow_redirects": allow_redirects,
            }
        )

        class Response:
            status_code = 204

        return Response()

    monkeypatch.setattr(
        "jobs.refresh_tokens.run_token_refresh",
        fake_run_token_refresh,
    )
    monkeypatch.setattr(route.requests, "post", fake_post)

    response = route.token_refresh(_request())
    body = response.body.decode("utf-8")

    assert response.status_code == 503
    assert "token secret" not in body
    assert "username" not in body
    assert posts == [
        {
            "url": "https://hooks.example/refresh",
            "json": {
                "text": (
                    "Instagram token refresh failed: "
                    "failed=1, reauth_required=1, error_count=1"
                )
            },
            "timeout": 5,
            "allow_redirects": False,
        }
    ]


def test_token_refresh_webhook_http_failure_is_distinct_and_sanitized(monkeypatch):
    import src.token_refresh_route as route

    _configure_production(monkeypatch, route)
    monkeypatch.setenv("TOKEN_REFRESH_ALERT_WEBHOOK_URL", "https://hooks.example/refresh")

    monkeypatch.setattr(
        "jobs.refresh_tokens.run_token_refresh",
        lambda days_before_expiry=7, *, dry_run=False: {
            "refreshed": 0,
            "failed": 1,
            "errors": ["raw secret should not appear"],
        },
    )

    class Response:
        status_code = 500

    monkeypatch.setattr(route.requests, "post", lambda url, **kwargs: Response())

    response = route.token_refresh(_request())

    assert response.status_code == 503
    body = response.body.decode("utf-8")
    assert '"alert":{"status":"failed"}' in body
    assert "raw secret" not in body


def test_token_refresh_webhook_timeout_is_distinct_and_sanitized(monkeypatch):
    import src.token_refresh_route as route

    _configure_production(monkeypatch, route)
    monkeypatch.setenv("TOKEN_REFRESH_ALERT_WEBHOOK_URL", "https://hooks.example/refresh")
    monkeypatch.setattr(
        "jobs.refresh_tokens.run_token_refresh",
        lambda days_before_expiry=7, *, dry_run=False: {
            "refreshed": 0,
            "failed": 1,
            "errors": ["timeout token should not appear"],
        },
    )

    def timeout_post(url, **kwargs):
        raise route.requests.Timeout("timeout token should not appear")

    monkeypatch.setattr(route.requests, "post", timeout_post)

    response = route.token_refresh(_request())

    assert response.status_code == 503
    body = response.body.decode("utf-8")
    assert '"alert":{"status":"failed"}' in body
    assert "timeout token" not in body


def test_token_refresh_absent_webhook_has_distinct_state(monkeypatch):
    import src.token_refresh_route as route

    _configure_production(monkeypatch, route)
    monkeypatch.delenv("TOKEN_REFRESH_ALERT_WEBHOOK_URL", raising=False)
    monkeypatch.setattr(
        "jobs.refresh_tokens.run_token_refresh",
        lambda days_before_expiry=7, *, dry_run=False: {
            "refreshed": 0,
            "failed": 1,
            "errors": ["hidden"],
        },
    )

    response = route.token_refresh(_request())

    assert response.status_code == 503
    assert b'"alert":{"status":"not_configured"}' in response.body


def test_token_refresh_unexpected_job_exception_returns_safe_503_and_alert(
    monkeypatch,
):
    import src.token_refresh_route as route

    _configure_production(monkeypatch, route)
    monkeypatch.setenv("TOKEN_REFRESH_ALERT_WEBHOOK_URL", "https://hooks.example/refresh")
    posts = []

    def broken_job(days_before_expiry=7, *, dry_run=False):
        raise RuntimeError("raw token and username should not appear")

    def fake_post(url, *, json, timeout, allow_redirects):
        posts.append(json)

        class Response:
            status_code = 204

        return Response()

    monkeypatch.setattr("jobs.refresh_tokens.run_token_refresh", broken_job)
    monkeypatch.setattr(route.requests, "post", fake_post)

    response = route.token_refresh(_request())
    body = response.body.decode("utf-8")

    assert response.status_code == 503
    assert "raw token" not in body
    assert "username" not in body
    assert posts == [
        {
            "text": (
                "Instagram token refresh failed: "
                "failed=1, reauth_required=0, error_count=1"
            )
        }
    ]


def test_token_refresh_alert_failure_does_not_hide_refresh_failure(monkeypatch):
    import src.token_refresh_route as route

    _configure_production(monkeypatch, route)
    monkeypatch.setenv("TOKEN_REFRESH_ALERT_WEBHOOK_URL", "http://insecure.example/hook")

    monkeypatch.setattr(
        "jobs.refresh_tokens.run_token_refresh",
        lambda days_before_expiry=7, *, dry_run=False: {
            "refreshed": 0,
            "failed": 1,
            "errors": ["hidden"],
        },
    )

    response = route.token_refresh(_request())

    assert response.status_code == 503
    assert b'"alert":{"status":"invalid_url"}' in response.body
