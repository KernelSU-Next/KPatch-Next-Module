import { exec, spawn, toast } from 'kernelsu-alt';
import { modDir, superkey } from '../index.js';
import { handleFileUpload, uploadFile } from './kpm.js';
import { getString } from '../language.js';

function uInt2String(ver) {
    const val = typeof ver === 'string' ? parseInt(ver, 16) : ver;

    const major = (val & 0xff0000) >> 16;
    const minor = (val & 0x00ff00) >> 8;
    const patch = (val & 0x0000ff);

    return `${major}.${minor}.${patch}`;
}

function parseIni(str) {
    const result = {};
    let currentSection = null;
    str.split('\n').forEach(line => {
        line = line.trim();
        if (!line || line.startsWith(';')) return;
        if (line.startsWith('[') && line.endsWith(']')) {
            currentSection = line.slice(1, -1);
            result[currentSection] = {};
        } else if (line.includes('=')) {
            const parts = line.split('=');
            const key = parts[0].trim();
            const value = parts.slice(1).join('=').trim();
            if (currentSection) {
                result[currentSection][key] = value;
            } else {
                result[key] = value;
            }
        }
    });
    return result;
}

async function getInstalledVersion() {
    if (superkey === '') return null;
    if (import.meta.env.DEV) return uInt2String('c06');
    const working = await exec(`kpatch '${superkey}' hello`, { env: { PATH: `${modDir}/bin` } });
    if (working.stdout.trim() === '') return null;
    const version = await exec(`kpatch '${superkey}' kpver`, { env: { PATH: `${modDir}/bin` } });
    return uInt2String(version.stdout.trim());
}

let bootSlot = '';
let bootDev = '';
let kimgInfo = { banner: '', patched: false };
let kpimgInfo = { version: '', compile_time: '', config: '', superKey: '' };
let existedExtras = [];
let newExtras = [];

async function getKpimgInfo() {
    if (kpimgInfo.version) {
        document.getElementById('kpimg-version').textContent = getString('info_version', uInt2String(kpimgInfo.version));
        document.getElementById('kpimg-time').textContent = getString('info_time', kpimgInfo.compile_time);
        document.getElementById('kpimg-config').textContent = getString('info_config', kpimgInfo.config);
        document.getElementById('kpimg').classList.remove('animate-hidden');
        return;
    }
    const result = await exec(`kptools -l -k ${modDir}/bin/kpimg`, { env: { PATH: `${modDir}/bin` } });
    if (import.meta.env.DEV) {
        result.stdout = `[kpimg]\nversion=0xc06\ncompile_time=11:08:10 Dec 30 2025\nconfig=linux,release`;
    }
    const ini = parseIni(result.stdout);
    if (ini.kpimg) {
        kpimgInfo.version = ini.kpimg.version;
        kpimgInfo.compile_time = ini.kpimg.compile_time;
        kpimgInfo.config = ini.kpimg.config;

        document.getElementById('kpimg-version').textContent = getString('info_version', uInt2String(ini.kpimg.version));
        document.getElementById('kpimg-time').textContent = getString('info_time', ini.kpimg.compile_time);
        document.getElementById('kpimg-config').textContent = getString('info_config', ini.kpimg.config);
    }
    document.getElementById('kpimg').classList.remove('animate-hidden');
}

function extractBootimg(bootDev) {
    const child = spawn('magiskboot', ['unpack', bootDev], {
        cwd: `${modDir}/tmp`,
        env: { PATH: `${modDir}/bin:/data/adb/ksu/bin:/data/adb/magisk:$PATH` }
    });
    child.on('exit', () => {
        parseBootimg();
    });
}

async function parseBootimg() {
    if (import.meta.env.DEV) {
        document.getElementById('kernel-info').textContent = `6.18-Linux`;
        document.getElementById('kernel').classList.remove('animate-hidden');
        return;
    }

    const result = await exec(`kptools -l -i kernel`, {
        cwd: `${modDir}/tmp`,
        env: { PATH: `${modDir}/bin:${modDir}/tmp:$PATH` }
    });

    if (result.errno) {
        toast(getString('msg_failed_parse_kernel', result.stderr));
        return;
    }

    const ini = parseIni(result.stdout);

    if (ini.kernel) {
        kimgInfo.banner = ini.kernel.banner;
        kimgInfo.patched = ini.kernel.patched === 'true';

        // Kernel info card
        document.getElementById('kernel-info').textContent = kimgInfo.banner;
        document.getElementById('kernel').classList.remove('animate-hidden');

        if (kimgInfo.patched && ini.kpimg) {
            const key = ini.kpimg.superkey || '';
            kpimgInfo.superKey = key;

            if (key.length > 0) {
                document.getElementById('superkey').value = key;
            }

            // Parse extras
            existedExtras = [];
            let kpmNum = parseInt(ini.kernel.extra_num);
            if (isNaN(kpmNum) && ini.extras) {
                kpmNum = parseInt(ini.extras.num);
            }

            if (kpmNum > 0) {
                for (let i = 0; i < kpmNum; i++) {
                    const extra = ini[`extra ${i}`];
                    if (extra && extra.type.toUpperCase() === 'KPM') {
                        existedExtras.push({
                            type: 'KPM',
                            name: extra.name,
                            event: extra.event || 'pre-kernel-init',
                            args: extra.args || '',
                            version: extra.version,
                            license: extra.license,
                            author: extra.author,
                            description: extra.description,
                            isNew: false
                        });
                    }
                }
            }
        }
        renderKpmList();
    }
}

async function extractAndParseBootimg() {
    if (bootDev) {
        document.getElementById('bootimg').classList.remove('animate-hidden');
        extractBootimg(bootDev);
        return;
    }

    // Prepare work directory
    await exec(`mkdir -p ${modDir}/tmp && rm -rf ${modDir}/tmp/* && cp ${modDir}/bin/kpimg ${modDir}/tmp/`);

    // get slot and device
    const result = await exec(`busybox sh ${modDir}/boot_extract.sh`, {
        env: { PATH: `${modDir}/bin:/data/adb/ksu/bin:/data/adb/magisk:$PATH`, ASH_STANDALONE: '1' }
    });

    if (result.errno && !import.meta.env.DEV) {
        toast(getString('msg_boot_extract_failed'), result.stderr);
        document.getElementById('bootimg-device').textContent = getString('msg_failed_locate_boot');
        return;
    }

    const output = result.stdout;
    const matchSlot = output.match(/SLOT=(.*)/);
    const matchBoot = output.match(/BOOTIMAGE=(.*)/);

    bootSlot = matchSlot ? matchSlot[1].trim() : '';
    bootDev = matchBoot ? matchBoot[1].trim() : '';

    // Bootimg info card
    document.getElementById('bootimg-slot').textContent = bootSlot ? getString('info_slot', bootSlot) : '';
    document.getElementById('bootimg-device').textContent = bootDev ? getString('info_device', bootDev) : getString('info_device_unknown');
    document.getElementById('bootimg').classList.remove('animate-hidden');

    if (bootDev || import.meta.env.DEV) {
        extractBootimg(bootDev);
    }
}

function renderKpmList() {
    const list = document.getElementById('kpm-embed-list');
    list.innerHTML = '';

    const createCard = (item, index, isNew) => {
        const card = document.createElement('div');
        card.className = 'card module-card';
        card.innerHTML = `
            <div class="module-card-header">
                <div class="flex-header">
                    <div class="module-card-title">${item.name}</div>
                    ${isNew ? '' : '<div class="tag">' + getString('info_embedded') + '</div>'}
                </div>
                <div class="module-card-subtitle">${item.version}, ${getString('info_author', item.author || getString('msg_unknown'))}</div>
                <div class="module-card-subtitle">${getString('info_args', item.args ? item.args : '(null)')}</div>
            </div>
            <div class="module-card-content">
                <div class="module-card-text">${item.description || getString('info_no_description')}</div>
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

        card.querySelector('.control').onclick = () => openOptionDialog(item);
        card.querySelector('.unload').onclick = () => {
            if (isNew) {
                newExtras.splice(index, 1);
            } else {
                existedExtras.splice(index, 1);
            }
            renderKpmList();
        };

        return card;
    };

    const appendCard = (item, idx, isNew) => {
        const card = createCard(item, idx, isNew);
        list.appendChild(card);
    }

    existedExtras.forEach((item, idx) => appendCard(item, idx, false));
    newExtras.forEach((item, idx) => appendCard(item, idx, true));
}

function openOptionDialog(item) {
    const dialog = document.getElementById('kpm-option-dialog');
    const eventSelect = document.getElementById('kpm-event-select');
    const argsInput = document.getElementById('kpm-args-input');

    eventSelect.value = item.event || 'pre-kernel-init';
    argsInput.value = item.args || '';

    const confirmBtn = dialog.querySelector('.confirm');
    const newConfirm = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);

    newConfirm.onclick = () => {
        item.event = eventSelect.value;
        item.args = argsInput.value;
        dialog.close();
        renderKpmList();
    };

    const cancelBtn = dialog.querySelector('.cancel');
    cancelBtn.onclick = () => dialog.close();

    dialog.show();
}

async function embedKPM() {
    const embedBtn = document.getElementById('embed');
    const startBtn = document.getElementById('start');
    handleFileUpload('.kpm', 'kpm-embed-list', async (file, onProgress, signal) => {
        embedBtn.disabled = true;
        startBtn.disabled = true;

        // Generate random filename
        const randName = Math.random().toString(36).substring(7) + '.kpm';
        const tmpPath = `${modDir}/tmp/${randName}`;

        try {
            await uploadFile(file, tmpPath, onProgress, signal);
        } catch (e) {
            exec(`rm -f ${tmpPath}`);
            throw e;
        } finally {
            embedBtn.disabled = false;
            startBtn.disabled = false;
        }

        const result = await exec(`kptools -l -M "${randName}"`, {
            cwd: `${modDir}/tmp`,
            env: { PATH: `${modDir}/bin:$PATH` }
        });

        if (result.errno) {
            toast(getString('msg_invalid_kpm_file'));
            return;
        }

        const ini = parseIni(result.stdout);
        if (ini.kpm) {
            newExtras.push({
                type: 'KPM',
                name: ini.kpm.name,
                event: 'pre-kernel-init', // default
                args: '',
                version: ini.kpm.version,
                license: ini.kpm.license,
                author: ini.kpm.author,
                description: ini.kpm.description,
                fileName: randName,
                isNew: true
            });
            renderKpmList();
        } else {
            toast(getString('msg_could_not_parse_kpm'));
        }
    });
}

function patch(type) {
    const superkeyVal = document.querySelector('#superkey md-outlined-text-field').value;
    const terminal = document.querySelector('#patch-terminal');
    const pageContent = terminal.closest('.page-content');
    const onOutput = (data) => {
        terminal.innerHTML += `<div>${data}</div>`;
        pageContent.scrollTo({ top: pageContent.scrollHeight, behavior: 'smooth' });
    };

    if (!bootDev) {
        terminal.textContent = getString('msg_error_no_boot_image');
        return;
    }

    let args = ['sh'];
    if (type === "patch") {
        args.push(
            `${modDir}/boot_patch.sh`,
            `'${superkeyVal}'`,
            bootDev,
            'true'
        );

        // New kpm
        newExtras.forEach(extra => {
            args.push('-M', `${modDir}/tmp/${extra.fileName}`);
            if (extra.args) args.push('-A', extra.args);
            if (extra.event) args.push('-V', extra.event);
            args.push('-T', 'kpm');
        });

        // Embeded kpm
        existedExtras.forEach(extra => {
            args.push('-E', extra.name);
            if (extra.args) args.push('-A', extra.args);
            if (extra.event) args.push('-V', extra.event);
            args.push('-T', 'kpm');
        });
    } else {
        // Unpatch logic
        args.push(`${modDir}/boot_unpatch.sh`, bootDev);
    }

    const process = spawn(
        `busybox`,
        args,
        {
            cwd: `${modDir}/tmp`,
            env: {
                PATH: `${modDir}/bin:/data/adb/ksu/bin:/data/adb/magisk:$PATH`,
                ASH_STANDALONE: '1'
            }
        }
    );
    process.stdout.on('data', onOutput);
    process.stderr.on('data', onOutput);
    process.on('exit', (code) => {
        if (code === 0) {
            document.getElementById('reboot-fab').classList.remove('hide');
            bootSlot = '';
            bootDev = '';
            kimgInfo = { banner: '', patched: false };
            newExtras = [];
        }
        exec(`rm -rf ${modDir}/tmp`);
    });
}

export { getKpimgInfo, extractAndParseBootimg, getInstalledVersion, patch, embedKPM }
