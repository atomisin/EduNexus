from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.services.email_service import EmailService

router = APIRouter()
email_service = EmailService()


class TestEmailRequest(BaseModel):
    to_email: str


@router.post("/test-email")
async def test_email(request: TestEmailRequest):
    """Test SMTP email sending"""
    try:
        success = email_service.send_email(
            to_email=request.to_email,
            subject="Test Email from EduNexus",
            html_content="""
            <h1>EduNexus Email Test</h1>
            <p>This is a test email to confirm your SMTP settings are working correctly.</p>
            <p>If you received this email, your email configuration is working!</p>
            <br>
            <p>Best regards,<br>EduNexus Team</p>
            """,
        )

        if success:
            return {"success": True, "detail": f"Test email sent successfully to {request.to_email}"}
        else:
            raise HTTPException(status_code=500, detail="Failed to send test email. Check SMTP settings.")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
