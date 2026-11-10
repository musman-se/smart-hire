"""Create staff accounts from the command line: the first admin, and recruiters.

    python -m app.auth.cli create-admin owner@example.com --name "Nadia Malik"
    python -m app.auth.cli create-recruiter alice@example.com --name "Alice Ahmed"
    docker compose exec api python -m app.auth.cli create-recruiter alice@example.com \\
        --name "Alice Ahmed"

It prompts for the password. Scripts pipe it in instead, with --password-stdin, so it
never appears in the process list or the shell history (the convention
`docker login --password-stdin` follows):

    printf %s "$PASSWORD" | python -m app.auth.cli create-recruiter alice@example.com \\
        --name "Alice Ahmed" --password-stdin --exist-ok

The account and the profile are created together. Either can change the name later,
and add a title, with PATCH /recruiters/me.

Every installation needs this once, for its first admin: nobody exists yet who could
invite them, and an endpoint anyone may call would let anyone become one. Whoever can
run commands on the server is already trusted. After that, admins add recruiters from
the console (POST /recruiters), and each recruiter chooses their own password through
an invitation link — so create-recruiter is for scripts and the demo seed.
"""

import argparse
import asyncio
import getpass
import sys
from collections.abc import Sequence

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import app.models  # noqa: F401 — registers every model, so relationships resolve
from app.auth import service as auth_service
from app.auth.enums import Role, with_article
from app.auth.errors import DuplicateEmailError
from app.auth.models import User
from app.auth.schemas import PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH
from app.core.db import SessionLocal, engine
from app.recruiters.schemas import normalise_full_name

_EMAIL = TypeAdapter(EmailStr)

_COMMANDS = {"create-recruiter": Role.RECRUITER, "create-admin": Role.ADMIN}


def _parse(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="python -m app.auth.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    for command, role in _COMMANDS.items():
        create = commands.add_parser(command, help=f"Create {with_article(role)} account")
        create.add_argument("email")
        create.add_argument("--name", required=True, help=f"The {role}'s full name")
        create.add_argument(
            "--password-stdin", action="store_true", help="Read the password from standard input"
        )
        create.add_argument(
            "--exist-ok",
            action="store_true",
            help=f"Succeed without changes if this {role} already exists",
        )
    return parser.parse_args(argv)


def _read_password(from_stdin: bool) -> str:
    if from_stdin:
        return sys.stdin.read().rstrip("\r\n")
    password = getpass.getpass("Password: ")
    if getpass.getpass("Repeat password: ") != password:
        raise SystemExit("The passwords do not match.")
    return password


async def create_staff(
    session_factory: async_sessionmaker[AsyncSession],
    email: str,
    password: str,
    full_name: str,
    *,
    exist_ok: bool,
    role: Role = Role.RECRUITER,
) -> str:
    """Returns what happened, for the caller to print. Raises SystemExit on refusal."""
    try:
        email = _EMAIL.validate_python(email.strip()).lower()
    except ValidationError as exc:
        raise SystemExit(f"Not a valid email address: {email}") from exc
    try:
        full_name = normalise_full_name(full_name)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    if not PASSWORD_MIN_LENGTH <= len(password) <= PASSWORD_MAX_LENGTH:
        raise SystemExit(
            f"The password must be {PASSWORD_MIN_LENGTH} to {PASSWORD_MAX_LENGTH} characters."
        )

    async with session_factory() as session:
        existing = await session.scalar(select(User).where(User.email == email))
        if existing is not None:
            # Never change an existing account's role, reset a password or rename
            # anyone from here: --exist-ok means "already done", nothing more.
            if exist_ok and existing.role is role:
                return f"{role.capitalize()} {email} already exists; nothing changed."
            raise SystemExit(f"An account with email {email} already exists ({existing.role}).")
        try:
            user = await auth_service.create_staff_account(
                session, email, password, full_name, role=role
            )
        except DuplicateEmailError as exc:  # registered between the check and the insert
            raise SystemExit(exc.message) from exc
    return f"Created {role} {email} (id {user.id})."


def main(argv: Sequence[str] | None = None) -> None:
    args = _parse(argv)
    password = _read_password(args.password_stdin)

    async def run() -> str:
        try:
            return await create_staff(
                SessionLocal,
                args.email,
                password,
                args.name,
                exist_ok=args.exist_ok,
                role=_COMMANDS[args.command],
            )
        finally:
            await engine.dispose()

    print(asyncio.run(run()))


if __name__ == "__main__":
    main()
