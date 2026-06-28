import os
import re

path = r"D:\Recall\docs\PROMPTS.md"
content = ""
for enc in ['utf-8', 'utf-16', 'latin-1']:
    try:
        with open(path, 'r', encoding=enc) as f:
            content = f.read()
        break
    except Exception:
        continue

matches = re.finditer(r'##? [^\n]*(?:059|060|spaced repetition|quiz)[^\n]*', content, re.IGNORECASE)
with open("search_results.txt", "w", encoding="utf-8") as out:
    for m in matches:
        out.write(f"Match found: {m.group(0)}\n")
        start = max(0, m.start() - 200)
        end = min(len(content), m.end() + 2500)
        out.write("--- CONTEXT ---\n")
        out.write(content[start:end])
        out.write("\n----------------\n\n")
print("Written search results to search_results.txt")
