import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from google.oauth2 import id_token
from google.auth.transport import requests
from datetime import timedelta
from ..core.route_policy import serialize_route_policies
from ..core.security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALLOWED_USER_EMAIL,
    create_access_token,
    get_auth_mode,
)

router = APIRouter(prefix="/api/auth", tags=["Auth"])

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")


class GoogleToken(BaseModel):
    credential: str


@router.get("/policy-map")
def get_policy_map():
    return {
        "auth_mode": get_auth_mode(),
        "routes": serialize_route_policies(),
    }


@router.post("/verify_google_token")
def verify_google_token(token_data: GoogleToken):
    if not ALLOWED_USER_EMAIL:
        # Auth is disabled locally if allowed email isn't set
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": "local_dev@localhost"}, expires_delta=access_token_expires
        )
        return {"access_token": access_token, "token_type": "bearer"}

    try:
        # Verify the Google JWT token
        idinfo = id_token.verify_oauth2_token(
            token_data.credential, requests.Request(), GOOGLE_CLIENT_ID
        )

        email = idinfo.get("email")
        if not email or email.lower() != ALLOWED_USER_EMAIL.lower():
            raise HTTPException(status_code=403, detail="Unregistered email address")

        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": email}, expires_delta=access_token_expires
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {"email": email, "name": idinfo.get("name")},
        }

    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")
