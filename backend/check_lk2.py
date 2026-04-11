import inspect
import sys
import livekit.api as api
from livekit.api import AccessToken

with open('sdk_output.txt', 'w', encoding='utf-8') as f:
    f.write("--- AccessToken Source ---\n")
    f.write(inspect.getsource(AccessToken) + "\n\n")
    
    f.write("--- api attributes ---\n")
    f.write(", ".join(dir(api)) + "\n\n")
    
    f.write("--- LiveKitAPI attributes ---\n")
    if hasattr(api, 'LiveKitAPI'):
        f.write(", ".join(dir(api.LiveKitAPI)) + "\n\n")
    
    f.write(f"Egress found: {'EgressClient' in dir(api) or 'egress' in dir(api)}\n")
