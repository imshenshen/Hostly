const tauri = window.__TAURI__ || {};
const { invoke } = tauri.core || {};
const { ask, message, open, save: saveDialog } = tauri.dialog || {};
const { readTextFile, writeTextFile } = tauri.fs || {}; // We'll use backend commands instead

console.log('Tauri APIs initialized:', {
    hasInvoke: !!invoke,
    hasDialog: !!ask,
    hasFs: !!readTextFile
});

// State
let profileMetadata = [];
let folderMetadata = [];
let profileContentCache = [];
let currentProfileId = null;
let commonConfig = '';
let systemHosts = '';

// DOM Elements
const profileList = document.getElementById('profile-list');
const editor = document.getElementById('editor');
const currentNameDisplay = document.getElementById('current-profile-name');
const hostSearchInput = document.getElementById('host-search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const hostSearchResults = document.getElementById('host-search-results');
const editorFindBar = document.getElementById('editor-find-bar');
const editorFindInput = document.getElementById('editor-find-input');
const editorFindCount = document.getElementById('editor-find-count');
const editorFindPrev = document.getElementById('editor-find-prev');
const editorFindNext = document.getElementById('editor-find-next');
const editorFindClose = document.getElementById('editor-find-close');
const saveBtn = document.getElementById('save-btn');
const renameBtn = document.getElementById('rename-btn');
const addBtn = document.getElementById('add-profile-btn');
const addFolderBtn = document.getElementById('add-folder-btn');
const importBtn = document.getElementById('import-btn');
const importSwitchHostsBtn = document.getElementById('import-switchhosts-btn');
const exportBtn = document.getElementById('export-btn');
const refreshBtn = document.getElementById('refresh-btn');
const systemEditBtn = document.getElementById('system-edit-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsModalOverlay = document.getElementById('settings-modal-overlay');
const settingsCloseBtn = document.getElementById('settings-close-btn');

// Status Bar
const remoteStatusBar = document.getElementById('remote-status-bar');
const lastUpdateTimeEl = document.getElementById('last-update-time');
const nextUpdateTimeEl = document.getElementById('next-update-time');

// Modal Logic
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalInput = document.getElementById('modal-input');
const modalFolderSelect = document.getElementById('modal-folder-select');
const modalConfirm = document.getElementById('modal-confirm');
const modalCancel = document.getElementById('modal-cancel');
// New Fields
const modalUrl = document.getElementById('modal-url');
const autoUpdateFields = document.getElementById('auto-update-fields');
const modalIntervalValue = document.getElementById('modal-interval-value');
const modalIntervalUnit = document.getElementById('modal-interval-unit');
const remoteFields = document.getElementById('remote-fields');
const typeRadios = document.getElementsByName('profile-type');
const updateModeRadios = document.getElementsByName('update-mode');

let modalCallback = null;
let dragState = null;
let folderDragState = null;
let suppressClickUntil = 0;
let editorFindMatches = [];
let editorFindIndex = -1;
let metadataSyncInProgress = false;

function clearFolderDragState() {
    document.querySelectorAll('.folder-group.drag-over').forEach(el => el.classList.remove('drag-over'));
}

function clearFolderSortState() {
    document.querySelectorAll('.folder-group.folder-sort-before').forEach(el => el.classList.remove('folder-sort-before'));
    document.querySelectorAll('.folder-group.folder-sort-after').forEach(el => el.classList.remove('folder-sort-after'));
}

function getFolderGroupFromPoint(x, y) {
    return document.elementFromPoint(x, y)?.closest('.folder-group') || null;
}

function endCustomDrag() {
    clearFolderDragState();
    if (!dragState) return;
    dragState.element.classList.remove('is-dragging');
    document.body.classList.remove('dragging-profile');
    if (dragState.ghost?.parentNode) {
        dragState.ghost.parentNode.removeChild(dragState.ghost);
    }
    dragState = null;
}

function endFolderSortDrag() {
    clearFolderSortState();
    if (!folderDragState) return;
    folderDragState.element.classList.remove('is-dragging');
    document.body.classList.remove('dragging-profile');
    if (folderDragState.ghost?.parentNode) {
        folderDragState.ghost.parentNode.removeChild(folderDragState.ghost);
    }
    folderDragState = null;
}

function startCustomDrag(profile, element, event) {
    if (event.button !== 0) return;
    dragState = {
        profileId: profile.id,
        sourceFolderId: profile.folder_id,
        element,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
        targetFolderId: null,
        ghost: null,
    };
}

function startFolderSortDrag(folderId, element, event) {
    if (event.button !== 0) return;
    folderDragState = {
        folderId,
        element,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
        targetFolderId: null,
        targetPosition: 'after',
        ghost: null,
    };
}

function buildDragGhost(element) {
    const ghost = element.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.width = `${element.getBoundingClientRect().width}px`;
    document.body.appendChild(ghost);
    return ghost;
}

function buildFolderDragGhost(element) {
    const ghost = element.cloneNode(true);
    ghost.classList.add('drag-ghost', 'folder-drag-ghost');
    ghost.style.width = `${element.getBoundingClientRect().width}px`;
    document.body.appendChild(ghost);
    return ghost;
}

function updateCustomDrag(event) {
    if (!dragState) return;
    const moved = Math.abs(event.clientX - dragState.startX) + Math.abs(event.clientY - dragState.startY);
    if (!dragState.dragging && moved < 6) return;

    if (!dragState.dragging) {
        dragState.dragging = true;
        dragState.element.classList.add('is-dragging');
        document.body.classList.add('dragging-profile');
        dragState.ghost = buildDragGhost(dragState.element);
    }

    suppressClickUntil = Date.now() + 250;
    dragState.ghost.style.left = `${event.clientX + 14}px`;
    dragState.ghost.style.top = `${event.clientY + 14}px`;

    const group = getFolderGroupFromPoint(event.clientX, event.clientY);
    clearFolderDragState();
    dragState.targetFolderId = null;
    if (!group) return;

    const folderId = group.dataset.folderId;
    if (folderId && folderId !== dragState.sourceFolderId) {
        group.classList.add('drag-over');
        dragState.targetFolderId = folderId;
    }
}

function updateFolderSortDrag(event) {
    if (!folderDragState) return;
    const moved = Math.abs(event.clientX - folderDragState.startX) + Math.abs(event.clientY - folderDragState.startY);
    if (!folderDragState.dragging && moved < 6) return;

    if (!folderDragState.dragging) {
        folderDragState.dragging = true;
        folderDragState.element.classList.add('is-dragging');
        document.body.classList.add('dragging-profile');
        folderDragState.ghost = buildFolderDragGhost(folderDragState.element);
    }

    suppressClickUntil = Date.now() + 250;
    folderDragState.ghost.style.left = `${event.clientX + 14}px`;
    folderDragState.ghost.style.top = `${event.clientY + 14}px`;

    clearFolderSortState();
    folderDragState.targetFolderId = null;

    const targetGroup = getFolderGroupFromPoint(event.clientX, event.clientY);
    if (!targetGroup) return;
    const targetFolderId = targetGroup.dataset.folderId;
    if (!targetFolderId || targetFolderId === folderDragState.folderId) return;

    const rect = targetGroup.getBoundingClientRect();
    const insertBefore = event.clientY < rect.top + rect.height / 2;
    folderDragState.targetFolderId = targetFolderId;
    folderDragState.targetPosition = insertBefore ? 'before' : 'after';
    targetGroup.classList.add(insertBefore ? 'folder-sort-before' : 'folder-sort-after');
}

async function finishCustomDrag() {
    if (!dragState) return;
    const shouldMove = dragState.dragging && dragState.targetFolderId && dragState.targetFolderId !== dragState.sourceFolderId;
    const profileId = dragState.profileId;
    const folderId = dragState.targetFolderId;
    endCustomDrag();
    if (shouldMove) {
        await moveProfileByDrag(profileId, folderId);
    }
}

async function finishFolderSortDrag() {
    if (!folderDragState) return;
    const shouldReorder = folderDragState.dragging && folderDragState.targetFolderId;
    const sourceId = folderDragState.folderId;
    const targetId = folderDragState.targetFolderId;
    const targetPosition = folderDragState.targetPosition;
    endFolderSortDrag();
    if (!shouldReorder) return;

    const currentOrder = folderMetadata.map(f => f.id);
    const withoutSource = currentOrder.filter(id => id !== sourceId);
    const targetIndex = withoutSource.indexOf(targetId);
    if (targetIndex < 0) return;
    const insertIndex = targetPosition === 'before' ? targetIndex : targetIndex + 1;
    withoutSource.splice(insertIndex, 0, sourceId);

    try {
        await invoke('reorder_folders', { orderedIds: withoutSource });
        await loadData();
    } catch (e) {
        showToast(`文件夹排序失败: ${e}`, 'error');
    }
}

function getDefaultFolderId() {
    if (currentProfileId && currentProfileId !== 'system' && currentProfileId !== 'common') {
        const current = profileMetadata.find(x => x.id === currentProfileId);
        if (current?.folder_id) return current.folder_id;
    }
    return folderMetadata[0]?.id || 'default';
}

function getFolderNameById(folderId) {
    const folder = folderMetadata.find(x => x.id === folderId);
    return folder ? folder.name : '未知文件夹';
}

let lineFlashToken = 0;

function getLineRange(lineNumber) {
    const lines = editor.value.split('\n');
    const safeLine = Math.max(1, lineNumber);
    let start = 0;
    for (let i = 0; i < safeLine - 1 && i < lines.length; i += 1) {
        start += lines[i].length + 1;
    }
    const lineText = lines[safeLine - 1] || '';
    return { start, end: start + lineText.length };
}

function scrollToLine(lineNumber) {
    const style = window.getComputedStyle(editor);
    const lineHeight = parseFloat(style.lineHeight) || 20;
    const targetTop = Math.max(0, (lineNumber - 1) * lineHeight - (editor.clientHeight * 0.4));
    editor.scrollTop = targetTop;
}

async function flashLine(lineNumber) {
    const token = Date.now();
    lineFlashToken = token;
    const range = getLineRange(lineNumber);
    const collapseAt = range.start;

    const doSelect = (s, e) => {
        editor.focus();
        editor.setSelectionRange(s, e);
    };

    doSelect(range.start, range.end);
    await new Promise((r) => setTimeout(r, 140));
    if (lineFlashToken !== token) return;
    doSelect(collapseAt, collapseAt);
    await new Promise((r) => setTimeout(r, 120));
    if (lineFlashToken !== token) return;
    doSelect(range.start, range.end);
    await new Promise((r) => setTimeout(r, 180));
    if (lineFlashToken !== token) return;
    doSelect(collapseAt, collapseAt);
}

function jumpToLine(lineNumber) {
    const range = getLineRange(lineNumber);
    scrollToLine(lineNumber);
    editor.focus();
    editor.setSelectionRange(range.start, range.start);
}

async function openProfileAtLine(profileId, lineNumber) {
    await selectProfile(profileId);
    jumpToLine(lineNumber);
    await flashLine(lineNumber);
}

function updateEditorFindCount() {
    const total = editorFindMatches.length;
    const current = total > 0 ? editorFindIndex + 1 : 0;
    editorFindCount.innerText = `${current}/${total}`;
}

function selectEditorFindMatch(index) {
    if (editorFindMatches.length === 0) {
        editorFindIndex = -1;
        updateEditorFindCount();
        return;
    }
    const total = editorFindMatches.length;
    editorFindIndex = ((index % total) + total) % total;
    const match = editorFindMatches[editorFindIndex];
    editor.focus();
    editor.setSelectionRange(match.start, match.end);

    const before = editor.value.slice(0, match.start);
    const lineNumber = before.split('\n').length;
    scrollToLine(lineNumber);
    updateEditorFindCount();
}

function refreshEditorFindMatches(jumpToFirst = true) {
    const query = (editorFindInput.value || '').toLowerCase();
    const text = editor.value || '';
    editorFindMatches = [];
    if (!query) {
        editorFindIndex = -1;
        updateEditorFindCount();
        return;
    }

    let from = 0;
    while (from < text.length) {
        const idx = text.toLowerCase().indexOf(query, from);
        if (idx === -1) break;
        editorFindMatches.push({ start: idx, end: idx + query.length });
        from = idx + Math.max(1, query.length);
        if (editorFindMatches.length >= 500) break;
    }

    if (editorFindMatches.length === 0) {
        editorFindIndex = -1;
        updateEditorFindCount();
        return;
    }

    if (jumpToFirst || editorFindIndex < 0 || editorFindIndex >= editorFindMatches.length) {
        selectEditorFindMatch(0);
    } else {
        updateEditorFindCount();
    }
}

function openEditorFind() {
    editorFindBar.classList.remove('hidden');
    const selectedText = editor.value.slice(editor.selectionStart, editor.selectionEnd).trim();
    if (selectedText && selectedText.length <= 120) {
        editorFindInput.value = selectedText;
    }
    refreshEditorFindMatches(true);
    editor.focus();
}

function closeEditorFind() {
    editorFindBar.classList.add('hidden');
    editorFindMatches = [];
    editorFindIndex = -1;
    updateEditorFindCount();
    editor.focus();
}

function clearGlobalSearch() {
    if (!hostSearchInput.value && hostSearchResults.classList.contains('hidden')) return false;
    hostSearchInput.value = '';
    renderSearchResults('');
    return true;
}

function updateFindInputValue(nextValue, caretPos = nextValue.length) {
    editorFindInput.value = nextValue;
    const safePos = Math.max(0, Math.min(caretPos, nextValue.length));
    editorFindInput.setSelectionRange(safePos, safePos);
    refreshEditorFindMatches(true);
}

function handleEditorFindTyping(e) {
    if (editorFindBar.classList.contains('hidden')) return false;
    if (document.activeElement === editorFindInput) return false;
    if (e.metaKey || e.ctrlKey || e.altKey) return false;

    const key = e.key;
    const value = editorFindInput.value || '';
    const start = editorFindInput.selectionStart ?? value.length;
    const end = editorFindInput.selectionEnd ?? start;

    if (key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
            selectEditorFindMatch(editorFindIndex - 1);
        } else {
            selectEditorFindMatch(editorFindIndex + 1);
        }
        return true;
    }

    if (key === 'Backspace') {
        e.preventDefault();
        if (start !== end) {
            updateFindInputValue(value.slice(0, start) + value.slice(end), start);
        } else if (start > 0) {
            updateFindInputValue(value.slice(0, start - 1) + value.slice(start), start - 1);
        }
        return true;
    }

    if (key === 'Delete') {
        e.preventDefault();
        if (start !== end) {
            updateFindInputValue(value.slice(0, start) + value.slice(end), start);
        } else if (start < value.length) {
            updateFindInputValue(value.slice(0, start) + value.slice(start + 1), start);
        }
        return true;
    }

    if (key === 'ArrowLeft') {
        e.preventDefault();
        editorFindInput.setSelectionRange(Math.max(0, start - 1), Math.max(0, start - 1));
        return true;
    }
    if (key === 'ArrowRight') {
        e.preventDefault();
        editorFindInput.setSelectionRange(Math.min(value.length, end + 1), Math.min(value.length, end + 1));
        return true;
    }
    if (key === 'Home') {
        e.preventDefault();
        editorFindInput.setSelectionRange(0, 0);
        return true;
    }
    if (key === 'End') {
        e.preventDefault();
        editorFindInput.setSelectionRange(value.length, value.length);
        return true;
    }

    if (key.length === 1) {
        e.preventDefault();
        const inserted = value.slice(0, start) + key + value.slice(end);
        updateFindInputValue(inserted, start + 1);
        return true;
    }

    return false;
}

function syncFolderOptions(selectedFolderId) {
    modalFolderSelect.innerHTML = '';
    folderMetadata.forEach(folder => {
        const option = document.createElement('option');
        option.value = folder.id;
        option.innerText = folder.name;
        option.selected = folder.id === selectedFolderId;
        modalFolderSelect.appendChild(option);
    });
}


function showPrompt(title, initialData, callback) {
    modalTitle.innerText = title;

    // Handle simple string (legacy) or object
    const data = typeof initialData === 'object'
        ? initialData
        : { name: initialData || '', folderId: getDefaultFolderId() };
    const isFolderMode = data.mode === 'folder';

    modalInput.value = data.name || '';
    syncFolderOptions(data.folderId || getDefaultFolderId());
    modalFolderSelect.closest('.form-group').classList.toggle('hidden', isFolderMode);
    document.querySelector('input[name="profile-type"][value="local"]').closest('.form-group').classList.toggle('hidden', isFolderMode);

    // Reset or Fill extended fields
    if (isFolderMode) {
        typeRadios[0].checked = true;
        remoteFields.classList.add('hidden');
        modalUrl.value = '';
        updateModeRadios[0].checked = true;
        autoUpdateFields.classList.add('hidden');
        modalIntervalValue.value = '1';
        modalIntervalUnit.value = '3600';
    } else if (data.isRemote) {
        typeRadios[1].checked = true; // Remote
        remoteFields.classList.remove('hidden');
        modalUrl.value = data.url || '';

        if (data.updateInterval) {
             updateModeRadios[1].checked = true; // Auto
             autoUpdateFields.classList.remove('hidden');

             // Convert seconds to best unit
             let sec = data.updateInterval;
             let unit = 1;
             if (sec % 86400 === 0) unit = 86400;
             else if (sec % 3600 === 0) unit = 3600;
             else if (sec % 60 === 0) unit = 60;

             modalIntervalUnit.value = unit.toString();
             modalIntervalValue.value = (sec / unit).toString();
        } else {
             updateModeRadios[0].checked = true; // Manual
             autoUpdateFields.classList.add('hidden');
             modalIntervalValue.value = '1';
             modalIntervalUnit.value = '3600';
        }
    } else {
        // Local Default
        typeRadios[0].checked = true; // Local
        remoteFields.classList.add('hidden');
        modalUrl.value = '';
        updateModeRadios[0].checked = true;
        autoUpdateFields.classList.add('hidden');
        modalIntervalValue.value = '1';
        modalIntervalUnit.value = '3600';
    }

    modalOverlay.classList.remove('hidden');
    modalInput.focus();
    modalCallback = callback;
}


modalInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
        modalConfirm.click();
    } else if (e.key === 'Escape') {
        modalCancel.click();
    }
};

modalConfirm.onclick = () => {
    const name = modalInput.value;
    const folderId = modalFolderSelect.value;
    const isFolderMode = modalFolderSelect.closest('.form-group').classList.contains('hidden');
    const isRemote = typeRadios[1].checked;
    const url = modalUrl.value;

    let interval = 0;
    if (updateModeRadios[1].checked) { // Auto
        const val = parseInt(modalIntervalValue.value, 10) || 0;
        const unit = parseInt(modalIntervalUnit.value, 10) || 1;
        interval = val * unit;
    }

    console.log('Modal Confirm:', { name, isRemote, url, interval });

    if (modalCallback) {
        modalCallback({ name, folderId, isRemote: isFolderMode ? false : isRemote, url: isFolderMode ? '' : url, interval: isFolderMode ? 0 : interval });
    }
    modalOverlay.classList.add('hidden');
};

// Type Toggle Logic
typeRadios.forEach(radio => {
    radio.onchange = () => {
        if (radio.value === 'remote') {
            remoteFields.classList.remove('hidden');
        } else {
            remoteFields.classList.add('hidden');
        }
    };
});

// Update Mode Toggle Logic
updateModeRadios.forEach(radio => {
    radio.onchange = () => {
        if (radio.value === 'auto') {
            autoUpdateFields.classList.remove('hidden');
        } else {
            autoUpdateFields.classList.add('hidden');
        }
    };
});


modalCancel.onclick = () => {
    modalOverlay.classList.add('hidden');
};

// Toast Logic
const toastContainer = document.getElementById('toast-container');

function showToast(text, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `<span>${icon}</span><span>${text}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Functions
async function loadData() {
    console.log('loadData starting...');
    try {
        if (!invoke) {
            console.error('Invoke not available!');
            return;
        }
        const config = await invoke('load_config');
        console.log('Config loaded:', config);

        profileMetadata = config.profiles || [];
        folderMetadata = config.folders || [];
        profileContentCache = await invoke('list_profiles');

        commonConfig = await invoke('load_common_config');
        console.log('Common config loaded');

        renderList();
        renderSearchResults(hostSearchInput.value);

        // Refresh editor if common is active
        if (currentProfileId === 'common') {
            editor.value = commonConfig;
        } else if (currentProfileId && currentProfileId !== 'system') {
            const match = profileContentCache.find(x => x.id === currentProfileId);
            if (match) editor.value = match.content;
        }
    } catch (e) {
        console.error('loadData error:', e);
        showToast(`加载失败: ${e}`, 'error');
    }
}

async function syncExternalState() {
    if (metadataSyncInProgress) return;
    metadataSyncInProgress = true;
    try {
        const config = await invoke('load_config');
        profileMetadata = config.profiles || [];
        folderMetadata = config.folders || [];
        profileContentCache = await invoke('list_profiles');
        renderList();
        renderSearchResults(hostSearchInput.value);

        const current = currentProfileId ? profileMetadata.find(x => x.id === currentProfileId) : null;
        if (currentProfileId && currentProfileId !== 'system' && currentProfileId !== 'common' && !current) {
            currentProfileId = null;
            currentNameDisplay.innerText = '请选择配置';
            editor.value = '';
            saveBtn.classList.add('hidden');
            renameBtn.classList.add('hidden');
        }
    } catch (e) {
        console.error('syncExternalState error:', e);
    } finally {
        metadataSyncInProgress = false;
    }
}

function renderList() {
    profileList.innerHTML = '';

    folderMetadata.forEach(folder => {
        const group = document.createElement('li');
        group.className = 'folder-group';
        group.dataset.folderId = folder.id;

        const header = document.createElement('div');
        header.className = 'folder-header';
        const renameButtonHtml = folder.id === 'default'
            ? ''
            : `<button class="folder-rename-btn" data-folder-id="${folder.id}" title="重命名文件夹">改名</button>`;
        header.innerHTML = `
            <span class="name">${folder.name}</span>
            <div class="folder-actions">
                ${renameButtonHtml}
                <button class="folder-mode-btn ${folder.multi_select ? 'is-multi' : ''}" data-folder-id="${folder.id}">
                    ${folder.multi_select ? '多选' : '单选'}
                </button>
            </div>
        `;
        const renameBtn = header.querySelector('.folder-rename-btn');
        if (renameBtn) {
            renameBtn.onclick = (e) => {
                e.stopPropagation();
                renameFolder(folder);
            };
        }
        header.querySelector('.folder-mode-btn').onclick = async (e) => {
            e.stopPropagation();
            await toggleFolderMultiSelect(folder.id, !folder.multi_select);
        };
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;
            startFolderSortDrag(folder.id, group, e);
        });
        group.appendChild(header);

        const children = document.createElement('ul');
        children.className = 'folder-children';
        profileMetadata
            .filter(p => p.folder_id === folder.id)
            .forEach(p => {
                children.appendChild(renderProfileItem(p));
            });

        group.appendChild(children);
        profileList.appendChild(group);
    });
}

function renderSearchResults(rawQuery) {
    const query = (rawQuery || '').trim();
    if (!query) {
        hostSearchResults.classList.add('hidden');
        clearSearchBtn.classList.add('hidden');
        profileList.classList.remove('hidden');
        hostSearchResults.innerHTML = '';
        return;
    }

    clearSearchBtn.classList.remove('hidden');
    profileList.classList.add('hidden');
    hostSearchResults.classList.remove('hidden');
    hostSearchResults.innerHTML = '';

    const queryLower = query.toLowerCase();
    const groupedResults = [];

    for (const profile of profileContentCache) {
        const lines = (profile.content || '').split('\n');
        const hits = [];
        for (let i = 0; i < lines.length; i += 1) {
            if (lines[i].toLowerCase().includes(queryLower)) {
                hits.push({
                    lineNumber: i + 1,
                    text: lines[i].trim() || '(空行)',
                });
                if (hits.length >= 30) break;
            }
        }
        if (hits.length > 0) {
            groupedResults.push({ profile, hits });
        }
    }

    if (groupedResults.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'search-empty';
        empty.innerText = '没有搜索到匹配的 host';
        hostSearchResults.appendChild(empty);
        return;
    }

    groupedResults.forEach(({ profile, hits }) => {
        const group = document.createElement('div');
        group.className = 'search-group';

        const title = document.createElement('div');
        title.className = 'search-group-title';
        title.innerText = `${profile.name} · ${getFolderNameById(profile.folder_id)} · ${hits.length} 条`;
        group.appendChild(title);

        hits.forEach((hit) => {
            const row = document.createElement('button');
            row.className = 'search-hit';
            row.type = 'button';
            row.innerText = `[${hit.lineNumber}] ${hit.text}`;
            row.onclick = async () => {
                await openProfileAtLine(profile.id, hit.lineNumber);
            };
            group.appendChild(row);
        });

        hostSearchResults.appendChild(group);
    });
}

function renderProfileItem(p) {
        const li = document.createElement('li');
        li.className = `profile-item ${p.id === currentProfileId ? 'active' : ''} ${p.active ? 'is-enabled' : ''}`;
        li.dataset.id = p.id;
        li.innerHTML = `
            <span class="status-dot"></span>
            <span class="name">
                ${p.url ? '☁️' : ''}${p.name}
            </span>
            <div class="row-actions">
                <span class="toggle-row-btn" title="${p.active ? '禁用' : '启用'}">${p.active ? '禁' : '启'}</span>
                <span class="edit-row-btn" title="编辑">改</span>
                ${p.url ? '<span class="update-row-btn" title="立即更新">刷</span>' : ''}
                <span class="delete-row-btn" title="删除">删</span>
            </div>
        `;

        li.onclick = async (e) => {
            if (Date.now() < suppressClickUntil) return;
            if (e.target.classList.contains('delete-row-btn')) {
                deleteProfile(p.id, p.name);
            } else if (e.target.classList.contains('toggle-row-btn')) {
                e.stopPropagation();
                toggleProfile(p.id);
            } else if (e.target.classList.contains('edit-row-btn')) {
                e.stopPropagation();
                currentProfileId = p.id;
                await editProfile();
            } else if (e.target.classList.contains('update-row-btn')) {
                e.stopPropagation();
                updateRemoteProfile(p.id, p.name);
            } else {
                selectProfile(p.id);
            }
        };

        li.ondblclick = () => toggleProfile(p.id);
        li.addEventListener('mousedown', (e) => {
            if (e.target.closest('.row-actions')) return;
            startCustomDrag(p, li, e);
        });
        return li;
}

async function moveProfileByDrag(profileId, folderId) {
    try {
        await invoke('move_profile_to_folder', { id: profileId, folderId });
        await loadData();
        const profile = profileMetadata.find(x => x.id === profileId);
        const folder = folderMetadata.find(x => x.id === folderId);
        if (profile && folder) {
            showToast(`已将 ${profile.name} 移动到 ${folder.name}`, 'success');
        }
    } catch (e) {
        showToast(`拖拽移动失败: ${e}`, 'error');
    }
}

async function updateRemoteProfile(id, name) {
    const confirmed = await ask(`更新会覆盖现有配置 "${name}"，是否继续？`, {
        title: '更新确认',
        kind: 'info',
    });
    if (confirmed) {
        showToast(`正在更新 "${name}"...`, 'info');
        try {
            await invoke('trigger_profile_update', { id });
            await loadData();
            // If currently selected, refresh editor content
            if (currentProfileId === id) {
                selectProfile(id);
            }
            showToast('更新成功', 'success');
        } catch (e) {
            console.error(e);
            showToast(`更新失败: ${e}`, 'error');
        }
    }
}


let statusBarTimer = null;
let lastAutoRefreshTime = 0;

function updateStatusBar(p) {
    if (p && p.url) {
        remoteStatusBar.classList.remove('hidden');

        const updateText = () => {
             // Last Update: Only update if timestamp changed to define DOM
             // This prevents re-creating DOM every second, which would kill hover state.
             const currentLastTs = p.last_update || 'never';
             if (lastUpdateTimeEl.dataset.ts !== currentLastTs) {
                 lastUpdateTimeEl.dataset.ts = currentLastTs;

                 const labelSpan = document.createElement('span');
                 labelSpan.className = 'refresh-action';
                 labelSpan.innerText = '上次刷新';
                 labelSpan.onmouseenter = () => labelSpan.innerText = '马上刷新';
                 labelSpan.onmouseleave = () => labelSpan.innerText = '上次刷新';
                 labelSpan.onclick = () => manualRefreshRemote(p.id);

                 let timeText = '从未';
                 if (p.last_update) {
                     timeText = formatDate(new Date(p.last_update));
                 }

                 lastUpdateTimeEl.innerHTML = '';
                 lastUpdateTimeEl.appendChild(labelSpan);
                 lastUpdateTimeEl.appendChild(document.createTextNode(`：${timeText}`));
             }

            // Next Update
            let nextText = '';
            if (p.update_interval && p.update_interval > 0) {
                 let lastTime = p.last_update ? new Date(p.last_update) : null;
                 if (lastTime) {
                    const nextTime = new Date(lastTime.getTime() + p.update_interval * 1000);
                    // Check if overdue?
                    const now = new Date();
                    const diff =  nextTime - now;

                    if (diff <= 1000) { // If <= 1s remaining
                         nextText = '正在更新...';
                         // Trigger check
                         const nowTs = Date.now();
                         if (nowTs - lastAutoRefreshTime > 2000) {
                             lastAutoRefreshTime = nowTs;
                             // Call loadData silently (no spinner on refresh button, but effective)
                             loadData();
                         }
                    } else {
                         nextText = `下次刷新：${formatDate(nextTime)} (还有 ${Math.floor(diff/1000)}秒)`;
                    }
                } else {
                    nextText = '下次刷新：即将进行';
                }
            } else {
                nextText = '自动刷新：未开启';
            }
            nextUpdateTimeEl.innerText = nextText;
        };

        updateText();
    } else {
        remoteStatusBar.classList.add('hidden');
    }
}

async function manualRefreshRemote(id) {
    if (!id) return;
    showToast('正在刷新...', 'info');
    try {
        await invoke('trigger_profile_update', { id });
        await loadData();
        // Force status bar update immediately with new data
        const p = profileMetadata.find(x => x.id === id);
        if (p) updateStatusBar(p);

        if (currentProfileId === id) {
             // Refresh editor content
             selectProfile(id);
        }
        showToast('刷新成功', 'success');
    } catch (e) {
        showToast(`刷新失败: ${e}`, 'error');
    }
}

function startStatusBarTimer(id) {
    if (statusBarTimer) clearInterval(statusBarTimer);
    statusBarTimer = null;

    if (!id || id === 'system' || id === 'common') {
        remoteStatusBar.classList.add('hidden');
        return;
    }

    // Check if remote
    const p = profileMetadata.find(x => x.id === id);
    if (p && p.url) {
        // Update immediately
        updateStatusBar(p);
        // Start timer
        statusBarTimer = setInterval(() => {
             // vital: re-find profile to get latest last_update if it changed
             const currentP = profileMetadata.find(x => x.id === id);
             if (currentP) updateStatusBar(currentP);
        }, 1000);
    } else {
        remoteStatusBar.classList.add('hidden');
    }
}

function formatDate(date) {
    const pad = (n) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

async function selectProfile(id) {
    currentProfileId = id;
    renameBtn.classList.add('hidden');
    systemEditBtn.classList.add('hidden');
    systemEditBtn.innerText = '编辑';

    // Reset Title Events
    currentNameDisplay.onmouseenter = null;
    currentNameDisplay.onmouseleave = null;
    currentNameDisplay.onclick = null;
    currentNameDisplay.classList.remove('exportable-title');
    currentNameDisplay.title = '';
    currentNameDisplay.style.color = '';

    const setupExportTitle = (name) => {
        currentNameDisplay.classList.add('exportable-title');
        currentNameDisplay.title = '点击导出此配置';
        currentNameDisplay.onmouseenter = () => {
             currentNameDisplay.innerText = `导出 ${name}`;
        }
        currentNameDisplay.onmouseleave = () => {
             currentNameDisplay.innerText = name;
        }
        currentNameDisplay.onclick = exportCurrentProfile;
    };

    if (id === 'system') {
        const displayName = '系统 Hosts (只读)';
        currentNameDisplay.innerText = displayName;
        editor.readOnly = true;
        saveBtn.classList.add('hidden');
        systemEditBtn.classList.remove('hidden');
        setupExportTitle(displayName);
        try {
            systemHosts = await invoke('get_system_hosts');
            editor.value = systemHosts;
        } catch (e) { console.error(e); }
    } else if (id === 'common') {
        const displayName = '公共配置 (Common)';
        currentNameDisplay.innerText = displayName;
        editor.readOnly = false;
        saveBtn.classList.remove('hidden');
        editor.value = commonConfig;
        setupExportTitle(displayName);
    } else {
        const p = profileMetadata.find(x => x.id === id);
        if (p) {
            currentNameDisplay.innerText = p.name;
            const isRemoteProfile = !!p.url;
            editor.readOnly = isRemoteProfile;
            if (isRemoteProfile) {
                saveBtn.classList.add('hidden');
            } else {
                saveBtn.classList.remove('hidden');
            }
            renameBtn.classList.remove('hidden');

            setupExportTitle(p.name);

            try {
                const match = profileContentCache.find(x => x.id === id);
                if (match) editor.value = match.content;
            } catch (e) { console.error(e); }
            startStatusBarTimer(id);
        }
    }
    if (id === 'system' || id === 'common') {
        startStatusBarTimer(null); // Stop timer and hide bar
    }
    // Update active class for fixed list
    document.querySelectorAll('#fixed-list .profile-item').forEach(li => {
        if (li.dataset.id === id) {
            li.classList.add('active');
        } else {
            li.classList.remove('active');
        }
    });

    renderList(); // Update active class for custom profiles
    if (!editorFindBar.classList.contains('hidden')) {
        refreshEditorFindMatches(true);
    }
}

async function saveCurrent() {
    if (!currentProfileId) return;
    const content = editor.value;

    try {
        if (currentProfileId === 'common') {
            await invoke('save_common_config', { content });
            commonConfig = content;
        } else if (currentProfileId === 'system') {
            await invoke('save_system_hosts', { content });
            systemEditBtn.innerText = '编辑';
            editor.readOnly = true;
            saveBtn.classList.add('hidden');
            systemEditBtn.classList.remove('hidden');
            showToast('已更新系统文件', 'success');
            return;
        } else {
            const current = profileMetadata.find(x => x.id === currentProfileId);
            if (current?.url) {
                showToast('远程配置为只读，请通过修改配置更新 URL 或刷新远程内容', 'info');
                return;
            }
            await invoke('save_profile_content', { id: currentProfileId, content });
        }
        showToast('保存成功', 'success');
    } catch (e) {
        showToast(`保存失败: ${e}`, 'error');
    }
}

async function toggleSystemEdit() {
    if (editor.readOnly) {
        editor.readOnly = false;
        editor.focus();
        systemEditBtn.classList.add('hidden');
        saveBtn.classList.remove('hidden');
        showToast('进入编辑模式', 'info');
    }
}

async function toggleProfile(id) {
    if (id === 'system' || id === 'common') return;
    try {
        await invoke('toggle_profile_active', { id });
        await loadData();

        // Find profile to show specific name in toast
        const config = await invoke('load_config');
        const p = config.profiles.find(x => x.id === id);
        if (p) {
            showToast(`${p.name} 已${p.active ? '启用' : '禁用'}`, 'success');
        }

        // If current view is system hosts, refresh immediately
        if (currentProfileId === 'system') {
            const systemContent = await invoke('get_system_hosts');
            editor.value = systemContent;
        }
    } catch (e) {
        showToast(`切换失败: ${e}`, 'error');
    }
}

async function toggleFolderMultiSelect(folderId, enable) {
    try {
        await invoke('set_folder_multi_select', { folderId, enable });
        await loadData();
        const folder = folderMetadata.find(x => x.id === folderId);
        if (folder) {
            showToast(`${folder.name} 已切换为${folder.multi_select ? '多选' : '单选'}模式`, 'info');
        }
    } catch (e) {
        showToast(`切换文件夹模式失败: ${e}`, 'error');
    }
}

async function createProfile(data) {
    // data is now an object: { name, isRemote, url, interval } or just string if legacy (but we updated showPrompt)
    let name = data;
    let extra = {};
    if (typeof data === 'object') {
        name = data.name;
        extra = data;
    }

    console.log('Creating profile:', name, extra);
    if (!name) return;
    try {
        let args = { name, folderId: extra.folderId || getDefaultFolderId() };
        if (extra.isRemote && extra.url) {
            args.url = extra.url;
            // args.updateInterval = extra.interval; // Tauri expects snake_case for rust args usually?
            // Tauri 2.0 with rename_all="camelCase" is default? No, default is camelCase for JS -> snake_case for Rust variables?
            // Actually Tauri maps JS object keys to Rust arg names. Rust args are snake_case.
            // Tauri by default converts camelCase to snake_case.
            args.updateInterval = extra.interval;
        }

        const id = await invoke('create_profile', args);

        if (extra.isRemote && extra.url) {
             showToast('正在下载远程配置...', 'info');
             try {
                 await invoke('trigger_profile_update', { id });
                 showToast('远程配置下载成功', 'success');
             } catch (e) {
                 console.error('Download failed:', e);
                 showToast(`下载失败: ${e}`, 'error');
             }
        }

        console.log('Profile created, ID:', id);
        await loadData();
        selectProfile(id);
        showToast('创建成功 (部分加载中)', 'success');
    } catch (e) {
        console.error('Create profile error:', e);
        showToast(`创建失败: ${e}`, 'error');
    }
}

async function deleteProfile(id, name) {
    const confirmed = await ask(`确定要删除配置 "${name}" 吗？`, {
        title: '删除确认',
        kind: 'warning',
    });
    if (confirmed) {
        try {
            await invoke('delete_profile', { id });
            if (currentProfileId === id) {
                currentProfileId = null;
                editor.value = '';
                currentNameDisplay.innerText = '请选择配置';
            }
            await loadData();
            showToast('已删除', 'info');
        } catch (e) {
            showToast(`删除失败: ${e}`, 'error');
        }
    }
}

async function editProfile() {
    if (!currentProfileId || currentProfileId === 'system' || currentProfileId === 'common') return;
    const p = profileMetadata.find(x => x.id === currentProfileId);
    if (!p) return;

    // Preparation for showPrompt
    const initialData = {
        name: p.name,
        folderId: p.folder_id || getDefaultFolderId(),
        isRemote: !!p.url, // If has URL, assume remote type logic
        url: p.url,
        updateInterval: p.update_interval
    };

    showPrompt('修改配置', initialData, async (newData) => {
        // newData: { name, isRemote, url, interval }
        try {
            // 1. Rename if changed
            if (newData.name && newData.name !== p.name) {
                 await invoke('rename_profile', { id: p.id, newName: newData.name });
            }

            if (newData.folderId && newData.folderId !== p.folder_id) {
                await invoke('move_profile_to_folder', { id: p.id, folderId: newData.folderId });
            }

            // 2. Update Remote Config
            // Determine new URL and Interval
            let newUrl = null;
            let newInterval = null;

            if (newData.isRemote) {
                newUrl = newData.url;
                // If interval > 0, set it. Otherwise None.
                if (newData.interval > 0) newInterval = newData.interval;
            }

            // Call backend to update metadata
            // Note: If switching Local -> Remote, or Remote -> Local (url=null), this handles it.
            await invoke('update_remote_config', {
                id: p.id,
                url: newUrl,
                updateInterval: newInterval
            });

            await loadData();
            currentNameDisplay.innerText = newData.name;
            showToast('配置已更新', 'success');

            // If it became remote and has URL, ask to update content?
            // Or just let user click update button?
            // User might expect "Save" to apply new URL content immediately?
            // Let's being conservative: if URL changed, trigger update.
            if (newData.isRemote && newData.url && newData.url !== p.url) {
                // Trigger download
                 showToast('正在下载新地址内容...', 'info');
                 await invoke('trigger_profile_update', { id: p.id });
                 showToast('内容已更新', 'success');
                 if (currentProfileId === p.id) selectProfile(p.id); // refresh editor with new content
            }

        } catch (e) {
            console.error(e);
            showToast(`修改失败: ${e}`, 'error');
        }
    });
}

async function createFolder() {
    showPrompt('新建文件夹', { name: '', mode: 'folder' }, async ({ name }) => {
        if (!name) return;
        try {
            await invoke('create_folder', { name });
            await loadData();
            showToast('文件夹已创建', 'success');
        } catch (e) {
            showToast(`创建文件夹失败: ${e}`, 'error');
        }
    });
}

async function renameFolder(folder) {
    showPrompt('重命名文件夹', { name: folder.name, mode: 'folder' }, async ({ name }) => {
        if (!name || name === folder.name) return;
        try {
            await invoke('rename_folder', { id: folder.id, newName: name });
            await loadData();
            showToast('文件夹已重命名', 'success');
        } catch (e) {
            showToast(`重命名文件夹失败: ${e}`, 'error');
        }
    });
}

async function importData() {
    const selected = await open({
        multiple: false,
        filters: [{ name: 'Data', extensions: ['json', 'txt', 'hosts'] }]
    });
    if (selected) {
        try {
            const content = await invoke('import_file', { path: selected });
            if (selected.endsWith('.json')) {
                await invoke('import_data', { jsonContent: content });
            } else {
                const name = selected.split(/[\/\\]/).pop().split('.')[0];
                await invoke('create_profile', { name, content });
            }
            await loadData();
            showToast('导入成功', 'success');
        } catch (e) {
            showToast(`导入失败: ${e}`, 'error');
        }
    }
}

async function importSwitchHosts() {
    try {
        const selected = await open({
            filters: [{ name: 'JSON', extensions: ['json'] }]
        });
        if (selected) {
            const data = await invoke('import_file', { path: selected });
            const count = await invoke('import_switchhosts', { jsonContent: data });
            await loadData();
            showToast(`已从 SwitchHosts 导入 ${count} 个环境`, 'success');
        }
    } catch (e) {
        showToast(`导入失败: ${e}`, 'error');
    }
}

async function exportAll() {
    const path = await saveDialog({
        defaultPath: 'hosts-backup.json',
        filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (path) {
        try {
            const data = await invoke('export_data');
            // Use backend command to bypass frontend FS permissions
            await invoke('export_file', { path, content: data });
            showToast('导出成功', 'success');
        } catch (e) {
            showToast(`导出失败: ${e}`, 'error');
        }
    }
}

async function exportCurrentProfile() {
    let filename = 'hosts.txt';
    if (currentProfileId === 'system') filename = 'system-hosts.txt';
    else if (currentProfileId === 'common') filename = 'common-config.txt';
    else {
        const p = profileMetadata.find(x => x.id === currentProfileId);
        if (p) filename = `${p.name}.txt`;
        else return;
    }

    const path = await saveDialog({
        defaultPath: filename,
        filters: [{ name: 'Text', extensions: ['txt', 'hosts'] }]
    });

    if (path) {
        try {
             // Use current editor value (what you see is what you export)
             const content = editor.value;
             await invoke('export_file', { path, content });
             showToast('导出成功', 'success');
        } catch (e) {
             showToast(`导出失败: ${e}`, 'error');
        }
    }
}

// Fixed list clicks
document.querySelectorAll('#fixed-list .profile-item').forEach(li => {
    li.onclick = () => selectProfile(li.dataset.id);
});

window.addEventListener('mousemove', (e) => {
    updateCustomDrag(e);
    updateFolderSortDrag(e);
});

window.addEventListener('mouseup', async () => {
    await finishCustomDrag();
    await finishFolderSortDrag();
});

async function refreshData() {
    refreshBtn.classList.add('spinning');
    await loadData();
    setTimeout(() => {
        refreshBtn.classList.remove('spinning');
        showToast('数据已刷新', 'info');
    }, 500);
}

const githubLink = document.getElementById('github-link');

// Event Listeners
saveBtn.onclick = saveCurrent;
renameBtn.onclick = editProfile; // renamed function
systemEditBtn.onclick = toggleSystemEdit;
addBtn.onclick = () => showPrompt('新建配置', '', createProfile);
addFolderBtn.onclick = createFolder;
refreshBtn.onclick = (e) => {
    e.stopPropagation();
    refreshData();
};
importBtn.onclick = importData;
importSwitchHostsBtn.onclick = importSwitchHosts;
exportBtn.onclick = exportAll;
hostSearchInput.oninput = () => renderSearchResults(hostSearchInput.value);
clearSearchBtn.onclick = () => {
    hostSearchInput.value = '';
    renderSearchResults('');
    hostSearchInput.focus();
};
editorFindInput.oninput = () => refreshEditorFindMatches(true);
editorFindPrev.onclick = () => selectEditorFindMatch(editorFindIndex - 1);
editorFindNext.onclick = () => selectEditorFindMatch(editorFindIndex + 1);
editorFindClose.onclick = () => closeEditorFind();
editorFindInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
            selectEditorFindMatch(editorFindIndex - 1);
        } else {
            selectEditorFindMatch(editorFindIndex + 1);
        }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        closeEditorFind();
    }
};
editor.addEventListener('input', () => {
    if (!editorFindBar.classList.contains('hidden')) {
        refreshEditorFindMatches(false);
    }
});

githubLink.onclick = () => {
    invoke('hostly_open_url', { url: 'https://github.com/imshenshen/Hostly' });
};

window.addEventListener('blur', () => {
    endCustomDrag();
    endFolderSortDrag();
});

window.addEventListener('focus', () => {
    syncExternalState();
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        syncExternalState();
    }
});

setInterval(() => {
    if (!document.hidden) {
        syncExternalState();
    }
}, 3000);

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (!editorFindBar.classList.contains('hidden')) {
            e.preventDefault();
            closeEditorFind();
            return;
        }
        if (clearGlobalSearch()) {
            e.preventDefault();
            editor.focus();
        }
        return;
    }

    if (handleEditorFindTyping(e)) {
        return;
    }

    const key = e.key.toLowerCase();
    const withMeta = e.metaKey || e.ctrlKey;
    if (!withMeta || key !== 'f') return;

    e.preventDefault();
    if (e.shiftKey) {
        hostSearchInput.focus();
        hostSearchInput.select();
        renderSearchResults(hostSearchInput.value);
        return;
    }
    openEditorFind();
});

// Theme Logic
// Theme Logic
async function initTheme() {
    try {
        // Load from backend config
        const config = await invoke('load_config');
        if (config.theme) {
            setTheme(config.theme, false);
        } else {
            // Fallback to local storage or default
            const saved = localStorage.getItem('hostly-theme') || 'dark';
            setTheme(saved, true); // Sync valid default to backend
        }
    } catch (e) {
        console.error('Failed to load theme config:', e);
        const saved = localStorage.getItem('hostly-theme') || 'dark';
        setTheme(saved, false);
    }
}

async function setTheme(mode, persist = true) {
    document.documentElement.dataset.theme = mode;
    localStorage.setItem('hostly-theme', mode);

    // Update Radios
    const radios = document.getElementsByName('theme-mode');
    radios.forEach(r => {
        if (r.value === mode) r.checked = true;
    });

    if (persist) {
        try {
            await invoke('set_theme', { theme: mode });
        } catch (e) {
            console.error('Failed to save theme:', e);
        }
    }
}

// Settings Modal Logic
settingsBtn.onclick = () => {
    settingsModalOverlay.classList.remove('hidden');


    // Sync Window UI
    initWindowSettings();
};

const closeSettings = () => settingsModalOverlay.classList.add('hidden');
settingsCloseBtn.onclick = closeSettings;
settingsModalOverlay.onclick = (e) => {
    if (e.target === settingsModalOverlay) closeSettings();
};

document.getElementsByName('theme-mode').forEach(radio => {
    radio.onchange = (e) => setTheme(e.target.value);
});


// Window Settings Logic
let currentWindowMode = 'remember';
let resizeTimeout;

async function initWindowSettings() {
    try {
        const config = await invoke('load_config');
        const mode = config.window_mode || 'remember';
        const w = config.window_width || 1000;
        const h = config.window_height || 700;

        applyWindowSettings(mode, w, h);
    } catch(e) { console.error(e); }
}

function applyWindowSettings(mode, w, h) {
    currentWindowMode = mode;
    const select = document.getElementById('window-size-select');
    const radios = document.getElementsByName('window-mode');

    radios.forEach(r => {
        if (r.value === mode) r.checked = true;
    });

    if (mode === 'fixed') {
        select.classList.remove('hidden');
        select.value = `${w},${h}`;
        // If not found, use custom
        if (!select.value && w && h) {
             const custom = select.querySelector('option[hidden]');
             if (custom) {
                 custom.value = `${w},${h}`;
                 custom.innerText = `${w} x ${h}`;
                 custom.selected = true;
             }
        }
    } else {
        select.classList.add('hidden');
        startResizeListener();
    }
}

function startResizeListener() {
    window.onresize = () => {
        if (currentWindowMode !== 'remember') return;
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            saveWindowConfig('remember', window.outerWidth, window.outerHeight);
        }, 1000);
    };
}

async function saveWindowConfig(mode, w, h) {
    try {
        // Ensure w, h are numbers
        await invoke('save_window_config', { mode, width: parseFloat(w), height: parseFloat(h) });
    } catch(e) { console.error(e); }
}

// Listeners
document.getElementsByName('window-mode').forEach(r => {
    r.onchange = (e) => {
        const mode = e.target.value;
        currentWindowMode = mode;
        const select = document.getElementById('window-size-select');

        if (mode === 'fixed') {
            select.classList.remove('hidden');
            if (!select.value) select.selectedIndex = 0;
            const [w, h] = select.value.split(',');
            saveWindowConfig(mode, w, h);
        } else {
            select.classList.add('hidden');
            startResizeListener();
            saveWindowConfig(mode, window.outerWidth, window.outerHeight);
        }
    }
});

document.getElementById('window-size-select').onchange = (e) => {
    const val = e.target.value;
    const [w, h] = val.split(',');
    saveWindowConfig('fixed', w, h);
};

// Init
window.addEventListener('DOMContentLoaded', async () => {
    await initTheme();
    await initWindowSettings();
    await initSidebarWidth();
    await loadData();
    selectProfile('system');
    // Show window only after everything is ready to avoid flash
    setTimeout(() => {
        invoke('show_main_window');
    }, 50);
});

// Sidebar Resizing
let isResizingSidebar = false;

async function initSidebarWidth() {
    try {
        const config = await invoke('load_config');
        if (config.sidebar_width) {
            applySidebarWidth(config.sidebar_width);
        }
    } catch(e) { console.error(e); }
}

function applySidebarWidth(w) {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.style.width = w + 'px';
}

const resizer = document.getElementById('sidebar-resizer');
const sidebarEl = document.querySelector('.sidebar');

if (resizer && sidebarEl) {
    resizer.addEventListener('mousedown', (e) => {
        isResizingSidebar = true;
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizingSidebar) return;

        let newWidth = e.clientX;
        if (newWidth < 200) newWidth = 200;
        if (newWidth > 600) newWidth = 600;

        sidebarEl.style.width = newWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isResizingSidebar) {
            isResizingSidebar = false;
            document.body.style.cursor = '';
            // Save persistence
            const w = parseFloat(sidebarEl.style.width);
            invoke('save_sidebar_config', { width: w }).catch(console.error);
        }
    });
}
