import { listPackages, getPackagesInfo, exec } from 'kernelsu-alt';
import { modDir, persistDir, superkey } from '../index.js';
import { getString } from '../language.js';
import fallbackIcon from '../icon.png';

let allApps = [];
let showSystemApp = false;
let searchQuery = '';

const iconObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target.querySelector('.app-icon');
            const loader = img.parentElement.querySelector('.loader');
            const pkg = img.dataset.package;
            img.onload = () => {
                img.style.opacity = '1';
                loader.remove();
            };
            img.onerror = () => {
                img.src = fallbackIcon;
                img.style.opacity = '1';
                loader.remove();
            };
            img.src = `ksu://icon/${pkg}`;
            iconObserver.unobserve(entry.target);
        }
    });
}, { rootMargin: '100px' });

async function refreshAppList() {
    const appList = document.getElementById('app-list');
    const emptyMsg = document.getElementById('exclude-empty-msg');
    appList.innerHTML = '';
    emptyMsg.textContent = getString('status_loading');
    emptyMsg.classList.remove('hidden');

    try {
        if (import.meta.env.DEV) { // vite debug
            allApps = [
                { appLabel: 'Chrome', packageName: 'com.android.chrome', isSystem: false, uid: 10001 },
                { appLabel: 'Chrome', packageName: 'com.android.chrome', isSystem: false, uid: 1010001 },
                { appLabel: 'Google', packageName: 'com.google.android.googlequicksearchbox', isSystem: true, uid: 1010002 },
                { appLabel: 'Settings', packageName: 'com.android.settings', isSystem: true, uid: 10003 },
                { appLabel: 'WhatsApp', packageName: 'com.whatsapp', isSystem: false, uid: 10123 },
                { appLabel: 'Instagram', packageName: 'com.instagram.android', isSystem: false, uid: 1010456 }
            ];
        } else {
            const pkgs = await listPackages();
            const info = await getPackagesInfo(pkgs);
            allApps = Array.isArray(info) ? info : [];
        }
        renderAppList();
    } catch (e) {
        emptyMsg.textContent = getString('msg_error_loading_apps', e.message);
    }
}

let excludedApps = [];
const appItemMap = new Map();

async function saveExcludedList(excludedApps) {
    const header = 'pkg,exclude,allow,uid';
    const seen = new Set();
    const uniqueList = [];
    excludedApps.forEach(app => {
        const key = `${app.packageName}:${app.uid % 100000}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueList.push(app);
        }
    });
    const lines = uniqueList.map(app => `${app.packageName},1,0,${app.uid % 100000}`);
    const csvContent = [header, ...lines].join('\n');
    if (import.meta.env.DEV) {
        localStorage.setItem('kp-next_excluded_mock', csvContent);
        return;
    }
    await exec(`echo "${csvContent}" > ${persistDir}/package_config`);
}

async function renderAppList() {
    const appList = document.getElementById('app-list');
    const emptyMsg = document.getElementById('exclude-empty-msg');

    try {
        let rawContent = '';
        if (import.meta.env.DEV) {
            rawContent = localStorage.getItem('kp-next_excluded_mock') || '';
        } else {
            try {
                const result = await exec(`cat ${persistDir}/package_config`);
                if (result.errno === 0) {
                    rawContent = result.stdout.trim();
                }
            } catch (e) {
                console.warn('package_config not available.')
            }
        }

        if (rawContent) {
            let lines = rawContent.split('\n').filter(l => l.trim());

            // Skip header
            if (lines.length > 0 && lines[0].startsWith('pkg,exclude')) {
                lines = lines.slice(1);
            }

            const list = lines.map(line => {
                const parts = line.split(',');
                if (parts.length < 4) return null;
                return { packageName: parts[0].trim(), uid: parseInt(parts[3]) };
            }).filter(item => item !== null);


            // Consistency check
            if (allApps.length > 0) {
                const appByRealUid = new Map();
                allApps.forEach(app => {
                    const rUid = app.uid % 100000;
                    const key = `${(app.packageName || '').trim()}:${rUid}`;
                    if (!appByRealUid.has(key)) appByRealUid.set(key, []);
                    appByRealUid.get(key).push(app);
                });

                excludedApps = [];
                let changed = false;
                list.forEach(item => {
                    const key = `${item.packageName}:${item.uid}`;
                    const matches = appByRealUid.get(key);
                    if (matches) {
                        matches.forEach(app => {
                            excludedApps.push({ packageName: app.packageName, uid: app.uid });
                        });
                    } else {
                        excludedApps.push({ packageName: item.packageName, uid: item.uid });
                    }
                });

                if (changed) {
                    saveExcludedList(excludedApps);
                }
            } else {
                excludedApps = list;
            }
        }

        const excludedAppKeys = new Set(excludedApps.map(app => `${app.packageName}:${app.uid}`));

        const sortedApps = [...allApps].sort((a, b) => {
            const aExcluded = excludedAppKeys.has(`${a.packageName}:${a.uid}`);
            const bExcluded = excludedAppKeys.has(`${b.packageName}:${b.uid}`);
            if (aExcluded !== bExcluded) return aExcluded ? -1 : 1;
            return (a.appLabel || '').localeCompare(b.appLabel || '');
        });

        emptyMsg.classList.add('hidden');

        sortedApps.forEach(app => {
            const appKey = `${app.packageName}:${app.uid}`;
            let item = appItemMap.get(appKey);
            if (!item) {
                item = document.createElement('label');
                item.className = 'app-item';
                const userIdx = Math.floor(app.uid / 100000);
                const extraTags = [];
                if (userIdx > 0) extraTags.push(getString('info_user', userIdx));
                if (app.isSystem) extraTags.push(getString('info_system'));
                const extraTagsHtml = extraTags.length > 0 ? `
                    <div class="tag-wrapper">
                        ${extraTags.map(tag => `<div class="tag ${app.isSystem ? 'system' : ''}">${tag}</div>`).join('')}
                    </div>
                ` : '';

                item.innerHTML = `
                    <md-ripple></md-ripple>
                    <div class="icon-container">
                        <div class="loader"></div>
                        <img class="app-icon" data-package="${app.packageName || ''}" style="opacity: 0;">
                    </div>
                    <div class="app-info">
                        <div class="app-label">${app.appLabel || getString('msg_unknown')}</div>
                        <div class="app-package">${app.packageName}</div>
                        ${extraTagsHtml}
                    </div>
                    <md-switch class="app-switch"></md-switch>
                `;

                const toggle = item.querySelector('md-switch');
                let saveTimeout = null;
                toggle.addEventListener('change', () => {
                    const realUid = app.uid % 100000;
                    const isSelected = toggle.selected;

                    // Sync state across all instances of the same app
                    allApps.forEach(a => {
                        if (a.packageName === app.packageName && (a.uid % 100000) === realUid) {
                            if (isSelected) {
                                if (!excludedApps.some(e => e.packageName === a.packageName && e.uid === a.uid)) {
                                    excludedApps.push({ packageName: a.packageName, uid: a.uid });
                                }
                            } else {
                                excludedApps = excludedApps.filter(e => !(e.packageName === a.packageName && e.uid === a.uid));
                            }

                            const otherItem = appItemMap.get(`${a.packageName}:${a.uid}`);
                            if (otherItem) {
                                const otherToggle = otherItem.querySelector('md-switch');
                                if (otherToggle && otherToggle !== toggle) {
                                    otherToggle.selected = isSelected;
                                }
                            }
                        }
                    });

                    if (saveTimeout) clearTimeout(saveTimeout);
                    saveTimeout = setTimeout(() => {
                        saveExcludedList(excludedApps);
                    }, 500);
                    exec(`kpatch '${superkey}' exclude_set ${realUid} ${isSelected ? 1 : 0}`, { env: { PATH: `${modDir}/bin` } });
                });

                appItemMap.set(appKey, item);
                iconObserver.observe(item);
            }

            // Update state
            const toggle = item.querySelector('md-switch');
            toggle.selected = excludedAppKeys.has(`${app.packageName}:${app.uid}`);

            appList.appendChild(item);
        });

        applyFilters();
    } catch (e) {
        emptyMsg.textContent = getString('msg_error_rendering_apps', e.message);
        emptyMsg.classList.remove('hidden');
    }
}

function applyFilters() {
    const query = searchQuery.toLowerCase();
    let visibleCount = 0;

    allApps.forEach(app => {
        const item = appItemMap.get(`${app.packageName}:${app.uid}`);
        if (!item) return;

        const matchesSearch = (app.appLabel || '').toLowerCase().includes(query) ||
            (app.packageName || '').toLowerCase().includes(query);
        const matchesSystem = showSystemApp || !app.isSystem;
        const isVisible = matchesSearch && matchesSystem;

        item.classList.toggle('search-hidden', !isVisible);
        if (isVisible) visibleCount++;
    });

    const emptyMsg = document.getElementById('exclude-empty-msg');
    if (visibleCount === 0) {
        emptyMsg.textContent = getString('msg_no_app_found');
        emptyMsg.classList.remove('hidden');
    } else {
        emptyMsg.classList.add('hidden');
    }
}

// Initial setup for the search and menu
function initExcludePage() {
    const searchBtn = document.getElementById('search-btn');
    const searchBar = document.getElementById('app-search-bar');
    const closeBtn = document.getElementById('close-app-search-btn');
    const searchInput = document.getElementById('app-search-input');
    const menuBtn = document.getElementById('exclude-menu-btn');
    const menu = document.getElementById('exclude-menu');
    const systemAppCheckbox = document.getElementById('show-system-app');

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

    systemAppCheckbox.addEventListener('change', () => {
        showSystemApp = systemAppCheckbox.checked;
        localStorage.setItem('kp-next_show_system_app', showSystemApp);
        applyFilters();
    });
    if (localStorage.getItem('kp-next_show_system_app') === 'true') {
        showSystemApp = true;
        systemAppCheckbox.checked = true;
    }

    document.getElementById('refresh-app-list').onclick = () => {
        appItemMap.clear();
        refreshAppList();
    };

    // init render
    refreshAppList();
}

export { refreshAppList, initExcludePage };
