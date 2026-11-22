# -*- coding: utf-8 -*-
"""從公開的招募 API（Greenhouse boards、Lever postings）抓 JD，存成純文字。
用法：python -I fetch_jds.py <輸出資料夾> probe|fetch
"""
import html
import json
import os
import re
import sys
import urllib.request

UA = {"User-Agent": "jd-sample-fetcher/1.0", "Accept": "application/json"}
GH = ["appier", "dcard", "duolingo", "figma", "airbnb", "gitlab"]
LEVER = ["pinkoi", "lalamove", "binance"]


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def strip(h):
    h = html.unescape(h or "")
    h = re.sub(r"(?i)<\s*li[^>]*>", "\n- ", h)
    h = re.sub(r"(?i)<\s*(br|/p|/div|/h[1-6]|/ul|/ol|/li)[^>]*>", "\n", h)
    h = re.sub(r"(?i)<\s*h[1-6][^>]*>", "\n\n", h)
    h = re.sub(r"<[^>]+>", "", h)
    h = html.unescape(h).replace("\xa0", " ")
    h = re.sub(r"[ \t]+", " ", h)
    return re.sub(r"\n\s*\n+", "\n\n", h).strip()


def zh_ratio(s):
    if not s:
        return 0.0
    return len(re.findall(r"[一-鿿]", s)) / max(1, len(s))


def main():
    out, mode = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    index = []
    for token in GH:
        try:
            data = get("https://boards-api.greenhouse.io/v1/boards/%s/jobs?content=%s" % (token, "true" if mode == "fetch" else "false"))
        except Exception as e:  # noqa
            continue
        jobs = data.get("jobs", [])
        print("greenhouse", token, len(jobs))
        if mode != "fetch":
            continue
        for j in jobs:
            text = strip(j.get("content"))
            dept = ",".join(d.get("name", "") for d in j.get("departments", []) or [])
            index.append(dict(src="greenhouse", co=token, id=str(j.get("id")), title=j.get("title", ""), dept=dept,
                              loc=(j.get("location") or {}).get("name", ""), zh=round(zh_ratio(text), 3), n=len(text),
                              url=j.get("absolute_url", ""), text=text))
    for token in LEVER:
        try:
            jobs = get("https://api.lever.co/v0/postings/%s?mode=json" % token)
        except Exception as e:  # noqa
            continue
        if not isinstance(jobs, list):
            continue
        print("lever", token, len(jobs))
        if mode != "fetch":
            continue
        for j in jobs:
            parts = [j.get("descriptionPlain") or strip(j.get("description"))]
            for lst in j.get("lists", []) or []:
                parts.append("\n" + (lst.get("text") or "") + "\n" + strip(lst.get("content")))
            parts.append(j.get("additionalPlain") or "")
            text = "\n".join(p for p in parts if p).strip()
            cat = j.get("categories") or {}
            index.append(dict(src="lever", co=token, id=str(j.get("id")), title=j.get("text", ""), dept=cat.get("team", "") or cat.get("department", ""),
                              loc=cat.get("location", ""), zh=round(zh_ratio(text), 3), n=len(text), url=j.get("hostedUrl", ""), text=text))
    if mode == "fetch":
        with open(os.path.join(out, "all.jsonl"), "w", encoding="utf-8", newline="\n") as f:
            for row in index:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        print("saved", len(index), "zh>=0.2:", sum(1 for r in index if r["zh"] >= 0.2))


main()
