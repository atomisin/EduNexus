import asyncio
import sys

# Add the project root to sys.path
sys.path.append('/app')

async def test_llm_logic():
    try:
        from app.services.llm_service import llm_service
        
        # Test 2: Correct Name Logic
        print("-" * 20)
        print("Testing Correct Name Logic...")
        bad_name = "pythOn pRogRammimg"
        prompt = f"""Fix any spelling mistakes in this course name
and return it in Title Case. Return ONLY the corrected name, 
nothing else. Course name: "{bad_name}" """
        
        res = await llm_service.generate(
            prompt=prompt,
            max_tokens=30,
            temperature=0.0
        )
        corrected = res.strip().strip('"').strip("'")
        print(f"INPUT: {bad_name}")
        print(f"NORMALIZED: {corrected}")
        print("-" * 20)
        
        # Test 3: Composite Key Check
        print("Testing composite key formatting...")
        # subject_id::topic_id::topic_name::subtopic_name
        sid = "sub-1"
        tid = "top-2"
        tn = "React"
        sn = "Hooks"
        expected = "sub-1::top-2::React::Hooks"
        actual = f"{sid}::{tid}::{tn}::{sn}"
        print(f"EXPECTED: {expected}")
        print(f"ACTUAL:   {actual}")
        print("-" * 20)
        
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(test_llm_logic())
