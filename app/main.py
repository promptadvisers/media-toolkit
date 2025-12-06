from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from pathlib import Path

from app.config import settings
from app.routers import image, pdf, audio, video, ai_image

# Base directory
BASE_DIR = Path(__file__).resolve().parent.parent

# Create FastAPI app
app = FastAPI(
    title="Media Toolkit",
    description="Local media processing Swiss knife",
    version="1.0.0"
)

# Mount static files
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

# Setup templates
templates = Jinja2Templates(directory=BASE_DIR / "templates")


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Serve the main application page"""
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "version": "1.0.0"}


# Include routers
app.include_router(image.router, prefix="/api/image", tags=["Image"])
app.include_router(pdf.router, prefix="/api/pdf", tags=["PDF"])
app.include_router(audio.router, prefix="/api/audio", tags=["Audio"])
app.include_router(video.router, prefix="/api/video", tags=["Video"])
app.include_router(ai_image.router, prefix="/api/ai-image", tags=["AI Image"])
