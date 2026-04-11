"""
Email validation utilities for EduNexus
"""
import re
from typing import Optional, Tuple
from email_validator import validate_email, EmailNotValidError


class EmailValidator:
    """Email validation utility with multiple validation layers"""
    
    # Common disposable email domains to block
    DISPOSABLE_DOMAINS = {
        'tempmail.com', 'throwaway.com', 'mailinator.com', 'guerrillamail.com',
        'yopmail.com', 'fakeinbox.com', 'sharklasers.com', 'getairmail.com',
        'temp-mail.org', 'burnermail.io', '10minutemail.com', 'tempail.com',
        'mailnesia.com', 'tempinbox.com', 'emailondeck.com', 'dispostable.com',
        'maildrop.cc', 'harakirimail.com', 'mailcatch.com', 'bouncr.com',
        'spamgourmet.com', 'mytemp.email', 'throwawaymail.com', 'tempmailaddress.com',
        'tempm.com', 'tempmails.org', 'anonymous.email', 'freemail.hu'
    }
    
    # Educational domains for teacher verification (optional)
    EDUCATIONAL_DOMAINS = {
        '.edu', '.ac.', '.sch.', 'school.', 'college.', 'university.',
        'edu.', 'academy.', 'institute.'
    }
    
    @staticmethod
    def validate_format(email: str) -> Tuple[bool, Optional[str]]:
        """
        Validate email format using email-validator library
        Returns: (is_valid, error_message)
        """
        try:
            validation = validate_email(email, check_deliverability=False)
            normalized_email = validation.email
            return True, None
        except EmailNotValidError as e:
            return False, str(e)
    
    @staticmethod
    def is_disposable(email: str) -> bool:
        """Check if email is from a disposable email provider"""
        domain = email.lower().split('@')[-1]
        return domain in EmailValidator.DISPOSABLE_DOMAINS
    
    @staticmethod
    def is_educational(email: str) -> bool:
        """Check if email is from an educational institution"""
        domain = email.lower()
        return any(edu_domain in domain for edu_domain in EmailValidator.EDUCATIONAL_DOMAINS)
    
    @staticmethod
    def validate_password_strength(password: str) -> Tuple[bool, Optional[str]]:
        """
        Validate password strength
        Returns: (is_valid, error_message)
        """
        if len(password) < 8:
            return False, "Password must be at least 8 characters long"
        
        if len(password) > 72:
            return False, "Password must not exceed 72 characters"
        
        if not re.search(r'[A-Z]', password):
            return False, "Password must contain at least one uppercase letter"
        
        if not re.search(r'[a-z]', password):
            return False, "Password must contain at least one lowercase letter"
        
        if not re.search(r'\d', password):
            return False, "Password must contain at least one digit"
        
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
            return False, "Password must contain at least one special character"
        
        return True, None
    
    @classmethod
    def validate_registration_email(
        cls, 
        email: str, 
        role: str = "student",
        allow_disposable: bool = False
    ) -> Tuple[bool, Optional[str]]:
        """
        Comprehensive email validation for registration
        Returns: (is_valid, error_message)
        """
        # Check format
        is_valid, error = cls.validate_format(email)
        if not is_valid:
            return False, error
        
        # Check disposable emails
        if not allow_disposable and cls.is_disposable(email):
            return False, "Disposable email addresses are not allowed. Please use a permanent email address."
        
        # For teachers, optionally check for educational domain
        # This is optional - teachers can use any email
        if role == "teacher":
            # Log if it's an educational domain (for analytics)
            is_edu = cls.is_educational(email)
            # We don't block non-educational emails for teachers
            # but we could add verification requirements
        
        return True, None


# Convenience function
def validate_email_registration(email: str, role: str = "student") -> Tuple[bool, Optional[str]]:
    """Quick validation function for registration"""
    return EmailValidator.validate_registration_email(email, role)


def validate_password(password: str) -> Tuple[bool, Optional[str]]:
    """Quick password validation"""
    return EmailValidator.validate_password_strength(password)


import unicodedata

def sanitize_user_input(text: str, max_length: int = 2000) -> str:
    """
    Advanced LLM input sanitization (C-06):
    1. Removes control characters
    2. Enforces maximum length
    3. Normalizes Unicode to NFKC
    """
    if not text:
        return ""
    
    # 1. Normalize Unicode
    text = unicodedata.normalize('NFKC', text)
    
    # 2. Remove control characters (except \n, \r, \t)
    text = "".join(ch for ch in text if ch == '\n' or ch == '\r' or ch == '\t' or unicodedata.category(ch)[0] != 'C')
    
    # 3. Enforce length
    return text[:max_length]
