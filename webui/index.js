import '@material/web/all.js';
import { exec, toast } from 'kernelsu-alt';
import { setupRoute, navigateToHome } from './route.js';
import { getString, loadTranslations } from './language.js';
import * as patchModule from './page/patch.js';
import * as kpmModule from './page/kpm.js';
import * as excludeModule from './page/exclude.js';

export const modDir = '/data/adb/modules/KPatch-Next';
export const persistDir = '/data/adb/kp-next';

const rehookMode = [
    "disable",  // 0
    "target",   // 1
    "minimal"   // 2
]

export let MAX_CHUNK_SIZE = 96 * 1024;

async function updateStatus() {
    const version = await patchModule.getInstalledVersion();
    const versionText = document.getElementById('version');
    const notInstalled = document.getElementById('not-installed');
    const working = document.getElementById('working');
    const installedOnly = document.querySelectorAll('.installed-only');
    if (version) {
        versionText.textContent = version;
        kpmModule.refreshKpmList();
        initRehook();
        installedOnly.forEach(el => el.removeAttribute('hidden'));
    } else {
        installedOnly.forEach(el => el.setAttribute('hidden', ''));
    }
    notInstalled.classList.toggle('hidden', version);
    working.classList.toggle('hidden', !version);
}

export function escapeShell(cmd) {
    if (cmd === '' || cmd === null || cmd === undefined) return '""';
    return '"' + cmd.replace(/[\\"$`'[\]]/g, '\\$&') + '"';
}

export async function initInfo() {
    const result = await exec('uname -r && getprop ro.build.version.release && getprop ro.build.fingerprint && getenforce');
    if (import.meta.env.DEV) { // vite debug
        result.stdout = '6.18.2-linux\n16\nLinuxPC\nEnforcing';
    }
    const info = result.stdout.trim().split('\n');
    document.getElementById('kernel-release').textContent = info[0];
    document.getElementById('system').textContent = info[1];
    document.getElementById('fingerprint').textContent = info[2];
    document.getElementById('selinux').textContent = info[3];
}

async function reboot(reason = "") {
    if (reason === "recovery") {
        // KEYCODE_POWER = 26, hide incorrect "Factory data reset" message
        await exec("/system/bin/input keyevent 26");
    }
    exec(`/system/bin/svc power reboot ${reason} || /system/bin/reboot ${reason}`);
}

async function initRehook() {
    const rehook = document.getElementById('rehook');
    const rehookMenu = rehook.querySelector('md-menu');
    const mode = await updateRehookStatus();
    if (mode) rehook.onclick = () => rehookMenu.open = !rehookMenu.open;
    rehookMenu.querySelectorAll('md-menu-item').forEach((item, index) => {
        item.onclick = () => {
            setRehookMode(index);
            rehook.click();
        }
    });
}

async function updateRehookStatus() {
    const rehook = document.getElementById('rehook');
    const rehookText = rehook.querySelector('.menu-text');
    const rehookRipple = rehook.querySelector('md-ripple');

    let modeName = 'target', modeId = null;

    const result = await exec(`kpatch rehook_status`, { env: { PATH: `${modDir}/bin` } });
    const mode = result.stdout.split('\n').find(line => line.includes('mode: '));
    if (mode) {
        modeId = parseInt(mode.split(':')[1].trim());
        modeName = rehookMode[modeId];
    }
    rehookText.textContent = getString('label_rehook_mode_' + modeName);
    rehookText.classList.toggle('disabled', !mode);
    rehookRipple.disabled = !mode;

    return modeId !== null;
}

function setRehookMode(mode) {
    exec(`
        kpatch rehook ${mode} && echo ${mode} > ${persistDir}/rehook`,
        { env: { PATH: `${modDir}/bin:$PATH` } }
    ).then((result) => {
        if (result.errno !== 0) {
            toast(getString('msg_error', result.stderr));
            return;
        }
        updateRehookStatus();
    })
}

function getMaxChunkSize() {
    exec('getconf ARG_MAX').then((result) => {
        try {
            const max_arg = parseInt(result.stdout.trim());
            if (!isNaN(max_arg)) {
                // max_arg * 0.75 (base64 size increase) - command length
                MAX_CHUNK_SIZE = Math.floor(max_arg * 0.75) - 1024;
            }
        } catch (e) { }
    });
}

export function linkRedirect(link) {
    toast(getString('msg_redirecting_to', link));
    setTimeout(() => {
        exec(`am start -a android.intent.action.VIEW -d ${link}`)
            .then(({ errno }) => {
                if (errno !== 0) {
                    toast(getString('msg_failed_open_link'));
                    window.open(link, "_blank");
                }
            });
    }, 100);
}

document.addEventListener('DOMContentLoaded', async () => {
    document.querySelectorAll('[unresolved]').forEach(el => el.removeAttribute('unresolved'));
    const splash = document.getElementById('splash');
    if (splash) setTimeout(() => splash.querySelector('.splash-icon').classList.add('show'), 20);

    setupRoute();

    // language
    const language = document.getElementById('language');
    const languageDialog = document.getElementById('language-dialog');
    language.onclick = () => languageDialog.show();
    languageDialog.querySelector('.cancel').onclick = () => languageDialog.close();

    // patch/unpatch
    document.getElementById('embed').onclick = patchModule.embedKPM;
    document.getElementById('start').onclick = () => {
        document.querySelector('.trailing-btn').style.display = 'none';
        document.getElementById('patch-keyboard-inset').classList.add('hide');
        patchModule.patch("patch");
    }
    document.getElementById('unpatch').onclick = () => {
        document.querySelector('.trailing-btn').style.display = 'none';
        patchModule.patch("unpatch");
    }

    // reboot
    const rebootMenu = document.getElementById('reboot-menu');
    document.getElementById('reboot-btn').onclick = () => {
        rebootMenu.open = !rebootMenu.open;
    }
    rebootMenu.querySelectorAll('md-menu-item').forEach(item => {
        item.onclick = () => {
            reboot(item.getAttribute('data-reason'));
        }
    });
    document.getElementById('reboot-fab').onclick = () => reboot();

    getMaxChunkSize();

    await loadTranslations();
    await Promise.all([updateStatus(), initInfo()]);

    excludeModule.initExcludePage();
    kpmModule.initKPMPage();

    // splash screen
    if (splash) {
        setTimeout(() => splash.classList.add('exit'), 50);
        setTimeout(() => splash.remove(), 400);
    }
});

// Overwrite default dialog animation
document.querySelectorAll('md-dialog').forEach(dialog => {
    const defaultOpenAnim = dialog.getOpenAnimation;
    const defaultCloseAnim = dialog.getCloseAnimation;

    dialog.getOpenAnimation = () => {
        const defaultAnim = defaultOpenAnim.call(dialog);
        const customAnim = {};
        Object.keys(defaultAnim).forEach(key => customAnim[key] = defaultAnim[key]);

        customAnim.dialog = [
            [
                [{ opacity: 0, transform: 'translateY(50px)' }, { opacity: 1, transform: 'translateY(0)' }],
                { duration: 300, easing: 'ease' }
            ]
        ];
        customAnim.scrim = [
            [
                [{ 'opacity': 0 }, { 'opacity': 0.32 }],
                { duration: 300, easing: 'linear' },
            ],
        ];
        customAnim.container = [];

        return customAnim;
    };

    dialog.getCloseAnimation = () => {
        const defaultAnim = defaultCloseAnim.call(dialog);
        const customAnim = {};
        Object.keys(defaultAnim).forEach(key => customAnim[key] = defaultAnim[key]);

        customAnim.dialog = [
            [
                [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-50px)' }],
                { duration: 300, easing: 'ease' }
            ]
        ];
        customAnim.scrim = [
            [
                [{ 'opacity': 0.32 }, { 'opacity': 0 }],
                { duration: 300, easing: 'linear' },
            ],
        ];
        customAnim.container = [];

        return customAnim;
    };
});
