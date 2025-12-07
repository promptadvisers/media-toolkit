/**
 * Video Compression Module
 * Handles video compression with target size, quality presets, and resolution options
 */

(function() {
    // State
    let currentFile = null;
    let videoInfo = null;
    let isCompressing = false;
    let currentMode = 'target-size';
    let selectedQuality = 'medium';
    let selectedResolution = '720p';
    let selectedResQuality = 'medium';

    // DOM Elements
    let dropZone, pathInput, loadBtn, previewContainer;
    let fileNameEl, fileSizeEl, durationEl, resolutionEl;
    let compressTabs, targetSizePanel, qualityPanel, resolutionPanel;
    let targetSizeInput, qualityBtns, resolutionBtns, resQualityBtns;
    let estimateContainer, estimateSizeEl, estimateReductionEl;
    let progressContainer, progressBar, progressText;
    let compressBtn, resultContainer, resultInfo;

    /**
     * Initialize the compression module
     */
    function init() {
        // Get DOM elements
        dropZone = document.getElementById('compress-drop-zone');
        pathInput = document.getElementById('compress-path-input');
        loadBtn = document.getElementById('compress-load-btn');
        previewContainer = document.getElementById('compress-preview-container');
        fileNameEl = document.getElementById('compress-file-name');
        fileSizeEl = document.getElementById('compress-file-size');
        durationEl = document.getElementById('compress-duration');
        resolutionEl = document.getElementById('compress-resolution');

        compressTabs = document.querySelectorAll('.compress-tab');
        targetSizePanel = document.getElementById('compress-target-size-panel');
        qualityPanel = document.getElementById('compress-quality-panel');
        resolutionPanel = document.getElementById('compress-resolution-panel');

        targetSizeInput = document.getElementById('target-size-input');
        qualityBtns = document.querySelectorAll('.quality-btn');
        resolutionBtns = document.querySelectorAll('.resolution-btn');
        resQualityBtns = document.querySelectorAll('.res-quality-btn');

        estimateContainer = document.getElementById('compress-estimate');
        estimateSizeEl = document.getElementById('estimate-size');
        estimateReductionEl = document.getElementById('estimate-reduction');

        progressContainer = document.getElementById('compress-progress-container');
        progressBar = document.getElementById('compress-progress-bar');
        progressText = document.getElementById('compress-progress-text');

        compressBtn = document.getElementById('compress-btn');
        resultContainer = document.getElementById('compress-result-container');
        resultInfo = document.getElementById('compress-result-info');

        if (!pathInput) return;

        // Setup event listeners
        setupDropZone();
        setupFileInput();
        setupTabs();
        setupModeControls();
        setupCompressButton();
    }

    /**
     * Setup drop zone for drag-and-drop
     */
    function setupDropZone() {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'));
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'));
        });

        dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                const validExts = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.m4v'];
                const ext = '.' + file.name.split('.').pop().toLowerCase();

                if (!validExts.includes(ext)) {
                    showToast('Invalid file type', 'error');
                    return;
                }

                // Update drop zone to show the filename
                dropZone.innerHTML = `
                    <div style="text-align: center;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="4 14 10 14 10 20"></polyline>
                            <polyline points="20 10 14 10 14 4"></polyline>
                            <line x1="14" y1="10" x2="21" y2="3"></line>
                            <line x1="3" y1="21" x2="10" y2="14"></line>
                        </svg>
                        <p style="margin: 8px 0 4px; font-weight: 600; color: var(--primary);">${file.name}</p>
                        <p style="font-size: 11px; opacity: 0.7;">${formatFileSize(file.size)}</p>
                        <p style="font-size: 11px; margin-top: 8px; opacity: 0.6;">Fix the folder path below, then click Load</p>
                    </div>
                `;
                dropZone.classList.add('has-file');

                // Pre-fill with template
                pathInput.value = `/Users/marwankashef/Downloads/${file.name}`;
                pathInput.focus();
                showToast('Verify the path and click Load', 'success');
            }
        });
    }

    /**
     * Setup file input handlers
     */
    function setupFileInput() {
        loadBtn.addEventListener('click', loadVideo);
        pathInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') loadVideo();
        });
    }

    /**
     * Load video from path
     */
    async function loadVideo() {
        const filePath = pathInput.value.trim();
        if (!filePath) {
            showToast('Please enter a video file path', 'error');
            return;
        }

        const validExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.m4v', '.mpeg', '.mpg', '.3gp'];
        const ext = '.' + filePath.split('.').pop().toLowerCase();
        if (!validExtensions.includes(ext)) {
            showToast('Invalid file type. Use MP4, MKV, AVI, MOV, WEBM, etc.', 'error');
            return;
        }

        loadBtn.disabled = true;
        loadBtn.textContent = 'Loading...';

        try {
            const response = await fetch('/api/video/info-local', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_path: filePath }),
            });

            if (response.ok) {
                videoInfo = await response.json();
                currentFile = { path: filePath, name: videoInfo.filename };

                previewContainer.classList.remove('hidden');
                fileNameEl.textContent = videoInfo.filename;
                fileSizeEl.textContent = formatFileSize(videoInfo.file_size);
                durationEl.textContent = videoInfo.duration_formatted || 'Unknown';
                resolutionEl.textContent = videoInfo.resolution || 'Unknown';

                resultContainer.classList.add('hidden');
                progressContainer.classList.add('hidden');
                compressBtn.disabled = false;

                updateEstimate();
                showToast('Video loaded!', 'success');
            } else {
                const err = await response.json();
                showToast(err.detail || 'Could not load video', 'error');
            }
        } catch (error) {
            console.error('Error loading video:', error);
            showToast('Error loading video', 'error');
        }

        loadBtn.disabled = false;
        loadBtn.textContent = 'Load';
    }

    /**
     * Setup tab switching
     */
    function setupTabs() {
        compressTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const mode = tab.dataset.mode;

                // Update active tab
                compressTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Show corresponding panel
                targetSizePanel.classList.add('hidden');
                qualityPanel.classList.add('hidden');
                resolutionPanel.classList.add('hidden');

                if (mode === 'target-size') {
                    targetSizePanel.classList.remove('hidden');
                } else if (mode === 'quality') {
                    qualityPanel.classList.remove('hidden');
                } else if (mode === 'resolution') {
                    resolutionPanel.classList.remove('hidden');
                }

                currentMode = mode;
                updateEstimate();
            });
        });
    }

    /**
     * Setup mode control buttons
     */
    function setupModeControls() {
        // Target size input
        targetSizeInput.addEventListener('input', updateEstimate);

        // Quality buttons
        qualityBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                qualityBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedQuality = btn.dataset.quality;
                updateEstimate();
            });
        });

        // Resolution buttons
        resolutionBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                resolutionBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedResolution = btn.dataset.resolution;
                updateEstimate();
            });
        });

        // Resolution quality buttons
        resQualityBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                resQualityBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedResQuality = btn.dataset.quality;
                updateEstimate();
            });
        });
    }

    /**
     * Update compression estimate when settings change
     */
    async function updateEstimate() {
        if (!currentFile) {
            estimateContainer.classList.add('hidden');
            return;
        }

        const requestBody = {
            file_path: currentFile.path,
            mode: currentMode.replace('-', '_'),
        };

        if (currentMode === 'target-size') {
            requestBody.target_size_mb = parseFloat(targetSizeInput.value) || 900;
        } else if (currentMode === 'quality') {
            requestBody.quality = selectedQuality;
        } else if (currentMode === 'resolution') {
            requestBody.resolution = selectedResolution;
            requestBody.quality = selectedResQuality;
        }

        try {
            const response = await fetch('/api/video/compress/estimate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (response.ok) {
                const estimate = await response.json();
                estimateSizeEl.textContent = `~${estimate.estimated_size_mb.toFixed(1)} MB`;
                estimateReductionEl.textContent = `~${estimate.estimated_reduction_percent.toFixed(0)}%`;
                estimateContainer.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error getting estimate:', error);
        }
    }

    /**
     * Setup compress button
     */
    function setupCompressButton() {
        compressBtn.addEventListener('click', compressVideo);
    }

    /**
     * Compress the video
     */
    async function compressVideo() {
        if (!currentFile) {
            showToast('Please load a video first', 'error');
            return;
        }

        isCompressing = true;
        compressBtn.disabled = true;
        progressContainer.classList.remove('hidden');
        resultContainer.classList.add('hidden');

        compressBtn.innerHTML = '<svg class="spinner" viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="60" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></circle></svg> Compressing...';

        // Determine endpoint based on mode
        let endpoint = '/api/video/compress/';
        const requestBody = { file_path: currentFile.path };

        if (currentMode === 'target-size') {
            endpoint += 'target-size';
            requestBody.target_size_mb = parseFloat(targetSizeInput.value) || 900;
        } else if (currentMode === 'quality') {
            endpoint += 'quality';
            requestBody.quality = selectedQuality;
        } else if (currentMode === 'resolution') {
            endpoint += 'resolution';
            requestBody.resolution = selectedResolution;
            requestBody.quality = selectedResQuality;
        }

        // Start progress animation
        let progress = 0;
        progressBar.style.width = '0%';
        progressText.textContent = 'Starting compression...';

        const progressInterval = setInterval(() => {
            if (progress < 90 && isCompressing) {
                progress += 1;
                progressBar.style.width = `${progress}%`;
                if (progress < 30) {
                    progressText.textContent = 'Analyzing video...';
                } else if (progress < 60) {
                    progressText.textContent = 'Encoding (pass 1)...';
                } else {
                    progressText.textContent = 'Encoding (pass 2)...';
                }
            }
        }, 1000);

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            clearInterval(progressInterval);

            if (response.ok) {
                const result = await response.json();
                progressBar.style.width = '100%';
                progressText.textContent = 'Complete!';

                resultInfo.innerHTML = `
                    <div style="margin-bottom: 8px;"><strong>Output file:</strong></div>
                    <div style="background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px; margin-bottom: 12px; font-family: monospace; font-size: 11px; word-break: break-all;">${result.output_file}</div>
                    <div style="display: flex; gap: 16px; flex-wrap: wrap;">
                        <div><strong>Original:</strong> ${formatFileSize(result.original_size)}</div>
                        <div><strong>Compressed:</strong> ${formatFileSize(result.compressed_size)}</div>
                        <div><strong>Reduction:</strong> ${result.reduction_percent}%</div>
                    </div>
                `;
                resultContainer.classList.remove('hidden');
                showToast('Video compressed successfully!', 'success');
            } else {
                const err = await response.json();
                showToast(err.detail || 'Compression failed', 'error');
                progressContainer.classList.add('hidden');
            }
        } catch (error) {
            clearInterval(progressInterval);
            console.error('Error compressing video:', error);
            showToast('Network error during compression', 'error');
            progressContainer.classList.add('hidden');
        }

        finishCompressing();
    }

    /**
     * Reset button state after compression
     */
    function finishCompressing() {
        isCompressing = false;
        compressBtn.disabled = false;
        compressBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="4 14 10 14 10 20"></polyline>
                <polyline points="20 10 14 10 14 4"></polyline>
                <line x1="14" y1="10" x2="21" y2="3"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
            Compress Video
        `;
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.resetVideoCompressor = function() {
        currentFile = null;
        videoInfo = null;
        isCompressing = false;
        previewContainer.classList.add('hidden');
        resultContainer.classList.add('hidden');
        progressContainer.classList.add('hidden');
        estimateContainer.classList.add('hidden');
        compressBtn.disabled = true;
        pathInput.value = '';
    };
})();
