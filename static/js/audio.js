/**
 * Audio Extraction Module
 * Handles extracting audio from video files
 */

(function() {
    // State
    let currentFile = null;
    let videoInfo = null;

    // DOM Elements
    let dropZone, fileInput, previewContainer;
    let fileNameEl, fileSizeEl, durationEl, audioInfoEl;
    let formatButtons, bitrateContainer, bitrateSelect;
    let extractBtn, resultContainer, downloadBtn;

    // Selected options
    let selectedFormat = 'mp3';
    let selectedBitrate = '192';

    /**
     * Initialize the audio extraction module
     */
    function init() {
        // Get DOM elements
        dropZone = document.getElementById('audio-drop-zone');
        fileInput = document.getElementById('audio-file-input');
        previewContainer = document.getElementById('audio-preview-container');
        fileNameEl = document.getElementById('audio-file-name');
        fileSizeEl = document.getElementById('audio-file-size');
        durationEl = document.getElementById('audio-duration');
        audioInfoEl = document.getElementById('audio-info');
        formatButtons = document.querySelectorAll('#audio-extract-panel .audio-format-btn');
        bitrateContainer = document.getElementById('audio-bitrate-container');
        bitrateSelect = document.getElementById('audio-bitrate-select');
        extractBtn = document.getElementById('extract-btn');
        resultContainer = document.getElementById('audio-result-container');
        downloadBtn = document.getElementById('audio-download-btn');

        if (!dropZone) return; // Panel not yet in DOM

        // Setup event listeners
        setupDropZone();
        setupFormatButtons();
        setupBitrateSelect();
        setupExtractButton();
    }

    /**
     * Setup drop zone for file upload
     */
    function setupDropZone() {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('drag-over');
            });
        });

        dropZone.addEventListener('drop', handleDrop);
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleFileSelect);
    }

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function handleDrop(e) {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    }

    function handleFileSelect(e) {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    }

    /**
     * Handle selected video file
     */
    async function handleFile(file) {
        // Validate file type
        const validExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.m4v', '.mpeg', '.mpg', '.3gp'];
        const ext = '.' + file.name.split('.').pop().toLowerCase();

        if (!validExtensions.includes(ext)) {
            showToast('Please select a valid video file (MP4, MKV, AVI, MOV, WEBM, etc.)', 'error');
            return;
        }

        currentFile = file;

        // Show preview container
        previewContainer.classList.remove('hidden');
        dropZone.classList.add('has-file');

        // Update file info
        fileNameEl.textContent = file.name;
        fileSizeEl.textContent = formatFileSize(file.size);
        durationEl.textContent = 'Analyzing...';
        audioInfoEl.textContent = '';

        // Reset result
        resultContainer.classList.add('hidden');

        // Enable extract button
        extractBtn.disabled = false;

        // Get video info from server
        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/audio/info', {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                videoInfo = await response.json();
                durationEl.textContent = videoInfo.duration_formatted || 'Unknown';

                if (videoInfo.has_audio) {
                    let info = videoInfo.audio_codec ? videoInfo.audio_codec.toUpperCase() : '';
                    if (videoInfo.sample_rate) {
                        info += ` ${Math.round(videoInfo.sample_rate / 1000)}kHz`;
                    }
                    audioInfoEl.textContent = info;
                } else {
                    audioInfoEl.textContent = 'No audio track found';
                    audioInfoEl.style.color = 'var(--warning)';
                }
            } else {
                durationEl.textContent = 'Unknown';
            }
        } catch (error) {
            console.error('Error getting video info:', error);
            durationEl.textContent = 'Unknown';
        }
    }

    /**
     * Setup format selection buttons
     */
    function setupFormatButtons() {
        formatButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const format = btn.dataset.format;
                selectFormat(format);
            });
        });
    }

    function selectFormat(format) {
        selectedFormat = format;

        // Update button states
        formatButtons.forEach(btn => {
            if (btn.dataset.format === format) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Show/hide bitrate selector based on format
        const losslessFormats = ['wav', 'flac'];
        if (losslessFormats.includes(format)) {
            bitrateContainer.classList.add('hidden');
        } else {
            bitrateContainer.classList.remove('hidden');
        }
    }

    /**
     * Setup bitrate selector
     */
    function setupBitrateSelect() {
        bitrateSelect.addEventListener('change', () => {
            selectedBitrate = bitrateSelect.value;
        });
    }

    /**
     * Setup extract button
     */
    function setupExtractButton() {
        extractBtn.addEventListener('click', extractAudio);
    }

    /**
     * Extract audio from video
     */
    async function extractAudio() {
        if (!currentFile) {
            showToast('Please select a video file first', 'error');
            return;
        }

        // Disable button and show loading
        extractBtn.disabled = true;
        extractBtn.innerHTML = `
            <svg class="spinner" viewBox="0 0 24 24" width="20" height="20">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="60" stroke-linecap="round">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                </circle>
            </svg>
            Extracting...
        `;

        try {
            const formData = new FormData();
            formData.append('file', currentFile);
            formData.append('output_format', selectedFormat);
            formData.append('bitrate', selectedBitrate);

            const response = await fetch('/api/audio/extract', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Extraction failed');
            }

            // Get the extracted audio as blob
            const blob = await response.blob();
            const audioSize = parseInt(response.headers.get('X-Audio-Size') || blob.size);

            // Create download URL
            const downloadUrl = URL.createObjectURL(blob);
            const outputFilename = currentFile.name.replace(/\.[^/.]+$/, '') + '.' + selectedFormat;

            // Update download button
            downloadBtn.onclick = () => {
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = outputFilename;
                a.click();
            };

            // Update result info
            const resultInfo = document.getElementById('audio-result-info');
            resultInfo.textContent = `Audio size: ${formatFileSize(audioSize)}`;

            // Show result container
            resultContainer.classList.remove('hidden');

            showToast('Audio extracted successfully!', 'success');

        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            // Re-enable button
            extractBtn.disabled = false;
            extractBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 18V5l12-2v13"></path>
                    <circle cx="6" cy="18" r="3"></circle>
                    <circle cx="18" cy="16" r="3"></circle>
                </svg>
                Extract Audio
            `;
        }
    }

    /**
     * Reset the audio extractor
     */
    function reset() {
        currentFile = null;
        videoInfo = null;
        previewContainer.classList.add('hidden');
        resultContainer.classList.add('hidden');
        dropZone.classList.remove('has-file');
        extractBtn.disabled = true;
        fileInput.value = '';
        if (audioInfoEl) {
            audioInfoEl.style.color = '';
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose reset function globally
    window.resetAudioExtractor = reset;
})();
