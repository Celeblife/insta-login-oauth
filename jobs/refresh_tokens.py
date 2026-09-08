"""Scheduled job for refreshing expiring tokens."""

import argparse
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.config import config
from src.database import get_expiring_tokens, save_refreshed_token_if_current
from src.oauth import refresh_long_lived_token

_MIN_REFRESH_TOKEN_AGE = timedelta(hours=24)


def _new_results() -> dict:
    return {
        "refreshed": 0,
        "failed": 0,
        "errors": [],
        "skipped": 0,
        "would_refresh": 0,
        "too_new": 0,
        "reauth_required": 0,
        "metadata_missing": 0,
        "unchanged": 0,
    }


def _record_error(results: dict, code: str, *, user_id=None, token_id=None):
    parts = [code]
    if user_id is not None:
        parts.append(f"user_id={user_id}")
    if token_id is not None:
        parts.append(f"token_id={token_id}")
    results["failed"] += 1
    results["errors"].append(" ".join(parts))


def run_token_refresh(days_before_expiry: int = 7, *, dry_run: bool = False) -> dict:
    """
    Refresh tokens that will expire within the specified days.

    Args:
        days_before_expiry: Refresh tokens expiring within this many days
        dry_run: Report candidates without calling Instagram or writing tokens
    """
    print(f"Checking for tokens expiring within {days_before_expiry} days...")
    if dry_run:
        print("Dry run enabled; no Instagram API calls or DB writes will be made.")

    results = _new_results()

    try:
        expiring = get_expiring_tokens(days_before_expiry)
    except Exception:
        _record_error(results, "token_refresh_lookup_failed")
        return results

    # Get expiring tokens
    if not expiring:
        print("No tokens need refreshing.")
        return results

    now = datetime.now(timezone.utc)
    for user, token in expiring:
        print(f"Checking token for user_id={user.id} token_id={token.id}...")

        if token.expires_at is None:
            results["metadata_missing"] += 1
            _record_error(
                results,
                "token_refresh_missing_expires_at",
                user_id=user.id,
                token_id=token.id,
            )
            continue

        if token.expires_at <= now:
            results["reauth_required"] += 1
            _record_error(
                results,
                "token_refresh_reauth_required",
                user_id=user.id,
                token_id=token.id,
            )
            continue

        if token.created_at is None:
            results["metadata_missing"] += 1
            _record_error(
                results,
                "token_refresh_missing_created_at",
                user_id=user.id,
                token_id=token.id,
            )
            continue

        if token.created_at > now - _MIN_REFRESH_TOKEN_AGE:
            print("  Skipped: token was saved less than 24 hours ago.")
            results["skipped"] += 1
            results["too_new"] += 1
            continue

        if dry_run:
            print("  Would refresh.")
            results["would_refresh"] += 1
            continue

        try:
            # Refresh the token
            new_token_data = refresh_long_lived_token(token.access_token)
            new_expires_at = new_token_data.get("expires_at")
            new_access_token = new_token_data.get("access_token")
            if not isinstance(new_access_token, str) or not new_access_token:
                raise ValueError("token_refresh_missing_token")
            if not isinstance(new_expires_at, datetime):
                raise ValueError("token_refresh_missing_expires_at")
            if new_expires_at <= token.expires_at:
                raise ValueError("token_refresh_expiry_not_extended")

            # Save the new token
            saved = save_refreshed_token_if_current(
                token=token,
                access_token=new_access_token,
                expires_at=new_expires_at,
            )
            if not saved:
                print("  Skipped: token row changed before refresh save.")
                results["skipped"] += 1
                results["unchanged"] += 1
                continue

            print(f"  Token refreshed, expires: {new_expires_at}")
            results["refreshed"] += 1

        except Exception:
            print("  Failed to refresh token.")
            _record_error(
                results,
                "token_refresh_failed",
                user_id=user.id,
                token_id=token.id,
            )

    print("\n=== Refresh Summary ===")
    print(f"Refreshed: {results['refreshed']}")
    print(f"Failed: {results['failed']}")
    print(f"Skipped: {results['skipped']}")

    return results


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Refresh expiring Instagram tokens.")
    parser.add_argument(
        "--days-before-expiry",
        type=int,
        default=7,
        help="Refresh tokens expiring within this many days.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report candidates without calling Instagram or writing tokens.",
    )
    parser.add_argument(
        "--expected-project-ref",
        help="Fail unless SUPABASE_URL points at this Supabase project ref.",
    )
    args = parser.parse_args(argv)

    if args.expected_project_ref:
        expected_host = f"https://{args.expected_project_ref}.supabase.co"
        if config.SUPABASE_URL.rstrip("/") != expected_host:
            print("Configured Supabase project ref does not match expected target.")
            return 2

    results = run_token_refresh(
        days_before_expiry=args.days_before_expiry,
        dry_run=args.dry_run,
    )
    return 1 if results["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
