"""Erzeugt das herunterladbare Quellpaket ohne Git-, Hosting- oder Zugangsdaten."""
from pathlib import Path
import runpy
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parent.parent
runpy.run_path(str(root / 'scripts/build-portable.py'), run_name='__main__')
(root / 'index.html').write_text((root / 'dist/index.html').read_text().replace('<head>', '<head><base href="./dist/">', 1))
(root / '.nojekyll').write_text('')
files = [root / name for name in ['index.html','.nojekyll','AGENTS.md','CONTRACT.md','CHANGELOG.md','README.md','package.json']]
for folder in ['dist','docs','tests','scripts','pending']:
    files.extend(p for p in (root / folder).rglob('*') if p.is_file() and p.suffix != '.zip' and '__pycache__' not in p.parts)
with ZipFile(root / 'dist/Industrie-Logistik.zip', 'w', ZIP_DEFLATED) as archive:
    for file in sorted(files):
        archive.write(file, file.relative_to(root))
print(f'Quellpaket: {len(files)} Dateien.')
