from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from src.models import Token


class Query:
    def __init__(self, data=None):
        self.data = data if data is not None else [{"id": 1}]
        self.operations = []

    def upsert(self, row, on_conflict=None):
        self.operations.append(("upsert", row, on_conflict))
        return self

    def update(self, row):
        self.operations.append(("update", row))
        return self

    def select(self, columns):
        self.operations.append(("select", columns))
        return self

    def eq(self, column, value):
        self.operations.append(("eq", column, value))
        return self

    def or_(self, expression):
        self.operations.append(("or", expression))
        return self

    def is_(self, column, value):
        self.operations.append(("is", column, value))
        return self

    def execute(self):
        return SimpleNamespace(data=self.data)


class Client:
    def __init__(self, query):
        self.query = query

    def table(self, name):
        self.query.operations.append(("table", name))
        return self.query


def test_save_token_uses_upsert_without_delete(monkeypatch):
    import src.database as database

    query = Query()
    monkeypatch.setattr(database, "get_client", lambda: Client(query))
    expires_at = datetime(2026, 11, 7, tzinfo=timezone.utc)

    database.save_token(
        user_id=42,
        token_type="user",
        access_token="new-token",
        expires_at=expires_at,
    )

    assert not any(operation[0] == "delete" for operation in query.operations)
    assert query.operations == [
        ("table", "tokens"),
        (
            "upsert",
            {
                "user_id": 42,
                "token_type": "user",
                "access_token": "new-token",
                "expires_at": "2026-11-07T00:00:00+00:00",
                "created_at": query.operations[1][1]["created_at"],
            },
            "user_id,token_type",
        ),
    ]
    assert datetime.fromisoformat(query.operations[1][1]["created_at"]).tzinfo is not None


def test_save_refreshed_token_if_current_filters_by_snapshot_not_secret(monkeypatch):
    import src.database as database

    query = Query(data=[{"id": 7}])
    monkeypatch.setattr(database, "get_client", lambda: Client(query))
    created_at = datetime(2026, 9, 8, 12, 0, tzinfo=timezone.utc)
    old_expires_at = datetime(2026, 9, 10, tzinfo=timezone.utc)
    new_expires_at = old_expires_at + timedelta(days=60)
    token = Token(
        id=7,
        user_id=42,
        token_type="user",
        access_token="old-secret-token",
        created_at=created_at,
        expires_at=old_expires_at,
    )

    saved = database.save_refreshed_token_if_current(
        token=token,
        access_token="new-secret-token",
        expires_at=new_expires_at,
    )

    assert saved is True
    assert query.operations == [
        ("table", "tokens"),
        (
            "update",
            {
                "access_token": "new-secret-token",
                "expires_at": "2026-11-09T00:00:00+00:00",
                "created_at": query.operations[1][1]["created_at"],
            },
        ),
        ("eq", "id", 7),
        ("eq", "created_at", "2026-09-08T12:00:00+00:00"),
        ("eq", "expires_at", "2026-09-10T00:00:00+00:00"),
    ]
    assert all("old-secret-token" not in repr(operation) for operation in query.operations)
    assert datetime.fromisoformat(query.operations[1][1]["created_at"]).tzinfo is not None


def test_save_refreshed_token_if_current_reports_concurrent_change(monkeypatch):
    import src.database as database

    query = Query(data=[])
    monkeypatch.setattr(database, "get_client", lambda: Client(query))
    token = Token(
        id=7,
        user_id=42,
        token_type="user",
        access_token="old-secret-token",
        created_at=datetime(2026, 9, 8, 12, 0, tzinfo=timezone.utc),
        expires_at=datetime(2026, 9, 10, tzinfo=timezone.utc),
    )

    saved = database.save_refreshed_token_if_current(
        token=token,
        access_token="new-secret-token",
        expires_at=datetime(2026, 11, 9, tzinfo=timezone.utc),
    )

    assert saved is False


def test_get_expiring_tokens_includes_created_at_and_missing_expiry(monkeypatch):
    import src.database as database

    now = datetime.now(timezone.utc)
    old_created_at = now - timedelta(days=30)
    query = Query(
        data=[
            {
                "id": 1,
                "user_id": 42,
                "token_type": "user",
                "access_token": "expired-token",
                "expires_at": (now + timedelta(days=1)).isoformat(),
                "created_at": old_created_at.isoformat(),
                "users": {
                    "id": 42,
                    "instagram_id": "ig-42",
                    "instagram_username": "celeb_a",
                    "facebook_page_id": None,
                },
            },
            {
                "id": 2,
                "user_id": 43,
                "token_type": "user",
                "access_token": "missing-expiry-token",
                "expires_at": None,
                "created_at": old_created_at.isoformat(),
                "users": {
                    "id": 43,
                    "instagram_id": "ig-43",
                    "instagram_username": "celeb_b",
                    "facebook_page_id": None,
                },
            },
            {
                "id": 3,
                "user_id": 44,
                "token_type": "user",
                "access_token": "future-token",
                "expires_at": (now + timedelta(days=30)).isoformat(),
                "created_at": old_created_at.isoformat(),
                "users": {
                    "id": 44,
                    "instagram_id": "ig-44",
                    "instagram_username": "celeb_c",
                    "facebook_page_id": None,
                },
            },
        ]
    )
    monkeypatch.setattr(database, "get_client", lambda: Client(query))

    tokens = database.get_expiring_tokens(days=7)

    assert [token.id for _, token in tokens] == [1, 2]
    assert tokens[0][1].created_at == old_created_at
    assert tokens[1][1].expires_at is None
    assert query.operations[3][0] == "or"
    assert "expires_at.lt." in query.operations[3][1]
    assert "expires_at.is.null" in query.operations[3][1]
