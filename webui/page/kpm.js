import { exec, spawn, toast } from 'kernelsu-alt';
import { modDir, persistDir, superkey, initInfo, MAX_CHUNK_SIZE, linkRedirect } from '../index.js';
import { getString } from '../language.js';

let allKpms = [];
let searchQuery = '';
let clickCount = 0;
let lastClickTime = 0;

async function getKpmInfo(path) {
    const result = await exec(`kptools -l -M "${path}"`, { env: { PATH: `${modDir}/bin` } });
    if (import.meta.env.DEV) { // vite debug
        result.stdout = 'name=Test Module\nversion=1.0.0\ndescription=This is a test module\nauthor=KOWX712\nlicense=MIT\nargs=test';
    }
    const infoLines = result.stdout.trim().split('\n');

    const moduleInfo = {};
    infoLines.forEach(line => {
        const [key, ...valueParts] = line.split('=');
        moduleInfo[key] = valueParts.join('=');
    });

    return moduleInfo;
}

async function getKpmList() {
    if (import.meta.env.DEV) { // vite debug
        return [
            {
                name: 'Test Module',
                version: '1.0.0',
                description: 'This is a test module',
                author: 'KOWX712',
                license: 'MIT',
                args: 'test'
            },
            {
                name: 'Test Module 2',
                version: '1.0.0',
                description: 'This is a test module',
                author: 'KOWX712',
                license: 'MIT',
                args: 'test'
            }
        ];
    }

    const listResult = await exec(
        `kpatch '${superkey}' kpm list && sh "${modDir}/status.sh" '${superkey}'`,
        { env: { PATH: `${modDir}/bin:$PATH` } }
    );
    const modules = listResult.stdout.trim().split('\n').filter(line => line.trim());

    const modulePromises = modules.map(async (moduleName) => {
        const infoResult = await exec(`kpatch '${superkey}' kpm info "${moduleName}"`, { env: { PATH: `${modDir}/bin` } });
        const infoLines = infoResult.stdout.trim().split('\n');

        const moduleInfo = {};
        infoLines.forEach(line => {
            const [key, ...valueParts] = line.split('=');
            moduleInfo[key] = valueParts.join('=');
        });

        return moduleInfo;
    });

    const results = await Promise.all(modulePromises);
    return results.sort((a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase()));
}

async function controlModule(moduleName, action) {
    const result = await exec(`kpatch '${superkey}' kpm ctl0 "${moduleName}" ${action}`, { env: { PATH: `${modDir}/bin` } });
    toast(result.errno === 0 ? result.stdout : result.stderr);
}

function forgetModule(moduleName) {
    exec(`rm -f "${persistDir}/kpm/${moduleName}.kpm"`);
}

async function unloadModule(moduleName) {
    forgetModule(moduleName);
    const result = await exec(`kpatch '${superkey}' kpm unload "${moduleName}"`, { env: { PATH: `${modDir}/bin` } });
    return result.errno === 0;
}

async function loadModule(modulePath) {
    const result = await exec(`kpatch '${superkey}' kpm load "${modulePath}"`, { env: { PATH: `${modDir}/bin` } });
    return result.errno === 0;
}

async function refreshKpmList() {
    const emptyMsg = document.getElementById('kpm-empty-msg');
    emptyMsg.textContent = getString('status_loading');
    emptyMsg.classList.remove('hidden');
    allKpms = await getKpmList();
    renderKpmList();
}

const kpmItemMap = new Map();

async function renderKpmList() {
    const container = document.getElementById('kpm-list');
    container.innerHTML = '';

    allKpms.forEach(module => {
        let item = kpmItemMap.get(module.name);
        if (!item) {
            item = document.createElement('div');
            item.className = 'card module-card';
            item.innerHTML = `
                <div class="module-card-header">
                    <div class="module-card-title">${module.name}</div>
                    <div class="module-card-subtitle">${module.version}, ${getString('info_author', module.author)}</div>
                    <div class="module-card-subtitle">${getString('info_args', module.args ? module.args : '(null)')}</div>
                </div>
                <div class="module-card-content">
                    <div class="module-card-text">${module.description}</div>
                </div>
                <md-divider></md-divider>
                <div class="module-card-actions">
                    <md-filled-tonal-icon-button class="control">
                        <md-icon><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z" /></svg></md-icon>
                    </md-filled-tonal-icon-button>
                    <md-filled-tonal-icon-button class="unload">
                        <md-icon><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg></md-icon>
                    </md-filled-tonal-icon-button>
                </div>
            `;

            item.querySelector('.control').onclick = () => {
                const dialog = document.getElementById('control-dialog');
                const textField = dialog.querySelector('md-outlined-text-field');
                dialog.querySelector('.cancel').onclick = () => dialog.close();
                dialog.querySelector('.confirm').onclick = async () => {
                    await controlModule(module.name, textField.value);
                    refreshKpmList();
                    initInfo();
                    textField.value = '';
                    dialog.close();
                };
                dialog.show();
            }
            item.querySelector('.unload').onclick = async () => {
                const dialog = document.getElementById('unload-dialog');
                dialog.querySelector('[slot=content]').innerHTML = `<div>${getString('msg_unload_module', module.name)}</div>`;
                dialog.querySelector('.cancel').onclick = () => dialog.close();
                dialog.querySelector('.confirm').onclick = async () => {
                    await unloadModule(module.name);
                    refreshKpmList();
                    initInfo();
                    dialog.close();
                };
                dialog.show();
            }

            kpmItemMap.set(module.name, item);
        }
        container.appendChild(item);
    });

    applyFilters();
}

function applyFilters() {
    const query = searchQuery.toLowerCase();
    let visibleCount = 0;

    allKpms.forEach(module => {
        const item = kpmItemMap.get(module.name);
        if (!item) return;

        const isVisible = (module.name || '').toLowerCase().includes(query) ||
            (module.description || '').toLowerCase().includes(query);

        item.classList.toggle('search-hidden', !isVisible);
        if (isVisible) visibleCount++;
    });

    const emptyMsg = document.getElementById('kpm-empty-msg');
    if (visibleCount === 0) {
        emptyMsg.textContent = getString('msg_no_module_found');
        emptyMsg.classList.remove('hidden');
    } else {
        emptyMsg.classList.add('hidden');
    }
}

async function uploadFile(file, targetPath, onProgress, signal) {
    const CHUNK_SIZE = file.size > MAX_CHUNK_SIZE * 4 ? MAX_CHUNK_SIZE : Math.max(1, Math.ceil(file.size / 4));
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const CONCURRENCY = 8;

    await exec(`mkdir -p "$(dirname "${targetPath}")"`);

    let uploadedBytes = 0;
    let nextChunkIdx = 0;

    const processChunk = async (index) => {
        if (signal?.aborted) return;

        const start = index * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(chunk);
        });

        const partPath = `${targetPath}.part${index.toString().padStart(8, '0')}`;
        const result = await new Promise((resolve) => {
            const child = spawn(`echo '${base64}' | base64 -d > "${partPath}"`);
            child.on('exit', (code) => resolve({ errno: code }));
        });

        if (result.errno !== 0) {
            throw new Error(`Write error at chunk ${index}`);
        }

        uploadedBytes += (end - start);
        if (onProgress) {
            onProgress(uploadedBytes / file.size);
        }
    };

    try {
        const workers = [];
        for (let i = 0; i < Math.min(CONCURRENCY, totalChunks); i++) {
            workers.push((async () => {
                while (nextChunkIdx < totalChunks && !signal?.aborted) {
                    const index = nextChunkIdx++;
                    await processChunk(index);
                }
            })());
        }

        await Promise.all(workers);

        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

        if (totalChunks === 0) {
            await exec(`: > "${targetPath}"`);
            return;
        }

        const combineResult = await new Promise((resolve) => {
            const child = spawn(`cat "${targetPath}.part"* > "${targetPath}" && rm -f "${targetPath}.part"*`);
            child.on('exit', (code) => resolve({ errno: code }));
        });
        if (combineResult.errno !== 0) {
            throw new Error('Merge error');
        }
    } catch (err) {
        await exec(`rm -f "${targetPath}.part"*`);
        throw err;
    }
}

function checkFileUploadApi() {
    // If we reach here 3 times in 2 seconds, upload api is likely available
    const currentTime = Date.now();
    clickCount = (currentTime - lastClickTime > 2000) ? 1 : clickCount + 1;
    lastClickTime = currentTime;

    if (clickCount === 3) {
        clickCount = 0;
        linkRedirect('https://github.com/KOWX712/KsuWebUIStandalone/releases/latest');
    }
}

async function handleFileUpload(accept, containerId, onSelected) {
    checkFileUploadApi();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (accept && !file.name.endsWith(accept)) {
            toast(getString('msg_please_select_file', accept));
            return;
        }

        const abortController = new AbortController();
        const loadingCard = document.createElement('div');
        loadingCard.className = 'card module-card';
        loadingCard.innerHTML = `
            <div class="module-card-header flex-header">
                <div class="header-info">
                    <div class="module-card-title">${file.name}</div>
                    <div class="module-card-subtitle" id="upload-progress-text">${getString('msg_please_wait')}</div>
                </div>
                <md-outlined-icon-button id="cancel-upload">
                    <md-icon><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg></md-icon>
                </md-outlined-icon-button>
            </div>
            <div class="module-card-content">
                <md-linear-progress indeterminate></md-linear-progress>
            </div>
        `;
        const container = document.getElementById(containerId);
        container.prepend(loadingCard);

        const progressBar = loadingCard.querySelector('md-linear-progress');
        const progressText = loadingCard.querySelector('#upload-progress-text');
        const cancelBtn = loadingCard.querySelector('#cancel-upload');

        cancelBtn.onclick = () => {
            abortController.abort();
        };

        const onProgress = (percent) => {
            const p = Math.round(percent * 100);
            progressBar.value = percent;
            progressBar.indeterminate = false;
            progressText.textContent = getString('msg_uploading', p + '%');
        };

        try {
            await onSelected(file, onProgress, abortController.signal);
        } catch (err) {
            if (err.name === 'AbortError') {
                toast(getString('msg_upload_cancelled'));
            } else {
                toast(getString('msg_error', err.message));
            }
        } finally {
            loadingCard.remove();
        }
    };
    input.click();
}

async function uploadAndLoadModule() {
    const loadBtn = document.getElementById('load');
    handleFileUpload('.kpm', 'kpm-list', async (file, onProgress, signal) => {
        loadBtn.classList.add('hide');
        const tmpPath = `${modDir}/tmp/${file.name}`;
        try {
            await exec(`mkdir -p ${modDir}/tmp && rm -rf ${modDir}/tmp/*`);
            await uploadFile(file, tmpPath, onProgress, signal);
            const info = await getKpmInfo(tmpPath);
            if (info && info.name) {
                const dialog = document.getElementById('load-dialog');
                dialog.querySelector('#load-module-msg').textContent = getString('msg_module_loaded', info.name);
                const checkbox = dialog.querySelector('md-checkbox');
                checkbox.checked = false;

                dialog.querySelector('.cancel').onclick = () => {
                    dialog.close();
                    exec(`rm -rf ${modDir}/tmp`);
                };

                dialog.querySelector('.confirm').onclick = async () => {
                    const success = await loadModule(`${modDir}/tmp/${file.name}`);
                    if (success) {
                        toast(getString('msg_successfully_loaded', info.name));
                        refreshKpmList();
                        if (!checkbox.checked) { // Save module to load on boot automatically
                            exec(`
                                mkdir -p ${persistDir}/kpm
                                cp -f "${modDir}/tmp/${file.name}" "${persistDir}/kpm/${info.name}.kpm"
                            `);
                        }
                    } else {
                        toast(getString('msg_failed_load_module', info.name));
                    }
                    exec(`rm -rf ${modDir}/tmp`);
                    dialog.close();
                };

                dialog.show();
            } else {
                toast(getString('msg_failed_get_module_info'));
                exec(`rm -rf ${modDir}/tmp`);
            }
        } catch (e) {
            exec(`rm -rf ${modDir}/tmp`);
            throw e;
        } finally {
            loadBtn.classList.remove('hide');
        }
    });
}

export function initKPMPage() {
    const searchBtn = document.getElementById('kpm-search-btn');
    const searchBar = document.getElementById('kpm-search-bar');
    const closeBtn = document.getElementById('close-kpm-search-btn');
    const searchInput = document.getElementById('kpm-search-input');
    const menuBtn = document.getElementById('kpm-menu-btn');
    const menu = document.getElementById('kpm-menu');

    searchBtn.onclick = () => {
        searchBar.classList.add('show');
        document.querySelectorAll('.search-bg').forEach(el => el.classList.add('hide'));
        searchInput.focus();
    };

    closeBtn.onclick = () => {
        searchBar.classList.remove('show');
        document.querySelectorAll('.search-bg').forEach(el => el.classList.remove('hide'));
        searchQuery = '';
        searchInput.blur();
        searchInput.value = '';
        applyFilters();
    };

    searchInput.addEventListener('input', () => {
        searchQuery = searchInput.value;
        applyFilters();
    });

    menuBtn.onclick = () => menu.show();

    document.getElementById('refresh-kpm-list-menu').onclick = () => {
        kpmItemMap.clear();
        refreshKpmList();
    };

    const controlDialog = document.getElementById('control-dialog');
    const controlTextField = controlDialog.querySelector('md-outlined-text-field');
    controlTextField.addEventListener('input', () => {
        controlDialog.querySelector('.confirm').disabled = !controlTextField.value;
    });

    document.getElementById('load').onclick = () => uploadAndLoadModule();
}

export { loadModule, refreshKpmList, handleFileUpload, uploadFile }
