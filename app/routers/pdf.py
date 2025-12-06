"""
PDF Router
API endpoints for PDF merging and splitting
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import Response
import tempfile
import os
from pathlib import Path
from typing import List

from app.services.pdf_service import (
    get_pdf_info,
    merge_pdfs,
    split_pdf_by_ranges,
    create_split_zip,
)

router = APIRouter()


def validate_pdf_file(filename: str) -> bool:
    """Check if file has .pdf extension"""
    return Path(filename).suffix.lower() == '.pdf'


@router.post("/info")
async def pdf_info(file: UploadFile = File(...)):
    """Get information about a PDF file"""
    if not validate_pdf_file(file.filename):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        info = get_pdf_info(tmp_path)
        return info
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read PDF: {str(e)}")
    finally:
        os.unlink(tmp_path)


@router.post("/merge")
async def merge_pdfs_endpoint(files: List[UploadFile] = File(...)):
    """
    Merge multiple PDFs into one.

    - **files**: List of PDF files to merge (in order)
    """
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 PDFs to merge")

    # Validate all files are PDFs
    for f in files:
        if not validate_pdf_file(f.filename):
            raise HTTPException(
                status_code=400,
                detail=f"File '{f.filename}' is not a PDF"
            )

    # Save files to temp locations
    temp_paths = []
    try:
        for f in files:
            with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
                content = await f.read()
                tmp.write(content)
                temp_paths.append(tmp.name)

        # Merge PDFs
        merged_bytes = merge_pdfs(temp_paths)

        # Generate output filename
        output_filename = "merged.pdf"

        return Response(
            content=merged_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{output_filename}"',
            }
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Merge failed: {str(e)}")
    finally:
        # Clean up temp files
        for path in temp_paths:
            if os.path.exists(path):
                os.unlink(path)


@router.post("/split")
async def split_pdf_endpoint(
    file: UploadFile = File(...),
    pages: str = Form(default=""),
    mode: str = Form(default="all"),
):
    """
    Split a PDF into pages.

    - **file**: The PDF file to split
    - **pages**: Page specification (e.g., "1,3,5-7") - only used if mode is "range"
    - **mode**: "all" to split into individual pages (returns ZIP), or "range" to extract specific pages
    """
    if not validate_pdf_file(file.filename):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        original_stem = Path(file.filename).stem

        if mode == "all":
            # Split into all pages, return as ZIP
            zip_bytes = create_split_zip(tmp_path)

            return Response(
                content=zip_bytes,
                media_type="application/zip",
                headers={
                    "Content-Disposition": f'attachment; filename="{original_stem}_pages.zip"',
                }
            )
        else:
            # Extract specific pages
            if not pages:
                raise HTTPException(
                    status_code=400,
                    detail="Please specify pages to extract (e.g., '1,3,5-7')"
                )

            extracted_bytes = split_pdf_by_ranges(tmp_path, pages)

            return Response(
                content=extracted_bytes,
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f'attachment; filename="{original_stem}_extracted.pdf"',
                }
            )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Split failed: {str(e)}")
    finally:
        os.unlink(tmp_path)
