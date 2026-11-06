"""Download WHO LMS tables (expanded, by day) and convert to JSON.
TODO(agent): fill exact file URLs from https://www.who.int/tools/child-growth-standards/standards
(indicator pages -> 'Expanded tables' z-score/LMS .xlsx). Verify columns Day,L,M,S.
"""
import json, sys, datetime, pandas as pd
SOURCES = {  # indicator_sex: url  (TODO fill)
    # "wfa_boys": "https://...", "wfa_girls": "...", "lhfa_boys": "...", ...
}
def convert(key, url):
    df = pd.read_excel(url)
    df.columns = [c.strip() for c in df.columns]
    rows = [{"day": int(r["Day"]), "L": float(r["L"]), "M": float(r["M"]), "S": float(r["S"])}
            for _, r in df.iterrows() if int(r["Day"]) <= 731]
    out = {"indicator": key, "source_url": url, "downloaded_at": datetime.date.today().isoformat(),
           "verified": True, "data": rows}
    json.dump(out, open(f"knowledge/growth/who_lms_{key}.json", "w"), ensure_ascii=False)
if __name__ == "__main__":
    if not SOURCES: sys.exit("Fill SOURCES first")
    for k, u in SOURCES.items(): convert(k, u)
