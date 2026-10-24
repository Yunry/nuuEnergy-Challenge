"""Build a frontend-only static directory, keeping documents and Python sources private."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]


def build(output=None):
    output = Path(output) if output else ROOT / 'dist'
    output.mkdir(parents=True, exist_ok=True)
    for name in ('index.html', 'live.html', 'evaluation.html'):
        shutil.copyfile(ROOT / name, output / name)
    target = output / 'src' / 'browser'
    target.mkdir(parents=True, exist_ok=True)
    for source in (ROOT / 'src' / 'browser').iterdir():
        if source.suffix in ('.js', '.css'):
            shutil.copyfile(source, target / source.name)
    return output


if __name__ == '__main__':
    print(f'Built static frontend: {build()}')
