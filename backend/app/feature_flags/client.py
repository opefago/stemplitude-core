"""Feature flag provider hook.

This module remains as a compatibility shim while the internal provider is
the default runtime engine.
"""


def get_flagsmith_client():
    """Legacy shim kept for backward compatibility."""
    return None
