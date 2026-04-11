from passlib.context import CryptContext

# Create a centralized password hashing context
# This resolves the bcrypt version incompatibility by providing a single point of configuration
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hash."""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Generate a hash for a given password."""
    return pwd_context.hash(password)
