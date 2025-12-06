"""
Image Conversion Service
Handles image format conversion using Pillow
"""

from PIL import Image
import io
from pathlib import Path

# Register HEIC/HEIF support
from pillow_heif import register_heif_opener
register_heif_opener()


# Supported formats and their PIL format names
FORMAT_MAP = {
    'png': 'PNG',
    'jpg': 'JPEG',
    'jpeg': 'JPEG',
    'webp': 'WEBP',
    'gif': 'GIF',
    'bmp': 'BMP',
    'tiff': 'TIFF',
}

# Input-only formats (can read but not write)
INPUT_ONLY_FORMATS = {'heic', 'heif'}

# Formats that support quality setting
QUALITY_FORMATS = {'jpg', 'jpeg', 'webp'}

# Formats that don't support transparency
NO_ALPHA_FORMATS = {'jpg', 'jpeg', 'bmp'}


def get_image_info(image_path: str) -> dict:
    """Get information about an image file"""
    img = Image.open(image_path)
    file_path = Path(image_path)

    return {
        'filename': file_path.name,
        'format': img.format,
        'mode': img.mode,
        'width': img.width,
        'height': img.height,
        'size_bytes': file_path.stat().st_size,
    }


def convert_image(
    input_path: str,
    output_format: str,
    quality: int = 85
) -> tuple[bytes, str]:
    """
    Convert an image to a different format.

    Args:
        input_path: Path to the input image
        output_format: Target format (png, jpg, webp, etc.)
        quality: Quality for lossy formats (1-100)

    Returns:
        Tuple of (image bytes, mime type)
    """
    output_format = output_format.lower()

    if output_format not in FORMAT_MAP:
        raise ValueError(f"Unsupported format: {output_format}")

    # Open the image
    img = Image.open(input_path)

    # Handle transparency for formats that don't support it
    if output_format in NO_ALPHA_FORMATS and img.mode in ('RGBA', 'LA', 'P'):
        # Create white background
        background = Image.new('RGB', img.size, (255, 255, 255))

        # Convert palette images to RGBA first
        if img.mode == 'P':
            img = img.convert('RGBA')

        # Paste image onto white background using alpha as mask
        if img.mode in ('RGBA', 'LA'):
            # Split into channels and use alpha as mask
            if img.mode == 'RGBA':
                background.paste(img, mask=img.split()[3])
            else:
                background.paste(img, mask=img.split()[1])
        else:
            background.paste(img)

        img = background

    # Convert to RGB if needed for certain formats
    elif output_format in NO_ALPHA_FORMATS and img.mode != 'RGB':
        img = img.convert('RGB')

    # For WEBP, ensure we have proper mode
    elif output_format == 'webp':
        if img.mode not in ('RGB', 'RGBA'):
            img = img.convert('RGBA')

    # For PNG, preserve transparency
    elif output_format == 'png':
        if img.mode == 'P':
            img = img.convert('RGBA')

    # Save to bytes buffer
    output_buffer = io.BytesIO()

    pil_format = FORMAT_MAP[output_format]
    save_kwargs = {'format': pil_format}

    # Add quality for formats that support it
    if output_format in QUALITY_FORMATS:
        save_kwargs['quality'] = quality

    # Optimize PNG
    if output_format == 'png':
        save_kwargs['optimize'] = True

    img.save(output_buffer, **save_kwargs)

    # Get mime type
    mime_types = {
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'webp': 'image/webp',
        'gif': 'image/gif',
        'bmp': 'image/bmp',
        'tiff': 'image/tiff',
    }

    return output_buffer.getvalue(), mime_types[output_format]


def get_supported_formats() -> list[str]:
    """Get list of supported output formats"""
    return list(FORMAT_MAP.keys())
