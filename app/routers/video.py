"""
Video Splitting Router
API endpoints for splitting videos into equal parts
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from pydantic import BaseModel
from pathlib import Path
from typing import Optional
import tempfile
import shutil
import zipfile
import io

from app.services.video_service import (
    get_video_info,
    get_video_duration,
    split_video_direct,
    get_part_info,
    VIDEO_EXTENSIONS,
    QUALITY_PRESETS,
    RESOLUTION_PRESETS,
    compress_video_target_size,
    compress_video_quality,
    compress_video_resolution,
    estimate_compressed_size,
)

router = APIRouter()


class LocalFileRequest(BaseModel):
    """Request model for local file operations"""
    file_path: str
    num_parts: int = 2


class VideoInfoRequest(BaseModel):
    """Request model for video info"""
    file_path: str


class CompressTargetSizeRequest(BaseModel):
    """Request for target size compression"""
    file_path: str
    target_size_mb: float  # e.g., 900 for 900MB
    output_path: Optional[str] = None


class CompressQualityRequest(BaseModel):
    """Request for quality-based compression"""
    file_path: str
    quality: str = 'medium'  # 'low', 'medium', 'high'
    output_path: Optional[str] = None


class CompressResolutionRequest(BaseModel):
    """Request for resolution-based compression"""
    file_path: str
    resolution: str  # '720p', '1080p', '480p', etc.
    quality: str = 'medium'
    output_path: Optional[str] = None


class EstimateRequest(BaseModel):
    """Request for compression estimate"""
    file_path: str
    mode: str  # 'target_size', 'quality', 'resolution'
    target_size_mb: Optional[float] = None
    quality: Optional[str] = None
    resolution: Optional[str] = None


def validate_video_path(file_path: str) -> Path:
    """Validate that the file exists and is a video"""
    path = Path(file_path)

    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

    if not path.is_file():
        raise HTTPException(status_code=400, detail=f"Not a file: {file_path}")

    if path.suffix.lower() not in VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(VIDEO_EXTENSIONS)}"
        )

    return path


@router.post("/info")
async def video_info(file: UploadFile = File(...)):
    """Get information about an uploaded video file"""
    # Validate file type
    ext = Path(file.filename).suffix.lower()
    if ext not in VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(VIDEO_EXTENSIONS)}"
        )

    # Save to temp file
    temp_dir = tempfile.mkdtemp()
    temp_path = Path(temp_dir) / file.filename

    try:
        with open(temp_path, 'wb') as f:
            shutil.copyfileobj(file.file, f)

        info = get_video_info(str(temp_path))
        info['filename'] = file.filename
        info['file_size'] = temp_path.stat().st_size
        return info
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not analyze video: {str(e)}")
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@router.post("/split")
async def split_video_upload(
    file: UploadFile = File(...),
    num_parts: int = Form(default=2)
):
    """
    Split an uploaded video into equal parts.
    Returns a ZIP file containing all parts.
    """
    ext = Path(file.filename).suffix.lower()
    if ext not in VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(VIDEO_EXTENSIONS)}"
        )

    num_parts = max(2, min(20, num_parts))
    temp_dir = tempfile.mkdtemp()
    temp_path = Path(temp_dir) / file.filename
    output_dir = Path(temp_dir) / "output"
    output_dir.mkdir()

    try:
        # Save uploaded file
        with open(temp_path, 'wb') as f:
            shutil.copyfileobj(file.file, f)

        # Split the video
        output_files = split_video_direct(str(temp_path), num_parts, str(output_dir))

        # Create ZIP in memory
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            for filepath in output_files:
                zf.write(filepath, Path(filepath).name)

        zip_bytes = zip_buffer.getvalue()
        stem = Path(file.filename).stem
        zip_filename = f"{stem}_split_{num_parts}parts.zip"

        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{zip_filename}"',
                "X-Num-Parts": str(num_parts),
            }
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Splitting failed: {str(e)}")
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@router.post("/info-local")
async def video_info_local(request: VideoInfoRequest):
    """Get information about a local video file (no upload needed)"""
    path = validate_video_path(request.file_path)

    try:
        info = get_video_info(str(path))
        info['filename'] = path.name
        info['file_path'] = str(path)
        info['file_size'] = path.stat().st_size
        return info
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not analyze video: {str(e)}")


@router.post("/split-local")
async def split_video_local(request: LocalFileRequest):
    """
    Split a local video file into equal parts - saves directly to disk.

    - **file_path**: Absolute path to the video file
    - **num_parts**: Number of parts to split into (2-20)
    """
    path = validate_video_path(request.file_path)
    num_parts = max(2, min(20, request.num_parts))

    try:
        output_files = split_video_direct(str(path), num_parts)
        return {
            "success": True,
            "message": f"Split into {num_parts} parts",
            "files": output_files,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Splitting failed: {str(e)}")


@router.post("/split-local-to-folder")
async def split_video_local_to_folder(
    request: LocalFileRequest,
    output_folder: Optional[str] = None
):
    """
    Split a local video and save parts to a specific folder.

    - **file_path**: Absolute path to the video file
    - **num_parts**: Number of parts to split into (2-20)
    - **output_folder**: Where to save the parts (defaults to same folder as input)
    """
    path = validate_video_path(request.file_path)
    num_parts = max(2, min(20, request.num_parts))

    try:
        output_files = split_video_direct(str(path), num_parts, output_folder)
        return {
            "success": True,
            "message": f"Split into {num_parts} parts",
            "files": output_files,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Splitting failed: {str(e)}")


@router.post("/preview-local")
async def preview_split_local(request: LocalFileRequest):
    """
    Preview how a local video will be split without actually splitting it.
    """
    path = validate_video_path(request.file_path)

    # Validate num_parts
    num_parts = max(2, min(20, request.num_parts))

    try:
        duration = get_video_duration(str(path))
        parts = get_part_info(duration, num_parts)

        return {
            "filename": path.name,
            "file_path": str(path),
            "total_duration": duration,
            "num_parts": num_parts,
            "parts": parts,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not analyze video: {str(e)}")


# ============================================
# Video Compression Endpoints
# ============================================

@router.post("/compress/target-size")
async def compress_target_size_local(request: CompressTargetSizeRequest):
    """
    Compress a local video to a target file size.
    Uses two-pass encoding for accurate size targeting.
    """
    path = validate_video_path(request.file_path)

    try:
        output_file = compress_video_target_size(
            str(path),
            request.target_size_mb,
            request.output_path
        )
        output_size = Path(output_file).stat().st_size
        original_size = path.stat().st_size

        return {
            "success": True,
            "message": f"Compressed to {output_size / 1024 / 1024:.1f} MB",
            "output_file": output_file,
            "original_size": original_size,
            "compressed_size": output_size,
            "reduction_percent": round((1 - output_size / original_size) * 100, 1),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Compression failed: {str(e)}")


@router.post("/compress/quality")
async def compress_quality_local(request: CompressQualityRequest):
    """
    Compress a local video using quality presets.
    Options: 'low', 'medium', 'high'
    """
    path = validate_video_path(request.file_path)

    try:
        output_file = compress_video_quality(
            str(path),
            request.quality,
            request.output_path
        )
        output_size = Path(output_file).stat().st_size
        original_size = path.stat().st_size

        return {
            "success": True,
            "message": f"Compressed to {output_size / 1024 / 1024:.1f} MB",
            "output_file": output_file,
            "original_size": original_size,
            "compressed_size": output_size,
            "reduction_percent": round((1 - output_size / original_size) * 100, 1),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Compression failed: {str(e)}")


@router.post("/compress/resolution")
async def compress_resolution_local(request: CompressResolutionRequest):
    """
    Compress a local video by downscaling resolution.
    Options: '2160p', '1440p', '1080p', '720p', '480p', '360p'
    """
    path = validate_video_path(request.file_path)

    try:
        output_file = compress_video_resolution(
            str(path),
            request.resolution,
            request.quality,
            request.output_path
        )
        output_size = Path(output_file).stat().st_size
        original_size = path.stat().st_size

        return {
            "success": True,
            "message": f"Compressed to {output_size / 1024 / 1024:.1f} MB",
            "output_file": output_file,
            "original_size": original_size,
            "compressed_size": output_size,
            "reduction_percent": round((1 - output_size / original_size) * 100, 1),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Compression failed: {str(e)}")


@router.post("/compress/estimate")
async def estimate_compression(request: EstimateRequest):
    """
    Estimate compressed file size before processing.
    Useful for UI preview.
    """
    path = validate_video_path(request.file_path)

    try:
        estimate = estimate_compressed_size(
            str(path),
            request.mode,
            target_size_mb=request.target_size_mb,
            quality=request.quality,
            resolution=request.resolution
        )
        return estimate
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/compress/options")
async def get_compression_options():
    """
    Get available compression options (quality presets, resolutions).
    """
    return {
        "quality_presets": list(QUALITY_PRESETS.keys()),
        "resolutions": list(RESOLUTION_PRESETS.keys()),
    }
