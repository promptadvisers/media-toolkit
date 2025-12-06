/**
 * Video Splitting Module
 * Uses local file paths - no upload needed, instant processing
 */

(function() {
    // State
    let currentFile = null;
    let videoInfo = null;
    let isSplitting = false;

    // DOM Elements
    let dropZone, pathInput, loadBtn, previewContainer;
    let fileNameEl, fileSizeEl, durationEl, resolutionEl;
    let partsInput, partsPreview, progressContainer, progressBar, progressText;
    let splitBtn, resultContainer, resultInfo;

    /**
     * Initialize
     */
    function init() {
        dropZone = document.getElementById('video-drop-zone');
        pathInput = document.getElementById('video-path-input');
        loadBtn = document.getElementById('video-load-btn');
        previewContainer = document.getElementById('video-preview-container');
        fileNameEl = document.getElementById('video-file-name');
        fileSizeEl = document.getElementById('video-file-size');
        durationEl = document.getElementById('video-duration');
        resolutionEl = document.getElementById('video-resolution');
        partsInput = document.getElementById('video-parts-input');
        partsPreview = document.getElementById('video-parts-preview');
        progressContainer = document.getElementById('video-progress-container');
        progressBar = document.getElementById('video-progress-bar');
        progressText = document.getElementById('video-progress-text');
        splitBtn = document.getElementById('split-btn');
        resultContainer = document.getElementById('video-result-container');
        resultInfo = document.getElementById('video-result-info');

        if (!pathInput) return;

        // Setup event listeners
        setupDropZone();
        loadBtn.addEventListener('click', loadVideo);
        pathInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') loadVideo();
        });
        setupPartsInput();
        setupSplitButton();
    }

    /**
     * Setup drop zone - shows filename when dropped
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
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
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
                splitBtn.disabled = false;
                updatePartsPreview();

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
     * Setup parts input
     */
    function setupPartsInput() {
        partsInput.addEventListener('input', () => {
            if (isSplitting) return;
            let value = parseInt(partsInput.value) || 2;
            value = Math.max(2, Math.min(20, value));
            partsInput.value = value;
            updatePartsPreview();
        });

        partsInput.addEventListener('blur', () => {
            let value = parseInt(partsInput.value) || 2;
            value = Math.max(2, Math.min(20, value));
            partsInput.value = value;
        });
    }

    /**
     * Update parts preview
     */
    function updatePartsPreview(statuses = null) {
        if (!videoInfo || !videoInfo.duration) {
            partsPreview.innerHTML = '<p class="parts-preview-placeholder">Load a video to see split preview</p>';
            return;
        }

        const numParts = parseInt(partsInput.value) || 2;
        const partDuration = videoInfo.duration / numParts;

        let html = '<div class="parts-preview-list">';

        for (let i = 0; i < numParts; i++) {
            const startTime = i * partDuration;
            const endTime = Math.min((i + 1) * partDuration, videoInfo.duration);
            const status = statuses ? statuses[i] : 'pending';

            let statusHtml = '';
            let itemClass = 'parts-preview-item';

            if (status === 'done') {
                itemClass += ' parts-preview-item-done';
                statusHtml = '<span class="parts-preview-status status-done"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg></span>';
            } else if (status === 'processing') {
                itemClass += ' parts-preview-item-processing';
                statusHtml = '<span class="parts-preview-status status-processing"><svg class="spinner" viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" fill="none" stroke-dasharray="60" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></circle></svg></span>';
            } else if (status === 'waiting') {
                statusHtml = '<span class="parts-preview-status status-waiting">...</span>';
            }

            html += `
                <div class="${itemClass}" data-part="${i}">
                    <span class="parts-preview-part">Part ${i + 1}</span>
                    <span class="parts-preview-time">${formatTime(startTime)} - ${formatTime(endTime)}</span>
                    <span class="parts-preview-duration">${formatTime(endTime - startTime)}</span>
                    ${statusHtml}
                </div>
            `;
        }

        html += '</div>';
        partsPreview.innerHTML = html;
    }

    function updatePartStatus(partIndex, status) {
        const item = partsPreview.querySelector(`[data-part="${partIndex}"]`);
        if (!item) return;

        item.classList.remove('parts-preview-item-done', 'parts-preview-item-processing');
        const oldStatus = item.querySelector('.parts-preview-status');
        if (oldStatus) oldStatus.remove();

        let statusHtml = '';
        if (status === 'done') {
            item.classList.add('parts-preview-item-done');
            statusHtml = '<span class="parts-preview-status status-done"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg></span>';
        } else if (status === 'processing') {
            item.classList.add('parts-preview-item-processing');
            statusHtml = '<span class="parts-preview-status status-processing"><svg class="spinner" viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" fill="none" stroke-dasharray="60" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></circle></svg></span>';
        }

        if (statusHtml) item.insertAdjacentHTML('beforeend', statusHtml);
    }

    function updateProgress(percent, stage = '') {
        progressBar.style.width = `${percent}%`;
        progressText.textContent = stage;
    }

    function formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    function setupSplitButton() {
        splitBtn.addEventListener('click', splitVideo);
    }

    /**
     * Split the video - uses local path, no upload
     */
    async function splitVideo() {
        if (!currentFile || !currentFile.path) {
            showToast('Please load a video first', 'error');
            return;
        }

        const numParts = parseInt(partsInput.value) || 2;
        isSplitting = true;

        splitBtn.disabled = true;
        partsInput.disabled = true;
        progressContainer.classList.remove('hidden');
        resultContainer.classList.add('hidden');

        const statuses = Array(numParts).fill('waiting');
        statuses[0] = 'processing';
        updatePartsPreview(statuses);

        splitBtn.innerHTML = '<svg class="spinner" viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="60" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></circle></svg> Splitting...';

        updateProgress(10, 'Splitting video...');

        // Simulate part progress
        let currentPart = 0;
        const processingInterval = setInterval(() => {
            if (currentPart < numParts && isSplitting) {
                updatePartStatus(currentPart, 'processing');
                if (currentPart > 0) updatePartStatus(currentPart - 1, 'done');
                const percent = 10 + Math.round((currentPart / numParts) * 80);
                updateProgress(percent, `Processing part ${currentPart + 1} of ${numParts}...`);
                currentPart++;
            } else {
                clearInterval(processingInterval);
            }
        }, Math.max(500, (videoInfo?.duration || 30) * 100 / numParts));

        try {
            const response = await fetch('/api/video/split-local', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_path: currentFile.path,
                    num_parts: numParts
                }),
            });

            clearInterval(processingInterval);

            if (response.ok) {
                const result = await response.json();

                for (let i = 0; i < numParts; i++) updatePartStatus(i, 'done');
                updateProgress(100, 'Complete!');

                // Get output folder from first file
                const firstFile = result.files[0];
                const outputFolder = firstFile.substring(0, firstFile.lastIndexOf('/'));

                resultInfo.innerHTML = `
                    <div style="margin-bottom: 8px;"><strong>Output folder:</strong></div>
                    <div style="background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px; margin-bottom: 12px; font-family: monospace; font-size: 11px; word-break: break-all;">${outputFolder}</div>
                    <div style="margin-bottom: 8px;"><strong>Files created (${numParts}):</strong></div>
                    ${result.files.map(f => {
                        const fileName = f.substring(f.lastIndexOf('/') + 1);
                        return `<div style="padding: 4px 8px; background: rgba(0,0,0,0.1); margin: 2px 0; border-radius: 3px; font-family: monospace; font-size: 11px;">${fileName}</div>`;
                    }).join('')}
                `;

                resultContainer.classList.remove('hidden');
                showToast(`Video split into ${numParts} parts!`, 'success');
            } else {
                const err = await response.json();
                showToast(err.detail || 'Splitting failed', 'error');
                progressContainer.classList.add('hidden');
                updatePartsPreview();
            }
        } catch (error) {
            clearInterval(processingInterval);
            console.error('Error splitting video:', error);
            showToast('Network error during split', 'error');
            progressContainer.classList.add('hidden');
            updatePartsPreview();
        }

        finishSplitting();
    }

    function finishSplitting() {
        isSplitting = false;
        splitBtn.disabled = false;
        partsInput.disabled = false;
        splitBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect><line x1="8" y1="5" x2="8" y2="19"></line></svg> Split Video';
    }

    function reset() {
        currentFile = null;
        videoInfo = null;
        isSplitting = false;
        previewContainer.classList.add('hidden');
        resultContainer.classList.add('hidden');
        progressContainer.classList.add('hidden');
        splitBtn.disabled = true;
        partsInput.disabled = false;
        pathInput.value = '';
        partsInput.value = 2;
        partsPreview.innerHTML = '<p class="parts-preview-placeholder">Load a video to see split preview</p>';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.resetVideoSplitter = reset;
})();
