# /// script
# dependencies = ["fonttools"]
# ///
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from pathlib import Path
import shutil
src = Path('src'); out = Path('.')
jobs = []
for wt in [300, 500, 700, 900]:
    jobs.append(('Unbounded[wght].ttf', {'wght': wt}, f'Unbounded-{wt}.ttf'))
for wd in [75, 100, 112.5]:
    for wt in [300, 500, 800]:
        jobs.append(('MartianMono[wdth,wght].ttf', {'wdth': wd, 'wght': wt}, f'MartianMono-w{int(wd*10)}-{wt}.ttf'))
for s, loc, name in jobs:
    f = TTFont(src / s)
    ax = {a.axisTag: (a.minValue, a.maxValue) for a in f['fvar'].axes}
    loc = {k: min(max(v, ax[k][0]), ax[k][1]) for k, v in loc.items()}
    instancer.instantiateVariableFont(f, loc, updateFontNames=False).save(out / name)
for n in ['InstrumentSerif-Regular.ttf', 'InstrumentSerif-Italic.ttf']:
    shutil.copy(src / n, out / n)
print(len(jobs), 'instances', {k: v for k, v in ax.items()})
