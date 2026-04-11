import asyncio
import os
import sys

# Add the project root to sys.path
sys.path.append('/app')

async def test_llm():
    try:
        # Import inside function to ensure we catch import errors
        from app.services.llm_service import llm_service
        
        # Test 1: Basic Generation
        print("Testing Basic Generation...")
        res = await llm_service.generate("Say 'LLM is working' if you can read this.", max_tokens=20)
        print(f"BASIC RESPONSE: {res}")
        
    except Exception as e:
        print(f"FATAL ERROR: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_llm())
