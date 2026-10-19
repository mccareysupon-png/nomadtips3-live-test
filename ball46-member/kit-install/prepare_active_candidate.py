#!/usr/bin/env python3
"""Create MEMBER Candidate files from freshly verified ACTIVE public assets. Never deploy here."""
import argparse, hashlib, json, pathlib, zipfile

ROOT=pathlib.Path(__file__).resolve().parent
MARK='BALL46_MEMBER_PREMIUM_16KITS_20261019'
PRESETS=((1,12),(3,16),(6,4),(9,8),(10,14),(13,11),(15,2),(7,5))
def sha(raw): return hashlib.sha256(raw).hexdigest()

def build(active_js,active_css,zip_path):
    assert MARK not in active_js and MARK not in active_css,'ALREADY_INSTALLED'
    signature='function featuredHorizontal(detail,selected){'
    home="  const home=node('div','team home');\n  home.append(crestSlot(homeName,'home'),node('b','',homeName),node('span','team-side-label','HOME'));"
    away="  const away=node('div','team away');\n  away.append(crestSlot(awayName,'away'),node('b','',awayName),node('span','team-side-label','AWAY'));"
    for anchor in [signature,home,away]:
        assert active_js.count(anchor)==1,'CURRENT_MEMBER_DOM_DRIFT:'+anchor[:58]
    addon=(ROOT/'premium-kit-dom.js').read_text('utf8')
    style=(ROOT/'premium-kit-styles.css').read_text('utf8')
    assert MARK in addon and MARK in style
    updated_js=active_js.replace(signature,addon+'\n'+signature,1)
    updated_js=updated_js.replace(home,"  const [homeKit,awayKit]=premiumKitsForFixture(selected,f);\n  const home=node('div','team home');\n  home.append(crestSlot(homeName,'home'));\n  appendPremiumMatchKit(home,'home',homeKit);\n  home.append(node('b','',homeName),node('span','team-side-label','HOME'));",1)
    updated_js=updated_js.replace(away,"  const away=node('div','team away');\n  away.append(crestSlot(awayName,'away'));\n  appendPremiumMatchKit(away,'away',awayKit);\n  away.append(node('b','',awayName),node('span','team-side-label','AWAY'));",1)
    css=active_css+'\n'+style
    with zipfile.ZipFile(zip_path) as zipfile_obj:
        kitfiles={}
        for n in range(1,17):
            filename=f'kit_{n:02d}.png'
            matching=[path for path in zipfile_obj.namelist() if path.split('/')[-1]==filename]
            assert len(matching)==1,'KIT_FILE_MISSING_OR_DUPLICATE:'+filename
            raw=zipfile_obj.read(matching[0])
            assert raw.startswith(b'\x89PNG\r\n\x1a\n'),'KIT_IMAGE_NOT_PNG:'+filename
            assert raw[16:24]==(512).to_bytes(4,'big')*2,'KIT_IMAGE_DIMENSION_NOT_512:'+filename
            kitfiles[filename]=raw
    assert len({tuple(x) for x in PRESETS})==8 and len(kitfiles)==16
    return updated_js,css,kitfiles

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--active-dir',required=True)
    p.add_argument('--kits-zip',required=True)
    p.add_argument('--output-dir',required=True)
    p.add_argument('--expected-js-sha',required=True)
    p.add_argument('--expected-css-sha',required=True)
    a=p.parse_args()
    ad=pathlib.Path(a.active_dir)
    jsraw=(ad/'member.js').read_bytes()
    cssraw=(ad/'styles.css').read_bytes()
    assert sha(jsraw)==a.expected_js_sha,'MEMBER_ACTIVE_JS_SHA_MISMATCH'
    assert sha(cssraw)==a.expected_css_sha,'MEMBER_ACTIVE_CSS_SHA_MISMATCH'
    js,css,images=build(jsraw.decode(),cssraw.decode(),pathlib.Path(a.kits_zip))
    out=pathlib.Path(a.output_dir)
    target=out/'assets'/'premium-kits'
    target.mkdir(parents=True,exist_ok=True)
    (out/'member.js').write_text(js,encoding='utf8')
    (out/'styles.css').write_text(css,encoding='utf8')
    for filename,png in images.items():(target/filename).write_bytes(png)
    status={
      'scope':'BALL46 MEMBER expanded match card only',
      'original':{'member.js':sha(jsraw),'styles.css':sha(cssraw)},
      'patched':{'member.js':sha(js.encode()),'styles.css':sha(css.encode())},
      'kits':{key:sha(image) for key,image in images.items()},
      'presetPairs':PRESETS,'productionDeploy':False,
    }
    (out/'kit-candidate-validation.json').write_text(json.dumps(status,indent=2))
    print('PASS_CANDIDATE_PREPARED_ONLY_NO_DEPLOY',json.dumps({'kitCount':len(images),'filesChanged':['member.js','styles.css']}))

if __name__=='__main__':main()
