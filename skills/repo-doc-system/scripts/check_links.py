"""Report documentation pointers that lead nowhere: the links agents follow from one document to the next.

Checks, under a repository root:

- relative links in Markdown files (``[text](path)`` and ``[text](path#anchor)``), including that the anchor names a
  heading of the target file;
- ``docs/...md`` pointers in Python files, such as ``Usage: docs/developer/audit.md.`` in a package docstring.

Links inside code blocks and inline code are examples, not pointers, and are skipped. Exits 1 when anything is
broken. Standard library only: ``python check_links.py [root] [--exclude DIR ...]``.
"""

import argparse
import re
import sys
from collections.abc import Iterator
from pathlib import Path

SKIPPED_DIRS = {".git", ".venv", "node_modules", ".next", ".turbo", "dist", "build", "__pycache__", "templates"}
LINK = re.compile(r"\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
INLINE_CODE = re.compile(r"`[^`]*`")
FENCE = re.compile(r"^\s*(```|~~~)")
HEADING = re.compile(r"^#{1,6}\s+(.*?)\s*#*\s*$")
DOCS_POINTER = re.compile(r"(?<![\w/.-])docs/[\w./-]*\w\.md")
EXTERNAL = re.compile(r"^[a-z][a-z0-9+.-]*:", re.IGNORECASE)


def _files(root: Path, suffix: str, skipped: set[str]) -> Iterator[Path]:
    for path in sorted(root.rglob(f"*{suffix}")):
        if not skipped.intersection(path.relative_to(root).parts[:-1]):
            yield path


def _prose_lines(text: str) -> Iterator[tuple[int, str]]:
    """Yield each line outside fenced code blocks, and its 1-based number.

    Args:
        text: A Markdown document.

    Yields:
        ``(line number, line)`` pairs.
    """
    fence: str | None = None
    for number, line in enumerate(text.splitlines(), start=1):
        match = FENCE.match(line)
        if match:
            marker = match.group(1)
            fence = marker if fence is None else (None if marker == fence else fence)
            continue
        if fence is None:
            yield number, line


def slug(heading: str) -> str:
    """Return the anchor GitHub generates for a heading.

    Args:
        heading: The heading's text, without the leading ``#`` characters.

    Returns:
        Lowercase text with punctuation removed and spaces turned into hyphens.
    """
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", heading)  # a linked heading anchors on its text
    return re.sub(r"[^\w\- ]", "", text.replace("`", "").strip().lower()).replace(" ", "-")


def anchors(path: Path) -> set[str]:
    """Return every heading anchor of a Markdown file, numbering repeats as GitHub does (``-1``, ``-2``).

    Args:
        path: The Markdown file.

    Returns:
        The anchors.
    """
    found: set[str] = set()
    seen: dict[str, int] = {}
    for _, line in _prose_lines(path.read_text(encoding="utf-8")):
        match = HEADING.match(line)
        if match:
            base = slug(match.group(1))
            count = seen.get(base, 0)
            seen[base] = count + 1
            found.add(base if count == 0 else f"{base}-{count}")
    return found


def check(root: Path, skipped: set[str]) -> list[str]:
    """Return one message per broken pointer under ``root``.

    Args:
        root: The repository root.
        skipped: Directory names never searched.

    Returns:
        ``path:line: message`` strings, in file order.
    """
    problems: list[str] = []
    for path in _files(root, ".md", skipped):
        for number, line in _prose_lines(path.read_text(encoding="utf-8")):
            for target in LINK.findall(INLINE_CODE.sub("", line)):  # inline code holds examples, not pointers
                if EXTERNAL.match(target) or target.startswith("<"):
                    continue
                file_part, _, anchor = target.partition("#")
                resolved = path if not file_part else (path.parent / file_part).resolve()
                where = f"{path.relative_to(root)}:{number}"
                if not resolved.exists():
                    problems.append(f"{where}: no such file: {target}")
                elif anchor and resolved.suffix == ".md" and anchor.lower() not in anchors(resolved):
                    problems.append(f"{where}: no heading #{anchor} in {file_part or path.name}")
    for path in _files(root, ".py", skipped):
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            for pointer in DOCS_POINTER.findall(line):
                if not (root / pointer).exists():
                    problems.append(f"{path.relative_to(root)}:{number}: no such file: {pointer}")
    return problems


def main() -> int:
    """Check the repository named on the command line and print what is broken.

    Returns:
        The process exit code: 0 when every pointer resolves, else 1.
    """
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0] if __doc__ else None)
    parser.add_argument("root", nargs="?", default=".", type=Path, help="repository root (default: .)")
    parser.add_argument("--exclude", action="append", default=[], help="another directory name to skip")
    args = parser.parse_args()
    root: Path = args.root.resolve()
    problems = check(root, SKIPPED_DIRS | set(args.exclude))
    for problem in problems:
        print(problem)
    print(f"{len(problems)} broken pointer(s)." if problems else "Every pointer resolves.", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
