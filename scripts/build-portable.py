"""Build an offline HTML from the project's deliberately small ES-module subset.

Each module keeps its own function scope. Dependency ordering is checked; unknown
module syntax and cycles fail the build rather than creating a broken download.
No dependencies, runtime eval, module loader, or network access are required.

Vendor modules below dist/vendor/ (e.g. three.js) are embedded without syntax
analysis: they must have no imports and exactly one final `export{a as B,...};`
block. That block becomes a frozen namespace object; the rest runs unchanged in
its own strict function scope. Their license files are copied as HTML comments.
"""
from pathlib import Path
import json
import os
import re

ROOT = Path(__file__).resolve().parent.parent
IMPORT = re.compile(r"^import\s+(\{[^}]+\}|\*\s+as\s+\w+)\s+from\s+(['\"])(\./[^'\"]+\.js)\2\s*;", re.M)
EXPORT = re.compile(r"^export\s+(const|function|class)\s+([A-Za-z_$][\w$]*)", re.M)
IDENT = r'[A-Za-z_$][\w$]*'
VENDOR_WORD = lambda word: re.compile(r'(?<![\w$])' + word + r'(?![\w$])')
VENDOR_EXPORT = re.compile(r'(?<![\w$])export\s*\{([^{}]*)\}\s*;?\s*$')
VENDOR_SPEC = re.compile(r'^\s*(' + IDENT + r')(?:\s+as\s+(' + IDENT + r'))?\s*$')


def namespace(pairs):
    """Frozen namespace with live getters, like an ES module namespace."""
    properties = ','.join(json.dumps(name) + ':{enumerable:true,get:()=>' + local + '}' for name, local in pairs)
    return 'return Object.freeze(Object.defineProperties({}, {' + properties + '}));'


def vendor_chunk(path, index):
    source = path.read_text(encoding='utf-8')
    if VENDOR_WORD('import').search(source):
        raise ValueError(f'Vendor module must not import: {path.name}')
    if len(VENDOR_WORD('export').findall(source)) != 1:
        raise ValueError(f'Vendor module needs exactly one export block: {path.name}')
    match = VENDOR_EXPORT.search(source)
    if not match:
        raise ValueError(f'Vendor export block must end the file: {path.name}')
    pairs = []
    for spec in filter(str.strip, match[1].split(',')):
        parsed = VENDOR_SPEC.match(spec)
        if not parsed:
            raise ValueError(f'Unsupported vendor export in {path.name}: {spec.strip()[:40]}')
        pairs.append((parsed[2] or parsed[1], parsed[1]))
    if len({name for name, _ in pairs}) != len(pairs):
        raise ValueError(f'Duplicate vendor export in {path.name}')
    body = source[:match.start()]
    # `.call(undefined)` keeps module semantics for top-level `this`.
    return (f'// vendor/{path.name}\n__modules[{index}]=(function(){{\n' + body + '\n' + namespace(pairs) + '\n}).call(undefined);')


def bundle(entry, vendors=None):
    modules, visiting, chunks = {}, set(), []
    vendor_dir = (entry.parent / 'vendor').resolve()

    def visit(path):
        path = path.resolve()
        if path in visiting:
            raise ValueError(f'Module cycle: {path.name}')
        if path in modules:
            return modules[path]
        if not path.is_relative_to(entry.parent.resolve()):
            raise ValueError('Module outside dist')
        if path.is_relative_to(vendor_dir):
            index = len(modules)
            chunks.append(vendor_chunk(path, index))
            modules[path] = index
            if vendors is not None:
                vendors.append(path)
            return index
        visiting.add(path)
        source = path.read_text(encoding='utf-8')
        imports = []
        for match in IMPORT.finditer(source):
            dependency = visit(path.parent / match[3])
            bindings = match[1]
            if bindings.startswith('*'):
                bindings = bindings.split()[-1]
            else:
                bindings = re.sub(r'\s+as\s+', ':', bindings)
            imports.append(f'const {bindings}=__modules[{dependency}];')
        source = IMPORT.sub('', source)
        exports = [match[2] for match in EXPORT.finditer(source)]
        source = EXPORT.sub(lambda match: match[1] + ' ' + match[2], source)
        if re.search(r'^\s*(?:import|export)\b|\bimport\s*\(|\bimport\.meta', source, re.M):
            raise ValueError(f'Unsupported module syntax in {path.name}')
        index = len(modules)
        modules[path] = index
        chunks.append(f'// {path.name}\n__modules[{index}]=(()=>{{\n' + '\n'.join(imports) + '\n' + source + '\n' + namespace((name, name) for name in exports) + '\n})();')
        visiting.remove(path)
        return index

    visit(entry)
    return '(()=>{\n"use strict";\nconst __modules=[];\n' + '\n'.join(chunks) + '\n})();\n'


def license_comments(vendors, dist):
    """License texts of all used vendor folders as passive HTML comments."""
    notices = []
    for folder in sorted({path.parent for path in vendors}):
        for file in sorted(folder.glob('*LICENSE*')):
            text = file.read_text(encoding='utf-8').strip()
            while '--' in text:
                text = text.replace('--', '- -')
            notices.append('<!-- Drittanbieter-Lizenz (' + file.relative_to(dist).as_posix() + ')\n' + text + '\n-->\n')
    return ''.join(notices)


def build(root=ROOT):
    dist = root / 'dist'
    html = (dist / 'index.html').read_text(encoding='utf-8')
    css = (dist / 'styles.css').read_text(encoding='utf-8')
    if re.search(r'url\s*\(|@import|</style', css, re.I):
        raise ValueError('Portable CSS must contain no external resource or style end tag')
    css_tag = '<link rel="stylesheet" href="./styles.css">'
    app_tag = '<script type="module" src="./app.js"></script>'
    if html.count(css_tag) != 1 or html.count(app_tag) != 1:
        raise ValueError('Expected exactly one stylesheet and app entry')
    vendors = []
    code = bundle(dist / 'app.js', vendors)
    # HTML's script parser also recognizes closing tags inside JS strings/comments.
    code = re.sub(r'</script', r'<\\/script', code, flags=re.I)
    code = code.replace('<!--', '<\\!--')
    payload = ('<script id="embedded-save" type="application/json">null</script>\n'
               '<script id="embedded-prefs" type="application/json">null</script>\n'
               + license_comments(vendors, dist) +
               '<script id="portable-runtime">' + code + '</script>')
    html = html.replace(css_tag, '<style>' + css + '</style>', 1).replace(app_tag, payload, 1)
    # Atomar ersetzen: parallele Leser (z. B. gleichzeitig laufende Tests) sehen nie eine halb geschriebene Datei.
    target = dist / 'portable.html'
    temp = dist / f'.portable.html.{os.getpid()}.tmp'
    temp.write_text(html, encoding='utf-8')
    os.replace(temp, target)
    return len(html.encode('utf-8'))


if __name__ == '__main__':
    print(f'Offline-HTML: {build()} Bytes.')
