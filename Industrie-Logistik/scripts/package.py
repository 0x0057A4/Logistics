"""Erzeugt das herunterladbare Quellpaket ohne Git-, Hosting- oder Zugangsdaten."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parent.parent
files = [root / name for name in ['AGENTS.md','CONTRACT.md','CHANGELOG.md','README.md','package.json']]
for folder in ['dist','docs','tests','scripts']:
    files.extend(p for p in (root / folder).rglob('*') if p.is_file() and p.suffix != '.zip' and '__pycache__' not in p.parts)
with ZipFile(root / 'dist/Industrie-Logistik.zip', 'w', ZIP_DEFLATED) as archive:
    for file in sorted(files):
        archive.write(file, file.relative_to(root))
print(f'Quellpaket: {len(files)} Dateien.')
