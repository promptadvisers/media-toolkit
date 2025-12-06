/**
 * Media Toolkit - Main JavaScript
 * Handles navigation and common utilities
 */

// ============================================
// Navigation
// ============================================

// Initialize feature card click handlers
document.querySelectorAll('.feature-card').forEach(card => {
    card.addEventListener('click', () => {
        const feature = card.dataset.feature;
        showFeaturePanel(feature);
    });
});

/**
 * Show a specific feature panel and hide the main menu
 */
function showFeaturePanel(featureName) {
    // Hide main menu
    document.getElementById('main-menu').classList.add('hidden');

    // Hide all panels first
    document.querySelectorAll('.feature-panel').forEach(panel => {
        panel.classList.add('hidden');
    });

    // Show the selected panel
    const panel = document.getElementById(`${featureName}-panel`);
    if (panel) {
        panel.classList.remove('hidden');
    }
}

/**
 * Show the main menu and hide all feature panels
 */
function showMainMenu() {
    // Hide all panels
    document.querySelectorAll('.feature-panel').forEach(panel => {
        panel.classList.add('hidden');
    });

    // Show main menu
    document.getElementById('main-menu').classList.remove('hidden');
}

// ============================================
// Drag and Drop Utilities
// ============================================

/**
 * Initialize a drop zone element
 * @param {HTMLElement} element - The drop zone element
 * @param {Function} onDrop - Callback when files are dropped
 * @param {Object} options - Options (acceptedTypes, multiple)
 */
function initDropZone(element, onDrop, options = {}) {
    const { acceptedTypes = [], multiple = false } = options;

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        element.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight drop zone on drag enter/over
    ['dragenter', 'dragover'].forEach(eventName => {
        element.addEventListener(eventName, () => {
            element.classList.add('drag-over');
        });
    });

    // Remove highlight on drag leave/drop
    ['dragleave', 'drop'].forEach(eventName => {
        element.addEventListener(eventName, () => {
            element.classList.remove('drag-over');
        });
    });

    // Handle drop
    element.addEventListener('drop', (e) => {
        let files = [...e.dataTransfer.files];

        // Filter by accepted types if specified
        if (acceptedTypes.length > 0) {
            files = files.filter(file => {
                const ext = '.' + file.name.split('.').pop().toLowerCase();
                return acceptedTypes.includes(ext) || acceptedTypes.includes(file.type);
            });
        }

        // Limit to single file if not multiple
        if (!multiple && files.length > 1) {
            files = [files[0]];
        }

        if (files.length > 0) {
            onDrop(files);
        }
    });

    // Also handle click to open file picker
    element.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = multiple;

        if (acceptedTypes.length > 0) {
            input.accept = acceptedTypes.join(',');
        }

        input.onchange = (e) => {
            const files = [...e.target.files];
            if (files.length > 0) {
                onDrop(files);
            }
        };

        input.click();
    });
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// ============================================
// File Upload Utilities
// ============================================

/**
 * Upload a file to an endpoint with progress tracking
 * @param {string} endpoint - API endpoint
 * @param {FormData} formData - Form data with file
 * @param {Function} onProgress - Progress callback (0-100)
 * @returns {Promise} - Response data
 */
async function uploadFile(endpoint, formData, onProgress = null) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Track upload progress
        if (onProgress) {
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    onProgress(percent);
                }
            });
        }

        // Handle completion
        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    resolve(JSON.parse(xhr.responseText));
                } catch {
                    resolve(xhr.responseText);
                }
            } else {
                try {
                    reject(JSON.parse(xhr.responseText));
                } catch {
                    reject({ error: xhr.statusText });
                }
            }
        });

        // Handle errors
        xhr.addEventListener('error', () => {
            reject({ error: 'Upload failed' });
        });

        xhr.open('POST', endpoint);
        xhr.send(formData);
    });
}

// ============================================
// Toast Notifications
// ============================================

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - 'success' or 'error'
 * @param {number} duration - Auto-dismiss duration in ms
 */
function showToast(message, type = 'success', duration = 5000) {
    // Create container if it doesn't exist
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    // Create toast
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span>${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;

    container.appendChild(toast);

    // Auto-dismiss
    if (duration > 0) {
        setTimeout(() => {
            toast.remove();
        }, duration);
    }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted size string
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format duration for display
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted duration string (MM:SS or HH:MM:SS)
 */
function formatDuration(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Trigger file download
 * @param {string} url - Download URL
 * @param {string} filename - Suggested filename
 */
function downloadFile(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ============================================
// Initialization
// ============================================

console.log('Media Toolkit loaded successfully');
