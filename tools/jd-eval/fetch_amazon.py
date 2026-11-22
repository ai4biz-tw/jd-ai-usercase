# -*- coding: utf-8 -*-
"""從 amazon.jobs 的公開搜尋介面抓 JD，每個職類取幾十份。
用法：python -I fetch_amazon.py <輸出資料夾> [每類幾份=30] [最多幾類=30]
輸出 all.jsonl，欄位跟 fetch_jds.py 一樣。
"""
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

UA = {"User-Agent": "jd-sample-fetcher/1.0", "Accept": "application/json"}
BASE = "https://www.amazon.jobs/en/search.json"


def get(params):
    url = BASE + "?" + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def strip(h):
    h = html.unescape(h or "")
    h = re.sub(r"(?i)<\s*br\s*/?>", "\n", h)
    h = re.sub(r"(?i)<\s*li[^>]*>", "\n- ", h)
    h = re.sub(r"<[^>]+>", "", h)
    h = html.unescape(h).replace("\xa0", " ")
    h = re.sub(r"[ \t]+", " ", h)
    return re.sub(r"\n\s*\n+", "\n\n", h).strip()


def zh_ratio(s):
    return len(re.findall(r"[一-鿿]", s)) / max(1, len(s))


def main():
    out = sys.argv[1]
    per = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    max_cat = int(sys.argv[3]) if len(sys.argv) > 3 else 30
    os.makedirs(out, exist_ok=True)
    # 搜尋介面不回傳職類清單，這裡用網站上的職類代碼。
    slugs = """software-development operations-it-support-engineering fulfillment-warehouse-associate customer-service
    sales-advertising-account-management marketing-pr human-resources finance-accounting buying-planning-instock-management
    supply-chain-transportation-management project-program-product-management-non-tech project-program-product-management-technical
    design legal data-science business-intelligence medical-health-safety editorial-writing-content-management
    facilities-maintenance-real-estate administrative-support business-merchant-development public-policy solutions-architect
    machine-learning-science research-science hardware-development economics audio-video-photography-production
    investigation-loss-prevention database-administration systems-quality-security-engineering leadership-development-training
    fulfillment-operations-management""".split()
    cats = [(slug, 0) for slug in slugs]
    rows, seen = [], set()
    for name, count in cats[:max_cat]:
        try:
            data = get({"result_limit": per, "offset": 0, "sort": "recent", "category[]": name})
        except Exception as e:  # noqa
            print("fail", name, e)
            continue
        jobs = data.get("jobs", [])
        print("%-48s hits=%5s got=%d  -> %s" % (name[:48], data.get("hits"), len(jobs), sorted(set(j.get("job_category", "") for j in jobs))[:2]))
        for j in jobs:
            if j.get("id") in seen:
                continue
            seen.add(j.get("id"))
            parts = [strip(j.get("description"))]
            if j.get("basic_qualifications"):
                parts.append("BASIC QUALIFICATIONS\n" + strip(j.get("basic_qualifications")))
            if j.get("preferred_qualifications"):
                parts.append("PREFERRED QUALIFICATIONS\n" + strip(j.get("preferred_qualifications")))
            text = "\n\n".join(p for p in parts if p)
            rows.append(dict(src="amazon", co="amazon", id=str(j.get("id")), title=j.get("title", ""), dept=j.get("job_category", ""),
                             loc=j.get("location", ""), zh=round(zh_ratio(text), 3), n=len(text),
                             url="https://www.amazon.jobs" + (j.get("job_path") or ""), text=text))
        time.sleep(1.0)
    with open(os.path.join(out, "all.jsonl"), "w", encoding="utf-8", newline="\n") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print("saved", len(rows))


main()
