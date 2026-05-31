from app.services.custom_course_governance import screen_custom_course_request


def test_blocks_actionable_criminal_course_intent():
    result = screen_custom_course_request("How to create bomb and kidnap people")

    assert result.allowed is False
    assert result.status == "auto_rejected"
    assert result.safety_status == "blocked"
    assert "weapons_or_explosives" in result.safety_flags


def test_allows_defensive_sensitive_course_for_admin_review():
    result = screen_custom_course_request("Kidnapping prevention and personal safety")

    assert result.allowed is True
    assert result.status == "pending_admin_review"
    assert result.safety_status == "clear"
