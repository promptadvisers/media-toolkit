"""
Image Conversion Router
API endpoints for image format conversion
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import Response, StreamingResponse
import tempfile
import os
import io
import zipfile
from pathlib import Path
from typing import List

from app.services.image_service import (
    convert_image,
    get_image_info,
    get_supported_formats,
    FORMAT_MAP,
)
from app.config import settings

router = APIRouter()

# Allowed image extensions (including HEIC/HEIF from iPhone)
ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff', '.tif', '.heic', '.heif'}


def validate_image_file(filename: str) -> bool:
    """Check if file has an allowed image extension"""
    ext = Path(filename).suffix.lower()
    return ext in ALLOWED_EXTENSIONS


@router.get("/formats")
async def list_formats():
    """Get list of supported output formats"""
    return {
        "formats": get_supported_formats(),
        "quality_formats": ["jpg", "jpeg", "webp"],
    }


@router.post("/info")
async def image_info(file: UploadFile = File(...)):
    """Get information about an uploaded image"""
    if not validate_image_file(file.filename):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Save to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        info = get_image_info(tmp_path)
        return info
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read image: {str(e)}")
    finally:
        os.unlink(tmp_path)


@router.post("/convert")
async def convert_image_endpoint(
    file: UploadFile = File(...),
    output_format: str = Form(...),
    quality: int = Form(default=85),
):
    """
    Convert an image to a different format.

    - **file**: The image file to convert
    - **output_format**: Target format (png, jpg, webp, gif, bmp, tiff)
    - **quality**: Quality for lossy formats like JPG/WEBP (1-100, default 85)
    """
    # Validate file type
    if not validate_image_file(file.filename):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Validate output format
    output_format = output_format.lower()
    if output_format not in FORMAT_MAP:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid output format. Allowed: {', '.join(FORMAT_MAP.keys())}"
        )

    # Validate quality
    quality = max(1, min(100, quality))

    # Save uploaded file to temp location
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Convert the image
        output_bytes, mime_type = convert_image(tmp_path, output_format, quality)

        # Generate output filename
        original_stem = Path(file.filename).stem
        output_filename = f"{original_stem}.{output_format}"

        # Return the converted image
        return Response(
            content=output_bytes,
            media_type=mime_type,
            headers={
                "Content-Disposition": f'attachment; filename="{output_filename}"',
                "X-Original-Size": str(len(content)),
                "X-Converted-Size": str(len(output_bytes)),
            }
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")
    finally:
        # Clean up temp file
        os.unlink(tmp_path)


@router.post("/convert-single")
async def convert_single_image(
    file: UploadFile = File(...),
    output_format: str = Form(...),
    quality: int = Form(default=85),
):
    """
    Convert a single image and return as base64 (for bulk progress tracking).
    Returns JSON with the converted image data.
    """
    # Validate file type
    if not validate_image_file(file.filename):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Validate output format
    output_format = output_format.lower()
    if output_format not in FORMAT_MAP:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid output format. Allowed: {', '.join(FORMAT_MAP.keys())}"
        )

    # Validate quality
    quality = max(1, min(100, quality))

    # Save uploaded file to temp location
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Convert the image
        output_bytes, mime_type = convert_image(tmp_path, output_format, quality)

        # Generate output filename
        original_stem = Path(file.filename).stem
        output_filename = f"{original_stem}.{output_format}"

        import base64
        return {
            "success": True,
            "filename": output_filename,
            "original_filename": file.filename,
            "data": base64.b64encode(output_bytes).decode('utf-8'),
            "size": len(output_bytes),
            "mime_type": mime_type,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")
    finally:
        os.unlink(tmp_path)


@router.post("/create-zip")
async def create_zip_from_images(images: list = None):
    """
    Create a ZIP file from base64-encoded images sent in the request body.
    This is called after all individual conversions are complete.
    """
    from fastapi import Request, Body
    import base64

    # Receive JSON body directly
    pass  # We'll use a different approach - create zip client-side with JSZip


@router.post("/convert-bulk")
async def convert_images_bulk(
    files: List[UploadFile] = File(...),
    output_format: str = Form(...),
    quality: int = Form(default=85),
):
    """
    Convert multiple images to a different format and return as ZIP.
    (Legacy endpoint - kept for compatibility)

    - **files**: The image files to convert
    - **output_format**: Target format (png, jpg, webp, gif, bmp, tiff)
    - **quality**: Quality for lossy formats like JPG/WEBP (1-100, default 85)
    """
    # Validate output format
    output_format = output_format.lower()
    if output_format not in FORMAT_MAP:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid output format. Allowed: {', '.join(FORMAT_MAP.keys())}"
        )

    # Validate quality
    quality = max(1, min(100, quality))

    # Create in-memory zip file
    zip_buffer = io.BytesIO()
    converted_count = 0
    errors = []

    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for file in files:
            # Validate file type
            if not validate_image_file(file.filename):
                errors.append(f"{file.filename}: Invalid file type")
                continue

            # Save uploaded file to temp location
            try:
                with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
                    content = await file.read()
                    tmp.write(content)
                    tmp_path = tmp.name

                # Convert the image
                output_bytes, _ = convert_image(tmp_path, output_format, quality)

                # Generate output filename
                original_stem = Path(file.filename).stem
                output_filename = f"{original_stem}.{output_format}"

                # Add to zip
                zip_file.writestr(output_filename, output_bytes)
                converted_count += 1

            except Exception as e:
                errors.append(f"{file.filename}: {str(e)}")
            finally:
                # Clean up temp file
                if 'tmp_path' in locals():
                    os.unlink(tmp_path)

    if converted_count == 0:
        raise HTTPException(
            status_code=400,
            detail=f"No images could be converted. Errors: {'; '.join(errors)}"
        )

    # Prepare zip for download
    zip_buffer.seek(0)

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="converted_images.zip"',
            "X-Converted-Count": str(converted_count),
            "X-Error-Count": str(len(errors)),
        }
    )
