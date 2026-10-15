"""Build an offline HTML from the project's deliberately small ES-module subset.

Each module keeps its own function scope. Dependency ordering is checked; unknown
module syntax and cycles fail the build rather than creating a broken download.
No dependencies, runtime eval, module loader, or network access are required.
"""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parent.parent
IMPORT = re.compile(r"^import\s+(\{[^}]+\}|\*\s+as\s+\w+)\s+from\s+(['\"])(\./[^'\"]+\.js)\2\s*;", re.M)
EXPORT = re.compile(r"^export\s+(const|function|class)\s+([A-Za-z_$][\w$]*)", re.M)


def bundle(entry):
    modules, visiting, chunks = {}, set(), []

    def visit(path):
        path = path.resolve()
        if path in visiting:
            raise ValueError(f'Module cycle: {path.name}')
        if path in modules:
            return modules[path]
        if not path.is_relative_to(entry.parent.resolve()):
            raise ValueError('Module outside dist')
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
        if re.search(r'^\s*(?:import|export)\s|\bimport\s*\(|\bimport\.meta', source, re.M):
            raise ValueError(f'Unsupported module syntax in {path.name}')
        index = len(modules)
        modules[path] = index
        properties = ','.join(json.dumps(name)+':{enumerable:true,get:()=>'+name+'}' for name in exports)
        chunks.append(f'// {path.name}\n__modules[{index}]=(()=>{{\n' + '\n'.join(imports) + '\n' + source + '\nreturn Object.freeze(Object.defineProperties({}, {' + properties + '}));\n})();')
        visiting.remove(path)
        return index

    visit(entry)
    return '(()=>{\n"use strict";\nconst __modules=[];\n' + '\n'.join(chunks) + '\n})();\n'


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
    code = bundle(dist / 'app.js')
    # HTML's script parser also recognizes closing tags inside JS strings/comments.
    code = re.sub(r'</script', r'<\\/script', code, flags=re.I)
    code = code.replace('<!--', '<\\!--')
    payload = ('<script id="embedded-save" type="application/json">null</script>\n'
               '<script id="embedded-prefs" type="application/json">null</script>\n'
               '<script id="portable-runtime">' + code + '</script>')
    html = html.replace(css_tag, '<style>' + css + '</style>', 1).replace(app_tag, payload, 1)
    (dist / 'portable.html').write_text(html, encoding='utf-8')
    return len(html.encode('utf-8'))


if __name__ == '__main__':
    print(f'Offline-HTML: {build()} Bytes.')
