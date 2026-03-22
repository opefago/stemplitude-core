"""Central configuration directory.

All JSON registry files live here: plans, capabilities, permissions,
email providers, and jobs.  Use ``CONFIG_DIR`` for path resolution.
"""

from pathlib import Path

CONFIG_DIR = Path(__file__).resolve().parent
