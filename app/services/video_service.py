"""
Video Processing Service
Handles splitting videos into equal parts and compression using FFmpeg
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

# Quality preset CRF values (lower = higher quality, larger file)
QUALITY_PRESETS = {
    'high': {'crf': 18, 'audio_bitrate': '192k', 'preset': 'slow'},
    'medium': {'crf': 23, 'audio_bitrate': '128k', 'preset': 'medium'},
    'low': {'crf': 28, 'audio_bitrate': '96k', 'preset': 'fast'},
}

# Resolution presets (height values, width calculated to maintain aspect ratio)
RESOLUTION_PRESETS = {
    '2160p': 2160,
    '1440p': 1440,
    '1080p': 1080,
    '720p': 720,
    '480p': 480,
    '360p': 360,
}


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


# ============================================
# Video Compression Functions
# ============================================

def calculate_target_bitrate(target_size_mb: float, duration_seconds: float, audio_bitrate_kbps: int = 128) -> int:
    """
    Calculate target video bitrate to achieve desired file size.

    Formula: video_bitrate = (target_size_bytes * 8 / duration_seconds) - audio_bitrate

    Returns bitrate in kbps
    """
    target_size_bytes = target_size_mb * 1024 * 1024
    total_bitrate_bps = (target_size_bytes * 8) / duration_seconds
    video_bitrate_kbps = int((total_bitrate_bps / 1000) - audio_bitrate_kbps)

    # Minimum viable video bitrate (500 kbps)
    return max(video_bitrate_kbps, 500)


def compress_video_target_size(
    video_path: str,
    target_size_mb: float,
    output_path: str = None
) -> str:
    """
    Compress video to target file size using two-pass encoding.

    Uses libx264 for video and aac for audio.
    Two-pass encoding provides better quality distribution.
    """
    # Get video info
    info = get_video_info(video_path)
    duration = info['duration']

    if duration <= 0:
        raise ValueError("Could not determine video duration")

    # Calculate bitrates
    audio_bitrate = 128  # kbps
    video_bitrate = calculate_target_bitrate(target_size_mb, duration, audio_bitrate)

    # Prepare output path
    path = Path(video_path)
    if output_path is None:
        output_path = str(path.parent / f"{path.stem}_compressed{path.suffix}")

    # Create temp directory for pass log files
    temp_dir = tempfile.mkdtemp()
    passlog_prefix = os.path.join(temp_dir, 'ffmpeg2pass')

    try:
        # Pass 1: Analysis
        pass1_cmd = [
            'ffmpeg', '-y',
            '-i', video_path,
            '-c:v', 'libx264',
            '-b:v', f'{video_bitrate}k',
            '-pass', '1',
            '-passlogfile', passlog_prefix,
            '-an',  # No audio in first pass
            '-f', 'null',
            '/dev/null'
        ]

        result = subprocess.run(pass1_cmd, capture_output=True, text=True, timeout=3600)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg pass 1 failed: {result.stderr}")

        # Pass 2: Encoding
        pass2_cmd = [
            'ffmpeg', '-y',
            '-i', video_path,
            '-c:v', 'libx264',
            '-b:v', f'{video_bitrate}k',
            '-pass', '2',
            '-passlogfile', passlog_prefix,
            '-c:a', 'aac',
            '-b:a', f'{audio_bitrate}k',
            output_path
        ]

        result = subprocess.run(pass2_cmd, capture_output=True, text=True, timeout=3600)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg pass 2 failed: {result.stderr}")

        return output_path

    except subprocess.TimeoutExpired:
        raise RuntimeError("Video compression timed out")
    finally:
        # Clean up temp directory
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)


def compress_video_quality(
    video_path: str,
    quality: str = 'medium',
    output_path: str = None
) -> str:
    """
    Compress video using quality preset (CRF-based encoding).

    Quality options: 'high' (CRF 18), 'medium' (CRF 23), 'low' (CRF 28)
    """
    if quality not in QUALITY_PRESETS:
        quality = 'medium'

    preset = QUALITY_PRESETS[quality]

    path = Path(video_path)
    if output_path is None:
        output_path = str(path.parent / f"{path.stem}_{quality}{path.suffix}")

    cmd = [
        'ffmpeg', '-y',
        '-i', video_path,
        '-c:v', 'libx264',
        '-crf', str(preset['crf']),
        '-preset', preset['preset'],
        '-c:a', 'aac',
        '-b:a', preset['audio_bitrate'],
        output_path
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg compression failed: {result.stderr}")
        return output_path
    except subprocess.TimeoutExpired:
        raise RuntimeError("Video compression timed out")


def compress_video_resolution(
    video_path: str,
    target_resolution: str,
    quality: str = 'medium',
    output_path: str = None
) -> str:
    """
    Compress video by downscaling resolution.

    Uses scale filter to maintain aspect ratio.
    Combines with CRF encoding for quality control.
    """
    if target_resolution not in RESOLUTION_PRESETS:
        raise ValueError(f"Invalid resolution. Options: {list(RESOLUTION_PRESETS.keys())}")

    target_height = RESOLUTION_PRESETS[target_resolution]
    preset = QUALITY_PRESETS.get(quality, QUALITY_PRESETS['medium'])

    path = Path(video_path)
    if output_path is None:
        output_path = str(path.parent / f"{path.stem}_{target_resolution}{path.suffix}")

    # Scale filter: -2 ensures width is divisible by 2 (required by h264)
    cmd = [
        'ffmpeg', '-y',
        '-i', video_path,
        '-vf', f'scale=-2:{target_height}',
        '-c:v', 'libx264',
        '-crf', str(preset['crf']),
        '-preset', preset['preset'],
        '-c:a', 'aac',
        '-b:a', preset['audio_bitrate'],
        output_path
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg compression failed: {result.stderr}")
        return output_path
    except subprocess.TimeoutExpired:
        raise RuntimeError("Video compression timed out")


def estimate_compressed_size(
    video_path: str,
    mode: str,
    target_size_mb: float = None,
    quality: str = None,
    resolution: str = None
) -> dict:
    """
    Estimate the output file size for given compression settings.
    Returns estimate info for UI display.
    """
    info = get_video_info(video_path)
    original_size_mb = info['file_size'] / 1024 / 1024

    # Calculate based on mode
    if mode == 'target_size' and target_size_mb:
        estimated_size = target_size_mb
        reduction = (1 - target_size_mb / original_size_mb) * 100
    elif mode == 'quality':
        # Rough estimates based on CRF
        crf_ratios = {'high': 0.7, 'medium': 0.4, 'low': 0.2}
        ratio = crf_ratios.get(quality, 0.4)
        estimated_size = original_size_mb * ratio
        reduction = (1 - ratio) * 100
    elif mode == 'resolution' and resolution in RESOLUTION_PRESETS:
        # Estimate based on pixel ratio
        current_pixels = info['width'] * info['height']
        target_height = RESOLUTION_PRESETS[resolution]
        # Maintain aspect ratio
        target_width = int(info['width'] * (target_height / info['height']))
        target_pixels = target_width * target_height
        pixel_ratio = target_pixels / current_pixels if current_pixels > 0 else 1
        # Additional compression from encoding
        crf_ratios = {'high': 0.8, 'medium': 0.6, 'low': 0.4}
        quality_factor = crf_ratios.get(quality, 0.6)
        estimated_size = original_size_mb * pixel_ratio * quality_factor
        reduction = (1 - (pixel_ratio * quality_factor)) * 100
    else:
        estimated_size = original_size_mb * 0.4
        reduction = 60

    return {
        'original_size_mb': round(original_size_mb, 2),
        'estimated_size_mb': round(max(estimated_size, 1), 2),
        'estimated_reduction_percent': round(max(0, min(reduction, 99)), 1),
    }
