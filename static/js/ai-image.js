/**
 * AI Image Editor Module
 * Handles AI-powered image generation and editing
 */

(function() {
    // State
    let currentMode = 'generate'; // 'generate' or 'edit'
    let currentFile = null;
    let presets = null;
    let generatedImageUrl = null;

    // DOM Elements
    let modeTabs, generatePanel, editPanel;
    let promptInput, generateBtn, presetButtons;
    let editDropZone, editFileInput, editPreviewContainer, editPreviewImage;
    let editPromptInput, editBtn, editPresetButtons;
    let resultContainer, resultImage, downloadBtn;

    /**
     * Initialize the AI image module
     */
    function init() {
        // Get DOM elements
        modeTabs = document.querySelectorAll('.ai-mode-tab');
        generatePanel = document.getElementById('ai-generate-panel');
        editPanel = document.getElementById('ai-edit-panel');

        // Generate mode elements
        promptInput = document.getElementById('ai-prompt-input');
        generateBtn = document.getElementById('ai-generate-btn');
        presetButtons = document.querySelectorAll('.ai-preset-btn[data-mode="generate"]');

        // Edit mode elements
        editDropZone = document.getElementById('ai-edit-drop-zone');
        editFileInput = document.getElementById('ai-edit-file-input');
        editPreviewContainer = document.getElementById('ai-edit-preview-container');
        editPreviewImage = document.getElementById('ai-edit-preview');
        editPromptInput = document.getElementById('ai-edit-prompt-input');
        editBtn = document.getElementById('ai-edit-btn');
        editPresetButtons = document.querySelectorAll('.ai-preset-btn[data-mode="edit"]');

        // Result elements
        resultContainer = document.getElementById('ai-result-container');
        resultImage = document.getElementById('ai-result-image');
        downloadBtn = document.getElementById('ai-download-btn');

        // Setup event listeners
        setupModeTabs();
        setupGenerateMode();
        setupEditMode();
        setupResultContainer();

        // Load presets from API
        loadPresets();
    }

    /**
     * Load preset prompts from API
     */
    async function loadPresets() {
        try {
            const response = await fetch('/api/ai-image/presets');
            if (response.ok) {
                presets = await response.json();
            }
        } catch (error) {
            console.error('Failed to load presets:', error);
        }
    }

    /**
     * Setup mode tabs (Generate / Edit)
     */
    function setupModeTabs() {
        modeTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const mode = tab.dataset.mode;
                switchMode(mode);
            });
        });
    }

    function switchMode(mode) {
        currentMode = mode;

        // Update tab states
        modeTabs.forEach(tab => {
            if (tab.dataset.mode === mode) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Show/hide panels
        if (mode === 'generate') {
            generatePanel.classList.remove('hidden');
            editPanel.classList.add('hidden');
        } else {
            generatePanel.classList.add('hidden');
            editPanel.classList.remove('hidden');
        }

        // Hide result when switching modes
        resultContainer.classList.add('hidden');
    }

    /**
     * Setup Generate mode
     */
    function setupGenerateMode() {
        // Preset buttons
        document.querySelectorAll('.ai-preset-btn[data-mode="generate"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = btn.dataset.preset;
                applyGeneratePreset(preset);
            });
        });

        // Generate button
        generateBtn.addEventListener('click', generateImage);

        // Enter key in prompt input
        promptInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                generateImage();
            }
        });
    }

    function applyGeneratePreset(presetName) {
        if (!presets || !presets.generate) return;

        const preset = presets.generate.find(p => p.name === presetName);
        if (preset) {
            // Set placeholder as example
            promptInput.placeholder = preset.placeholder;
            promptInput.focus();
        }
    }

    async function generateImage() {
        const prompt = promptInput.value.trim();
        if (!prompt) {
            showToast('Please enter a prompt', 'error');
            return;
        }

        // Disable button and show loading
        generateBtn.disabled = true;
        generateBtn.innerHTML = `
            <svg class="spinner" viewBox="0 0 24 24" width="20" height="20">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="60" stroke-linecap="round">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                </circle>
            </svg>
            Generating...
        `;

        try {
            const formData = new FormData();
            formData.append('prompt', prompt);

            const response = await fetch('/api/ai-image/generate', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Generation failed');
            }

            // Get the generated image
            const blob = await response.blob();
            showResult(blob, 'generated_image.png');

            showToast('Image generated successfully!', 'success');

        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            // Re-enable button
            generateBtn.disabled = false;
            generateBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
                Generate Image
            `;
        }
    }

    /**
     * Setup Edit mode
     */
    function setupEditMode() {
        // Drop zone events
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            editDropZone.addEventListener(eventName, preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            editDropZone.addEventListener(eventName, () => {
                editDropZone.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            editDropZone.addEventListener(eventName, () => {
                editDropZone.classList.remove('drag-over');
            });
        });

        editDropZone.addEventListener('drop', handleEditDrop);
        editDropZone.addEventListener('click', () => editFileInput.click());
        editFileInput.addEventListener('change', handleEditFileSelect);

        // Preset buttons
        document.querySelectorAll('.ai-preset-btn[data-mode="edit"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = btn.dataset.preset;
                applyEditPreset(preset);
            });
        });

        // Edit button
        editBtn.addEventListener('click', editImage);
    }

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function handleEditDrop(e) {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleEditFile(files[0]);
        }
    }

    function handleEditFileSelect(e) {
        if (e.target.files.length > 0) {
            handleEditFile(e.target.files[0]);
        }
    }

    function handleEditFile(file) {
        const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
        const validExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.heif'];

        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!validTypes.includes(file.type) && !validExtensions.includes(ext)) {
            showToast('Please select a valid image file', 'error');
            return;
        }

        currentFile = file;

        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
            editPreviewImage.src = e.target.result;
            editPreviewContainer.classList.remove('hidden');
            editDropZone.classList.add('has-file');
        };
        reader.readAsDataURL(file);

        // Enable edit button
        editBtn.disabled = false;

        // Hide previous result
        resultContainer.classList.add('hidden');
    }

    function applyEditPreset(presetName) {
        if (!presets || !presets.edit) return;

        const preset = presets.edit.find(p => p.name === presetName);
        if (preset) {
            editPromptInput.value = preset.prompt;
            if (preset.placeholder) {
                editPromptInput.placeholder = `Replace {placeholder} with: ${preset.placeholder}`;
            }
            editPromptInput.focus();
        }
    }

    async function editImage() {
        if (!currentFile) {
            showToast('Please select an image first', 'error');
            return;
        }

        const prompt = editPromptInput.value.trim();
        if (!prompt) {
            showToast('Please enter editing instructions', 'error');
            return;
        }

        // Disable button and show loading
        editBtn.disabled = true;
        editBtn.innerHTML = `
            <svg class="spinner" viewBox="0 0 24 24" width="20" height="20">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="60" stroke-linecap="round">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                </circle>
            </svg>
            Editing...
        `;

        try {
            const formData = new FormData();
            formData.append('file', currentFile);
            formData.append('prompt', prompt);

            const response = await fetch('/api/ai-image/edit', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Editing failed');
            }

            // Get the edited image
            const blob = await response.blob();
            const filename = currentFile.name.replace(/\.[^/.]+$/, '') + '_edited.png';
            showResult(blob, filename);

            showToast('Image edited successfully!', 'success');

        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            // Re-enable button
            editBtn.disabled = false;
            editBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                Edit Image
            `;
        }
    }

    /**
     * Setup result container
     */
    function setupResultContainer() {
        downloadBtn.addEventListener('click', downloadResult);
    }

    function showResult(blob, filename) {
        // Revoke previous URL if exists
        if (generatedImageUrl) {
            URL.revokeObjectURL(generatedImageUrl);
        }

        // Create new URL
        generatedImageUrl = URL.createObjectURL(blob);

        // Update result image
        resultImage.src = generatedImageUrl;
        resultImage.dataset.filename = filename;

        // Show result container
        resultContainer.classList.remove('hidden');

        // Scroll to result
        resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function downloadResult() {
        if (!generatedImageUrl) return;

        const a = document.createElement('a');
        a.href = generatedImageUrl;
        a.download = resultImage.dataset.filename || 'ai_image.png';
        a.click();
    }

    /**
     * Reset the AI image editor
     */
    function reset() {
        currentFile = null;
        promptInput.value = '';
        editPromptInput.value = '';
        editPreviewContainer.classList.add('hidden');
        editDropZone.classList.remove('has-file');
        resultContainer.classList.add('hidden');
        editBtn.disabled = true;
        editFileInput.value = '';

        if (generatedImageUrl) {
            URL.revokeObjectURL(generatedImageUrl);
            generatedImageUrl = null;
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose reset function globally
    window.resetAIImageEditor = reset;
})();
