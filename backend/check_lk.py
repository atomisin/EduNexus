import inspect
import sys

try:
    import livekit.api as api
    from livekit.api import AccessToken
    
    print("--- AccessToken Source ---")
    print(inspect.getsource(AccessToken))
    
    print("\n--- api attributes ---")
    print(dir(api))
    
    print("\n--- LiveKitAPI ---")
    if hasattr(api, 'LiveKitAPI'):
        print(dir(api.LiveKitAPI))
    
    print("\n--- Egress ---")
    print("Egress found:" , "EgressClient" in dir(api) or "egress" in dir(api))
    
except Exception as e:
    print("Error:", e)
