"""Default roles and permissions seeded on tenant creation."""

SYSTEM_PERMISSIONS = [
    ("students", "view"), ("students", "create"), ("students", "edit"), ("students", "delete"),
    ("classrooms", "view"), ("classrooms", "create"), ("classrooms", "edit"), ("classrooms", "delete"),
    ("curriculum", "view"), ("curriculum", "create"), ("curriculum", "edit"), ("curriculum", "delete"),
    ("labs", "view"), ("labs", "create"), ("labs", "edit"), ("labs", "delete"),
    ("labs", "assign"), ("labs", "grade"),
    ("progress", "view"), ("progress", "create"), ("progress", "edit"), ("progress", "delete"),
    ("messages", "view"), ("messages", "create"), ("messages", "edit"), ("messages", "delete"),
    ("attendance", "view"), ("attendance", "create"), ("attendance", "edit"), ("attendance", "delete"),
    ("settings", "view"), ("settings", "create"), ("settings", "edit"), ("settings", "delete"),
    ("members", "view"), ("members", "create"), ("members", "edit"), ("members", "delete"),
    ("roles", "view"), ("roles", "create"), ("roles", "edit"), ("roles", "delete"),
    ("assets", "view"), ("assets", "create"), ("assets", "edit"), ("assets", "delete"),
    ("programs", "view"), ("programs", "create"), ("programs", "edit"), ("programs", "delete"),
    ("sessions", "cancel"), ("sessions", "reschedule"),
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
            if r not in ("roles",) or a in ("view",)
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
            "messages:view", "messages:create",
            "attendance:view", "attendance:create", "attendance:edit",
            "assets:view", "assets:create", "assets:edit",
            "programs:view",
            "sessions:cancel", "sessions:reschedule",
        ],
    },
    "parent": {
        "name": "Parent",
        "permissions": [
            "students:view",
            "progress:view",
            "messages:view", "messages:create",
            "classrooms:view",
            "assets:view",
            "sessions:cancel", "sessions:reschedule",
        ],
    },
    "homeschool_parent": {
        "name": "Homeschool Parent",
        "permissions": [
            "students:view", "students:create", "students:edit",
            "progress:view",
            "messages:view", "messages:create",
            "classrooms:view", "classrooms:create", "classrooms:edit",
            "labs:view", "labs:assign", "labs:grade",
            "assets:view", "assets:create",
            "sessions:cancel", "sessions:reschedule",
        ],
    },
}
