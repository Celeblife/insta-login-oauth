import json
import subprocess
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_vercel_daily_token_refresh_cron_points_to_internal_route():
    vercel = json.loads((PROJECT_ROOT / "vercel.json").read_text(encoding="utf-8"))

    assert {
        "path": "/internal/token-refresh",
        "schedule": "23 0 * * *",
    } in vercel.get("crons", [])


def test_asgi_entrypoint_exposes_token_refresh_route():
    import asgi

    paths = {route.path for route in asgi.app._user_routes}

    assert "/internal/token-refresh" in paths


def test_source_refresh_tokens_cli_help_smoke():
    result = subprocess.run(
        ["uv", "run", "python", "jobs/refresh_tokens.py", "--help"],
        cwd=PROJECT_ROOT,
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )

    assert result.returncode == 0
    assert "--dry-run" in result.stdout
    assert "--expected-project-ref" in result.stdout
