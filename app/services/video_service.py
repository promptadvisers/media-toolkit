"""
Video Splitting Service
Handles splitting videos into equal parts using FFmpeg
"""

import subprocess
import os
import tempfile
import zipfile
import io
import json
from pathlib import Path


# Supported video extensions
VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.m4v', '.mpeg', '.mpg', '.3gp'}


def get_video_duration(video_path: str) -> float:
    """Get the duration of a video file in seconds using ffprobe"""
    try:
        cmd = [
            'ffprobe',
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            video_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

        if result.returncode != 0:
            raise RuntimeError(f"ffprobe failed: {result.stderr}")

        info = json.loads(result.stdout)
        duration = float(info.get('format', {}).get('duration', 0))

        return duration

    except subprocess.TimeoutExpired:
        raise RuntimeError("Video analysis timed out")
    except Exception as e:
        raise RuntimeError(f"Failed to get video duration: {str(e)}")


def get_video_info(video_path: str) -> dict:
    """Get detailed information about a video file"""
    try:
        cmd = [
            'ffprobe',
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            video_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

        if result.returncode != 0:
            raise RuntimeError(f"ffprobe failed: {result.stderr}")

        info = json.loads(result.stdout)

        # Extract relevant info
        duration = float(info.get('format', {}).get('duration', 0))
        file_size = int(info.get('format', {}).get('size', 0))

        # Find video stream
        video_stream = None
        for stream in info.get('streams', []):
            if stream.get('codec_type') == 'video':
                video_stream = stream
                break

        width = video_stream.get('width', 0) if video_stream else 0
        height = video_stream.get('height', 0) if video_stream else 0
        codec = video_stream.get('codec_name', 'unknown') if video_stream else 'unknown'

        return {
            'duration': duration,
            'duration_formatted': format_duration(duration),
            'file_size': file_size,
            'width': width,
            'height': height,
            'codec': codec,
            'resolution': f"{width}x{height}" if width and height else 'unknown',
        }

    except subprocess.TimeoutExpired:
        raise RuntimeError("Video analysis timed out")
    except Exception as e:
        raise RuntimeError(f"Failed to analyze video: {str(e)}")


def format_duration(seconds: float) -> str:
    """Format duration in seconds to HH:MM:SS"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)

    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def split_video_direct(
    video_path: str,
    num_parts: int,
    output_dir: str = None
) -> list[str]:
    """
    Split a video directly to disk - fast, no memory buffering.

    Args:
        video_path: Path to the input video
        num_parts: Number of parts to split into (2-20)
        output_dir: Output directory (defaults to same as input)

    Returns:
        List of output file paths
    """
    num_parts = max(2, min(20, num_parts))

    path = Path(video_path)
    out_dir = Path(output_dir) if output_dir else path.parent
    out_dir.mkdir(parents=True, exist_ok=True)

    duration = get_video_duration(video_path)
    if duration <= 0:
        raise ValueError("Could not determine video duration")

    part_duration = duration / num_parts
    output_files = []

    for i in range(num_parts):
        output_path = out_dir / f"{path.stem}_part{i + 1}{path.suffix}"

        cmd = [
            'ffmpeg',
            '-ss', str(i * part_duration),  # Seek before input (faster)
            '-i', video_path,
            '-t', str(part_duration),
            '-c', 'copy',
            '-avoid_negative_ts', 'make_zero',
            '-y',
            str(output_path)
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

        if result.returncode != 0:
            # Fallback to re-encoding if copy fails
            cmd = [
                'ffmpeg',
                '-ss', str(i * part_duration),
                '-i', video_path,
                '-t', str(part_duration),
                '-c:v', 'libx264', '-c:a', 'aac',
                '-y',
                str(output_path)
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
            if result.returncode != 0:
                raise RuntimeError(f"FFmpeg failed for part {i + 1}: {result.stderr}")

        output_files.append(str(output_path))

    return output_files


def split_video(
    video_path: str,
    num_parts: int,
    output_format: str = None
) -> list[tuple[bytes, str]]:
    """
    Split a video into equal parts (legacy - buffers to memory).

    Args:
        video_path: Path to the input video
        num_parts: Number of parts to split into (2-20)
        output_format: Output format (None = same as input)

    Returns:
        List of tuples: (video bytes, filename)
    """
    # Validate num_parts
    num_parts = max(2, min(20, num_parts))

    # Get video duration
    duration = get_video_duration(video_path)
    if duration <= 0:
        raise ValueError("Could not determine video duration")

    # Calculate part duration
    part_duration = duration / num_parts

    # Determine output extension
    input_ext = Path(video_path).suffix.lower()
    output_ext = output_format if output_format else input_ext.lstrip('.')

    # Create temporary directory for output files
    temp_dir = tempfile.mkdtemp()
    parts = []

    try:
        original_stem = Path(video_path).stem

        for i in range(num_parts):
            start_time = i * part_duration
            part_filename = f"{original_stem}_part{i + 1}.{output_ext}"
            output_path = os.path.join(temp_dir, part_filename)

            # Build FFmpeg command
            cmd = [
                'ffmpeg',
                '-i', video_path,
                '-ss', str(start_time),
                '-t', str(part_duration),
                '-c', 'copy',  # Copy streams without re-encoding (fast)
                '-avoid_negative_ts', 'make_zero',
                '-y',
                output_path
            ]

            # Run FFmpeg
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=600  # 10 minute timeout per part
            )

            if result.returncode != 0:
                # If copy fails, try re-encoding
                cmd = [
                    'ffmpeg',
                    '-i', video_path,
                    '-ss', str(start_time),
                    '-t', str(part_duration),
                    '-c:v', 'libx264',
                    '-c:a', 'aac',
                    '-y',
                    output_path
                ]
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=600
                )

                if result.returncode != 0:
                    raise RuntimeError(f"FFmpeg failed for part {i + 1}: {result.stderr}")

            # Read the output file
            with open(output_path, 'rb') as f:
                video_bytes = f.read()

            parts.append((video_bytes, part_filename))

        return parts

    except subprocess.TimeoutExpired:
        raise RuntimeError("Video splitting timed out")
    finally:
        # Clean up temp directory
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)


def split_video_to_zip(
    video_path: str,
    num_parts: int,
    output_format: str = None
) -> bytes:
    """
    Split a video into equal parts and return as a ZIP file.

    Args:
        video_path: Path to the input video
        num_parts: Number of parts to split into
        output_format: Output format (None = same as input)

    Returns:
        ZIP file bytes containing all parts
    """
    parts = split_video(video_path, num_parts, output_format)

    # Create ZIP file in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for video_bytes, filename in parts:
            zip_file.writestr(filename, video_bytes)

    return zip_buffer.getvalue()


def get_part_info(duration: float, num_parts: int) -> list[dict]:
    """Get information about how the video will be split"""
    part_duration = duration / num_parts
    parts = []

    for i in range(num_parts):
        start_time = i * part_duration
        end_time = min((i + 1) * part_duration, duration)

        parts.append({
            'part': i + 1,
            'start': format_duration(start_time),
            'end': format_duration(end_time),
            'duration': format_duration(end_time - start_time),
        })

    return parts
