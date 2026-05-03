from __future__ import annotations

import sys
import uuid
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python scripts/test_pptx_preview.py <path_to_pptx>", file=sys.stderr)
        return 2

    pptx_path = Path(sys.argv[1]).expanduser().resolve()
    if not pptx_path.exists() or pptx_path.suffix.lower() != ".pptx":
        print(f"Not a PPTX file: {pptx_path}", file=sys.stderr)
        return 2

    repo_root = Path(__file__).resolve().parents[1]
    backend_root = repo_root / "backend"
    sys.path.insert(0, str(backend_root))

    from app.services.pptx_preview import converted_pdf_path, ensure_pptx_preview

    document_id = f"preview-test-{uuid.uuid4().hex}"
    _slides, error = ensure_pptx_preview(
        pptx_path.read_bytes(),
        document_id,
        original_file_path=str(pptx_path),
    )
    pdf_path = converted_pdf_path(document_id)
    pdf_size = pdf_path.stat().st_size if pdf_path.exists() else 0

    print(f"Generated PDF path: {pdf_path}")
    print(f"PDF size: {pdf_size}")
    if error:
        print(f"Conversion error: {error}", file=sys.stderr)
    return 0 if pdf_path.exists() and pdf_size > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

