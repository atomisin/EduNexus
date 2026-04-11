# Hierarchical Education Categories
EDUCATION_CATEGORIES = {
    "primary": {
        "label": "Primary School",
        "levels": [
            {"value": "creche", "label": "Creche / Pre-Nursery"},
            {"value": "nursery_1", "label": "Nursery 1"},
            {"value": "nursery_2", "label": "Nursery 2"},
            {"value": "kindergarten", "label": "Kindergarten"},
            {"value": "primary_1", "label": "Primary 1"},
            {"value": "primary_2", "label": "Primary 2"},
            {"value": "primary_3", "label": "Primary 3"},
            {"value": "primary_4", "label": "Primary 4"},
            {"value": "primary_5", "label": "Primary 5"},
            {"value": "primary_6", "label": "Primary 6"}
        ]
    },
    "secondary": {
        "label": "Secondary School",
        "levels": [
            {"value": "jss_1", "label": "JSS 1"},
            {"value": "jss_2", "label": "JSS 2"},
            {"value": "jss_3", "label": "JSS 3"},
            {"value": "ss_1", "label": "SS 1"},
            {"value": "ss_2", "label": "SS 2"},
            {"value": "ss_3", "label": "SS 3"}
        ]
    },
    "exam": {
        "label": "Exam Preparation (WAEC/NECO/JAMB)",
        "levels": [
            {"value": "waec", "label": "WAEC"},
            {"value": "neco", "label": "NECO"},
            {"value": "jamb", "label": "JAMB"}
        ]
    },
    "professional": {
        "label": "Professional Courses",
        "levels": [
            {"value": "professional", "label": "Professional"}
        ]
    }
}

# Derived flat list for backward compatibility and validation
EDUCATION_LEVELS = [
    level["value"]
    for cat in EDUCATION_CATEGORIES.values()
    for level in cat["levels"]
]

# Departmental Subject Mappings for Exam/Secondary
DEPARTMENTS = ["Science", "Art", "Commercial"]

# Common subjects across all departments
BASE_EXAM_SUBJECTS = {
    "waec": ["Mathematics", "English Language", "Civic Education"],
    "neco": ["Mathematics", "English Language", "Civic Education"],
    "jamb": ["Use of English"]
}

# Department-specific subjects
DEPARTMENT_SUBJECTS = {
    "Science": ["Physics", "Chemistry", "Biology", "Further Mathematics", "Agricultural Science", "Geography"],
    "Art": ["Literature-in-English", "Government", "History", "Christian Religious Studies", "Islamic Religious Studies", "Fine Art", "French"],
    "Commercial": ["Economics", "Commerce", "Financial Accounting", "Office Practice", "Insurance", "Salesmanship"]
}

# JAMB Combination Rules
# Total: 4 subjects (English is mandatory + 3 electives)
JAMB_MAX_SUBJECTS = 4
WAEC_NECO_RANGE = (7, 9)
