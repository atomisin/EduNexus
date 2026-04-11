
import asyncio
import uuid
import sys
import os
from datetime import datetime

# Add the current directory and backend directory to sys.path
if os.path.exists("backend"):
    sys.path.append(os.path.join(os.getcwd(), "backend"))
else:
    sys.path.append(os.getcwd())

from app.db.database import SessionLocal
from app.models.session import TeachingSession, SessionStatus
from app.models.user import User, UserRole
from app.models.student import StudentProfile
from app.services.session_manager import SessionManager

async def test_session_personalization():
    db = SessionLocal()
    manager = SessionManager(db)
    
    try:
        # 0. Check users
        user_count = db.query(User).count()
        print(f"Total users in DB: {user_count}")
        
        # 1. Setup a test teacher and student
        teacher = db.query(User).filter(User.role == "teacher").first()
        if not teacher:
            print("No teacher found, searching by any user...")
            teacher = db.query(User).first()
            if not teacher:
                print("No users in DB at all.")
                return

        student_user = db.query(User).filter(User.role == "student").first()
        if not student_user:
            print("No student found, using teacher as student for test...")
            student_user = teacher
            
        student_profile = db.query(StudentProfile).filter(StudentProfile.user_id == student_user.id).first()
        if not student_profile:
            # Create a mock profile with weak points
            student_profile = StudentProfile(
                user_id=student_user.id,
                learning_style="visual",
                weakness_areas=["Fractions", "Algebraic Expressions"],
                subject_proficiency={"mathematics": 0.4}
            )
            db.add(student_profile)
            db.commit()
            db.refresh(student_profile)

        print(f"Testing with Student: {student_user.full_name}, WEAKNESSES: {student_profile.weakness_areas}")

        # 2. Create a session
        from app.models.session import CreateSessionRequest, AIConfigModel
        from app.models.subject import Subject, Topic
        
        # 2. Reset and Create data
        from app.models.session import CreateSessionRequest, AIConfigModel
        from app.models.subject import Subject, Topic
        from sqlalchemy import text

        print("Resetting sessions, topics, and subjects for clean test...")
        db.execute(text("TRUNCATE teaching_sessions, topics, subjects CASCADE"))
        db.commit()

        print("Creating subject...")
        subject = Subject(
            id=uuid.uuid4(), 
            name="Mathematics", 
            code="MATH" + str(uuid.uuid4())[:8],
            education_level="secondary",
            created_by=teacher.id
        )
        db.add(subject)
        db.commit()
        db.refresh(subject)
        
        print(f"Creating topic for subject {subject.id}...")
        topic = Topic(
            id=uuid.uuid4(), 
            subject_id=subject.id, 
            name="Fractions", 
            description="Introduction to fractions",
            difficulty_level=1
        )
        db.add(topic)
        db.commit()
        db.refresh(topic)
        
        # Double check topic existence with raw SQL
        result = db.execute(text(f"SELECT id FROM topics WHERE id = '{topic.id}'")).fetchone()
        if not result:
            raise ValueError(f"CRITICAL: Topic {topic.id} NOT FOUND in DB after commit via raw SQL!")
        print(f"Topic verified in DB via raw SQL: {result[0]}")

        request = CreateSessionRequest(
            subject_id=str(subject.id),
            topic_id=str(topic.id),
            student_ids=[str(student_user.id)],
            duration_minutes=60,
            ai_config=AIConfigModel(llm_enabled=True)
        )
        
        print("Creating personalized session...")
        session = await manager.create_session(str(teacher.id), request)
        
        print(f"Session Created: {session.id}")
        print(f"Pre-Session Quiz Generated: {'Yes' if session.pre_session_quiz else 'No'}")
        if session.pre_session_quiz:
            print(f"Quiz Questions Count: {len(session.pre_session_quiz.get('questions', []))}")
        
        # 3. Test Quiz Submission
        print("\nSubmitting test quiz answers...")
        answers = {1: "B", 2: "A", 3: "C", 4: "D", 5: "A"} # Mock answers
        result = await manager.submit_quiz_answers(
            session_id=str(session.id),
            student_id=str(student_user.id),
            quiz_type="pre",
            answers=answers
        )
        print(f"Score: {result['score']}/{result['total']}")
        print(f"AI Feedback: {result['feedback'][:100]}...")

        # 4. Start and End session to check assignments
        print("\nStarting and Ending session to generate take-home assignment...")
        await manager.start_session(str(session.id))
        session.session_summary = "This lesson covered the basics of fractions, including numerators and denominators."
        db.commit()
        
        await manager.end_session(str(session.id))
        db.refresh(session)
        
        print(f"Post-Session Quiz Generated: {'Yes' if session.post_session_quiz else 'No'}")
        print(f"Take-Home Assignment Generated: {'Yes' if session.take_home_assignment else 'No'}")
        if session.take_home_assignment:
            print(f"Assignment Title: {session.take_home_assignment.get('title')}")
            print(f"Tasks Count: {len(session.take_home_assignment.get('tasks', []))}")

    except Exception as e:
        print(f"Error during verification: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(test_session_personalization())
