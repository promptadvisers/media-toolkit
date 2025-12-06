"""
AI Image Router
API endpoints for AI-powered image generation and editing
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import Response
import tempfile
import os
from pathlib import Path

from app.services.ai_image_service import (
    generate_image,
    edit_image,
    get_preset_prompts,
    AIImageError,
)

router = APIRouter()

# Allowed image extensions for editing
ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.heif'}


def validate_image_file(filename: str) -> bool:
    """Check if file has an allowed image extension"""
    ext = Path(filename).suffix.lower()
    return ext in ALLOWED_EXTENSIONS


@router.get("/presets")
async def get_presets():
    """Get preset prompts for generation and editing"""
    return get_preset_prompts()


@router.post("/generate")
async def generate_image_endpoint(
    prompt: str = Form(...),
):
    """
    Generate an image from a text prompt using Gemini AI.

    - **prompt**: Text description of the image to generate
    """
    if not prompt or len(prompt.strip()) < 3:
        raise HTTPException(
            status_code=400,
            detail="Please provide a valid prompt (at least 3 characters)"
        )

    try:
        # Generate the image
        image_bytes, mime_type = await generate_image(prompt.strip())

        # Determine file extension from mime type
        ext_map = {
            "image/png": "png",
            "image/jpeg": "jpg",
            "image/webp": "webp",
            "image/gif": "gif",
        }
        ext = ext_map.get(mime_type, "png")

        # Return the generated image
        return Response(
            content=image_bytes,
            media_type=mime_type,
            headers={
                "Content-Disposition": f'attachment; filename="generated_image.{ext}"',
                "X-Image-Size": str(len(image_bytes)),
            }
        )

    except AIImageError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


@router.post("/edit")
async def edit_image_endpoint(
    file: UploadFile = File(...),
    prompt: str = Form(...),
):
    """
    Edit an existing image using AI.

    - **file**: The image file to edit
    - **prompt**: Instructions for how to edit the image
    """
    # Validate file type
    if not validate_image_file(file.filename):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    if not prompt or len(prompt.strip()) < 3:
        raise HTTPException(
            status_code=400,
            detail="Please provide valid editing instructions (at least 3 characters)"
        )

    # Save uploaded file to temp location
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Edit the image
        edited_bytes, mime_type = await edit_image(tmp_path, prompt.strip())

        # Determine file extension from mime type
        ext_map = {
            "image/png": "png",
            "image/jpeg": "jpg",
            "image/webp": "webp",
            "image/gif": "gif",
        }
        ext = ext_map.get(mime_type, "png")

        # Generate output filename
        original_stem = Path(file.filename).stem
        output_filename = f"{original_stem}_edited.{ext}"

        # Return the edited image
        return Response(
            content=edited_bytes,
            media_type=mime_type,
            headers={
                "Content-Disposition": f'attachment; filename="{output_filename}"',
                "X-Original-Size": str(len(content)),
                "X-Edited-Size": str(len(edited_bytes)),
            }
        )

    except AIImageError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Editing failed: {str(e)}")
    finally:
        # Clean up temp file
        os.unlink(tmp_path)


@router.post("/edit-local")
async def edit_local_image_endpoint(
    file_path: str = Form(...),
    prompt: str = Form(...),
):
    """
    Edit an image from a local file path using AI.

    - **file_path**: Path to the local image file
    - **prompt**: Instructions for how to edit the image
    """
    # Validate path
    path = Path(file_path)
    if not path.exists():
        raise HTTPException(
            status_code=400,
            detail=f"File not found: {file_path}"
        )

    if not validate_image_file(path.name):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    if not prompt or len(prompt.strip()) < 3:
        raise HTTPException(
            status_code=400,
            detail="Please provide valid editing instructions (at least 3 characters)"
        )

    try:
        # Edit the image
        edited_bytes, mime_type = await edit_image(str(path), prompt.strip())

        # Determine file extension from mime type
        ext_map = {
            "image/png": "png",
            "image/jpeg": "jpg",
            "image/webp": "webp",
            "image/gif": "gif",
        }
        ext = ext_map.get(mime_type, "png")

        # Generate output filename
        output_filename = f"{path.stem}_edited.{ext}"

        # Return the edited image
        return Response(
            content=edited_bytes,
            media_type=mime_type,
            headers={
                "Content-Disposition": f'attachment; filename="{output_filename}"',
                "X-Edited-Size": str(len(edited_bytes)),
            }
        )

    except AIImageError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Editing failed: {str(e)}")
