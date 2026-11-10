"""Auth endpoints — the only domain routes reachable without an access token, apart
from /auth/me and /auth/change-password.

    POST /auth/register   a candidate creates their account and profile
    POST /auth/login      email + password -> access token + refresh token
    POST /auth/refresh    refresh token -> a new pair; the old refresh token stops working
    POST /auth/logout     revoke a refresh token
    POST /auth/change-password   current + new password -> every session ends, a new pair
    GET  /auth/me         who the access token belongs to
    POST /auth/invitations/preview   an invitation link's token -> whose invitation it is
    POST /auth/invitations/accept    token + new password -> the account is ready, signed in

The invitation endpoints are public: the person opening the link has no account they can
sign in to yet. The token in the body is what proves the admin invited them. It travels
in the body rather than the URL so it stays out of server and proxy logs, and the
console's link carries it after a "#", which browsers never send to any server.

Register has no Idempotency-Key. The idempotency record keeps a SHA-256 of the request
body for a day, and this body holds a password: a fast, unsalted hash of it is exactly
what must never sit in a cache. A retried registration gets 409 duplicate_email instead,
and the client signs in.
"""

from fastapi import APIRouter, status

from app.auth import service as auth_service
from app.auth.dependencies import CurrentUserDep
from app.auth.schemas import (
    InvitationAccept,
    InvitationPreview,
    InvitationToken,
    LoginRequest,
    PasswordChange,
    RefreshRequest,
    TokenPair,
    UserRead,
)
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
        "(an invitation link, or `python -m app.auth.cli`), never here."
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


@router.post(
    "/change-password",
    response_model=TokenPair,
    summary="Change your password",
    description=(
        "Needs the current password as well as the access token: a token left on an "
        "unlocked screen is not enough to take the account. Every session the user has "
        "ends, on every device. The pair returned starts a new one for the caller; use "
        "it in place of the old pair. Access tokens issued before stay valid until they "
        "expire, a few minutes at most."
    ),
    responses={
        **_UNAUTHORIZED,
        403: {"model": ErrorResponse, "description": "The current password is incorrect"},
    },
)
async def change_password(
    session: SessionDep, user: CurrentUserDep, payload: PasswordChange
) -> TokenPair:
    return await auth_service.change_password(session, user, payload)


_INVALID_INVITATION = {
    404: {"model": ErrorResponse, "description": "Unknown, expired or already used"}
}


@router.post(
    "/invitations/preview",
    response_model=InvitationPreview,
    summary="Look at an invitation",
    description="Whose invitation a link holds, so the page can greet them by name.",
    responses=_INVALID_INVITATION,
)
async def preview_invitation(session: SessionDep, payload: InvitationToken) -> InvitationPreview:
    return await auth_service.preview_invitation(session, payload.token)


@router.post(
    "/invitations/accept",
    response_model=TokenPair,
    summary="Accept an invitation",
    description=(
        "Sets the invited recruiter's password and signs them in: the pair returned is a "
        "normal session. The link stops working."
    ),
    responses=_INVALID_INVITATION,
)
async def accept_invitation(session: SessionDep, payload: InvitationAccept) -> TokenPair:
    return await auth_service.accept_invitation(session, payload)


@router.get("/me", response_model=UserRead, summary="The signed-in user", responses=_UNAUTHORIZED)
async def me(user: CurrentUserDep) -> UserRead:
    return UserRead.model_validate(user)
