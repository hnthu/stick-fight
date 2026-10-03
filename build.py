#!/usr/bin/env python3
"""Bundle the game into one self-contained page: dist/index.html (this is what gets published).

- src/style.css is inlined in place of its <link>.
- arenas/arenaNN.js are inlined as separate scripts (each guarded, so a broken arena can't stop the game).
- The game modules listed in src/modules.txt are concatenated, in order, into ONE closure,
  so they share a scope exactly like the separate <script> tags in index.html do.
"""
import os, re
here = os.path.dirname(os.path.abspath(__file__))
read = lambda p: open(os.path.join(here, p), encoding='utf-8').read()
safe = lambda code: code.replace('</script', '<\\/script')

html = read('index.html')

# stylesheet
html = html.replace('<link rel="stylesheet" href="src/style.css">', '<style>\n' + read('src/style.css') + '</style>')

# arenas
def inline_arena(m):
    path = m.group(1)
    if not os.path.exists(os.path.join(here, path)):
        return ''
    return f'<script>/* {path} */\ntry {{\n{safe(read(path))}\n}} catch (e) {{ console.warn("{path} failed to load", e); }}\n</script>'
html = re.sub(r'<script src="(arenas/arena\d\d\.js)"[^>]*></script>', inline_arena, html)

# game modules -> one closure
modules = [l.strip() for l in read('src/modules.txt').splitlines() if l.strip() and not l.startswith('#')]
bundle = '(() => {\n' + '\n'.join(f'/* ===== {p} ===== */\n{read(p)}' for p in modules) + '})();\n'
tags = re.compile(r'<!-- game modules.*?-->\n(?:<script src="[^"]+"></script>\n)+', re.S)
assert tags.search(html), 'module script tags not found in index.html'
html = tags.sub(lambda m: '<script>\n' + safe(bundle) + '</script>\n', html)

os.makedirs(os.path.join(here, 'dist'), exist_ok=True)
open(os.path.join(here, 'dist', 'index.html'), 'w', encoding='utf-8').write(html)
print('built dist/index.html', len(html), 'bytes from', len(modules), 'modules')
