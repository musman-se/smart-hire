"""Auth endpoints — the only domain routes reachable without an access token, apart
from /auth/me.

    POST /auth/register   a candidate creates their account and profile
    POST /auth/login      email + password -> access token + refresh token
    POST /auth/refresh    refresh token -> a new pair; the old refresh token stops working
    POST /auth/logout     revoke a refresh token
    GET  /auth/me         who the access token belongs to

Register has no Idempotency-Key. The idempotency record keeps a SHA-256 of the request
body for a day, and this body holds a password: a fast, unsalted hash of it is exactly
what must never sit in a cache. A retried registration gets 409 duplicate_email instead,
and the client signs in.
"""

from fastapi import APIRouter, status

from app.auth import service as auth_service
from app.auth.dependencies import CurrentUserDep
from app.auth.schemas import LoginRequest, RefreshRequest, TokenPair, UserRead
from app.candidates import service as candidate_service
from app.candidates.schemas import CandidateRead, CandidateRegistration
from app.core.db import SessionDep
from app.core.schemas import ErrorResponse

router = APIRouter()

_UNAUTHORIZED = {401: {"model": ErrorResponse}}


@router.post(
    "/register",
    response_model=CandidateRead,
    status_code=status.HTTP_201_CREATED,
    summary="Register as a candidate",
    description=(
        "Creates the account and the candidate profile together. It does not sign you "
        "in: call /auth/login next. Recruiter accounts are created by an administrator "
        "(`python -m app.auth.cli create-recruiter`), never here."
    ),
    responses={409: {"model": ErrorResponse, "description": "The email already has an account"}},
)
async def register(session: SessionDep, payload: CandidateRegistration) -> CandidateRead:
    candidate = await candidate_service.register_candidate(session, payload)
    return CandidateRead.model_validate(candidate)


@router.post("/login", response_model=TokenPair, summary="Sign in", responses=_UNAUTHORIZED)
async def login(session: SessionDep, payload: LoginRequest) -> TokenPair:
    return await auth_service.login(session, payload)


@router.post(
    "/refresh",
    response_model=TokenPair,
    summary="Exchange a refresh token for a new pair",
    description=(
        "Each refresh token works once. Presenting one that was used more than "
        "REFRESH_REUSE_GRACE_SECONDS ago ends every session of that user — it means the "
        "token was copied. Sooner than that, it is only refused."
    ),
    responses=_UNAUTHORIZED,
)
async def refresh(session: SessionDep, payload: RefreshRequest) -> TokenPair:
    return await auth_service.refresh(session, payload.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Sign out")
async def logout(session: SessionDep, payload: RefreshRequest) -> None:
    await auth_service.logout(session, payload.refresh_token)


@router.get("/me", response_model=UserRead, summary="The signed-in user", responses=_UNAUTHORIZED)
async def me(user: CurrentUserDep) -> UserRead:
    return UserRead.model_validate(user)
