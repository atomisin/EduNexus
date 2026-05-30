import uuid

import pytest

from app.api.v1.endpoints.messages import can_message_user, get_allowed_contact_ids
from app.models.user import User, UserRole


class _FakeScalars:
    def __init__(self, values):
        self._values = list(values)

    def all(self):
        return self._values

    def first(self):
        return self._values[0] if self._values else None


class _FakeResult:
    def __init__(self, values):
        self._values = values

    def scalars(self):
        return _FakeScalars(self._values)


class _FakeDb:
    def __init__(self, *results):
        self._results = list(results)
        self.execute_count = 0

    async def execute(self, _statement):
        self.execute_count += 1
        if not self._results:
            raise AssertionError("Unexpected database query")
        return _FakeResult(self._results.pop(0))


def _user(role: UserRole) -> User:
    return User(
        id=uuid.uuid4(),
        email=f"{uuid.uuid4()}@example.test",
        username=str(uuid.uuid4()),
        hashed_password="test",
        role=role,
    )


@pytest.mark.asyncio
async def test_admin_can_message_unrelated_users_without_roster_lookup():
    admin = _user(UserRole.ADMIN)
    student = _user(UserRole.STUDENT)
    db = _FakeDb()

    assert await can_message_user(db, admin, student) is True
    assert db.execute_count == 0


@pytest.mark.asyncio
async def test_same_user_and_peer_students_cannot_message():
    student = _user(UserRole.STUDENT)
    other_student = _user(UserRole.STUDENT)
    db = _FakeDb()

    assert await can_message_user(db, student, student) is False
    assert await can_message_user(db, student, other_student) is False
    assert db.execute_count == 0


@pytest.mark.asyncio
async def test_teacher_student_messages_require_active_relationship():
    teacher = _user(UserRole.TEACHER)
    student = _user(UserRole.STUDENT)

    assert await can_message_user(_FakeDb([object()]), teacher, student) is True
    assert await can_message_user(_FakeDb([]), student, teacher) is False


@pytest.mark.asyncio
async def test_allowed_contacts_include_admins_and_active_roster_only():
    student = _user(UserRole.STUDENT)
    admin_id = uuid.uuid4()
    teacher_id = uuid.uuid4()
    db = _FakeDb([admin_id], [teacher_id])

    assert await get_allowed_contact_ids(db, student) == {admin_id, teacher_id}
    assert db.execute_count == 2
