"""Default roles and permissions seeded on tenant creation."""

SYSTEM_PERMISSIONS = [
    ("students", "view"), ("students", "create"), ("students", "edit"), ("students", "delete"),
    ("classrooms", "view"), ("classrooms", "create"), ("classrooms", "edit"), ("classrooms", "delete"),
    ("curriculum", "view"), ("curriculum", "create"), ("curriculum", "edit"), ("curriculum", "delete"),
    ("labs", "view"), ("labs", "create"), ("labs", "edit"), ("labs", "delete"),
    ("labs", "assign"), ("labs", "grade"),
    ("progress", "view"), ("progress", "create"), ("progress", "edit"), ("progress", "delete"),
    ("gamification", "view"), ("gamification", "create"), ("gamification", "edit"), ("gamification", "delete"),
    ("messages", "view"), ("messages", "create"), ("messages", "update"), ("messages", "edit"), ("messages", "delete"),
    ("attendance", "view"), ("attendance", "create"), ("attendance", "edit"), ("attendance", "delete"),
    ("settings", "view"), ("settings", "create"), ("settings", "edit"), ("settings", "delete"),
    ("members", "view"), ("members", "create"), ("members", "edit"), ("members", "delete"),
    ("roles", "view"), ("roles", "create"), ("roles", "edit"), ("roles", "delete"),
    ("assets", "view"), ("assets", "create"), ("assets", "edit"), ("assets", "delete"),
    ("programs", "view"), ("programs", "create"), ("programs", "edit"), ("programs", "delete"),
    ("sessions", "cancel"), ("sessions", "reschedule"),
    ("member_billing", "view"), ("member_billing", "manage"), ("member_billing", "collect"),
    ("analytics", "view"), ("analytics", "export"),
]

DEFAULT_ROLES = {
    "owner": {
        "name": "Owner",
        "permissions": [f"{r}:{a}" for r, a in SYSTEM_PERMISSIONS],
    },
    "admin": {
        "name": "Admin",
        "permissions": [
            f"{r}:{a}" for r, a in SYSTEM_PERMISSIONS
            if (r not in ("roles", "analytics") or a in ("view",))
            and not (r == "analytics" and a == "export")
        ],
    },
    "instructor": {
        "name": "Instructor",
        "permissions": [
            "students:view", "students:create", "students:edit",
            "classrooms:view", "classrooms:create", "classrooms:edit",
            "curriculum:view", "curriculum:create", "curriculum:edit",
            "labs:view", "labs:create", "labs:edit", "labs:assign", "labs:grade",
            "progress:view", "progress:create", "progress:edit",
            "gamification:view", "gamification:create", "gamification:delete",
            "messages:view", "messages:create", "messages:update",
            "attendance:view", "attendance:create", "attendance:edit",
            "assets:view", "assets:create", "assets:edit",
            "programs:view",
            "sessions:cancel", "sessions:reschedule",
            "member_billing:view",
        ],
    },
    "parent": {
        "name": "Parent",
        "permissions": [
            "students:view",
            "progress:view",
            "gamification:view",
            "messages:view", "messages:create", "messages:update",
            "classrooms:view",
            "assets:view",
            "notifications:view", "notifications:update",
            "sessions:cancel", "sessions:reschedule",
        ],
    },
    "homeschool_parent": {
        "name": "Homeschool Parent",
        "permissions": [
            "students:view", "students:create", "students:edit",
            "progress:view",
            "gamification:view",
            "messages:view", "messages:create", "messages:update",
            "classrooms:view", "classrooms:create", "classrooms:edit",
            "curriculum:view",
            "labs:view", "labs:assign", "labs:grade",
            "assets:view", "assets:create",
            "settings:view", "settings:edit",
            "member_billing:view", "member_billing:manage",
            "notifications:view", "notifications:update",
            "sessions:cancel", "sessions:reschedule",
        ],
    },
}
