"""
PDF Service
Handles PDF merging and splitting using pypdf
"""

from pypdf import PdfReader, PdfWriter
import io
from pathlib import Path
import zipfile
import re


def get_pdf_info(pdf_path: str) -> dict:
    """Get information about a PDF file"""
    reader = PdfReader(pdf_path)
    file_path = Path(pdf_path)

    return {
        'filename': file_path.name,
        'num_pages': len(reader.pages),
        'size_bytes': file_path.stat().st_size,
    }


def merge_pdfs(pdf_paths: list[str]) -> bytes:
    """
    Merge multiple PDFs into one.

    Args:
        pdf_paths: List of paths to PDF files (in order)

    Returns:
        Merged PDF as bytes
    """
    writer = PdfWriter()

    for pdf_path in pdf_paths:
        reader = PdfReader(pdf_path)
        for page in reader.pages:
            writer.add_page(page)

    output_buffer = io.BytesIO()
    writer.write(output_buffer)
    return output_buffer.getvalue()


def parse_page_ranges(page_spec: str, total_pages: int) -> list[int]:
    """
    Parse page specification string into list of page numbers (0-indexed).

    Examples:
        "1,3,5" -> [0, 2, 4]
        "1-5" -> [0, 1, 2, 3, 4]
        "1,3-5,7" -> [0, 2, 3, 4, 6]
        "all" or "" -> [0, 1, 2, ..., total_pages-1]

    Args:
        page_spec: Page specification string (1-indexed for user)
        total_pages: Total number of pages in the PDF

    Returns:
        List of 0-indexed page numbers
    """
    if not page_spec or page_spec.lower() == 'all':
        return list(range(total_pages))

    pages = set()
    parts = page_spec.replace(' ', '').split(',')

    for part in parts:
        if '-' in part:
            # Range like "1-5"
            match = re.match(r'^(\d+)-(\d+)$', part)
            if match:
                start = int(match.group(1))
                end = int(match.group(2))
                # Convert to 0-indexed and add to set
                for p in range(start - 1, end):
                    if 0 <= p < total_pages:
                        pages.add(p)
        else:
            # Single page like "3"
            try:
                p = int(part) - 1  # Convert to 0-indexed
                if 0 <= p < total_pages:
                    pages.add(p)
            except ValueError:
                continue

    return sorted(pages)


def split_pdf_all_pages(pdf_path: str, output_dir: str) -> list[dict]:
    """
    Split a PDF into individual pages.

    Args:
        pdf_path: Path to the PDF file
        output_dir: Directory to save individual pages

    Returns:
        List of dicts with filename and path for each page
    """
    reader = PdfReader(pdf_path)
    original_name = Path(pdf_path).stem
    output_files = []

    for i, page in enumerate(reader.pages):
        writer = PdfWriter()
        writer.add_page(page)

        output_filename = f"{original_name}_page_{i + 1:03d}.pdf"
        output_path = Path(output_dir) / output_filename

        with open(output_path, 'wb') as f:
            writer.write(f)

        output_files.append({
            'filename': output_filename,
            'path': str(output_path),
            'page_num': i + 1,
        })

    return output_files


def split_pdf_by_ranges(pdf_path: str, page_spec: str) -> bytes:
    """
    Extract specific pages from a PDF.

    Args:
        pdf_path: Path to the PDF file
        page_spec: Page specification (e.g., "1,3,5-7")

    Returns:
        New PDF with only the specified pages as bytes
    """
    reader = PdfReader(pdf_path)
    total_pages = len(reader.pages)
    pages_to_extract = parse_page_ranges(page_spec, total_pages)

    if not pages_to_extract:
        raise ValueError("No valid pages specified")

    writer = PdfWriter()
    for page_idx in pages_to_extract:
        writer.add_page(reader.pages[page_idx])

    output_buffer = io.BytesIO()
    writer.write(output_buffer)
    return output_buffer.getvalue()


def create_split_zip(pdf_path: str) -> bytes:
    """
    Split a PDF into individual pages and return as ZIP.

    Args:
        pdf_path: Path to the PDF file

    Returns:
        ZIP file containing all individual pages as bytes
    """
    reader = PdfReader(pdf_path)
    original_name = Path(pdf_path).stem

    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for i, page in enumerate(reader.pages):
            writer = PdfWriter()
            writer.add_page(page)

            # Write page to bytes
            page_buffer = io.BytesIO()
            writer.write(page_buffer)

            # Add to zip
            filename = f"{original_name}_page_{i + 1:03d}.pdf"
            zip_file.writestr(filename, page_buffer.getvalue())

    return zip_buffer.getvalue()
