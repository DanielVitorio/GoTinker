import { esc } from './util.js';

const dark16 = ['#000000', '#cd3131', '#0dbc79', '#e5e510', '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5', '#666666', '#f14c4c', '#23d18b', '#f5f543', '#3b8eea', '#d670d6', '#29b8db', '#e5e5e5'];
const light16 = ['#000000', '#cd3131', '#00a35c', '#949800', '#0451a5', '#bc05bc', '#0598bc', '#555555', '#666666', '#cd3131', '#14a85a', '#a6a800', '#0451a5', '#bc05bc', '#0598bc', '#333333'];
let base16 = dark16;

function color256(n) {
    if (n < 16) return base16[n];
    if (n < 232) {
        const levels = [0, 95, 135, 175, 215, 255];
        const i = n - 16;
        return `rgb(${levels[Math.floor(i / 36)]},${levels[Math.floor(i / 6) % 6]},${levels[i % 6]})`;
    }
    const gray = 8 + (n - 232) * 10;
    return `rgb(${gray},${gray},${gray})`;
}

export function stripAnsi(text) {
    return String(text || '').replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

export function ansiToHtml(input) {
    base16 = document.documentElement.dataset.theme === 'light' ? light16 : dark16;
    const text = String(input || '').replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
    const re = /\x1b\[([0-9;?]*)([ -/]*[@-~])/g;
    let out = '';
    let last = 0;
    let fg = '';
    let bg = '';
    let bold = false;
    let dim = false;
    let italic = false;
    let underline = false;
    const open = segment => {
        if (!segment) return;
        const styles = [];
        if (fg) styles.push(`color:${fg}`);
        if (bg) styles.push(`background:${bg}`);
        if (bold) styles.push('font-weight:700');
        if (dim) styles.push('opacity:.7');
        if (italic) styles.push('font-style:italic');
        if (underline) styles.push('text-decoration:underline');
        out += styles.length ? `<span style="${styles.join(';')}">${esc(segment)}</span>` : esc(segment);
    };
    let m;
    while ((m = re.exec(text))) {
        open(text.slice(last, m.index));
        last = re.lastIndex;
        if (m[2] !== 'm') continue;
        const codes = (m[1] || '0').split(';').map(n => Number(n || 0));
        for (let i = 0; i < codes.length; i++) {
            const c = codes[i];
            if (c === 0) { fg = ''; bg = ''; bold = dim = italic = underline = false; }
            else if (c === 1) bold = true;
            else if (c === 2) dim = true;
            else if (c === 3) italic = true;
            else if (c === 4) underline = true;
            else if (c === 22) { bold = false; dim = false; }
            else if (c === 23) italic = false;
            else if (c === 24) underline = false;
            else if (c >= 30 && c <= 37) fg = base16[c - 30];
            else if (c >= 90 && c <= 97) fg = base16[c - 90 + 8];
            else if (c >= 40 && c <= 47) bg = base16[c - 40];
            else if (c >= 100 && c <= 107) bg = base16[c - 100 + 8];
            else if (c === 39) fg = '';
            else if (c === 49) bg = '';
            else if ((c === 38 || c === 48) && codes[i + 1] === 5) {
                const value = color256(codes[i + 2] || 0);
                if (c === 38) fg = value; else bg = value;
                i += 2;
            } else if ((c === 38 || c === 48) && codes[i + 1] === 2) {
                const value = `rgb(${codes[i + 2] || 0},${codes[i + 3] || 0},${codes[i + 4] || 0})`;
                if (c === 38) fg = value; else bg = value;
                i += 4;
            }
        }
    }
    open(text.slice(last));
    return out;
}
