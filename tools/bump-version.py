#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
소화전 점검 지도 (119hyd-Map2) - 버전 한 번에 바꾸기 / 배포 전 확인

  python tools/bump-version.py 3.0.1     버전을 v3.0.1로 (index.html + css/ + js/ 전부)
  python tools/bump-version.py --check   바꾸지 않고 확인만 (배포 직전에 한 번)

확인하는 것
  · index.html의 APP_VERSION과 css/·js/ 모든 파일 첫머리의 버전 표시가 같은지
  · index.html의 AppFiles 목록에 적힌 파일이 실제로 있는지
  · css/·js/ 폴더에 있는데 AppFiles 목록에 빠진 파일이 없는지
  · CHANGELOG.md에 이 버전 항목이 있는지 (없으면 알림만)

추가 설치 없이 파이썬 3만 있으면 된다.
"""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'index.html'
RE_APPVER = re.compile(r"^(const APP_VERSION = ')(v[^']*)(';)", re.M)
RE_JS = re.compile(r"^AppFiles\.reg\('js/([\w.-]+)\.js','([^']*)'\);", re.M)
RE_CSS = re.compile(r'^:root\{--appver-([\w-]+):"([^"]*)"\}', re.M)
NOTE = '파일 버전 표시 (tools/bump-version.py가 관리 - 손으로 고치지 않음)'


def read(p): return p.read_text(encoding='utf-8')
def write(p, s): p.write_bytes(s.encode('utf-8'))   # 줄바꿈을 건드리지 않도록 그대로 기록


def file_lists(html):
    """index.html의 AppFiles에서 css·js 파일 목록을 읽는다."""
    out = {}
    for kind in ('css', 'js'):
        m = re.search(r"^\s*%s:\s*\[([^\]]*)\]" % kind, html, re.M)
        if not m:
            sys.exit(f'[오류] index.html에서 AppFiles.{kind} 목록을 찾지 못했습니다.')
        out[kind] = re.findall(r"'([\w.-]+)'", m.group(1))
    return out


def stamp_of(kind, name, text):
    for m in (RE_JS if kind == 'js' else RE_CSS).finditer(text):
        if m.group(1) == name:
            return m.group(2)
    return None


def set_stamp(kind, name, text, ver):
    if stamp_of(kind, name, text) is None:               # 새로 만든 파일: 맨 위에 넣어 줌
        nl = '\r\n' if '\r\n' in text else '\n'
        line = (f"AppFiles.reg('js/{name}.js','{ver}'); // {NOTE}" if kind == 'js'
                else f':root{{--appver-{name}:"{ver}"}} /* {NOTE} */')
        return line + nl + text
    if kind == 'js':
        return RE_JS.sub(lambda m: f"AppFiles.reg('js/{name}.js','{ver}');" if m.group(1) == name else m.group(0), text)
    return RE_CSS.sub(lambda m: f':root{{--appver-{name}:"{ver}"}}' if m.group(1) == name else m.group(0), text)


def check():
    html = read(INDEX)
    m = RE_APPVER.search(html)
    if not m:
        sys.exit("[오류] index.html에서 const APP_VERSION = 'v…'; 줄을 찾지 못했습니다.")
    ver, lists, bad = m.group(2), file_lists(html), []
    for kind in ('css', 'js'):
        for name in lists[kind]:
            p = ROOT / kind / f'{name}.{kind}'
            if not p.exists():
                bad.append(f'{kind}/{name}.{kind}: 파일이 없음 (index.html 목록에는 있음)')
                continue
            v = stamp_of(kind, name, read(p))
            if v is None:
                bad.append(f'{kind}/{name}.{kind}: 버전 표시 줄이 없음')
            elif v != ver:
                bad.append(f'{kind}/{name}.{kind}: {v} (앱은 {ver})')
        for p in sorted((ROOT / kind).glob(f'*.{kind}')):
            if p.stem not in lists[kind]:
                bad.append(f'{kind}/{p.name}: 폴더에는 있는데 index.html의 AppFiles.{kind} 목록에 없음')
    n = len(lists['css']) + len(lists['js'])
    if bad:
        print(f'[오류] 앱 버전 {ver} - 맞지 않는 파일 {len(bad)}개:')
        for b in bad:
            print('   ·', b)
        return ver, False
    print(f'[확인] 앱 버전 {ver} - css {len(lists["css"])}개 · js {len(lists["js"])}개, 모두 {n}개 파일 버전 일치')
    cl = ROOT / 'CHANGELOG.md'
    if cl.exists() and not re.search(r'^## ' + re.escape(ver) + r'\b', read(cl), re.M):
        print(f'  ※ CHANGELOG.md에 "## {ver}" 항목이 아직 없습니다. 변경 내용을 적어 주세요.')
    return ver, True


def bump(new):
    new = 'v' + new.lstrip('vV')
    if not re.fullmatch(r'v\d+\.\d+\.\d+', new):
        sys.exit('[오류] 버전은 3.0.1 처럼 숫자 세 개로 적어 주세요.')
    html = read(INDEX)
    m = RE_APPVER.search(html)
    if not m:
        sys.exit("[오류] index.html에서 const APP_VERSION = 'v…'; 줄을 찾지 못했습니다.")
    old, lists = m.group(2), file_lists(html)
    write(INDEX, RE_APPVER.sub(lambda k: k.group(1) + new + k.group(3), html, count=1))
    for kind in ('css', 'js'):
        for name in lists[kind]:
            p = ROOT / kind / f'{name}.{kind}'
            if p.exists():
                write(p, set_stamp(kind, name, read(p), new))
    print(f'{old} → {new}')
    _, ok = check()
    if ok:
        print('다음: CHANGELOG.md 작성 → 폴더 전체(index.html, css/, js/)를 함께 올리기')
    return ok


if __name__ == '__main__':
    try: sys.stdout.reconfigure(errors='replace'); sys.stderr.reconfigure(errors='replace')   # 윈도우 명령창에서 글자 때문에 멈추지 않게
    except Exception: pass
    if len(sys.argv) != 2 or sys.argv[1] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0)
    if sys.argv[1] == '--check':
        sys.exit(0 if check()[1] else 1)
    sys.exit(0 if bump(sys.argv[1]) else 1)
