import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


async def send_otp_email(to_email: str, otp: str) -> bool:
    """Send an OTP verification email via Resend. Returns True on success."""
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — skipping email send to %s (OTP: %s)", to_email, otp)
        return False

    html = (
        "<div style='font-family:sans-serif;max-width:480px;margin:auto'>"
        "<h2 style='color:#4f46e5'>Verify your email</h2>"
        f"<p>Your verification code is:</p>"
        f"<div style='font-size:36px;font-weight:bold;letter-spacing:8px;color:#1e1b4b;padding:16px 0'>{otp}</div>"
        "<p style='color:#64748b'>This code expires in 15 minutes. Do not share it with anyone.</p>"
        "<hr style='border:none;border-top:1px solid #e2e8f0;margin:24px 0'/>"
        "<p style='color:#94a3b8;font-size:12px'>NeuraFix Bridge — AI-powered entrance exam preparation</p>"
        "</div>"
    )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
                json={
                    "from": settings.RESEND_FROM_EMAIL,
                    "to": [to_email],
                    "subject": "Your verification code",
                    "html": html,
                },
            )
            if resp.status_code >= 400:
                logger.error("Resend API error %s: %s", resp.status_code, resp.text)
                return False
            return True
    except Exception as exc:
        logger.error("Failed to send OTP email to %s: %s", to_email, exc)
        return False
