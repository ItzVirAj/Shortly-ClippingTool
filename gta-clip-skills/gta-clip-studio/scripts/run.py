"""run.cmd / run.sh entry:  run <tool> [args...]   tool = clipwatch | clipdesk | voice | pro_short | make_sfx"""
import runpy, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOOLS = {"clipwatch": HERE / "clipwatch.py", "clipdesk": HERE / "clipdesk.py", "voice": HERE / "voice.py",
         "pro_short": HERE / "shorts" / "pro_short.py", "make_sfx": HERE / "make_sfx.py"}

if len(sys.argv) < 2 or sys.argv[1] not in TOOLS:
    sys.exit(f"usage: run <{'|'.join(TOOLS)}> [args...]")
tool = TOOLS[sys.argv[1]]
sys.argv = [str(tool)] + sys.argv[2:]
sys.path.insert(0, str(tool.parent))
runpy.run_path(str(tool), run_name="__main__")
