"""Authenticated Vercel Cron route for Instagram token refresh."""

from __future__ import annotations

import hmac
import logging
import os
from typing import Any
from urllib.parse import urlsplit

import requests
from starlette.requests import Request
from starlette.responses import JSONResponse

from .config import _supabase_key_kind, config

logger = logging.getLogger(__name__)

TOKEN_REFRESH_PATH = "/internal/token-refresh"
TOKEN_REFRESH_ALERT_WEBHOOK_ENV = "TOKEN_REFRESH_ALERT_WEBHOOK_URL"
CRON_SECRET_ENV = "CRON_SECRET"
MIN_CRON_SECRET_BYTES = 32
REFRESH_DAYS_BEFORE_EXPIRY = 7
ALERT_TIMEOUT_SECONDS = 5


def token_refresh(request: Request) -> JSONResponse:
    """Run the token refresh job after Vercel Production and secret gates pass."""
    gate_error = _validate_gate(request)
    if gate_error is not None:
        return gate_error

    from jobs.refresh_tokens import run_token_refresh

    try:
        result = run_token_refresh(
            days_before_expiry=REFRESH_DAYS_BEFORE_EXPIRY,
            dry_run=False,
        )
    except Exception:  # noqa: BLE001 - public cron route must fail closed safely.
        logger.error("Token refresh job failed unexpectedly", exc_info=False)
        result = {
            "refreshed": 0,
            "failed": 1,
            "errors": ["token_refresh_unexpected_failure"],
        }
    payload = _response_payload(result)
    failure = _has_refresh_failure(result)
    status_code = 503 if failure else 200

    payload["alert"] = _send_failure_alert(payload) if failure else {"status": "not_required"}
    return _json(payload, status_code=status_code)


def _validate_gate(request: Request) -> JSONResponse | None:
    secret = os.getenv(CRON_SECRET_ENV, "")
    if len(secret.encode("utf-8")) < MIN_CRON_SECRET_BYTES:
        return _json({"status": "misconfigured", "error": "missing_cron_secret"}, 503)

    authorization = request.headers.get("authorization", "")
    if not _authorized(authorization, secret):
        return _json({"status": "unauthorized"}, 401)

    if config.preview_safe_mode() or not (
        config.IS_VERCEL and config.VERCEL_ENV.lower() == "production"
    ):
        return _json({"status": "blocked", "error": "production_only"}, 403)

    config_errors = _production_config_errors()
    if config_errors:
        return _json(
            {
                "status": "misconfigured",
                "errors": config_errors,
            },
            503,
        )

    return None


def _authorized(authorization: str, secret: str) -> bool:
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() != "bearer" or not value:
        return False
    return hmac.compare_digest(value.encode("utf-8"), secret.encode("utf-8"))


def _production_config_errors() -> list[str]:
    # Refresh uses stored tokens, not the interactive OAuth/session settings.
    errors: list[str] = []

    if _supabase_key_kind(config.SUPABASE_KEY) not in {"secret", "service_role"}:
        errors.append("SUPABASE_KEY (secret/service_role required)")

    production_ref = config.SUPABASE_PRODUCTION_PROJECT_REF.strip()
    if not production_ref:
        errors.append("SUPABASE_PRODUCTION_PROJECT_REF")
    elif not _is_exact_supabase_project_url(config.SUPABASE_URL, production_ref):
        errors.append("SUPABASE_URL (must match production Supabase project)")

    return _dedupe(errors)


def _is_exact_supabase_project_url(url: str, production_ref: str) -> bool:
    try:
        parsed = urlsplit(url)
    except ValueError:
        return False

    return (
        parsed.scheme == "https"
        and parsed.netloc == f"{production_ref}.supabase.co"
        and parsed.path in {"", "/"}
        and not parsed.query
        and not parsed.fragment
        and parsed.username is None
        and parsed.password is None
        and parsed.port is None
    )


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result


def _response_payload(result: dict[str, Any]) -> dict[str, Any]:
    errors = result.get("errors")
    error_count = len(errors) if isinstance(errors, list) else int(bool(errors))
    return {
        "status": "failed" if _has_refresh_failure(result) else "ok",
        "days_before_expiry": REFRESH_DAYS_BEFORE_EXPIRY,
        "refreshed": _count(result, "refreshed"),
        "failed": _count(result, "failed"),
        "reauth_required": _count(result, "reauth_required"),
        "skipped": _count(result, "skipped"),
        "would_refresh": _count(result, "would_refresh"),
        "error_count": error_count,
    }


def _count(result: dict[str, Any], key: str) -> int:
    value = result.get(key, 0)
    return value if isinstance(value, int) and value >= 0 else 0


def _has_refresh_failure(result: dict[str, Any]) -> bool:
    return (
        _count(result, "failed") > 0
        or _count(result, "reauth_required") > 0
        or bool(result.get("errors"))
    )


def _send_failure_alert(payload: dict[str, Any]) -> dict[str, str]:
    webhook_url = os.getenv(TOKEN_REFRESH_ALERT_WEBHOOK_ENV, "").strip()
    if not webhook_url:
        return {"status": "not_configured"}
    if not _is_https_url(webhook_url):
        return {"status": "invalid_url"}

    alert_payload = {
        "text": (
            "Instagram token refresh failed: "
            f"failed={payload['failed']}, "
            f"reauth_required={payload['reauth_required']}, "
            f"error_count={payload['error_count']}"
        )
    }

    try:
        response = requests.post(
            webhook_url,
            json=alert_payload,
            timeout=ALERT_TIMEOUT_SECONDS,
            allow_redirects=False,
        )
        if 200 <= response.status_code < 300:
            return {"status": "sent"}
        return {"status": "failed"}
    except requests.RequestException:
        logger.warning("Token refresh alert webhook failed", exc_info=False)
        return {"status": "failed"}


def _is_https_url(url: str) -> bool:
    try:
        parsed = urlsplit(url)
    except ValueError:
        return False
    return parsed.scheme == "https" and bool(parsed.netloc)


def _json(payload: dict[str, Any], status_code: int) -> JSONResponse:
    return JSONResponse(
        payload,
        status_code=status_code,
        headers={"cache-control": "no-store"},
    )
