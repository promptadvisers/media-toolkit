/**
 * PDF Tools Module
 * Handles PDF merging and splitting UI and API calls
 */

(function() {
    // State
    let mergeFiles = [];
    let splitFile = null;

    // DOM Elements
    let mergeTab, splitTab;
    let mergePanel, splitPanel;
    let mergeDropZone, mergeFileInput, mergeFileList, mergeBtn, mergeResultContainer, mergeDownloadBtn;
    let splitDropZone, splitFileInput, splitPreview, splitFileName, splitPageCount;
    let splitModeAll, splitModeRange, splitPagesInput, splitBtn, splitResultContainer, splitDownloadBtn;

    /**
     * Initialize the PDF tools module
     */
    function init() {
        // Get tab elements
        mergeTab = document.getElementById('pdf-merge-tab');
        splitTab = document.getElementById('pdf-split-tab');
        mergePanel = document.getElementById('pdf-merge-panel');
        splitPanel = document.getElementById('pdf-split-panel');

        // Get merge elements
        mergeDropZone = document.getElementById('pdf-merge-drop-zone');
        mergeFileInput = document.getElementById('pdf-merge-file-input');
        mergeFileList = document.getElementById('pdf-merge-file-list');
        mergeBtn = document.getElementById('pdf-merge-btn');
        mergeResultContainer = document.getElementById('pdf-merge-result-container');
        mergeDownloadBtn = document.getElementById('pdf-merge-download-btn');

        // Get split elements
        splitDropZone = document.getElementById('pdf-split-drop-zone');
        splitFileInput = document.getElementById('pdf-split-file-input');
        splitPreview = document.getElementById('pdf-split-preview');
        splitFileName = document.getElementById('pdf-split-file-name');
        splitPageCount = document.getElementById('pdf-split-page-count');
        splitModeAll = document.getElementById('split-mode-all');
        splitModeRange = document.getElementById('split-mode-range');
        splitPagesInput = document.getElementById('split-pages-input');
        splitBtn = document.getElementById('pdf-split-btn');
        splitResultContainer = document.getElementById('pdf-split-result-container');
        splitDownloadBtn = document.getElementById('pdf-split-download-btn');

        // Setup event listeners
        setupTabs();
        setupMergeDropZone();
        setupSplitDropZone();
        setupSplitMode();
        setupMergeButton();
        setupSplitButton();
    }

    /**
     * Setup tab switching
     */
    function setupTabs() {
        mergeTab.addEventListener('click', () => {
            mergeTab.classList.add('active');
            splitTab.classList.remove('active');
            mergePanel.classList.remove('hidden');
            splitPanel.classList.add('hidden');
        });

        splitTab.addEventListener('click', () => {
            splitTab.classList.add('active');
            mergeTab.classList.remove('active');
            splitPanel.classList.remove('hidden');
            mergePanel.classList.add('hidden');
        });
    }

    /**
     * Setup merge drop zone
     */
    function setupMergeDropZone() {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            mergeDropZone.addEventListener(eventName, preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            mergeDropZone.addEventListener(eventName, () => {
                mergeDropZone.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            mergeDropZone.addEventListener(eventName, () => {
                mergeDropZone.classList.remove('drag-over');
            });
        });

        mergeDropZone.addEventListener('drop', (e) => {
            const files = [...e.dataTransfer.files].filter(f => f.name.toLowerCase().endsWith('.pdf'));
            files.forEach(addMergeFile);
        });

        mergeDropZone.addEventListener('click', () => mergeFileInput.click());
        mergeFileInput.addEventListener('change', (e) => {
            [...e.target.files].forEach(addMergeFile);
            mergeFileInput.value = '';
        });
    }

    /**
     * Add a file to the merge list
     */
    function addMergeFile(file) {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            showToast('Only PDF files are allowed', 'error');
            return;
        }

        mergeFiles.push(file);
        renderMergeFileList();
        updateMergeButton();
    }

    /**
     * Remove a file from the merge list
     */
    function removeMergeFile(index) {
        mergeFiles.splice(index, 1);
        renderMergeFileList();
        updateMergeButton();
    }

    /**
     * Move a file in the merge list
     */
    function moveMergeFile(fromIndex, toIndex) {
        const [file] = mergeFiles.splice(fromIndex, 1);
        mergeFiles.splice(toIndex, 0, file);
        renderMergeFileList();
    }

    /**
     * Render the merge file list
     */
    function renderMergeFileList() {
        if (mergeFiles.length === 0) {
            mergeFileList.classList.add('hidden');
            return;
        }

        mergeFileList.classList.remove('hidden');
        mergeFileList.innerHTML = mergeFiles.map((file, index) => `
            <div class="pdf-file-item" draggable="true" data-index="${index}">
                <div class="pdf-file-drag-handle">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="8" y1="6" x2="16" y2="6"></line>
                        <line x1="8" y1="12" x2="16" y2="12"></line>
                        <line x1="8" y1="18" x2="16" y2="18"></line>
                    </svg>
                </div>
                <div class="pdf-file-info">
                    <span class="pdf-file-name">${file.name}</span>
                    <span class="pdf-file-size">${formatFileSize(file.size)}</span>
                </div>
                <button class="pdf-file-remove" onclick="window.removeMergeFile(${index})">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `).join('');

        // Setup drag and drop for reordering
        setupDragReorder();
    }

    /**
     * Setup drag and drop reordering
     */
    function setupDragReorder() {
        const items = mergeFileList.querySelectorAll('.pdf-file-item');
        let draggedItem = null;

        items.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                draggedItem = item;
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                draggedItem = null;
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (draggedItem && draggedItem !== item) {
                    const rect = item.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    if (e.clientY < midY) {
                        item.parentNode.insertBefore(draggedItem, item);
                    } else {
                        item.parentNode.insertBefore(draggedItem, item.nextSibling);
                    }
                    // Update file order
                    updateFileOrder();
                }
            });
        });
    }

    /**
     * Update file order based on DOM order
     */
    function updateFileOrder() {
        const items = mergeFileList.querySelectorAll('.pdf-file-item');
        const newOrder = [];
        items.forEach(item => {
            const index = parseInt(item.dataset.index);
            newOrder.push(mergeFiles[index]);
        });
        mergeFiles = newOrder;
        // Re-render to update indices
        setTimeout(renderMergeFileList, 0);
    }

    /**
     * Update merge button state
     */
    function updateMergeButton() {
        mergeBtn.disabled = mergeFiles.length < 2;
        mergeResultContainer.classList.add('hidden');
    }

    /**
     * Setup split drop zone
     */
    function setupSplitDropZone() {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            splitDropZone.addEventListener(eventName, preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            splitDropZone.addEventListener(eventName, () => {
                splitDropZone.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            splitDropZone.addEventListener(eventName, () => {
                splitDropZone.classList.remove('drag-over');
            });
        });

        splitDropZone.addEventListener('drop', (e) => {
            const files = [...e.dataTransfer.files].filter(f => f.name.toLowerCase().endsWith('.pdf'));
            if (files.length > 0) {
                setSplitFile(files[0]);
            }
        });

        splitDropZone.addEventListener('click', () => splitFileInput.click());
        splitFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                setSplitFile(e.target.files[0]);
            }
        });
    }

    /**
     * Set the file for splitting
     */
    async function setSplitFile(file) {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            showToast('Only PDF files are allowed', 'error');
            return;
        }

        splitFile = file;
        splitFileName.textContent = file.name;
        splitPreview.classList.remove('hidden');
        splitDropZone.classList.add('has-file');
        splitResultContainer.classList.add('hidden');

        // Get page count from API
        try {
            const formData = new FormData();
            formData.append('file', file);
            const response = await fetch('/api/pdf/info', {
                method: 'POST',
                body: formData
            });
            if (response.ok) {
                const info = await response.json();
                splitPageCount.textContent = `${info.num_pages} pages`;
            }
        } catch (e) {
            splitPageCount.textContent = 'Unknown pages';
        }

        splitBtn.disabled = false;
    }

    /**
     * Setup split mode toggle
     */
    function setupSplitMode() {
        splitModeAll.addEventListener('change', () => {
            splitPagesInput.parentElement.classList.add('hidden');
        });

        splitModeRange.addEventListener('change', () => {
            splitPagesInput.parentElement.classList.remove('hidden');
            splitPagesInput.focus();
        });
    }

    /**
     * Setup merge button
     */
    function setupMergeButton() {
        mergeBtn.addEventListener('click', mergePdfs);
    }

    /**
     * Merge PDFs
     */
    async function mergePdfs() {
        if (mergeFiles.length < 2) {
            showToast('Need at least 2 PDFs to merge', 'error');
            return;
        }

        mergeBtn.disabled = true;
        mergeBtn.innerHTML = `
            <svg class="spinner" viewBox="0 0 24 24" width="20" height="20">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="60" stroke-linecap="round">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                </circle>
            </svg>
            Merging...
        `;

        try {
            const formData = new FormData();
            mergeFiles.forEach(file => {
                formData.append('files', file);
            });

            const response = await fetch('/api/pdf/merge', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Merge failed');
            }

            const blob = await response.blob();
            const downloadUrl = URL.createObjectURL(blob);

            mergeDownloadBtn.onclick = () => {
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = 'merged.pdf';
                a.click();
            };

            mergeResultContainer.classList.remove('hidden');
            showToast('PDFs merged successfully!', 'success');

        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            mergeBtn.disabled = false;
            mergeBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"></path>
                </svg>
                Merge PDFs
            `;
        }
    }

    /**
     * Setup split button
     */
    function setupSplitButton() {
        splitBtn.addEventListener('click', splitPdf);
    }

    /**
     * Split PDF
     */
    async function splitPdf() {
        if (!splitFile) {
            showToast('Please select a PDF file', 'error');
            return;
        }

        const mode = splitModeRange.checked ? 'range' : 'all';
        const pages = splitPagesInput.value.trim();

        if (mode === 'range' && !pages) {
            showToast('Please specify pages to extract', 'error');
            return;
        }

        splitBtn.disabled = true;
        splitBtn.innerHTML = `
            <svg class="spinner" viewBox="0 0 24 24" width="20" height="20">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="60" stroke-linecap="round">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                </circle>
            </svg>
            Splitting...
        `;

        try {
            const formData = new FormData();
            formData.append('file', splitFile);
            formData.append('mode', mode);
            if (mode === 'range') {
                formData.append('pages', pages);
            }

            const response = await fetch('/api/pdf/split', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Split failed');
            }

            const blob = await response.blob();
            const downloadUrl = URL.createObjectURL(blob);
            const filename = mode === 'all'
                ? splitFile.name.replace('.pdf', '_pages.zip')
                : splitFile.name.replace('.pdf', '_extracted.pdf');

            splitDownloadBtn.onclick = () => {
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = filename;
                a.click();
            };

            // Update button text based on mode
            splitDownloadBtn.innerHTML = mode === 'all' ? `
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Download ZIP (All Pages)
            ` : `
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Download Extracted PDF
            `;

            splitResultContainer.classList.remove('hidden');
            showToast('PDF split successfully!', 'success');

        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            splitBtn.disabled = false;
            splitBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="9" y1="3" x2="9" y2="21"></line>
                </svg>
                Split PDF
            `;
        }
    }

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose functions globally
    window.removeMergeFile = removeMergeFile;
})();
