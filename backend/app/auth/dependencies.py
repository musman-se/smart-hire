"""Who is calling — FastAPI dependencies that every protected route builds on.

    CurrentUserDep   any signed-in user                      401 without a valid token
    RecruiterDep     a recruiter                             403 for a candidate
    CandidateDep     a candidate (their id is their profile) 403 for a recruiter

**Secure by default.** app/main.py mounts every domain router with get_current_user as a
router-level dependency, so a new endpoint is protected without anyone remembering to
protect it. The routes that must stay public — health probes, register, login, refresh,
logout — are on routers mounted without it, and tests/test_auth.py fails if any other
route answers without a token.

FastAPI resolves a dependency once per request, however many routes or dependencies ask
for it, so the router-level check and a route's own CurrentUserDep share one lookup.
"""

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.enums import Role
from app.auth.errors import InvalidTokenError, NotAuthenticatedError, RoleRequiredError
from app.auth.models import User
from app.auth.security import read_access_token
from app.core.db import SessionDep

# auto_error=False: a missing header is reported in this API's own error envelope, not
# FastAPI's {"detail": ...}. HTTPBearer is also what puts the "Authorize" button in /docs.
bearer = HTTPBearer(
    auto_error=False,
    description="An access token from POST /auth/login. It expires in minutes; "
    "POST /auth/refresh exchanges the refresh token for a new one.",
)


async def get_current_user(
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> User:
    if credentials is None:
        raise NotAuthenticatedError()
    user_id = read_access_token(credentials.credentials)
    if user_id is None:
        raise InvalidTokenError()
    # One primary-key lookup per request. It is what lets a deleted account stop
    # working immediately, instead of when its last token expires.
    user = await session.get(User, user_id)
    if user is None:
        raise InvalidTokenError()
    return user


CurrentUserDep = Annotated[User, Depends(get_current_user)]


async def require_recruiter(user: CurrentUserDep) -> User:
    if user.role is not Role.RECRUITER:
        raise RoleRequiredError(Role.RECRUITER)
    return user


async def require_candidate(user: CurrentUserDep) -> User:
    if user.role is not Role.CANDIDATE:
        raise RoleRequiredError(Role.CANDIDATE)
    return user


RecruiterDep = Annotated[User, Depends(require_recruiter)]
CandidateDep = Annotated[User, Depends(require_candidate)]
