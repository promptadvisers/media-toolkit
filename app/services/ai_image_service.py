"""
AI Image Service
Gemini API integration for image generation and editing
Uses Google's Gemini 3 Pro Image (Nano Banana Pro) model
"""

import io
import base64
from pathlib import Path
from typing import Tuple
from google import genai
from google.genai import types
from PIL import Image

from app.config import settings


# Model configuration
MODEL_NAME = "gemini-3-pro-image-preview"  # Nano Banana Pro


class AIImageError(Exception):
    """Custom exception for AI image operations"""
    pass


def get_client() -> genai.Client:
    """Get configured Gemini client"""
    api_key = settings.google_api_key
    if not api_key:
        raise AIImageError(
            "Google API key not configured. Please set GOOGLE_API_KEY in your .env file."
        )
    return genai.Client(api_key=api_key)


async def generate_image(prompt: str, aspect_ratio: str = "1:1", image_size: str = "2K") -> Tuple[bytes, str]:
    """
    Generate an image from a text prompt using Gemini 3 Pro Image (Nano Banana Pro).

    Args:
        prompt: Text description of the image to generate
        aspect_ratio: Aspect ratio ("1:1", "4:5", "9:16", "16:9")
        image_size: Image size ("1K", "2K", or "4K")

    Returns:
        Tuple of (image_bytes, mime_type)
    """
    try:
        client = get_client()

        # Call Nano Banana Pro via Gemini 3 Pro Image
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(
                    aspect_ratio=aspect_ratio,
                    image_size=image_size
                ),
            ),
        )

        # Extract the image from response
        image_parts = [part for part in response.parts if getattr(part, "inline_data", None)]

        if not image_parts:
            # Check if there's a text response explaining why
            text_parts = [part.text for part in response.parts if hasattr(part, "text") and part.text]
            if text_parts:
                raise AIImageError(f"Image generation failed: {text_parts[0]}")
            raise AIImageError("No image returned from Nano Banana Pro")

        # Get the image data from inline_data
        inline_data = image_parts[0].inline_data
        image_bytes = inline_data.data
        mime_type = inline_data.mime_type or "image/png"

        return image_bytes, mime_type

    except AIImageError:
        raise
    except Exception as e:
        raise AIImageError(f"Image generation failed: {str(e)}")


async def edit_image(
    image_path: str,
    prompt: str,
    aspect_ratio: str = None,
    image_size: str = "2K"
) -> Tuple[bytes, str]:
    """
    Edit an existing image using Gemini 3 Pro Image (Nano Banana Pro).

    Args:
        image_path: Path to the source image
        prompt: Instructions for how to edit the image
        aspect_ratio: Optional aspect ratio for output
        image_size: Image size ("1K", "2K", or "4K")

    Returns:
        Tuple of (edited_image_bytes, mime_type)
    """
    try:
        client = get_client()

        # Read the source image
        image_path = Path(image_path)
        if not image_path.exists():
            raise AIImageError(f"Image file not found: {image_path}")

        # Load image with PIL
        source_image = Image.open(image_path)

        # Build config
        config_kwargs = {
            "response_modalities": ["IMAGE"],
        }

        # Add image config if aspect ratio specified
        if aspect_ratio:
            config_kwargs["image_config"] = types.ImageConfig(
                aspect_ratio=aspect_ratio,
                image_size=image_size
            )

        # Call Nano Banana Pro with the image and prompt
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=[prompt, source_image],
            config=types.GenerateContentConfig(**config_kwargs),
        )

        # Extract the image from response
        image_parts = [part for part in response.parts if getattr(part, "inline_data", None)]

        if not image_parts:
            # Check if there's a text response explaining why
            text_parts = [part.text for part in response.parts if hasattr(part, "text") and part.text]
            if text_parts:
                raise AIImageError(f"Image editing failed: {text_parts[0]}")
            raise AIImageError("No edited image returned from Nano Banana Pro")

        # Get the image data from inline_data
        inline_data = image_parts[0].inline_data
        image_bytes = inline_data.data
        mime_type = inline_data.mime_type or "image/png"

        return image_bytes, mime_type

    except AIImageError:
        raise
    except Exception as e:
        raise AIImageError(f"Image editing failed: {str(e)}")


def get_preset_prompts() -> dict:
    """
    Get preset prompts for common AI image operations.

    Returns:
        Dictionary of preset categories with prompt templates
    """
    return {
        "generate": [
            {
                "name": "Photorealistic",
                "prompt": "Create a photorealistic image of {subject}. High quality, detailed, professional photography style.",
                "placeholder": "a golden retriever playing in autumn leaves"
            },
            {
                "name": "Digital Art",
                "prompt": "Create digital art of {subject}. Vibrant colors, stylized, trending on ArtStation.",
                "placeholder": "a futuristic cityscape at sunset"
            },
            {
                "name": "Watercolor",
                "prompt": "Create a watercolor painting of {subject}. Soft edges, flowing colors, artistic style.",
                "placeholder": "a peaceful mountain lake"
            },
            {
                "name": "Minimalist",
                "prompt": "Create a minimalist illustration of {subject}. Clean lines, simple shapes, limited color palette.",
                "placeholder": "a coffee cup"
            },
            {
                "name": "3D Render",
                "prompt": "Create a 3D rendered image of {subject}. Octane render, volumetric lighting, high detail.",
                "placeholder": "a glass sculpture"
            },
            {
                "name": "Anime Style",
                "prompt": "Create an anime-style illustration of {subject}. Studio Ghibli inspired, beautiful, detailed.",
                "placeholder": "a magical forest spirit"
            }
        ],
        "edit": [
            {
                "name": "Remove Background",
                "prompt": "Remove the background from this image and make it transparent.",
                "icon": "crop"
            },
            {
                "name": "Change Style",
                "prompt": "Transform this image into {style} style while keeping the main subject.",
                "placeholder": "oil painting",
                "icon": "palette"
            },
            {
                "name": "Add Elements",
                "prompt": "Add {element} to this image naturally.",
                "placeholder": "sunglasses",
                "icon": "plus"
            },
            {
                "name": "Remove Object",
                "prompt": "Remove {object} from this image and fill the area naturally.",
                "placeholder": "the person in the background",
                "icon": "eraser"
            },
            {
                "name": "Enhance Quality",
                "prompt": "Enhance this image: improve quality, sharpen details, and optimize colors.",
                "icon": "sparkles"
            },
            {
                "name": "Color Correction",
                "prompt": "Adjust the colors of this image: {adjustment}.",
                "placeholder": "make it warmer and more vibrant",
                "icon": "sliders"
            }
        ]
    }
