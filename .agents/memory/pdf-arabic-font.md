---
name: PDF Arabic font fix
description: How to correctly render Arabic text in jsPDF.
---

## Rule
Two separate issues in jsPDF with Arabic text:

1. **Font encoding (garbage characters):** Loading a font with `addFileToVFS` + `addFont` is not enough. You MUST call `doc.setFont("Amiri", "normal")` before rendering Arabic text — otherwise jsPDF uses helvetica which shows bytes as Latin-1 garbage (þžþô...).

2. **Font loading performance:** Use `Array.from(new Uint8Array(buf), b => String.fromCharCode(b)).join("")` for the btoa conversion, NOT a string-concat loop (`binary += ...`). The loop is O(n²) due to string immutability in JS.

3. **Arabic detection helper:**
```ts
const hasArabic = (text: string) =>
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
```

4. **Font switching pattern in Reports.tsx:**
```ts
if (hasArabic(text)) { setArabicFont(); } else { setLatinFont(true); }
doc.text(text, x, y, opts);
setLatinFont(false); // always reset after
```

**Limitation:** jsPDF doesn't do RTL text shaping natively. For fully correct Arabic (letter joining + RTL order), a canvas-based approach is needed. Current fix eliminates garbage characters but letter shaping is imperfect.
