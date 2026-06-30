import os
from datetime import datetime, timedelta
from dataclasses import dataclass
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, Request, WebSocket, status
from fastapi.security import OAuth2PasswordBearer

from . import config

# In production this should be stored safely in env vars
_DEFAULT_SECRET_KEY = "super-secret-tft-arena-key-for-local-dev"
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", _DEFAULT_SECRET_KEY)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days
ALLOWED_USER_EMAIL = os.environ.get("ALLOWED_USER_EMAIL", "")

# Refuse to start with the built-in dev secret whenever auth is actually
# enforced (hosted deployment or a single-email allowlist). The default secret
# is only acceptable for fully-open local development.
if SECRET_KEY == _DEFAULT_SECRET_KEY and (config.is_hosted() or ALLOWED_USER_EMAIL):
    raise RuntimeError(
        "JWT_SECRET_KEY must be set to a strong, unique value when running in "
        "hosted mode or with an ALLOWED_USER_EMAIL allowlist. Refusing to start "
        "with the built-in development secret."
    )

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


@dataclass(frozen=True)
class AuthContext:
    """Resolved auth details for REST or WebSocket requests."""

    mode: str
    is_authenticated: bool
    principal: Optional[str]
    token_source: Optional[str] = None
    error: Optional[str] = None

    def to_state_payload(self) -> dict:
        return {
            "mode": self.mode,
            "is_authenticated": self.is_authenticated,
            "principal": self.principal,
            "token_source": self.token_source,
            "error": self.error,
        }


def get_auth_mode() -> str:
    return "allowlist-jwt" if ALLOWED_USER_EMAIL else "local-open"


def _extract_bearer_token(value: Optional[str]) -> Optional[str]:
    if not value:
        return None

    parts = value.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


def _decode_subject(token: str) -> Optional[str]:
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    sub = payload.get("sub")
    return str(sub) if sub else None


def _resolve_auth_context(
    token: Optional[str], token_source: Optional[str]
) -> AuthContext:
    mode = get_auth_mode()
    if mode == "local-open":
        # Keep local behavior permissive while still exposing auth seams.
        return AuthContext(
            mode=mode,
            is_authenticated=True,
            principal="local_dev@localhost",
            token_source=token_source,
        )

    if not token:
        return AuthContext(
            mode=mode,
            is_authenticated=False,
            principal=None,
            token_source=token_source,
            error="Missing access token",
        )

    try:
        email = _decode_subject(token)
        if not email or email.lower() != ALLOWED_USER_EMAIL.lower():
            return AuthContext(
                mode=mode,
                is_authenticated=False,
                principal=email,
                token_source=token_source,
                error="Token subject is not authorized",
            )

        return AuthContext(
            mode=mode,
            is_authenticated=True,
            principal=email,
            token_source=token_source,
        )
    except JWTError:
        return AuthContext(
            mode=mode,
            is_authenticated=False,
            principal=None,
            token_source=token_source,
            error="Invalid access token",
        )


def resolve_request_auth_context(request: Request) -> AuthContext:
    auth_header = request.headers.get("Authorization")
    token = _extract_bearer_token(auth_header)
    return _resolve_auth_context(token, "authorization_header" if token else None)


def resolve_websocket_auth_context(websocket: WebSocket) -> AuthContext:
    auth_header = websocket.headers.get("Authorization")
    token = _extract_bearer_token(auth_header)
    source: Optional[str] = "authorization_header" if token else None

    if not token:
        query_token = websocket.query_params.get(
            "access_token"
        ) or websocket.query_params.get("token")
        if query_token:
            token = query_token
            source = "query_param"

    return _resolve_auth_context(token, source)


async def get_request_auth_context(request: Request) -> AuthContext:
    return resolve_request_auth_context(request)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    # If no allowed email is set, we bypass auth for local open testing
    if not ALLOWED_USER_EMAIL:
        return {"email": "local_dev@localhost"}

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None or email.lower() != ALLOWED_USER_EMAIL.lower():
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    return {"email": email}
