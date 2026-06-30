"""
Avatar generation endpoint.
Offers two modes:
  1. Serve one of the pre-baked sprite avatars (SVG color blobs)
  2. Generate a custom avatar via the Gemini Imagen API using the agent's role description
"""

import os
import base64
import hashlib
import html
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/avatars", tags=["Avatars"])

# --- Pre-baked abstract SVG avatars ---
# Each is a distinct colored geometric shape, generated inline
PRESET_AVATARS = {
    "scholar": "#6366f1",
    "devil": "#ef4444",
    "creator": "#22c55e",
    "analyst": "#f59e0b",
    "skeptic": "#ec4899",
    "oracle": "#8b5cf6",
    "explorer": "#06b6d4",
    "strategist": "#64748b",
}


def _make_svg_avatar(color: str, letter: str) -> str:
    """Generate a minimal SVG avatar circle with a letter."""
    safe_letter = html.escape(letter.upper(), quote=True)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
    <circle cx="24" cy="24" r="24" fill="{color}"/>
    <text x="24" y="30" text-anchor="middle" font-size="22" font-family="system-ui" fill="white" font-weight="bold">{safe_letter}</text>
</svg>'''


def _role_to_color(role_description: str) -> str:
    """Deterministically pick a color from the role description hash."""
    colors = list(PRESET_AVATARS.values())
    idx = int(hashlib.md5(role_description.encode()).hexdigest(), 16) % len(colors)
    return colors[idx]


class AvatarGenerateRequest(BaseModel):
    role_description: str
    agent_name: str


@router.get("/preset/{preset_name}")
def get_preset_avatar(preset_name: str):
    color = PRESET_AVATARS.get(preset_name.lower(), "#6366f1")
    letter = preset_name[0] if preset_name else "A"
    svg = _make_svg_avatar(color, letter)
    from fastapi.responses import Response

    return Response(content=svg, media_type="image/svg+xml")


@router.get("/generate-default")
def generate_default_avatar(role_description: str, agent_name: str):
    """Returns a deterministically colored SVG based on the role description."""
    color = _role_to_color(role_description)
    letter = agent_name[0] if agent_name else "A"
    svg = _make_svg_avatar(color, letter)
    from fastapi.responses import Response

    return Response(content=svg, media_type="image/svg+xml")


@router.post("/generate-ai")
async def generate_ai_avatar(req: AvatarGenerateRequest):
    """
    Calls the Gemini Imagen API to generate a custom avatar.
    Falls back to the default SVG avatar if the API key is not configured.
    """
    gemini_key = os.environ.get("GEMINI_API_KEY")
    if not gemini_key:
        # Graceful fallback: return default avatar
        color = _role_to_color(req.role_description)
        letter = req.agent_name[0] if req.agent_name else "A"
        svg = _make_svg_avatar(color, letter)
        return {"type": "svg", "data": svg, "fallback": True}

    try:
        import google.generativeai as genai

        genai.configure(api_key=gemini_key)
        model = genai.ImageGenerationModel("imagen-3.0-generate-001")
        prompt = (
            f"A minimalist, abstract avatar icon for an AI agent whose role is: {req.role_description}. "
            "Flat design, vibrant single color, geometric shapes, 256x256, no text, no faces."
        )
        result = model.generate_images(
            prompt=prompt, number_of_images=1, aspect_ratio="1:1"
        )
        image_bytes = result.images[0]._image_bytes
        b64 = base64.b64encode(image_bytes).decode()
        return {
            "type": "image",
            "data": f"data:image/png;base64,{b64}",
            "fallback": False,
        }
    except Exception as e:
        # Fallback
        color = _role_to_color(req.role_description)
        letter = req.agent_name[0] if req.agent_name else "A"
        svg = _make_svg_avatar(color, letter)
        return {"type": "svg", "data": svg, "fallback": True, "error": str(e)}
