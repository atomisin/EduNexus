from slowapi import Limiter
from slowapi.util import get_remote_address

# C-06: Global Rate Limiter instance (singleton)
limiter = Limiter(key_func=get_remote_address)
