/**
 * Image Conversion Module
 * Handles image format conversion UI and API calls
 */

(function() {
    // State
    let currentFiles = [];  // Changed to array for bulk support
    let imageInfo = null;

    // DOM Elements (will be set on init)
    let dropZone, fileInput, previewContainer, previewImage, fileListContainer;
    let fileNameEl, fileSizeEl, fileDimensionsEl;
    let formatButtons, qualityContainer, qualitySlider, qualityValue;
    let convertBtn, resultContainer, downloadBtn, resultInfo;

    // Selected format
    let selectedFormat = 'jpg';

    /**
     * Initialize the image conversion module
     */
    function init() {
        // Get DOM elements
        dropZone = document.getElementById('image-drop-zone');
        fileInput = document.getElementById('image-file-input');
        previewContainer = document.getElementById('image-preview-container');
        previewImage = document.getElementById('image-preview');
        fileListContainer = document.getElementById('image-file-list');
        fileNameEl = document.getElementById('image-file-name');
        fileSizeEl = document.getElementById('image-file-size');
        fileDimensionsEl = document.getElementById('image-file-dimensions');
        formatButtons = document.querySelectorAll('.format-btn');
        qualityContainer = document.getElementById('quality-container');
        qualitySlider = document.getElementById('quality-slider');
        qualityValue = document.getElementById('quality-value');
        convertBtn = document.getElementById('convert-btn');
        resultContainer = document.getElementById('image-result-container');
        downloadBtn = document.getElementById('image-download-btn');
        resultInfo = document.getElementById('image-result-info');

        // Setup event listeners
        setupDropZone();
        setupFormatButtons();
        setupQualitySlider();
        setupConvertButton();
    }

    /**
     * Setup drop zone for file upload
     */
    function setupDropZone() {
        // Drag and drop events
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
            handleFiles(Array.from(files));
        }
    }

    function handleFileSelect(e) {
        if (e.target.files.length > 0) {
            handleFiles(Array.from(e.target.files));
        }
    }

    /**
     * Handle selected files (single or multiple)
     */
    function handleFiles(files) {
        const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff', 'image/heic', 'image/heif'];
        const validExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff', '.tif', '.heic', '.heif'];

        const validFiles = [];

        for (const file of files) {
            const ext = '.' + file.name.split('.').pop().toLowerCase();
            if (validTypes.includes(file.type) || validExtensions.includes(ext)) {
                validFiles.push(file);
            }
        }

        if (validFiles.length === 0) {
            showToast('Please select valid image files (PNG, JPG, WEBP, HEIC, GIF, BMP, TIFF)', 'error');
            return;
        }

        currentFiles = validFiles;

        // Show file list or single preview
        if (currentFiles.length === 1) {
            showSingleFilePreview(currentFiles[0]);
        } else {
            showFileList(currentFiles);
        }

        // Reset result
        resultContainer.classList.add('hidden');

        // Enable convert button
        convertBtn.disabled = false;

        // Auto-select format based on first file
        const firstFile = currentFiles[0];
        const ext = '.' + firstFile.name.split('.').pop().toLowerCase();
        autoSelectFormat(firstFile.type, ext);
    }

    /**
     * Show preview for a single file
     */
    function showSingleFilePreview(file) {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        const isHeic = ext === '.heic' || ext === '.heif';

        // Hide file list, show preview
        fileListContainer.classList.add('hidden');
        previewContainer.classList.remove('hidden');
        dropZone.classList.add('has-file');

        if (isHeic) {
            previewImage.src = 'data:image/svg+xml,' + encodeURIComponent(`
                <svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150">
                    <rect fill="#1e293b" width="150" height="150"/>
                    <text x="75" y="70" text-anchor="middle" fill="#94a3b8" font-family="system-ui" font-size="14">HEIC Image</text>
                    <text x="75" y="90" text-anchor="middle" fill="#64748b" font-family="system-ui" font-size="11">(Preview after convert)</text>
                </svg>
            `);
            fileDimensionsEl.textContent = 'Convert to view';
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                previewImage.src = e.target.result;
            };
            reader.readAsDataURL(file);

            const img = new Image();
            img.onload = () => {
                fileDimensionsEl.textContent = `${img.width} x ${img.height}`;
            };
            img.src = URL.createObjectURL(file);
        }

        fileNameEl.textContent = file.name;
        fileSizeEl.textContent = formatFileSize(file.size);
    }

    /**
     * Show file list for bulk upload
     */
    function showFileList(files, statuses = null) {
        // Hide single preview, show file list
        previewContainer.classList.add('hidden');
        fileListContainer.classList.remove('hidden');
        dropZone.classList.add('has-file');

        // Calculate total size
        const totalSize = files.reduce((sum, f) => sum + f.size, 0);

        // Count completed if statuses provided
        const completedCount = statuses ? statuses.filter(s => s === 'done').length : 0;
        const headerText = statuses
            ? `${completedCount}/${files.length} converted`
            : `${files.length} files selected`;

        // Build file list HTML
        let html = `
            <div class="file-list-header">
                <span>${headerText}</span>
                <span>Total: ${formatFileSize(totalSize)}</span>
            </div>
            <div class="file-list-items">
        `;

        files.forEach((file, index) => {
            const ext = file.name.split('.').pop().toUpperCase();
            const status = statuses ? statuses[index] : 'pending';

            // Status indicator HTML
            let statusHtml = '';
            if (status === 'done') {
                statusHtml = `
                    <div class="file-list-item-status status-done">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                `;
            } else if (status === 'converting') {
                statusHtml = `
                    <div class="file-list-item-status status-converting">
                        <svg class="spinner" viewBox="0 0 24 24" width="18" height="18">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" fill="none" stroke-dasharray="60" stroke-linecap="round">
                                <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                            </circle>
                        </svg>
                    </div>
                `;
            } else if (status === 'error') {
                statusHtml = `
                    <div class="file-list-item-status status-error">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </div>
                `;
            } else {
                // pending - show remove button only when not converting
                statusHtml = `
                    <button class="file-list-item-remove" onclick="window.removeImageFile(${index})" title="Remove">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                `;
            }

            const itemClass = status !== 'pending' ? `file-list-item file-list-item-${status}` : 'file-list-item';

            html += `
                <div class="${itemClass}" data-index="${index}">
                    <div class="file-list-item-icon">${ext}</div>
                    <div class="file-list-item-info">
                        <span class="file-list-item-name">${file.name}</span>
                        <span class="file-list-item-size">${formatFileSize(file.size)}</span>
                    </div>
                    ${statusHtml}
                </div>
            `;
        });

        html += '</div>';
        fileListContainer.innerHTML = html;
    }

    /**
     * Update a single file's status in the list
     */
    function updateFileStatus(index, status) {
        const item = fileListContainer.querySelector(`[data-index="${index}"]`);
        if (!item) return;

        // Update item class
        item.className = `file-list-item file-list-item-${status}`;

        // Update status indicator
        const statusContainer = item.querySelector('.file-list-item-status, .file-list-item-remove');
        if (statusContainer) {
            if (status === 'done') {
                statusContainer.outerHTML = `
                    <div class="file-list-item-status status-done">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                `;
            } else if (status === 'converting') {
                statusContainer.outerHTML = `
                    <div class="file-list-item-status status-converting">
                        <svg class="spinner" viewBox="0 0 24 24" width="18" height="18">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" fill="none" stroke-dasharray="60" stroke-linecap="round">
                                <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                            </circle>
                        </svg>
                    </div>
                `;
            } else if (status === 'error') {
                statusContainer.outerHTML = `
                    <div class="file-list-item-status status-error">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </div>
                `;
            }
        }

        // Update header count
        const doneCount = fileListContainer.querySelectorAll('.file-list-item-done').length;
        const headerSpan = fileListContainer.querySelector('.file-list-header span:first-child');
        if (headerSpan) {
            headerSpan.textContent = `${doneCount}/${currentFiles.length} converted`;
        }
    }

    /**
     * Remove a file from the list
     */
    function removeFile(index) {
        currentFiles.splice(index, 1);

        if (currentFiles.length === 0) {
            reset();
        } else if (currentFiles.length === 1) {
            showSingleFilePreview(currentFiles[0]);
        } else {
            showFileList(currentFiles);
        }
    }

    // Expose removeFile globally for onclick handlers
    window.removeImageFile = removeFile;

    /**
     * Auto-select a format different from the input
     */
    function autoSelectFormat(mimeType, ext) {
        const currentFormat = mimeType ? mimeType.split('/')[1] : '';

        // HEIC files should default to PNG (lossless, good for photos)
        if (ext === '.heic' || ext === '.heif') {
            selectFormat('png');
        }
        // If current is jpeg, select png; otherwise select jpg
        else if (currentFormat === 'jpeg' || currentFormat === 'jpg') {
            selectFormat('png');
        } else {
            selectFormat('jpg');
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

        // Show/hide quality slider based on format
        const qualityFormats = ['jpg', 'jpeg', 'webp'];
        if (qualityFormats.includes(format)) {
            qualityContainer.classList.remove('hidden');
        } else {
            qualityContainer.classList.add('hidden');
        }
    }

    /**
     * Setup quality slider
     */
    function setupQualitySlider() {
        qualitySlider.addEventListener('input', () => {
            qualityValue.textContent = qualitySlider.value + '%';
        });
    }

    /**
     * Setup convert button
     */
    function setupConvertButton() {
        convertBtn.addEventListener('click', convertImage);
    }

    /**
     * Convert the image(s)
     */
    async function convertImage() {
        if (currentFiles.length === 0) {
            showToast('Please select an image first', 'error');
            return;
        }

        // Disable button and show loading
        convertBtn.disabled = true;
        const isBulk = currentFiles.length > 1;

        try {
            if (isBulk) {
                // Bulk conversion with progress tracking
                await convertBulkWithProgress();
            } else {
                // Single file conversion
                convertBtn.innerHTML = `
                    <svg class="spinner" viewBox="0 0 24 24" width="20" height="20">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="60" stroke-linecap="round">
                            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                        </circle>
                    </svg>
                    Converting...
                `;

                const formData = new FormData();
                formData.append('file', currentFiles[0]);
                formData.append('output_format', selectedFormat);
                formData.append('quality', qualitySlider.value);

                const response = await fetch('/api/image/convert', {
                    method: 'POST',
                    body: formData,
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.detail || 'Conversion failed');
                }

                // Get the converted image as blob
                const blob = await response.blob();
                const originalSize = parseInt(response.headers.get('X-Original-Size') || currentFiles[0].size);
                const convertedSize = parseInt(response.headers.get('X-Converted-Size') || blob.size);

                // Create download URL
                const downloadUrl = URL.createObjectURL(blob);
                const outputFilename = currentFiles[0].name.replace(/\.[^/.]+$/, '') + '.' + selectedFormat;

                // Update download button
                downloadBtn.onclick = () => {
                    const a = document.createElement('a');
                    a.href = downloadUrl;
                    a.download = outputFilename;
                    a.click();
                };

                // Show result info
                const sizeDiff = originalSize - convertedSize;
                const sizePercent = Math.round((sizeDiff / originalSize) * 100);

                let sizeText = `New size: ${formatFileSize(convertedSize)}`;
                if (sizeDiff > 0) {
                    sizeText += ` (${sizePercent}% smaller)`;
                } else if (sizeDiff < 0) {
                    sizeText += ` (${Math.abs(sizePercent)}% larger)`;
                }
                resultInfo.textContent = sizeText;

                // Reset download button text for single file
                downloadBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Download Converted Image
                `;

                // Show result container
                resultContainer.classList.remove('hidden');

                showToast('Image converted successfully!', 'success');
            }

        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            // Re-enable button
            convertBtn.disabled = false;
            convertBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="16 16 12 12 8 16"></polyline>
                    <line x1="12" y1="12" x2="12" y2="21"></line>
                    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"></path>
                </svg>
                Convert Image${currentFiles.length > 1 ? 's' : ''}
            `;
        }
    }

    /**
     * Convert multiple images with progress tracking
     */
    async function convertBulkWithProgress() {
        const convertedImages = [];
        let errorCount = 0;

        // Initialize file list with pending status
        const statuses = currentFiles.map(() => 'pending');
        showFileList(currentFiles, statuses);

        // Update button to show progress
        const updateButtonProgress = (current, total) => {
            convertBtn.innerHTML = `
                <svg class="spinner" viewBox="0 0 24 24" width="20" height="20">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="60" stroke-linecap="round">
                        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                    </circle>
                </svg>
                Converting ${current}/${total}...
            `;
        };

        // Convert each file sequentially
        for (let i = 0; i < currentFiles.length; i++) {
            const file = currentFiles[i];

            // Update status to converting
            updateFileStatus(i, 'converting');
            updateButtonProgress(i + 1, currentFiles.length);

            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('output_format', selectedFormat);
                formData.append('quality', qualitySlider.value);

                const response = await fetch('/api/image/convert-single', {
                    method: 'POST',
                    body: formData,
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.detail || 'Conversion failed');
                }

                const result = await response.json();
                convertedImages.push(result);

                // Update status to done
                updateFileStatus(i, 'done');

            } catch (error) {
                console.error(`Error converting ${file.name}:`, error);
                updateFileStatus(i, 'error');
                errorCount++;
            }
        }

        // Create ZIP file from converted images
        if (convertedImages.length > 0) {
            const zipBlob = await createZipFromBase64Images(convertedImages);
            const downloadUrl = URL.createObjectURL(zipBlob);

            // Update download button
            downloadBtn.onclick = () => {
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = 'converted_images.zip';
                a.click();
            };

            // Show result info
            let resultText = `${convertedImages.length} images converted to ${selectedFormat.toUpperCase()}`;
            if (errorCount > 0) {
                resultText += ` (${errorCount} failed)`;
            }
            resultInfo.textContent = resultText;

            // Update download button text
            downloadBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Download ZIP (${convertedImages.length} images)
            `;

            // Show result container
            resultContainer.classList.remove('hidden');

            showToast(`${convertedImages.length} images converted successfully!`, 'success');
        } else {
            showToast('No images could be converted', 'error');
        }
    }

    /**
     * Create a ZIP file from base64-encoded images (client-side)
     */
    async function createZipFromBase64Images(images) {
        // Use JSZip library (we'll add it) or create a simple zip
        // For now, let's create a simple blob array approach

        // Create a simple ZIP file structure
        const zipParts = [];

        // ZIP file format constants
        const LOCAL_FILE_HEADER_SIG = 0x04034b50;
        const CENTRAL_DIR_HEADER_SIG = 0x02014b50;
        const END_OF_CENTRAL_DIR_SIG = 0x06054b50;

        let offset = 0;
        const centralDirectory = [];

        for (const img of images) {
            // Decode base64 to binary
            const binaryString = atob(img.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const filename = img.filename;
            const filenameBytes = new TextEncoder().encode(filename);

            // Local file header
            const localHeader = new ArrayBuffer(30 + filenameBytes.length);
            const localView = new DataView(localHeader);

            localView.setUint32(0, LOCAL_FILE_HEADER_SIG, true);  // signature
            localView.setUint16(4, 20, true);  // version needed
            localView.setUint16(6, 0, true);   // flags
            localView.setUint16(8, 0, true);   // compression (store)
            localView.setUint16(10, 0, true);  // mod time
            localView.setUint16(12, 0, true);  // mod date
            localView.setUint32(14, 0, true);  // crc32 (we'll skip proper CRC for simplicity)
            localView.setUint32(18, bytes.length, true);  // compressed size
            localView.setUint32(22, bytes.length, true);  // uncompressed size
            localView.setUint16(26, filenameBytes.length, true);  // filename length
            localView.setUint16(28, 0, true);  // extra field length

            // Copy filename
            new Uint8Array(localHeader, 30).set(filenameBytes);

            // Store central directory entry info
            centralDirectory.push({
                offset: offset,
                filenameBytes: filenameBytes,
                size: bytes.length
            });

            zipParts.push(new Uint8Array(localHeader));
            zipParts.push(bytes);

            offset += localHeader.byteLength + bytes.length;
        }

        const centralDirOffset = offset;

        // Central directory entries
        for (const entry of centralDirectory) {
            const centralHeader = new ArrayBuffer(46 + entry.filenameBytes.length);
            const centralView = new DataView(centralHeader);

            centralView.setUint32(0, CENTRAL_DIR_HEADER_SIG, true);
            centralView.setUint16(4, 20, true);   // version made by
            centralView.setUint16(6, 20, true);   // version needed
            centralView.setUint16(8, 0, true);    // flags
            centralView.setUint16(10, 0, true);   // compression
            centralView.setUint16(12, 0, true);   // mod time
            centralView.setUint16(14, 0, true);   // mod date
            centralView.setUint32(16, 0, true);   // crc32
            centralView.setUint32(20, entry.size, true);  // compressed size
            centralView.setUint32(24, entry.size, true);  // uncompressed size
            centralView.setUint16(28, entry.filenameBytes.length, true);  // filename length
            centralView.setUint16(30, 0, true);   // extra field length
            centralView.setUint16(32, 0, true);   // comment length
            centralView.setUint16(34, 0, true);   // disk number start
            centralView.setUint16(36, 0, true);   // internal attrs
            centralView.setUint32(38, 0, true);   // external attrs
            centralView.setUint32(42, entry.offset, true);  // relative offset

            new Uint8Array(centralHeader, 46).set(entry.filenameBytes);

            zipParts.push(new Uint8Array(centralHeader));
            offset += centralHeader.byteLength;
        }

        const centralDirSize = offset - centralDirOffset;

        // End of central directory
        const endRecord = new ArrayBuffer(22);
        const endView = new DataView(endRecord);

        endView.setUint32(0, END_OF_CENTRAL_DIR_SIG, true);
        endView.setUint16(4, 0, true);   // disk number
        endView.setUint16(6, 0, true);   // disk with central dir
        endView.setUint16(8, centralDirectory.length, true);   // entries on disk
        endView.setUint16(10, centralDirectory.length, true);  // total entries
        endView.setUint32(12, centralDirSize, true);   // central dir size
        endView.setUint32(16, centralDirOffset, true); // central dir offset
        endView.setUint16(20, 0, true);  // comment length

        zipParts.push(new Uint8Array(endRecord));

        return new Blob(zipParts, { type: 'application/zip' });
    }

    /**
     * Reset the image converter
     */
    function reset() {
        currentFiles = [];
        previewContainer.classList.add('hidden');
        fileListContainer.classList.add('hidden');
        resultContainer.classList.add('hidden');
        dropZone.classList.remove('has-file');
        convertBtn.disabled = true;
        fileInput.value = '';
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose reset function globally
    window.resetImageConverter = reset;
})();
