import re
import html

def sanitize_user_input(text: str) -> str:
    """
    Sanitizes user input to prevent XSS and other injection attacks.
    Removes HTML tags and escapes special characters.
    """
    if not text:
        return ""
    # Remove HTML tags
    clean = re.compile('<.*?>')
    text = re.sub(clean, '', text)
    # Escape HTML characters
    return html.escape(text)
