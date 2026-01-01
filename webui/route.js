import * as patchModule from './page/patch.js';

const backBtn = document.getElementById('back-btn');

function setupExitBtn() {
    const ksuExit = typeof window.ksu?.exit === 'function';
    const webuiExit = typeof window.webui?.exit === 'function';

    if (ksuExit || webuiExit) {
        backBtn.style.display = 'inline-flex';
        backBtn.onclick = (e) => {
            e.stopPropagation();
            setTimeout(() => ksuExit ? window.ksu.exit() : window.webui.exit(), 0);
        };
    } else {
        backBtn.style.display = 'none';
        backBtn.onclick = null;
    }
}

// Page switcher
function switchPage(pageId, title, navId = null) {
    document.getElementById('close-search-btn')?.click();
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === pageId));
    document.querySelector('.title').textContent = title;

    // Icon
    document.getElementById('home-icon').style.display = (pageId === 'home-page' ? 'flex' : 'none');
    document.getElementById('exclude-icon').style.display = (pageId === 'exclude-page' ? 'flex' : 'none');

    // Bottom Bar
    const isPrimary = navId !== null;
    document.querySelector('.bottom-bar').classList.toggle('hide', !isPrimary);
    document.querySelector('.content').style.marginBottom = isPrimary ? '80px' : '0';

    if (isPrimary) {
        updateBottomBar(navId);
        setupExitBtn();
    } else {
        backBtn.style.display = 'inline-flex';
        backBtn.onclick = (e) => {
            e.stopPropagation();
            navigateToHome();
        };
    }
}

// Patch/UnPatch
function preparePatchUI(title, isUnpatch) {
    switchPage('patch-page', title);
    document.querySelector('.trailing-btn').style.display = 'flex';
    document.getElementById('patch-terminal').innerHTML = '';
    document.getElementById('reboot-fab').classList.add('hide');

    document.querySelectorAll('.patch-only').forEach(p => p.classList.toggle('hidden', isUnpatch));
    document.querySelectorAll('.unpatch-only').forEach(p => p.classList.toggle('hidden', !isUnpatch));

    if (isUnpatch) {
        document.getElementById('patch-keyboard-inset').classList.remove('hide');
    }
}

export function navigateToHome() {
    switchPage('home-page', 'KPatch Next', 'home');
}

function navigateToKPM() {
    switchPage('kpm-page', 'KPModule', 'KPM');
}

function navigateToExclude() {
    switchPage('exclude-page', 'Exclude', 'exclude');
}

function navigateToSettings() {
    switchPage('settings-page', 'Settings', 'settings');
}

function navigateToPatch() {
    preparePatchUI('Patch', false);
    patchModule.getKpimgInfo();
    patchModule.getKernelInfo();
}

function navigateToUnPatch() {
    preparePatchUI('UnPatch', true);
    patchModule.getKernelInfo();
}

function updateBottomBar(activeId) {
    document.querySelectorAll('.bottom-bar-item').forEach(item => {
        item.toggleAttribute('selected', item.id === activeId);
    });
}

export function setupRoute() {
    document.getElementById('patch-btn').onclick = navigateToPatch;
    document.getElementById('uninstall').onclick = navigateToUnPatch;
    document.getElementById('not-installed').onclick = navigateToPatch;

    document.querySelectorAll('.bottom-bar-item').forEach(item => {
        item.addEventListener('click', () => {
            const routes = { home: navigateToHome, KPM: navigateToKPM, exclude: navigateToExclude, settings: navigateToSettings };
            routes[item.id]?.();
        });
    });

    navigateToHome();
}
