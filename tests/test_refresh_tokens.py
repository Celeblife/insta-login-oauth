from datetime import datetime, timedelta, timezone
from importlib import import_module, reload

from src.models import Token, User


def _load_refresh_module():
    module = import_module("jobs.refresh_tokens")
    return reload(module)


def test_run_token_refresh_refreshes_user_token(monkeypatch):
    refresh_module = _load_refresh_module()
    now = datetime.now(timezone.utc)
    user = User(
        id=1,
        instagram_id="ig-1",
        instagram_username="influencer",
        facebook_page_id=None,
    )
    token = Token(
        id=1,
        user_id=1,
        token_type="user",
        access_token="old-user-token",
        expires_at=now + timedelta(days=1),
        created_at=now - timedelta(days=2),
    )
    saved_tokens = []

    monkeypatch.setattr(refresh_module, "get_expiring_tokens", lambda days: [(user, token)])
    monkeypatch.setattr(
        refresh_module,
        "refresh_long_lived_token",
        lambda access_token: {
            "access_token": "new-user-token",
            "expires_at": now + timedelta(days=60),
        },
    )

    def fake_save_refreshed_token_if_current(token, access_token, expires_at):
        saved_tokens.append(
            {
                "token": token,
                "access_token": access_token,
                "expires_at": expires_at,
            }
        )
        return True

    monkeypatch.setattr(
        refresh_module,
        "save_refreshed_token_if_current",
        fake_save_refreshed_token_if_current,
    )

    result = refresh_module.run_token_refresh(days_before_expiry=7)

    assert result["refreshed"] == 1
    assert result["failed"] == 0
    assert len(saved_tokens) == 1
    assert saved_tokens[0]["token"].id == 1
    assert saved_tokens[0]["access_token"] == "new-user-token"


def test_run_token_refresh_handles_failure(monkeypatch):
    refresh_module = _load_refresh_module()
    now = datetime.now(timezone.utc)
    user = User(
        id=1,
        instagram_id="ig-1",
        instagram_username="influencer",
        facebook_page_id=None,
    )
    token = Token(
        id=1,
        user_id=1,
        token_type="user",
        access_token="old-user-token",
        expires_at=now + timedelta(days=1),
        created_at=now - timedelta(days=2),
    )

    monkeypatch.setattr(refresh_module, "get_expiring_tokens", lambda days: [(user, token)])
    monkeypatch.setattr(
        refresh_module,
        "refresh_long_lived_token",
        lambda access_token: (_ for _ in ()).throw(Exception("API error")),
    )
    monkeypatch.setattr(
        refresh_module,
        "save_refreshed_token_if_current",
        lambda **kwargs: True,
    )

    result = refresh_module.run_token_refresh(days_before_expiry=7)

    assert result["refreshed"] == 0
    assert result["failed"] == 1
    assert len(result["errors"]) == 1


def test_run_token_refresh_skips_tokens_saved_less_than_24_hours(monkeypatch):
    refresh_module = _load_refresh_module()
    now = datetime.now(timezone.utc)
    user = User(id=1, instagram_id="ig-1", instagram_username="influencer")
    token = Token(
        id=1,
        user_id=1,
        token_type="user",
        access_token="old-user-token",
        expires_at=now + timedelta(days=1),
        created_at=now - timedelta(hours=3),
    )

    monkeypatch.setattr(refresh_module, "get_expiring_tokens", lambda days: [(user, token)])
    monkeypatch.setattr(
        refresh_module,
        "refresh_long_lived_token",
        lambda access_token: (_ for _ in ()).throw(
            AssertionError("too-new token must not call Instagram")
        ),
    )

    result = refresh_module.run_token_refresh(days_before_expiry=7)

    assert result["refreshed"] == 0
    assert result["failed"] == 0
    assert result["too_new"] == 1
    assert result["skipped"] == 1


def test_run_token_refresh_marks_expired_token_reauth_required(monkeypatch):
    refresh_module = _load_refresh_module()
    now = datetime.now(timezone.utc)
    user = User(id=1, instagram_id="ig-1", instagram_username="influencer")
    token = Token(
        id=1,
        user_id=1,
        token_type="user",
        access_token="expired-user-token",
        expires_at=now - timedelta(minutes=1),
        created_at=now - timedelta(days=60),
    )

    monkeypatch.setattr(refresh_module, "get_expiring_tokens", lambda days: [(user, token)])

    result = refresh_module.run_token_refresh(days_before_expiry=7)

    assert result["refreshed"] == 0
    assert result["failed"] == 1
    assert result["reauth_required"] == 1
    assert result["errors"] == ["token_refresh_reauth_required user_id=1 token_id=1"]


def test_run_token_refresh_marks_missing_created_at_as_metadata_failure(monkeypatch):
    refresh_module = _load_refresh_module()
    now = datetime.now(timezone.utc)
    user = User(id=1, instagram_id="ig-1", instagram_username="influencer")
    token = Token(
        id=1,
        user_id=1,
        token_type="user",
        access_token="old-user-token",
        expires_at=now + timedelta(days=1),
        created_at=None,
    )

    monkeypatch.setattr(refresh_module, "get_expiring_tokens", lambda days: [(user, token)])

    result = refresh_module.run_token_refresh(days_before_expiry=7)

    assert result["refreshed"] == 0
    assert result["failed"] == 1
    assert result["metadata_missing"] == 1
    assert result["errors"] == ["token_refresh_missing_created_at user_id=1 token_id=1"]


def test_run_token_refresh_marks_missing_expires_at_as_metadata_failure(monkeypatch):
    refresh_module = _load_refresh_module()
    now = datetime.now(timezone.utc)
    user = User(id=1, instagram_id="ig-1", instagram_username="influencer")
    token = Token(
        id=1,
        user_id=1,
        token_type="user",
        access_token="old-user-token",
        expires_at=None,
        created_at=now - timedelta(days=2),
    )

    monkeypatch.setattr(refresh_module, "get_expiring_tokens", lambda days: [(user, token)])

    result = refresh_module.run_token_refresh(days_before_expiry=7)

    assert result["refreshed"] == 0
    assert result["failed"] == 1
    assert result["metadata_missing"] == 1
    assert result["errors"] == ["token_refresh_missing_expires_at user_id=1 token_id=1"]


def test_run_token_refresh_dry_run_does_not_call_api_or_save(monkeypatch):
    refresh_module = _load_refresh_module()
    now = datetime.now(timezone.utc)
    user = User(id=1, instagram_id="ig-1", instagram_username="influencer")
    token = Token(
        id=1,
        user_id=1,
        token_type="user",
        access_token="old-user-token",
        expires_at=now + timedelta(days=1),
        created_at=now - timedelta(days=2),
    )

    monkeypatch.setattr(refresh_module, "get_expiring_tokens", lambda days: [(user, token)])
    monkeypatch.setattr(
        refresh_module,
        "refresh_long_lived_token",
        lambda access_token: (_ for _ in ()).throw(
            AssertionError("dry run must not call Instagram")
        ),
    )
    monkeypatch.setattr(
        refresh_module,
        "save_refreshed_token_if_current",
        lambda **kwargs: (_ for _ in ()).throw(
            AssertionError("dry run must not write DB")
        ),
    )

    result = refresh_module.run_token_refresh(days_before_expiry=7, dry_run=True)

    assert result["refreshed"] == 0
    assert result["failed"] == 0
    assert result["would_refresh"] == 1


def test_run_token_refresh_lookup_failure_is_sanitized(monkeypatch):
    refresh_module = _load_refresh_module()

    def fail_lookup(days):
        raise RuntimeError("raw failure with access_token=secret")

    monkeypatch.setattr(refresh_module, "get_expiring_tokens", fail_lookup)

    result = refresh_module.run_token_refresh(days_before_expiry=7)

    assert result["refreshed"] == 0
    assert result["failed"] == 1
    assert result["errors"] == ["token_refresh_lookup_failed"]


def test_run_token_refresh_db_save_failure_preserves_error_and_continues(monkeypatch):
    refresh_module = _load_refresh_module()
    now = datetime.now(timezone.utc)
    users_and_tokens = [
        (
            User(id=1, instagram_id="ig-1", instagram_username="first"),
            Token(
                id=1,
                user_id=1,
                token_type="user",
                access_token="old-first-token",
                expires_at=now + timedelta(days=1),
                created_at=now - timedelta(days=2),
            ),
        ),
        (
            User(id=2, instagram_id="ig-2", instagram_username="second"),
            Token(
                id=2,
                user_id=2,
                token_type="user",
                access_token="old-second-token",
                expires_at=now + timedelta(days=1),
                created_at=now - timedelta(days=2),
            ),
        ),
    ]
    refresh_calls = []
    save_calls = []

    monkeypatch.setattr(
        refresh_module,
        "get_expiring_tokens",
        lambda days: users_and_tokens,
    )

    def fake_refresh(access_token):
        refresh_calls.append(access_token)
        return {
            "access_token": f"new-{len(refresh_calls)}",
            "expires_at": now + timedelta(days=60),
        }

    def fake_save(**kwargs):
        save_calls.append(kwargs)
        if kwargs["token"].id == 1:
            raise RuntimeError("db failure with access_token=secret")
        return True

    monkeypatch.setattr(refresh_module, "refresh_long_lived_token", fake_refresh)
    monkeypatch.setattr(refresh_module, "save_refreshed_token_if_current", fake_save)

    result = refresh_module.run_token_refresh(days_before_expiry=7)

    assert refresh_calls == ["old-first-token", "old-second-token"]
    assert len(save_calls) == 2
    assert result["refreshed"] == 1
    assert result["failed"] == 1
    assert result["errors"] == ["token_refresh_failed user_id=1 token_id=1"]


def test_run_token_refresh_cas_false_skips_without_failure(monkeypatch):
    refresh_module = _load_refresh_module()
    now = datetime.now(timezone.utc)
    user = User(id=1, instagram_id="ig-1", instagram_username="influencer")
    token = Token(
        id=1,
        user_id=1,
        token_type="user",
        access_token="old-user-token",
        expires_at=now + timedelta(days=1),
        created_at=now - timedelta(days=2),
    )

    monkeypatch.setattr(refresh_module, "get_expiring_tokens", lambda days: [(user, token)])
    monkeypatch.setattr(
        refresh_module,
        "refresh_long_lived_token",
        lambda access_token: {
            "access_token": "new-user-token",
            "expires_at": now + timedelta(days=60),
        },
    )
    monkeypatch.setattr(
        refresh_module,
        "save_refreshed_token_if_current",
        lambda **kwargs: False,
    )

    result = refresh_module.run_token_refresh(days_before_expiry=7)

    assert result["refreshed"] == 0
    assert result["failed"] == 0
    assert result["skipped"] == 1
    assert result["unchanged"] == 1


def test_run_token_refresh_rejects_non_extended_expiry_without_save(monkeypatch):
    refresh_module = _load_refresh_module()
    now = datetime.now(timezone.utc)
    user = User(id=1, instagram_id="ig-1", instagram_username="influencer")
    token = Token(
        id=1,
        user_id=1,
        token_type="user",
        access_token="old-user-token",
        expires_at=now + timedelta(days=1),
        created_at=now - timedelta(days=2),
    )

    monkeypatch.setattr(refresh_module, "get_expiring_tokens", lambda days: [(user, token)])
    monkeypatch.setattr(
        refresh_module,
        "refresh_long_lived_token",
        lambda access_token: {
            "access_token": "new-user-token",
            "expires_at": token.expires_at,
        },
    )
    monkeypatch.setattr(
        refresh_module,
        "save_refreshed_token_if_current",
        lambda **kwargs: (_ for _ in ()).throw(
            AssertionError("non-extended token must not be saved")
        ),
    )

    result = refresh_module.run_token_refresh(days_before_expiry=7)

    assert result["refreshed"] == 0
    assert result["failed"] == 1
    assert result["errors"] == ["token_refresh_failed user_id=1 token_id=1"]


def test_main_exit_codes_and_expected_ref_gate(monkeypatch):
    refresh_module = _load_refresh_module()
    run_calls = []

    monkeypatch.setattr(
        refresh_module.config,
        "SUPABASE_URL",
        "https://expectedref.supabase.co",
        raising=False,
    )

    def fake_run_token_refresh(days_before_expiry=7, *, dry_run=False):
        run_calls.append(
            {
                "days_before_expiry": days_before_expiry,
                "dry_run": dry_run,
            }
        )
        return {"refreshed": 0, "failed": 0, "errors": []}

    monkeypatch.setattr(refresh_module, "run_token_refresh", fake_run_token_refresh)

    assert refresh_module.main(["--dry-run", "--days-before-expiry", "3"]) == 0
    assert run_calls == [{"days_before_expiry": 3, "dry_run": True}]

    monkeypatch.setattr(
        refresh_module,
        "run_token_refresh",
        lambda **kwargs: {"refreshed": 0, "failed": 1, "errors": ["safe"]},
    )
    assert refresh_module.main([]) == 1

    read_attempted = False

    def fail_if_called(**kwargs):
        nonlocal read_attempted
        read_attempted = True
        return {"refreshed": 0, "failed": 0, "errors": []}

    monkeypatch.setattr(refresh_module, "run_token_refresh", fail_if_called)
    assert refresh_module.main(["--expected-project-ref", "otherref"]) == 2
    assert read_attempted is False
