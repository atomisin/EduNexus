import smtplib
import random
import string
import httpx
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User
import logging

logger = logging.getLogger(__name__)

class EmailService:
    """Service for sending emails via SMTP"""
    
    def __init__(self):
        self.smtp_host = settings.SMTP_HOST
        self.smtp_port = settings.SMTP_PORT
        self.smtp_user = settings.SMTP_USER
        self.smtp_password = settings.SMTP_PASSWORD
        self.use_tls = settings.SMTP_USE_TLS
        self.from_email = settings.SMTP_FROM_EMAIL
        self.from_name = settings.SMTP_FROM_NAME
        self.resend_api_key = (settings.RESEND_API_KEY or "").strip() or None
        # Keep Resend independent from SMTP_FROM_EMAIL. SMTP may point at a
        # future custom domain that Resend has not verified yet.
        self.resend_from_email = (settings.RESEND_FROM_EMAIL or "").strip() or "onboarding@resend.dev"

    def _send_via_resend(self, to_email: str, subject: str, html_content: str, text_content: Optional[str] = None) -> bool:
        """Send an email through Resend's HTTPS API, which is friendlier to hosted environments."""
        if not self.resend_api_key:
            return False

        payload = {
            "from": f"{self.from_name} <{self.resend_from_email}>",
            "to": [to_email],
            "subject": subject,
            "html": html_content,
        }
        if text_content:
            payload["text"] = text_content

        try:
            with httpx.Client(timeout=15.0) as client:
                response = client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {self.resend_api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                if response.status_code >= 400:
                    logger.error(
                        "Resend rejected email to %s with status %s: %s",
                        to_email,
                        response.status_code,
                        response.text[:500],
                    )
                    return False
            return True
        except Exception as e:
            logger.exception(f"Failed to send email via Resend: {e}")
            return False
    
    def send_email(self, to_email: str, subject: str, html_content: str, text_content: Optional[str] = None) -> bool:
        """Send an email via the configured provider."""
        if self.resend_api_key:
            return self._send_via_resend(to_email, subject, html_content, text_content)

        try:
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to_email
            
            # Add text part
            if text_content:
                msg.attach(MIMEText(text_content, 'plain'))
            
            # Add HTML part
            msg.attach(MIMEText(html_content, 'html'))
            
            # Connect to SMTP server
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                if self.use_tls:
                    server.starttls()
                
                if self.smtp_user and self.smtp_password:
                    server.login(self.smtp_user, self.smtp_password)
                
                server.sendmail(self.from_email, to_email, msg.as_string())
            
            return True
        except Exception as e:
            logger.exception(f"Failed to send email: {e}")
            return False
    
    def generate_verification_code(self, length: int = 6) -> str:
        """Generate a random verification code"""
        return ''.join(random.choices(string.digits, k=length))
    
    def send_verification_email(self, user: User, verification_code: str) -> bool:
        """Send email verification email to user"""
        subject = "Verify Your Email - EduNexus"
        
        verification_url = f"{settings.APP_BASE_URL}/verify-email?code={verification_code}&email={user.email}"
        
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #2c5aa0;">Welcome to EduNexus!</h2>
                <p>Hi {user.full_name},</p>
                <p>Thank you for registering. Please verify your email address by using the code below:</p>
                
                <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
                    <h1 style="color: #2c5aa0; font-size: 32px; letter-spacing: 5px; margin: 0;">{verification_code}</h1>
                </div>
                
                <p>Or click the link below to verify your email:</p>
                <p><a href="{verification_url}" style="background-color: #2c5aa0; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a></p>
                
                <p>This code will expire in {settings.VERIFICATION_TOKEN_EXPIRE_HOURS} hours.</p>
                <p>If you didn't create an account, you can safely ignore this email.</p>
                
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 12px; color: #666;">
                    This is an automated message from EduNexus. Please do not reply to this email.
                </p>
            </div>
        </body>
        </html>
        """
        
        text_content = f"""
        Welcome to EduNexus!
        
        Hi {user.full_name},
        
        Thank you for registering. Please verify your email address by using the code below:
        
        Verification Code: {verification_code}
        
        Or visit: {verification_url}
        
        This code will expire in {settings.VERIFICATION_TOKEN_EXPIRE_HOURS} hours.
        
        If you didn't create an account, you can safely ignore this email.
        """
        
        return self.send_email(user.email, subject, html_content, text_content)
    
    def send_password_reset_email(self, user: User, reset_token: str) -> bool:
        """Send password reset email to user"""
        subject = "Password Reset Request - EduNexus"
        
        reset_url = f"{settings.APP_BASE_URL}/reset-password?token={reset_token}"
        
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #2c5aa0;">Password Reset Request</h2>
                <p>Hi {user.full_name},</p>
                <p>We received a request to reset your password. Click the link below to reset it:</p>
                
                <p><a href="{reset_url}" style="background-color: #2c5aa0; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
                
                <p>This link will expire in {settings.VERIFICATION_TOKEN_EXPIRE_HOURS} hours.</p>
                <p>If you didn't request a password reset, you can safely ignore this email.</p>
                
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 12px; color: #666;">
                    This is an automated message from EduNexus. Please do not reply to this email.
                </p>
            </div>
        </body>
        </html>
        """
        
        text_content = f"""
        Password Reset Request
        
        Hi {user.full_name},
        
        We received a request to reset your password. Visit the link below to reset it:
        
        {reset_url}
        
        This link will expire in {settings.VERIFICATION_TOKEN_EXPIRE_HOURS} hours.
        
        If you didn't request a password reset, you can safely ignore this email.
        """
        
        return self.send_email(user.email, subject, html_content, text_content)

    async def notify_admins_of_pending_user(self, user: User, db: Session) -> bool:
        """Notify all administrators of a new user pending approval (C-04-B)"""
        # Note: We use Session type hint but it could be AsyncSession
        from sqlalchemy import select
        
        # Determine if we need to await the execute (EduNexus uses AsyncSession)
        query = select(User).filter(User.role == "admin", User.is_active == True)
        
        # Check if db is AsyncSession
        if hasattr(db, "execute"):
            res = await db.execute(query)
            admins = res.scalars().all()
        else:
            admins = db.execute(query).scalars().all()
            
        if not admins:
            return False
            
        subject = f"Action Required: New User Pending Approval ({user.full_name})"
        
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #2c5aa0;">New User Registration</h2>
                <p>A new user has verified their email and is now pending administrator approval.</p>
                
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Name:</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">{user.full_name}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Email:</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">{user.email}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Role:</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">{user.role.title()}</td>
                    </tr>
                </table>
                
                <p>Please log in to the admin dashboard to review and approve/reject this request.</p>
                <p><a href="{settings.APP_BASE_URL}/admin/users" style="background-color: #2c5aa0; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Review Users</a></p>
                
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 12px; color: #666;">
                    EduNexus 2.0 Security Notification
                </p>
            </div>
        </body>
        </html>
        """
        
        # sychronous send for each admin
        success = True
        for admin in admins:
            if not self.send_email(admin.email, subject, html_content):
                success = False
        
        return success


# Global instance
email_service = EmailService()
