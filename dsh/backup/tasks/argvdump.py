import sys, json, os
tag = sys.argv[1]
p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "argv-%s.json" % tag)
with open(p, "w", encoding="utf-8") as f:
    json.dump(sys.argv[1:], f, ensure_ascii=False, indent=1)
