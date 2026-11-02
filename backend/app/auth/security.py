"""Passwords and tokens — the cryptography, kept apart from the rules that use it.

**Passwords** are hashed with Argon2id, through pwdlib. Argon2id is deliberately slow and
memory-hard (64 MiB per hash with these defaults): checking one guess costs an attacker
who stole the table about as much as it costs us at sign-in, which is the point. Each
hash has its own random salt, so equal passwords do not produce equal hashes.

That cost is CPU time, and on the event loop it would stall every other request for
about a tenth of a second. Hashing therefore runs in worker threads — argon2-cffi
releases the GIL while it works, so they hash truly in parallel — on a pool of its own,
PASSWORD_HASH_WORKERS threads wide. Not the event loop's default pool: that one also
resolves hostnames for every new database and Redis connection, and a burst of sign-ins
queued on it would stall those too. The bound also caps the memory a burst can take
(64 MiB per hash in flight); further sign-ins wait their turn.

**Access tokens** are JWTs signed with HS256 and JWT_SECRET_KEY. The API verifies one
with no database lookup of the token itself — but it cannot revoke one either, which is
why they live for minutes (ACCESS_TOKEN_MINUTES).

**Refresh tokens** are not JWTs. They are 256 random bits, and the database stores their
SHA-256. A fast hash is right here, where it would be wrong for a password: a password is
guessable and needs a slow hash to resist guessing, while 256 random bits cannot be
guessed at any speed. A fast, unsalted hash is also what makes the lookup an index probe.
"""

import asyncio
import functools
import hashlib
import secrets
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

from app.core.config import settings

# Fixed in code, not configurable. A verifier that reads the algorithm from the token
# can be talked into "none", or into checking an RS256 signature with the HMAC key.
ALGORITHM = "HS256"

# pwdlib's recommended Argon2id parameters. The test suite swaps in a cheaper hasher;
# nothing else should touch this.
password_hasher = PasswordHash((Argon2Hasher(),))


def _signing_key() -> str:
    assert settings.jwt_secret_key is not None  # enforced by Settings._check_consistency
    return settings.jwt_secret_key.get_secret_value()


# --- Passwords -----------------------------------------------------------------------

_hashing_pool: ThreadPoolExecutor | None = None


async def _in_hashing_pool[T](work: Callable[..., T], *args: object) -> T:
    global _hashing_pool
    if _hashing_pool is None:
        _hashing_pool = ThreadPoolExecutor(
            max_workers=settings.password_hash_workers, thread_name_prefix="password-hash"
        )
    return await asyncio.get_running_loop().run_in_executor(_hashing_pool, work, *args)


async def hash_password(password: str) -> str:
    return await _in_hashing_pool(password_hasher.hash, password)


@functools.cache
def _decoy_hash(hasher: PasswordHash) -> str:
    """A real hash of a random password, made once per hasher."""
    return hasher.hash(secrets.token_urlsafe(16))


def _verify_decoy(hasher: PasswordHash, password: str) -> None:
    # Both steps in one thread: the first call also computes the decoy, which must not
    # run on the event loop any more than a real hash may.
    hasher.verify(password, _decoy_hash(hasher))


async def verify_password(password: str, stored_hash: str | None) -> tuple[bool, str | None]:
    """(matches, replacement hash or None).

    A replacement is returned when the stored hash used weaker parameters than the
    current hasher: the caller saves it, so hashes are upgraded as people sign in.

    With no stored hash — an unknown email, or an account with no password — a decoy
    hash is checked instead, and the answer is always False. Returning early would make
    "no such account" measurably faster than "wrong password", and the timing alone
    would tell an attacker which emails are registered.
    """
    hasher = password_hasher
    if stored_hash is None:
        await _in_hashing_pool(_verify_decoy, hasher, password)
        return False, None
    return await _in_hashing_pool(hasher.verify_and_update, password, stored_hash)


# --- Access tokens ---------------------------------------------------------------------


def create_access_token(user_id: uuid.UUID, *, now: datetime | None = None) -> str:
    """A signed token naming the user. It carries no role: the role is read from the
    database on every request, so a changed role or a deleted account takes effect at
    once rather than when the token expires."""
    issued = now or datetime.now(UTC)
    claims = {
        "sub": str(user_id),
        "iat": issued,
        "exp": issued + timedelta(minutes=settings.access_token_minutes),
    }
    return jwt.encode(claims, _signing_key(), algorithm=ALGORITHM)


def read_access_token(token: str) -> uuid.UUID | None:
    """The user id a token names, or None if it is forged, altered, expired or malformed."""
    try:
        claims = jwt.decode(
            token,
            _signing_key(),
            algorithms=[ALGORITHM],
            options={"require": ["sub", "iat", "exp"]},
        )
        return uuid.UUID(claims["sub"])
    except (jwt.InvalidTokenError, ValueError, TypeError):
        # InvalidTokenError covers a bad signature, expiry and malformed input;
        # ValueError and TypeError a "sub" that is not a UUID string.
        return None


# --- Refresh tokens --------------------------------------------------------------------


def new_refresh_token() -> str:
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
