import os
import sys
sys.path.append(os.path.join(os.getcwd(), 'backend'))

try:
    from app.core.config import settings
    print("Settings loaded successfully")
    print(f"DATABASE_URL: {settings.DATABASE_URL}")
except Exception as e:
    print(f"Failed to load settings: {e}")
    import traceback
    traceback.print_exc()
