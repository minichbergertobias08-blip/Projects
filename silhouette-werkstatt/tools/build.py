#!/usr/bin/env python3
"""Baut die Einzeldatei dist/silhouette-werkstatt.html (alles eingebettet, läuft offline)."""
import base64, json, re, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda f: os.path.join(ROOT, 'assets', f)

def asset(m):
    name, fn, kind = m.group(1), m.group(2), m.group(3)
    data = open(A(fn), 'rb').read()
    if kind == 'b64':
        val = base64.b64encode(data).decode()
    elif kind == 'text':
        val = data.decode('utf-8')
    elif kind.startswith('dataurl:'):
        val = 'data:%s;base64,%s' % (kind[8:], base64.b64encode(data).decode())
    else:
        raise SystemExit('unknown kind ' + kind)
    return 'const %s=%s;' % (name, json.dumps(val))

def build(out):
    html = open(os.path.join(ROOT, 'src', 'index.html'), encoding='utf-8').read()
    app = open(os.path.join(ROOT, 'src', 'app.js'), encoding='utf-8').read()
    app = re.sub(r'/\*@ASSET (\w+) (\S+) (\S+)\*/', asset, app)
    earcut = open(A('earcut.min.js'), encoding='utf-8').read()
    scripts = ('<script>/* earcut 2.2.4 (ISC, Mapbox) – Triangulierung für den STL-Export */\n' + earcut +
               '\n</script>\n<script>\n' + app + '\n</script>\n')
    html = html.replace('<!--@SCRIPTS-->\n', scripts)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, 'w', encoding='utf-8').write(html)
    print(out, round(len(html) / 1e6, 2), 'MB')

if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'dist', 'silhouette-werkstatt.html'))
