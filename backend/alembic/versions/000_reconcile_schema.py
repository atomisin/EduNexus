"""reconcile_schema

Revision ID: 000_reconcile
Revises: None
Create Date: 2026-04-11 16:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '000_reconcile'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Enable extensions
    op.execute("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"")
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # 2. Create Enums safely
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'userrole') THEN
                CREATE TYPE userrole AS ENUM ('student', 'teacher', 'admin', 'parent');
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'userstatus') THEN
                CREATE TYPE userstatus AS ENUM ('unverified', 'pending', 'pending_approval', 'active', 'suspended', 'rejected');
            END IF;
        END $$;
    """)

    # 3. Create users table safely
    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY,
            email VARCHAR(255) NOT NULL UNIQUE,
            username VARCHAR(100) NOT NULL UNIQUE,
            hashed_password VARCHAR(255) NOT NULL,
            first_name VARCHAR(100),
            last_name VARCHAR(100),
            full_name VARCHAR(255),
            phone_number VARCHAR(20),
            role userrole NOT NULL,
            status userstatus NOT NULL DEFAULT 'unverified',
            avatar_url VARCHAR(500),
            bio TEXT,
            state VARCHAR(100),
            city VARCHAR(100),
            date_of_birth TIMESTAMP WITH TIME ZONE,
            verification_code VARCHAR(10),
            verification_code_expires TIMESTAMP WITH TIME ZONE,
            email_verified_at TIMESTAMP WITH TIME ZONE,
            authorized_by UUID REFERENCES users(id),
            authorized_at TIMESTAMP WITH TIME ZONE,
            rejection_reason TEXT,
            is_active BOOLEAN DEFAULT FALSE,
            force_password_change BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            last_login TIMESTAMP WITH TIME ZONE,
            ai_chat_history JSONB DEFAULT '[]'::jsonb
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_email ON users (email)")

    # 4. Create subjects table safely
    op.execute("""
        CREATE TABLE IF NOT EXISTS subjects (
            id UUID PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            code VARCHAR(50) NOT NULL UNIQUE,
            education_level VARCHAR(50) NOT NULL,
            parent_subject_id UUID REFERENCES subjects(id),
            curriculum_type VARCHAR(50),
            grade_levels VARCHAR[],
            departments VARCHAR[],
            description TEXT,
            learning_objectives TEXT[],
            prerequisites UUID[],
            created_by UUID REFERENCES users(id),
            is_private BOOLEAN DEFAULT FALSE,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)

    # 5. Create topics table safely
    op.execute("""
        CREATE TABLE IF NOT EXISTS topics (
            id UUID PRIMARY KEY,
            subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            difficulty_level INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            term VARCHAR(20),
            estimated_hours INTEGER,
            prerequisite_topics UUID[],
            learning_outcomes TEXT[],
            ai_summary TEXT,
            ai_key_points TEXT[],
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)

    # 6. Create student_profiles table safely
    op.execute("""
        CREATE TABLE IF NOT EXISTS student_profiles (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            student_id VARCHAR(20) UNIQUE,
            gender VARCHAR(20),
            age INTEGER,
            learning_style VARCHAR(50),
            preferred_pace VARCHAR(50),
            attention_span_minutes INTEGER DEFAULT 30,
            best_study_time VARCHAR(50),
            education_level VARCHAR(50),
            education_category VARCHAR(50),
            current_grade_level VARCHAR(50),
            grade_level VARCHAR(50),
            department VARCHAR(50),
            school_name VARCHAR(255),
            curriculum_type VARCHAR(50),
            exam_targets VARCHAR[],
            jamb_subjects VARCHAR[],
            course_name VARCHAR(255),
            professional_curriculum JSONB,
            enrolled_subjects VARCHAR[],
            guardian_name VARCHAR(255),
            guardian_email VARCHAR(255),
            guardian_phone VARCHAR(50),
            desired_topics VARCHAR[],
            subject_proficiency JSONB DEFAULT '{}'::jsonb,
            has_learning_difficulties BOOLEAN DEFAULT FALSE,
            learning_difficulties_notes TEXT,
            accommodations_needed VARCHAR[],
            career_interests VARCHAR[],
            target_universities VARCHAR[],
            target_grades JSONB DEFAULT '{}'::jsonb,
            engagement_patterns JSONB DEFAULT '{}'::jsonb,
            common_mistakes JSONB DEFAULT '{}'::jsonb,
            strength_areas VARCHAR[],
            weakness_areas VARCHAR[],
            learning_recommendations TEXT[],
            suggested_focus_areas VARCHAR[],
            estimated_time_to_mastery JSONB DEFAULT '{}'::jsonb,
            brain_power INTEGER DEFAULT 100,
            xp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 1,
            current_streak INTEGER DEFAULT 0,
            longest_streak INTEGER DEFAULT 0,
            last_active_date TIMESTAMP WITH TIME ZONE,
            badges JSONB DEFAULT '[]'::jsonb,
            avatar_url VARCHAR(500),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)

    # 7. Create teacher_students table safely (Target state)
    op.execute("""
        CREATE TABLE IF NOT EXISTS teacher_students (
            id UUID PRIMARY KEY,
            teacher_id UUID NOT NULL REFERENCES users(id),
            student_id UUID NOT NULL REFERENCES users(id),
            status VARCHAR(20) DEFAULT 'active',
            added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            added_by VARCHAR(50) DEFAULT 'teacher',
            private_notes TEXT,
            UNIQUE (teacher_id, student_id)
        )
    """)

    # 8. Create legacy teacher_student_links table safely (For migration data preservation)
    op.execute("""
        CREATE TABLE IF NOT EXISTS teacher_student_links (
            id UUID PRIMARY KEY,
            teacher_id UUID NOT NULL REFERENCES users(id),
            student_id UUID NOT NULL REFERENCES users(id),
            status VARCHAR(20) DEFAULT 'active',
            added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            added_by VARCHAR(50) DEFAULT 'teacher',
            private_notes TEXT,
            UNIQUE (teacher_id, student_id)
        )
    """)

    # 9. Create materials table safely
    op.execute("""
        CREATE TABLE IF NOT EXISTS materials (
            id UUID PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            file_url VARCHAR(500),
            video_url VARCHAR(500),
            file_type VARCHAR(50),
            file_size INTEGER,
            subject VARCHAR(100) NOT NULL,
            subject_id UUID,
            topic VARCHAR(255),
            education_level VARCHAR(50),
            grade_level VARCHAR(50),
            uploader_id UUID NOT NULL REFERENCES users(id),
            is_public BOOLEAN DEFAULT FALSE,
            allowed_students UUID[],
            tags VARCHAR[],
            download_count INTEGER DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)

    # 10. Create material_chunks table safely (base columns only)
    op.execute("""
        CREATE TABLE IF NOT EXISTS material_chunks (
            id UUID PRIMARY KEY,
            material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            page_number INTEGER,
            chunk_index INTEGER NOT NULL,
            embedding vector(384),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)


def downgrade() -> None:
    pass
