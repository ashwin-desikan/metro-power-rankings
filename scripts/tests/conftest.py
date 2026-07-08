import importlib.util
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent.parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))


def load_module_from_path(module_name, filename):
    """Import a scripts/*.py file whose name isn't a valid Python identifier
    (e.g. 'stage-leagues.py' has a hyphen), so `import stage_leagues` can't
    work. Safe here because every script under test only defines
    functions/constants at module scope and gates its side effects behind
    `if __name__ == "__main__":`."""
    path = SCRIPTS_DIR / filename
    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
