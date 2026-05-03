from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


def find_converter() -> str | None:
    return shutil.which("soffice") or shutil.which("libreoffice")


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python scripts/test_pptx_to_pdf.py path/to/file.pptx", file=sys.stderr)
        return 2

    input_path = Path(sys.argv[1]).expanduser().resolve()
    if not input_path.exists():
        print(f"Input file does not exist: {input_path}", file=sys.stderr)
        return 2
    if input_path.suffix.lower() not in {".pptx", ".ppt"}:
        print(f"Input is not a PowerPoint file: {input_path}", file=sys.stderr)
        return 2

    converter = find_converter()
    print(f"converter: {converter or ''}")
    if not converter:
        print("LibreOffice/soffice was not found on PATH.", file=sys.stderr)
        return 1

    out_dir = input_path.parent / f"{input_path.stem}_preview_test"
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        converter,
        "--headless",
        "--nologo",
        "--nofirststartwizard",
        "--convert-to",
        "pdf",
        "--outdir",
        str(out_dir),
        str(input_path),
    ]
    print("command:", " ".join(cmd))
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=120)
    except subprocess.TimeoutExpired:
        print("conversion timed out", file=sys.stderr)
        return 1

    stdout = (result.stdout or b"").decode("utf-8", errors="replace").strip()
    stderr = (result.stderr or b"").decode("utf-8", errors="replace").strip()
    print(f"return_code: {result.returncode}")
    print(f"stdout: {stdout}")
    print(f"stderr: {stderr}")
    if result.returncode != 0:
        return result.returncode or 1

    expected = out_dir / f"{input_path.stem}.pdf"
    pdf_path = expected if expected.exists() else next(iter(out_dir.glob("*.pdf")), expected)
    pdf_exists = pdf_path.exists()
    pdf_size = pdf_path.stat().st_size if pdf_exists else 0
    print(f"pdf_exists: {pdf_exists}")
    print(f"pdf_size: {pdf_size}")
    print(f"output_pdf_path: {pdf_path}")
    if not pdf_exists or pdf_size <= 0:
        print("Conversion did not produce a non-empty PDF.", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
