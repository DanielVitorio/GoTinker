import { t } from './i18n.js';
import { esc } from './util.js';

const fullToolbar = [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike', 'code'],
    [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }],
    ['blockquote', 'code-block', 'link'],
    ['clean']
];

const compactToolbar = [
    ['bold', 'italic', 'code'],
    [{ list: 'bullet' }, { list: 'check' }],
    ['link', 'clean']
];

const labels = [
    ['.ql-header', 'richHeading'], ['.ql-bold', 'richBold'], ['.ql-italic', 'richItalic'], ['.ql-underline', 'richUnderline'],
    ['.ql-strike', 'richStrike'], ['.ql-code', 'richCode'], ['.ql-list[value="ordered"]', 'richOrdered'], ['.ql-list[value="bullet"]', 'richBullet'],
    ['.ql-list[value="check"]', 'richCheck'], ['.ql-blockquote', 'richQuote'], ['.ql-code-block', 'richCodeBlock'], ['.ql-link', 'richLink'], ['.ql-clean', 'richClean']
];

const cssLabels = [
    ['--rt-visit', 'richVisit'], ['--rt-enter', 'richEnterLink'], ['--rt-edit', 'richEdit'], ['--rt-save', 'richSave'], ['--rt-remove', 'richRemove'],
    ['--rt-normal', 'richNormal'], ['--rt-h1', 'richH1'], ['--rt-h2', 'richH2'], ['--rt-h3', 'richH3']
];

const htmlPattern = /<\/?(p|h[1-6]|ol|ul|li|strong|em|u|s|a|code|pre|blockquote|br|div|span)\b/i;

export function toRichHtml(value) {
    const text = String(value || '');
    if (!text.trim()) return '';
    if (htmlPattern.test(text)) return text;
    return text.split(/\r?\n/).map(line => `<p>${line ? esc(line) : '<br>'}</p>`).join('');
}

export function isRichEmpty(value) {
    return !String(value || '').replace(/<li[^>]*data-list="(checked|unchecked)"[^>]*>/gi, 'x').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

export function createRichEditor({ placeholder = '', compact = false, onChange = () => {} } = {}) {
    const root = document.createElement('div');
    root.className = 'rich' + (compact ? ' compact' : '');
    const host = document.createElement('div');
    root.append(host);
    if (!window.Quill) {
        const fallback = document.createElement('textarea');
        fallback.className = 'rich-fallback';
        fallback.placeholder = placeholder;
        host.replaceWith(fallback);
        let lastValue = '';
        fallback.addEventListener('input', () => {
            lastValue = fallback.value;
            onChange(lastValue);
        });
        return {
            el: root,
            getValue: () => lastValue,
            setValue: value => { lastValue = String(value || ''); fallback.value = lastValue.replace(/<[^>]*>/g, ''); },
            focus: () => fallback.focus(),
            localize: () => {}
        };
    }
    const quill = new window.Quill(host, {
        theme: 'snow',
        placeholder,
        bounds: root,
        modules: { toolbar: compact ? compactToolbar : fullToolbar }
    });
    let lastValue = '';
    const read = () => (quill.getLength() <= 1 ? '' : quill.root.innerHTML);
    quill.on('text-change', (_delta, _old, source) => {
        if (source !== 'user') return;
        lastValue = read();
        onChange(lastValue);
    });
    const localize = () => {
        const toolbar = root.querySelector('.ql-toolbar');
        for (const [selector, key] of labels) {
            toolbar?.querySelectorAll(selector).forEach(el => { el.title = t(key); });
        }
        for (const [property, key] of cssLabels) root.style.setProperty(property, JSON.stringify(t(key)));
        quill.root.dataset.placeholder = placeholder;
    };
    localize();
    return {
        el: root,
        quill,
        getValue: () => lastValue,
        setValue(value) {
            const next = String(value || '');
            if (next === lastValue && root.isConnected && quill.root.innerHTML) return;
            lastValue = next;
            const html = toRichHtml(next);
            quill.setContents(html ? quill.clipboard.convert({ html }) : [], 'silent');
            quill.history.clear();
        },
        focus: () => quill.focus(),
        setPlaceholder(text) {
            placeholder = text;
            quill.root.dataset.placeholder = text;
        },
        localize
    };
}
