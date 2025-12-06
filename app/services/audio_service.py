"""
Audio Extraction Service
Handles extracting audio from video files using FFmpeg
"""

import subprocess
import os
import tempfile
from pathlib import Path


# Supported output audio formats
AUDIO_FORMATS = {
    'mp3': {
        'codec': 'libmp3lame',
        'extension': 'mp3',
        'mime': 'audio/mpeg',
    },
    'aac': {
        'codec': 'aac',
        'extension': 'aac',
        'mime': 'audio/aac',
    },
    'wav': {
        'codec': 'pcm_s16le',
        'extension': 'wav',
        'mime': 'audio/wav',
    },
    'flac': {
        'codec': 'flac',
        'extension': 'flac',
        'mime': 'audio/flac',
    },
    'ogg': {
        'codec': 'libvorbis',
        'extension': 'ogg',
        'mime': 'audio/ogg',
    },
}

# Bitrate options (kbps)
BITRATE_OPTIONS = ['64', '128', '192', '256', '320']

# Supported input video extensions
VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.m4v', '.mpeg', '.mpg', '.3gp'}


def get_video_info(video_path: str) -> dict:
    """Get information about a video file using ffprobe"""
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

        import json
        info = json.loads(result.stdout)

        # Extract relevant info
        duration = float(info.get('format', {}).get('duration', 0))

        # Find audio stream
        audio_stream = None
        for stream in info.get('streams', []):
            if stream.get('codec_type') == 'audio':
                audio_stream = stream
                break

        return {
            'duration': duration,
            'duration_formatted': format_duration(duration),
            'has_audio': audio_stream is not None,
            'audio_codec': audio_stream.get('codec_name') if audio_stream else None,
            'audio_bitrate': audio_stream.get('bit_rate') if audio_stream else None,
            'sample_rate': audio_stream.get('sample_rate') if audio_stream else None,
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


def extract_audio(
    video_path: str,
    output_format: str = 'mp3',
    bitrate: str = '192'
) -> tuple[bytes, str, str]:
    """
    Extract audio from a video file.

    Args:
        video_path: Path to the input video
        output_format: Target audio format (mp3, aac, wav, flac, ogg)
        bitrate: Bitrate in kbps (64, 128, 192, 256, 320)

    Returns:
        Tuple of (audio bytes, mime type, file extension)
    """
    output_format = output_format.lower()

    if output_format not in AUDIO_FORMATS:
        raise ValueError(f"Unsupported audio format: {output_format}")

    if bitrate not in BITRATE_OPTIONS:
        bitrate = '192'  # Default fallback

    format_info = AUDIO_FORMATS[output_format]

    # Create temporary output file
    with tempfile.NamedTemporaryFile(suffix=f'.{format_info["extension"]}', delete=False) as tmp:
        output_path = tmp.name

    try:
        # Build FFmpeg command
        cmd = [
            'ffmpeg',
            '-i', video_path,
            '-vn',  # No video
            '-acodec', format_info['codec'],
        ]

        # Add bitrate for lossy formats (not for wav/flac)
        if output_format not in ['wav', 'flac']:
            cmd.extend(['-b:a', f'{bitrate}k'])

        # Overwrite output without asking
        cmd.extend(['-y', output_path])

        # Run FFmpeg
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )

        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg failed: {result.stderr}")

        # Read the output file
        with open(output_path, 'rb') as f:
            audio_bytes = f.read()

        return audio_bytes, format_info['mime'], format_info['extension']

    except subprocess.TimeoutExpired:
        raise RuntimeError("Audio extraction timed out")
    finally:
        # Clean up temp file
        if os.path.exists(output_path):
            os.unlink(output_path)


def get_supported_formats() -> list[dict]:
    """Get list of supported audio formats with their info"""
    return [
        {'value': key, 'label': key.upper(), 'mime': info['mime']}
        for key, info in AUDIO_FORMATS.items()
    ]


def get_bitrate_options() -> list[dict]:
    """Get list of bitrate options"""
    return [
        {'value': br, 'label': f'{br} kbps'}
        for br in BITRATE_OPTIONS
    ]
