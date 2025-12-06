"""
Audio Extraction Router
API endpoints for extracting audio from video files
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import Response
import tempfile
import os
from pathlib import Path

from app.services.audio_service import (
    extract_audio,
    get_video_info,
    get_supported_formats,
    get_bitrate_options,
    AUDIO_FORMATS,
    BITRATE_OPTIONS,
    VIDEO_EXTENSIONS,
)

router = APIRouter()


def validate_video_file(filename: str) -> bool:
    """Check if file has an allowed video extension"""
    ext = Path(filename).suffix.lower()
    return ext in VIDEO_EXTENSIONS


@router.get("/formats")
async def list_formats():
    """Get list of supported audio formats and bitrate options"""
    return {
        "formats": get_supported_formats(),
        "bitrates": get_bitrate_options(),
    }


@router.post("/info")
async def video_info(file: UploadFile = File(...)):
    """Get audio information about an uploaded video"""
    if not validate_video_file(file.filename):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed video formats: {', '.join(VIDEO_EXTENSIONS)}"
        )

    # Save to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        info = get_video_info(tmp_path)
        info['filename'] = file.filename
        info['file_size'] = len(content)
        return info
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not analyze video: {str(e)}")
    finally:
        os.unlink(tmp_path)


@router.post("/extract")
async def extract_audio_endpoint(
    file: UploadFile = File(...),
    output_format: str = Form(default="mp3"),
    bitrate: str = Form(default="192"),
):
    """
    Extract audio from a video file.

    - **file**: The video file to extract audio from
    - **output_format**: Target audio format (mp3, aac, wav, flac, ogg)
    - **bitrate**: Bitrate in kbps (64, 128, 192, 256, 320) - ignored for wav/flac
    """
    # Validate file type
    if not validate_video_file(file.filename):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed video formats: {', '.join(VIDEO_EXTENSIONS)}"
        )

    # Validate output format
    output_format = output_format.lower()
    if output_format not in AUDIO_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid output format. Allowed: {', '.join(AUDIO_FORMATS.keys())}"
        )

    # Validate bitrate
    if bitrate not in BITRATE_OPTIONS:
        bitrate = "192"

    # Save uploaded file to temp location
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Extract audio
        audio_bytes, mime_type, extension = extract_audio(tmp_path, output_format, bitrate)

        # Generate output filename
        original_stem = Path(file.filename).stem
        output_filename = f"{original_stem}.{extension}"

        # Return the extracted audio
        return Response(
            content=audio_bytes,
            media_type=mime_type,
            headers={
                "Content-Disposition": f'attachment; filename="{output_filename}"',
                "X-Original-Size": str(len(content)),
                "X-Audio-Size": str(len(audio_bytes)),
            }
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")
    finally:
        # Clean up temp file
        os.unlink(tmp_path)
