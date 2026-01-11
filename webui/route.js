import * as patchModule from './page/patch.js';
import { getString } from './language.js';

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
    document.getElementById('close-kpm-search-btn')?.click();
    document.getElementById('close-app-search-btn')?.click();
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === pageId));
    document.querySelector('.title').textContent = title;

    // Icon
    document.getElementById('home-icon').style.display = (pageId === 'home-page' ? 'flex' : 'none');
    document.getElementById('kpm-icon').style.display = (pageId === 'kpm-page' ? 'flex' : 'none');
    document.getElementById('exclude-icon').style.display = (pageId === 'exclude-page' ? 'flex' : 'none');

    // Bottom Bar
    const isPrimary = navId !== null;
    document.querySelector('.bottom-bar').classList.toggle('hide', !isPrimary);
    document.querySelector('.content').classList.toggle('no-bottom-bar', !isPrimary);

    if (isPrimary) {
        updateBottomBar(navId);
        setupExitBtn();
        setTimeout(() => {
            document.querySelectorAll('.animated').forEach(el => el.classList.add('animate-hidden'));
        }, 200);
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
}

export function navigateToHome() {
    switchPage('home-page', 'KPatch Next', 'home');
}

function navigateToKPM() {
    switchPage('kpm-page', getString('title_kpmodule'), 'KPM');
}

function navigateToExclude() {
    switchPage('exclude-page', getString('title_exclude'), 'exclude');
}

function navigateToSettings() {
    switchPage('settings-page', getString('title_settings'), 'settings');
}

function navigateToPatch() {
    preparePatchUI(getString('title_patch'), false);
    patchModule.getKpimgInfo();
    patchModule.extractAndParseBootimg();
}

function navigateToUnPatch() {
    preparePatchUI(getString('title_unpatch'), true);
    patchModule.extractAndParseBootimg();
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
