# -*- coding: utf-8 -*-
"""讀 run_batch 的輸出，印統計。用法：python -I stats.py <out.json> [label]"""
import collections
import json
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
rows = json.load(open(sys.argv[1], encoding="utf-8"))


def role(title):
    t = title.lower()
    table = [
        ("engineering", r"engineer|developer|sre|devops|architect|工程師|開發|qa\b|security|scientist|machine learning|data eng"),
        ("sales", r"account executive|sales|business development|account manager|業務|partnership|customer success|solutions"),
        ("marketing", r"marketing|content|brand|social|行銷|文案|社群|growth|communications|pr\b|copywriter"),
        ("finance", r"finance|financ|accountant|accounting|財務|會計|tax|treasury|fp&a|controller|payroll|audit"),
        ("hr", r"recruit|talent|people|hr\b|human resources|人資|招募"),
        ("design", r"design|ux|ui\b|設計|research"),
        ("product", r"product manager|product lead|pm\b|產品|program manager|project manager"),
        ("data", r"analyst|analytics|data|分析"),
        ("ops", r"operations|ops\b|supply|logistics|營運|行政|採購|driver|fleet|support|customer service|客服"),
        ("legal", r"legal|counsel|compliance|法務|policy|risk"),
    ]
    for name, pat in table:
        if re.search(pat, t):
            return name
    return "other"


def lang(r):
    return "zh" if r["zh"] >= 0.2 else "en"


def summarize(rs, label):
    n = len(rs)
    if not n:
        return
    zero = sum(1 for r in rs if not r["modules"])
    noresp = sum(1 for r in rs if r["nResp"] == 0)
    tot_resp = sum(len(r["human"]) + sum(len(m["bullets"]) for m in r["modules"]) for r in rs)
    covered = sum(sum(len(m["bullets"]) for m in r["modules"]) for r in rs)
    soft = sum(sum(1 for h in r["human"] if h["reason"] == "soft") for r in rs)
    print("%-22s n=%4d  沒收成任何模組=%4d (%3.0f%%)  平均模組數=%.1f  職責被收進模組=%3.0f%%  soft=%3.0f%%  平均解析出職責條數=%.1f  解析0條=%d"
          % (label, n, zero, 100.0 * zero / n, sum(len(r["modules"]) for r in rs) / n,
             100.0 * covered / max(1, tot_resp), 100.0 * soft / max(1, tot_resp),
             sum(r["nResp"] for r in rs) / n, noresp))


for r in rows:
    r["role"] = role(r["title"])
    r["lang"] = lang(r)

print("errors:", sum(1 for r in rows if r["err"]), " truncated:", sum(1 for r in rows if r["truncated"]))
summarize(rows, "全部")
for lg in ("en", "zh"):
    summarize([r for r in rows if r["lang"] == lg], "語言 " + lg)
for ro in sorted(set(r["role"] for r in rows)):
    summarize([r for r in rows if r["role"] == ro], "職類 " + ro)

print("\n== 職類 × 被判定的 family（前幾名）")
for ro in sorted(set(r["role"] for r in rows)):
    c = collections.Counter(",".join(r["families"]) or "(無)" for r in rows if r["role"] == ro)
    print("  %-12s %s" % (ro, c.most_common(5)))

print("\n== 職類 × 收成的模組（前幾名）")
for ro in sorted(set(r["role"] for r in rows)):
    c = collections.Counter(m["name"] for r in rows if r["role"] == ro for m in r["modules"])
    print("  %-12s %s" % (ro, c.most_common(6)))

print("\n== error 訊息")
print(collections.Counter((r["error"] or "")[:40] for r in rows if r["error"]).most_common(5))
