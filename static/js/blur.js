/**
 * Image Blur Module
 * Handles drawing blur regions on images
 */

(function() {
    // State
    let originalImage = null;
    let blurRegions = [];
    let selectedShape = 'rectangle';
    let isDrawing = false;
    let startX, startY;

    // DOM Elements
    let dropZone, fileInput, controls;
    let mainCanvas, selectionCanvas, mainCtx, selectionCtx;
    let intensitySlider, intensityValue;
    let shapeButtons, undoBtn, blurCount, downloadBtn;

    /**
     * Initialize the blur module
     */
    function init() {
        // Get DOM elements
        dropZone = document.getElementById('blur-drop-zone');
        fileInput = document.getElementById('blur-file-input');
        controls = document.getElementById('blur-controls');
        mainCanvas = document.getElementById('blur-main-canvas');
        selectionCanvas = document.getElementById('blur-selection-canvas');
        intensitySlider = document.getElementById('blur-intensity-slider');
        intensityValue = document.getElementById('blur-intensity-value');
        shapeButtons = document.querySelectorAll('.blur-shape-btn');
        undoBtn = document.getElementById('blur-undo-btn');
        blurCount = document.getElementById('blur-count');
        downloadBtn = document.getElementById('blur-download-btn');

        if (!mainCanvas || !selectionCanvas) return;

        mainCtx = mainCanvas.getContext('2d');
        selectionCtx = selectionCanvas.getContext('2d');

        setupEventListeners();
    }

    /**
     * Setup all event listeners
     */
    function setupEventListeners() {
        // Drop zone events
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'));
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'));
        });

        dropZone.addEventListener('drop', handleDrop);
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleFileSelect);

        // Intensity slider
        intensitySlider.addEventListener('input', () => {
            intensityValue.textContent = intensitySlider.value;
        });

        // Shape buttons
        shapeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                shapeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedShape = btn.dataset.shape;
            });
        });

        // Canvas events
        mainCanvas.addEventListener('mousedown', handleMouseDown);
        mainCanvas.addEventListener('mousemove', handleMouseMove);
        mainCanvas.addEventListener('mouseup', handleMouseUp);
        mainCanvas.addEventListener('mouseleave', handleMouseLeave);

        // Touch events for mobile
        mainCanvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        mainCanvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        mainCanvas.addEventListener('touchend', handleTouchEnd);

        // Undo button
        undoBtn.addEventListener('click', undo);

        // Download button
        downloadBtn.addEventListener('click', downloadImage);

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            const blurPanel = document.getElementById('image-blur-panel');
            if (!blurPanel || blurPanel.classList.contains('hidden')) return;

            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                undo();
            }
        });

        // Clipboard paste support
        document.addEventListener('paste', handlePaste);
    }

    /**
     * Handle paste event for clipboard images
     */
    function handlePaste(e) {
        const blurPanel = document.getElementById('image-blur-panel');
        if (!blurPanel || blurPanel.classList.contains('hidden')) return;

        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    loadImage(file);
                    showToast('Image pasted from clipboard', 'success');
                }
                return;
            }
        }
    }

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function handleDrop(e) {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            loadImage(files[0]);
        }
    }

    function handleFileSelect(e) {
        if (e.target.files.length > 0) {
            loadImage(e.target.files[0]);
        }
    }

    /**
     * Load an image file
     */
    function loadImage(file) {
        const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'];
        if (!validTypes.includes(file.type)) {
            showToast('Please select a valid image file (PNG, JPG, WEBP, GIF, BMP)', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                originalImage = img;
                blurRegions = [];
                updateBlurCount();

                // Set canvas size to image size
                mainCanvas.width = img.width;
                mainCanvas.height = img.height;
                selectionCanvas.width = img.width;
                selectionCanvas.height = img.height;

                // Scale canvas display to fit container (no scrolling)
                const maxWidth = 1000;  // Max display width
                const maxHeight = 450;  // Max display height (container is 480px with padding)

                // Always scale to fit within bounds
                const ratio = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
                const displayWidth = Math.floor(img.width * ratio);
                const displayHeight = Math.floor(img.height * ratio);

                mainCanvas.style.width = displayWidth + 'px';
                mainCanvas.style.height = displayHeight + 'px';
                selectionCanvas.style.width = displayWidth + 'px';
                selectionCanvas.style.height = displayHeight + 'px';

                // Draw image
                mainCtx.drawImage(img, 0, 0);

                // Show controls, hide drop zone
                dropZone.classList.add('hidden');
                controls.classList.remove('hidden');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    /**
     * Get mouse/touch position relative to canvas
     */
    function getCanvasPos(e) {
        const rect = mainCanvas.getBoundingClientRect();
        const scaleX = mainCanvas.width / rect.width;
        const scaleY = mainCanvas.height / rect.height;

        let clientX, clientY;
        if (e.touches) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    // Mouse events
    function handleMouseDown(e) {
        if (!originalImage) return;
        isDrawing = true;
        const pos = getCanvasPos(e);
        startX = pos.x;
        startY = pos.y;
    }

    function handleMouseMove(e) {
        if (!isDrawing) return;
        const pos = getCanvasPos(e);
        drawSelectionPreview(startX, startY, pos.x - startX, pos.y - startY);
    }

    function handleMouseUp(e) {
        if (!isDrawing) return;
        isDrawing = false;
        const pos = getCanvasPos(e);
        finishDrawing(pos.x, pos.y);
    }

    function handleMouseLeave() {
        if (isDrawing) {
            isDrawing = false;
            selectionCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
        }
    }

    // Touch events
    function handleTouchStart(e) {
        e.preventDefault();
        if (!originalImage) return;
        isDrawing = true;
        const pos = getCanvasPos(e);
        startX = pos.x;
        startY = pos.y;
    }

    function handleTouchMove(e) {
        e.preventDefault();
        if (!isDrawing) return;
        const pos = getCanvasPos(e);
        drawSelectionPreview(startX, startY, pos.x - startX, pos.y - startY);
    }

    function handleTouchEnd(e) {
        if (!isDrawing) return;
        isDrawing = false;
        // Get last touch position from the preview
        const rect = mainCanvas.getBoundingClientRect();
        const scaleX = mainCanvas.width / rect.width;
        const scaleY = mainCanvas.height / rect.height;

        if (e.changedTouches && e.changedTouches.length > 0) {
            const touch = e.changedTouches[0];
            const x = (touch.clientX - rect.left) * scaleX;
            const y = (touch.clientY - rect.top) * scaleY;
            finishDrawing(x, y);
        }
    }

    /**
     * Finish drawing a blur region
     */
    function finishDrawing(endX, endY) {
        const width = endX - startX;
        const height = endY - startY;

        // Only add if region has meaningful size
        if (Math.abs(width) > 10 && Math.abs(height) > 10) {
            blurRegions.push({
                x: width < 0 ? startX + width : startX,
                y: height < 0 ? startY + height : startY,
                width: Math.abs(width),
                height: Math.abs(height),
                blur: parseInt(intensitySlider.value),
                shape: selectedShape
            });
            updateBlurCount();
            redrawCanvas();
        }

        // Clear selection preview
        selectionCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
    }

    /**
     * Draw selection preview
     */
    function drawSelectionPreview(x, y, width, height) {
        selectionCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
        selectionCtx.strokeStyle = '#6366f1';
        selectionCtx.lineWidth = 2;
        selectionCtx.setLineDash([5, 5]);

        if (selectedShape === 'ellipse') {
            selectionCtx.beginPath();
            selectionCtx.ellipse(
                x + width / 2,
                y + height / 2,
                Math.abs(width / 2),
                Math.abs(height / 2),
                0, 0, Math.PI * 2
            );
            selectionCtx.stroke();
        } else {
            selectionCtx.strokeRect(x, y, width, height);
        }
    }

    /**
     * Redraw canvas with all blur regions
     */
    function redrawCanvas() {
        if (!originalImage) return;

        // Draw original image
        mainCtx.drawImage(originalImage, 0, 0);

        // Apply each blur region
        blurRegions.forEach(region => {
            applyBlurRegion(region);
        });
    }

    /**
     * Apply blur to a specific region
     */
    function applyBlurRegion(region) {
        const { x, y, width, height, blur, shape } = region;

        mainCtx.save();

        if (shape === 'ellipse') {
            mainCtx.beginPath();
            mainCtx.ellipse(
                x + width / 2,
                y + height / 2,
                width / 2,
                height / 2,
                0, 0, Math.PI * 2
            );
            mainCtx.clip();
        } else {
            mainCtx.beginPath();
            mainCtx.rect(x, y, width, height);
            mainCtx.clip();
        }

        mainCtx.filter = `blur(${blur}px)`;
        mainCtx.drawImage(originalImage, 0, 0);
        mainCtx.filter = 'none';

        mainCtx.restore();
    }

    /**
     * Undo last blur
     */
    function undo() {
        if (blurRegions.length > 0) {
            blurRegions.pop();
            updateBlurCount();
            redrawCanvas();
        }
    }

    /**
     * Update blur count display
     */
    function updateBlurCount() {
        const count = blurRegions.length;
        blurCount.textContent = `${count} blur${count !== 1 ? 's' : ''}`;
        undoBtn.disabled = count === 0;
    }

    /**
     * Download the blurred image
     */
    function downloadImage() {
        if (!originalImage) {
            showToast('No image loaded', 'error');
            return;
        }

        const link = document.createElement('a');
        link.download = 'blurred-image.png';
        link.href = mainCanvas.toDataURL('image/png');
        link.click();

        showToast('Image downloaded successfully!', 'success');
    }

    /**
     * Reset the blur tool
     */
    function reset() {
        originalImage = null;
        blurRegions = [];
        updateBlurCount();
        dropZone.classList.remove('hidden');
        controls.classList.add('hidden');
        fileInput.value = '';
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose reset function globally
    window.resetBlurTool = reset;
})();
