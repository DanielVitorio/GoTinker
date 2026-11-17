export const LANGUAGE_ID = 'tinker';

const controlKeywords = [
    'if', 'else', 'elseif', 'endif', 'foreach', 'endforeach', 'for', 'endfor', 'while', 'endwhile', 'do', 'switch', 'endswitch',
    'case', 'default', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw', 'match', 'goto', 'yield',
    'include', 'include_once', 'require', 'require_once', 'declare', 'enddeclare', 'as', 'from'
];

const keywords = [
    'abstract', 'and', 'array', 'callable', 'class', 'clone', 'const', 'echo', 'empty', 'enum', 'eval', 'exit', 'die', 'extends',
    'final', 'fn', 'function', 'global', 'implements', 'instanceof', 'insteadof', 'interface', 'isset', 'list', 'namespace',
    'new', 'or', 'print', 'private', 'protected', 'public', 'readonly', 'static', 'trait', 'unset', 'use', 'var', 'xor',
    'true', 'false', 'null', 'self', 'parent', 'int', 'string', 'bool', 'float', 'void', 'mixed', 'never', 'iterable', 'object'
];

export const monarch = {
    defaultToken: '',
    tokenPostfix: '',
    controlKeywords,
    keywords,
    brackets: [
        { open: '{', close: '}', token: 'delimiter.curly' },
        { open: '[', close: ']', token: 'delimiter.square' },
        { open: '(', close: ')', token: 'delimiter.parenthesis' }
    ],
    tokenizer: {
        root: [
            [/<\?(php|=)?/, 'metatag'],
            [/\?>/, 'metatag'],
            [/\{\{\s*[\w.\-]+\s*\}\}/, 'env'],
            [/#\[/, { token: 'delimiter.attribute', next: '@attribute' }],
            [/\/\*\*(?!\/)/, 'comment.doc', '@doccomment'],
            [/\/\*/, 'comment', '@comment'],
            [/(\/\/|#).*$/, 'comment'],
            [/<<<\s*(['"]?)([A-Za-z_]\w*)\1\s*$/, { token: 'string.heredoc', next: '@heredoc.$2' }],
            [/\$this\b/, 'variable.language'],
            [/\$[a-zA-Z_\x7f-￿][\w\x7f-￿]*/, 'variable'],
            [/(\??->)(\s*)([a-zA-Z_]\w*)(?=\s*\()/, ['delimiter', '', 'function']],
            [/(\??->)(\s*)([a-zA-Z_]\w*)/, ['delimiter', '', 'property']],
            [/(::)(\s*)(class)\b/, ['delimiter', '', 'keyword']],
            [/(::)(\s*)([a-zA-Z_]\w*)(?=\s*\()/, ['delimiter', '', 'function']],
            [/(::)(\s*)(\$[a-zA-Z_]\w*)/, ['delimiter', '', 'variable']],
            [/(::)(\s*)([a-zA-Z_]\w*)/, ['delimiter', '', 'constant']],
            [/(new|instanceof|extends|implements)(\s+)(\\?[A-Za-z_][\w\\]*)/, ['keyword', '', 'type']],
            [/(function)(\s+)(&?\s*[a-zA-Z_]\w*)/, ['keyword', '', 'function']],
            [/\\?[A-Za-z_]\w*(?:\\[A-Za-z_]\w*)+/, 'type'],
            [/[a-zA-Z_]\w*(?=\s*\()/, {
                cases: { '@controlKeywords': 'keyword.control', '@keywords': 'keyword', '@default': 'function' }
            }],
            [/[a-zA-Z_]\w*(?=\s*::)/, 'type'],
            [/[a-zA-Z_]\w*/, {
                cases: {
                    '@controlKeywords': 'keyword.control',
                    '@keywords': 'keyword',
                    '[A-Z][A-Z0-9_]+': 'constant',
                    '[A-Z]\\w*': 'type',
                    '@default': 'identifier'
                }
            }],
            [/"/, 'string', '@dstring'],
            [/'/, 'string', '@sstring'],
            [/`/, 'string', '@bstring'],
            [/0[xX][0-9a-fA-F_]+/, 'number.hex'],
            [/0[bB][01_]+/, 'number'],
            [/\d[\d_]*(\.\d[\d_]*)?([eE][+-]?\d+)?/, 'number'],
            [/\.\d[\d_]*([eE][+-]?\d+)?/, 'number'],
            [/[{}()[\]]/, '@brackets'],
            [/=>|\?\?=?|===?|!==?|<=>|<=|>=|&&|\|\||\+\+|--|\*\*=?|<<|>>|[+\-*/%.=<>!&|^~?:@]=?/, 'operator'],
            [/[;,]/, 'delimiter'],
            [/\s+/, '']
        ],
        attribute: [
            [/\]/, { token: 'delimiter.attribute', next: '@pop' }],
            [/\\?[A-Za-z_][\w\\]*/, 'type'],
            [/"/, 'string', '@dstring'],
            [/'/, 'string', '@sstring'],
            [/\(/, 'delimiter'],
            [/\)/, 'delimiter'],
            [/[^\]"'()\\A-Za-z_]+/, '']
        ],
        comment: [
            [/[^*]+/, 'comment'],
            [/\*\//, 'comment', '@pop'],
            [/\*/, 'comment']
        ],
        doccomment: [
            [/@[a-zA-Z-]+/, 'comment.doc.tag'],
            [/\*\//, 'comment.doc', '@pop'],
            [/[^*@]+/, 'comment.doc'],
            [/[*@]/, 'comment.doc']
        ],
        dstring: [
            [/[^\\"${]+/, 'string'],
            [/\\./, 'string.escape'],
            [/\{\$/, { token: 'delimiter', next: '@interpolation' }],
            [/\$[a-zA-Z_]\w*/, 'variable'],
            [/"/, 'string', '@pop'],
            [/[${]/, 'string']
        ],
        interpolation: [
            [/\}/, { token: 'delimiter', next: '@pop' }],
            { include: 'root' }
        ],
        sstring: [
            [/[^\\']+/, 'string'],
            [/\\./, 'string.escape'],
            [/'/, 'string', '@pop']
        ],
        bstring: [
            [/[^\\`]+/, 'string'],
            [/\\./, 'string.escape'],
            [/`/, 'string', '@pop']
        ],
        heredoc: [
            [/^\s*([A-Za-z_]\w*)\b/, {
                cases: { '$1==$S2': { token: 'string.heredoc', next: '@pop' }, '@default': 'string' }
            }],
            [/\$[a-zA-Z_]\w*/, 'variable'],
            [/[^$]+/, 'string'],
            [/\$/, 'string']
        ]
    }
};

export const configuration = {
    wordPattern: /(-?\d*\.\d\w*)|([^\-`~!@#%^&*()=+[{\]}\\|;:'",.<>/?\s]+)/g,
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
        { open: '{', close: '}', notIn: ['string'] },
        { open: '[', close: ']', notIn: ['string'] },
        { open: '(', close: ')', notIn: ['string'] },
        { open: '"', close: '"', notIn: ['string'] },
        { open: "'", close: "'", notIn: ['string', 'comment'] },
        { open: '/**', close: ' */', notIn: ['string'] }
    ],
    surroundingPairs: [
        { open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' },
        { open: "'", close: "'" }, { open: '"', close: '"' }, { open: '`', close: '`' }
    ],
    indentationRules: {
        increaseIndentPattern: /({(?!.*}).*|\(|\[|((else(\s)?)?if|else|for(each)?|while|switch|case).*:)\s*((\/[/*].*|)?$|\?>)/,
        decreaseIndentPattern: /^(.*\*\/)?\s*((\})|(\)+[;,])|(\][;,])|\b(else:)|\b((end(if|for(each)?|while|switch));))/
    },
    folding: { markers: { start: /^\s*(#|\/\/)region\b/, end: /^\s*(#|\/\/)endregion\b/ } },
    onEnterRules: [
        { beforeText: /^\s*\/\*\*(?!\/)([^*]|\*(?!\/))*$/, afterText: /^\s*\*\/$/, action: { indentAction: 2, appendText: ' * ' } },
        { beforeText: /^\s*\/\*\*(?!\/)([^*]|\*(?!\/))*$/, action: { indentAction: 0, appendText: ' * ' } },
        { beforeText: /^(\t|( {2}))* \*( ([^*]|\*(?!\/))*)?$/, action: { indentAction: 0, appendText: '* ' } },
        { beforeText: /^(\t|( {2}))* \*\/\s*$/, action: { indentAction: 0, removeText: 1 } }
    ]
};

export function registerPhp(monaco) {
    monaco.languages.register({ id: LANGUAGE_ID, extensions: ['.php'], aliases: ['PHP', 'php'] });
    monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, monarch);
    monaco.languages.setLanguageConfiguration(LANGUAGE_ID, configuration);
    monaco.editor.defineTheme('gotinker-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: '', foreground: 'D4D4D4' },
            { token: 'identifier', foreground: 'D4D4D4' },
            { token: 'comment', foreground: '6A9955' },
            { token: 'comment.doc', foreground: '6A9955' },
            { token: 'comment.doc.tag', foreground: '569CD6' },
            { token: 'string', foreground: 'CE9178' },
            { token: 'string.heredoc', foreground: 'CE9178' },
            { token: 'string.escape', foreground: 'D7BA7D' },
            { token: 'number', foreground: 'B5CEA8' },
            { token: 'number.hex', foreground: 'B5CEA8' },
            { token: 'keyword', foreground: '569CD6' },
            { token: 'keyword.control', foreground: 'C586C0' },
            { token: 'variable', foreground: '9CDCFE' },
            { token: 'variable.language', foreground: '569CD6' },
            { token: 'type', foreground: '4EC9B0' },
            { token: 'function', foreground: 'DCDCAA' },
            { token: 'property', foreground: '9CDCFE' },
            { token: 'constant', foreground: '4FC1FF' },
            { token: 'operator', foreground: 'D4D4D4' },
            { token: 'delimiter', foreground: 'D4D4D4' },
            { token: 'delimiter.attribute', foreground: 'D4D4D4' },
            { token: 'metatag', foreground: '569CD6' },
            { token: 'env', foreground: 'FF8A5B', fontStyle: 'bold' },
            { token: 'string.key.json', foreground: '9CDCFE' },
            { token: 'string.value.json', foreground: 'CE9178' },
            { token: 'keyword.json', foreground: '569CD6' }
        ],
        colors: {
            'editor.background': '#1E1E1E',
            'editor.foreground': '#D4D4D4',
            'editorLineNumber.foreground': '#858585',
            'editorLineNumber.activeForeground': '#C6C6C6',
            'editorCursor.foreground': '#AEAFAD',
            'editor.selectionBackground': '#264F78',
            'editor.inactiveSelectionBackground': '#3A3D41',
            'editorIndentGuide.background1': '#404040',
            'editorIndentGuide.activeBackground1': '#707070',
            'editorWhitespace.foreground': '#E3E4E229',
            'editorGutter.background': '#1E1E1E',
            'editorWidget.background': '#252526',
            'editorSuggestWidget.background': '#252526',
            'editorSuggestWidget.border': '#454545',
            'editorSuggestWidget.selectedBackground': '#04395E',
            'editorSuggestWidget.highlightForeground': '#2AAAFF',
            'editorHoverWidget.background': '#252526',
            'editorHoverWidget.border': '#454545',
            'list.hoverBackground': '#2A2D2E',
            'scrollbarSlider.background': '#79797966',
            'scrollbarSlider.hoverBackground': '#646464B3',
            'scrollbarSlider.activeBackground': '#BFBFBF66',
            'minimap.background': '#1E1E1E'
        }
    });
    monaco.editor.defineTheme('gotinker-light', {
        base: 'vs',
        inherit: true,
        rules: [
            { token: '', foreground: '1F1F1F' },
            { token: 'identifier', foreground: '1F1F1F' },
            { token: 'comment', foreground: '008000' },
            { token: 'comment.doc', foreground: '008000' },
            { token: 'comment.doc.tag', foreground: '0000FF' },
            { token: 'string', foreground: 'A31515' },
            { token: 'string.heredoc', foreground: 'A31515' },
            { token: 'string.escape', foreground: 'EE0000' },
            { token: 'number', foreground: '098658' },
            { token: 'number.hex', foreground: '098658' },
            { token: 'keyword', foreground: '0000FF' },
            { token: 'keyword.control', foreground: 'AF00DB' },
            { token: 'variable', foreground: '001080' },
            { token: 'variable.language', foreground: '0000FF' },
            { token: 'type', foreground: '267F99' },
            { token: 'function', foreground: '795E26' },
            { token: 'property', foreground: '001080' },
            { token: 'constant', foreground: '0070C1' },
            { token: 'operator', foreground: '1F1F1F' },
            { token: 'delimiter', foreground: '1F1F1F' },
            { token: 'delimiter.attribute', foreground: '1F1F1F' },
            { token: 'metatag', foreground: '800000' },
            { token: 'env', foreground: 'D4501C', fontStyle: 'bold' },
            { token: 'string.key.json', foreground: '0451A5' },
            { token: 'string.value.json', foreground: 'A31515' },
            { token: 'keyword.json', foreground: '0000FF' }
        ],
        colors: {
            'editor.background': '#FFFFFF',
            'editor.foreground': '#1F1F1F',
            'editorLineNumber.foreground': '#8C8C8C',
            'editorLineNumber.activeForeground': '#1F1F1F',
            'editorCursor.foreground': '#000000',
            'editor.selectionBackground': '#ADD6FF',
            'editor.inactiveSelectionBackground': '#E5EBF1',
            'editor.lineHighlightBackground': '#F5F5F5',
            'editor.lineHighlightBorder': '#00000000',
            'editorIndentGuide.background1': '#E3E3E3',
            'editorIndentGuide.activeBackground1': '#A0A0A0',
            'editorWhitespace.foreground': '#33333333',
            'editorGutter.background': '#FFFFFF',
            'editorWidget.background': '#F8F8F8',
            'editorWidget.border': '#D6D6D6',
            'editorSuggestWidget.background': '#F8F8F8',
            'editorSuggestWidget.border': '#D6D6D6',
            'editorSuggestWidget.selectedBackground': '#D7E9FB',
            'editorSuggestWidget.highlightForeground': '#0066BF',
            'editorHoverWidget.background': '#F8F8F8',
            'editorHoverWidget.border': '#D6D6D6',
            'list.hoverBackground': '#EDEDED',
            'scrollbarSlider.background': '#64646440',
            'scrollbarSlider.hoverBackground': '#64646480',
            'scrollbarSlider.activeBackground': '#00000066',
            'minimap.background': '#FFFFFF'
        }
    });
}
