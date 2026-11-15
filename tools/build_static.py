"""Build the static website folder:  python tools/build_static.py  ->  static_site/

web/ is the source of the site (plain HTML/CSS/JS, no bundler). static_site/ is an exact copy of it, kept in git so
that hosts which only serve a folder from the repository (Vercel: Root Directory = static_site) need no build step.
Run tools/export_site.py first if the results changed."""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / "web", ROOT / "static_site"


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(SRC, OUT)
    n = sum(1 for p in OUT.rglob("*") if p.is_file())
    print(f"static_site/ built from web/: {n} files")


if __name__ == "__main__":
    main()
