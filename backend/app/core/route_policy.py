"""Route policy map for auth-readiness without forced enforcement."""

from dataclasses import asdict, dataclass
from enum import Enum


class AccessPolicy(str, Enum):
    PUBLIC = "public"
    OPTIONAL = "optional"
    AUTHENTICATED = "authenticated"


@dataclass(frozen=True)
class RoutePolicy:
    path_prefix: str
    kind: str
    policy: AccessPolicy
    purpose: str


ROUTE_POLICIES: tuple[RoutePolicy, ...] = (
    RoutePolicy(
        path_prefix="/api/auth",
        kind="rest",
        policy=AccessPolicy.PUBLIC,
        purpose="Login and auth metadata",
    ),
    RoutePolicy(
        path_prefix="/api/health",
        kind="rest",
        policy=AccessPolicy.PUBLIC,
        purpose="Service health checks",
    ),
    RoutePolicy(
        path_prefix="/api/chat",
        kind="ws",
        policy=AccessPolicy.OPTIONAL,
        purpose="Arena streaming channel",
    ),
    RoutePolicy(
        path_prefix="/api/rooms",
        kind="rest",
        policy=AccessPolicy.OPTIONAL,
        purpose="Room and flow controls",
    ),
    RoutePolicy(
        path_prefix="/api/settings",
        kind="rest",
        policy=AccessPolicy.OPTIONAL,
        purpose="Local settings management",
    ),
    RoutePolicy(
        path_prefix="/api/agents",
        kind="rest",
        policy=AccessPolicy.OPTIONAL,
        purpose="Agent persona CRUD",
    ),
    RoutePolicy(
        path_prefix="/api/messages",
        kind="rest",
        policy=AccessPolicy.OPTIONAL,
        purpose="Transcript retrieval/export",
    ),
    RoutePolicy(
        path_prefix="/api/providers",
        kind="rest",
        policy=AccessPolicy.OPTIONAL,
        purpose="Model provider discovery",
    ),
    RoutePolicy(
        path_prefix="/api/avatars",
        kind="rest",
        policy=AccessPolicy.PUBLIC,
        purpose="Avatar rendering",
    ),
)


def get_route_policy(path: str, kind: str) -> AccessPolicy:
    for policy in ROUTE_POLICIES:
        if policy.kind == kind and path.startswith(policy.path_prefix):
            return policy.policy
    return AccessPolicy.OPTIONAL


def get_ws_policy(path: str) -> AccessPolicy:
    return get_route_policy(path, "ws")


def serialize_route_policies() -> list[dict]:
    return [
        {
            **asdict(policy),
            "policy": policy.policy.value,
        }
        for policy in ROUTE_POLICIES
    ]
