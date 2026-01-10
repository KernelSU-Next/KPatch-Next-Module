import { listPackages, getPackagesInfo, exec } from 'kernelsu-alt';
import { modDir, persistDir } from '../index.js';
import { getString } from '../language.js';
import fallbackIcon from '../icon.png';

let allApps = [];
let showSystemApp = false;
let searchQuery = '';

function addLiquidRippleEffect(element, event) {
    const ripple = document.createElement('div');
    ripple.className = 'ripple';
    const rect = element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    element.appendChild(ripple);
    setTimeout(() => ripple.remove(), 1000);
}

function addMouseFollowEffect(element) {
    element.addEventListener('mousemove', (e) => {
        const rect = element.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        element.style.setProperty('--mouse-x', `${x}px`);
        element.style.setProperty('--mouse-y', `${y}px`);
    });
}

function createGlowingBorder(element) {
    element.style.position = 'relative';
    element.style.overflow = 'hidden';
    element.insertAdjacentHTML('afterbegin', `
        <div class="glowing-border-top"></div>
        <div class="glowing-border-right"></div>
        <div class="glowing-border-bottom"></div>
        <div class="glowing-border-left"></div>
    `);
}

const iconObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target.querySelector('.app-icon');
            const loader = img.parentElement.querySelector('.loader');
            const pkg = img.dataset.package;
            img.onload = () => {
                img.style.opacity = '1';
                img.style.filter = 'drop-shadow(0 4px 8px rgba(var(--md-sys-color-primary-rgb), 0.3))';
                loader.style.opacity = '0';
                setTimeout(() => loader.remove(), 300);
            };
            img.onerror = () => {
                img.src = fallbackIcon;
                img.style.opacity = '1';
                img.style.filter = 'drop-shadow(0 4px 8px rgba(var(--md-sys-color-primary-rgb), 0.3))';
                loader.style.opacity = '0';
                setTimeout(() => loader.remove(), 300);
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
    emptyMsg.classList.add('liquid-glass-empty');

    try {
        if (import.meta.env.DEV) {
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
            if (lines.length > 0 && lines[0].startsWith('pkg,exclude')) {
                lines = lines.slice(1);
            }

            const list = lines.map(line => {
                const parts = line.split(',');
                if (parts.length < 4) return null;
                return { packageName: parts[0].trim(), uid: parseInt(parts[3]) };
            }).filter(item => item !== null);

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

        sortedApps.forEach((app, index) => {
            const appKey = `${app.packageName}:${app.uid}`;
            let item = appItemMap.get(appKey);
            if (!item) {
                item = document.createElement('label');
                item.className = 'app-item glass-morphism';
                item.style.animationDelay = `${index * 0.05}s`;
                const userIdx = Math.floor(app.uid / 100000);
                const extraTags = [];
                if (userIdx > 0) extraTags.push(getString('info_user', userIdx));
                if (app.isSystem) extraTags.push(getString('info_system'));
                const extraTagsHtml = extraTags.length > 0 ? `
                    <div class="tag-wrapper">
                        ${extraTags.map(tag => `<div class="tag glass-tag ${app.isSystem ? 'system' : ''}">${tag}</div>`).join('')}
                    </div>
                ` : '';

                item.innerHTML = `
                    <div class="glass-ripple"></div>
                    <div class="glass-glow"></div>
                    <div class="icon-container glass-icon">
                        <div class="loader glass-shimmer"></div>
                        <img class="app-icon glass-icon-img" data-package="${app.packageName || ''}" style="opacity: 0;">
                    </div>
                    <div class="app-info glass-text">
                        <div class="app-label glass-text-title">${app.appLabel || getString('msg_unknown')}</div>
                        <div class="app-package glass-text-subtitle">${app.packageName}</div>
                        ${extraTagsHtml}
                    </div>
                    <md-switch class="app-switch glass-switch"></md-switch>
                `;

                createGlowingBorder(item);
                addMouseFollowEffect(item);

                const toggle = item.querySelector('md-switch');
                let saveTimeout = null;
                toggle.addEventListener('change', () => {
                    const realUid = app.uid % 100000;
                    const isSelected = toggle.selected;
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
                                    otherToggle.animate([
                                        { transform: 'scale(1)' },
                                        { transform: 'scale(1.2)' },
                                        { transform: 'scale(1)' }
                                    ], { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
                                }
                            }
                        }
                    });

                    toggle.animate([
                        { transform: 'scale(1)' },
                        { transform: 'scale(1.2)' },
                        { transform: 'scale(1)' }
                    ], { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });

                    if (saveTimeout) clearTimeout(saveTimeout);
                    saveTimeout = setTimeout(() => {
                        saveExcludedList(excludedApps);
                    }, 500);
                    exec(`kpatch exclude_set ${realUid} ${isSelected ? 1 : 0}`, { env: { PATH: `${modDir}/bin` } });
                });

                toggle.addEventListener('click', (e) => {
                    addLiquidRippleEffect(toggle, e);
                });

                item.addEventListener('click', (e) => {
                    if (!e.target.closest('md-switch')) {
                        addLiquidRippleEffect(item, e);
                        toggle.click();
                    }
                });

                appItemMap.set(appKey, item);
                iconObserver.observe(item);
            }

            const toggle = item.querySelector('md-switch');
            toggle.selected = excludedAppKeys.has(`${app.packageName}:${app.uid}`);
            if (!appList.contains(item)) {
                appList.appendChild(item);
            }
        });

        applyFilters();
        setTimeout(() => {
            document.querySelectorAll('.app-item.glass-morphism').forEach((item, index) => {
                item.style.animationDelay = `${index * 0.03}s`;
            });
        }, 100);

    } catch (e) {
        emptyMsg.textContent = getString('msg_error_rendering_apps', e.message);
        emptyMsg.classList.remove('hidden');
        emptyMsg.classList.add('liquid-glass-empty');
    }
}

function applyFilters() {
    const query = searchQuery.toLowerCase();
    let visibleCount = 0;

    allApps.forEach((app, index) => {
        const item = appItemMap.get(`${app.packageName}:${app.uid}`);
        if (!item) return;

        const matchesSearch = (app.appLabel || '').toLowerCase().includes(query) ||
            (app.packageName || '').toLowerCase().includes(query);
        const matchesSystem = showSystemApp || !app.isSystem;
        const isVisible = matchesSearch && matchesSystem;

        if (isVisible) {
            item.classList.remove('search-hidden');
            item.style.opacity = '1';
            item.style.transform = 'translateY(0) scale(1)';
            item.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
            item.style.animationDelay = `${visibleCount * 0.03}s`;
            visibleCount++;
        } else {
            item.classList.add('search-hidden');
            item.style.opacity = '0';
            item.style.transform = 'translateY(-20px) scale(0.95)';
        }
    });

    const emptyMsg = document.getElementById('exclude-empty-msg');
    if (visibleCount === 0) {
        emptyMsg.textContent = getString('msg_no_app_found');
        emptyMsg.classList.remove('hidden');
        emptyMsg.classList.add('liquid-glass-empty');
        emptyMsg.animate([
            { transform: 'scale(0.9)', opacity: 0 },
            { transform: 'scale(1)', opacity: 1 }
        ], { duration: 400, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
    } else {
        emptyMsg.classList.add('hidden');
    }
}

function initExcludePage() {
    const excludePage = document.getElementById('exclude-page');
    const searchBtn = document.getElementById('search-btn');
    const searchBar = document.getElementById('app-search-bar');
    const closeBtn = document.getElementById('close-app-search-btn');
    const searchInput = document.getElementById('app-search-input');
    const menuBtn = document.getElementById('exclude-menu-btn');
    const menu = document.getElementById('exclude-menu');
    const systemAppCheckbox = document.getElementById('show-system-app');

    excludePage.classList.add('glass-page-transition');
    setTimeout(() => {
        excludePage.classList.remove('glass-page-transition');
    }, 600);

    searchBtn.classList.add('glass-button');
    menuBtn.classList.add('glass-button');
    closeBtn.classList.add('glass-button');
    
    searchBtn.addEventListener('click', (e) => {
        addLiquidRippleEffect(searchBtn, e);
        searchBar.classList.add('show', 'glass-search-bar');
        document.querySelectorAll('.search-bg').forEach(el => el.classList.add('hide'));
        searchInput.classList.add('glass-input');
        searchInput.focus();
        searchBar.animate([
            { opacity: '0', transform: 'translateY(-10px)' },
            { opacity: '1', transform: 'translateY(0)' }
        ], { duration: 300, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
    });

    closeBtn.addEventListener('click', (e) => {
        addLiquidRippleEffect(closeBtn, e);
        searchBar.classList.remove('show', 'glass-search-bar');
        document.querySelectorAll('.search-bg').forEach(el => el.classList.remove('hide'));
        searchQuery = '';
        searchInput.blur();
        searchInput.value = '';
        applyFilters();
    });

    searchInput.addEventListener('input', () => {
        searchQuery = searchInput.value;
        applyFilters();
    });

    menuBtn.addEventListener('click', (e) => {
        addLiquidRippleEffect(menuBtn, e);
        menu.classList.add('glass-menu');
        menu.show();
    });

    systemAppCheckbox.classList.add('glass-checkbox');
    systemAppCheckbox.addEventListener('change', () => {
        showSystemApp = systemAppCheckbox.checked;
        localStorage.setItem('kp-next_show_system_app', showSystemApp);
        systemAppCheckbox.animate([
            { transform: 'scale(1)' },
            { transform: 'scale(1.2)' },
            { transform: 'scale(1)' }
        ], { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
        setTimeout(() => {
            applyFilters();
        }, 150);
    });
    
    if (localStorage.getItem('kp-next_show_system_app') === 'true') {
        showSystemApp = true;
        systemAppCheckbox.checked = true;
    }

    const refreshBtn = document.getElementById('refresh-app-list');
    refreshBtn.classList.add('glass-button');
    refreshBtn.addEventListener('click', (e) => {
        addLiquidRippleEffect(refreshBtn, e);
        appItemMap.clear();
        refreshAppList();
        const appList = document.getElementById('app-list');
        appList.animate([
            { opacity: '1' },
            { opacity: '0.3' },
            { opacity: '1' }
        ], { duration: 500, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
        refreshBtn.animate([
            { transform: 'rotate(0deg)' },
            { transform: 'rotate(360deg)' }
        ], { duration: 500, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
    });

    const menuItems = menu.querySelectorAll('md-menu-item');
    menuItems.forEach(item => {
        item.classList.add('glass-menu-item');
        item.addEventListener('click', (e) => {
            addLiquidRippleEffect(item, e);
        });
    });

    document.querySelectorAll('.bottom-bar-item').forEach(item => {
        item.classList.add('glass-bottom-bar');
    });

    const dialog = document.getElementById('exclude-dialog');
    if (dialog) {
        dialog.classList.add('glass-dialog');
    }

    refreshAppList();
    setTimeout(() => {
        document.querySelectorAll('.app-item.glass-morphism').forEach(item => {
            item.style.animation = 'glassSlideIn 0.5s ease-out backwards';
        });
    }, 300);
}

export { refreshAppList, initExcludePage };
