import { describe, expect, it } from "vitest";
import { dataLanguage, highlightData, highlightFile, type Span } from "../src/view/highlight";

const show = (rows: Span[][]) =>
  rows.map((r) => r.map((s) => (s.kind === "plain" ? s.text : `[${s.kind}:${s.text}]`)).join("")).join("\n");

describe("highlighting", () => {
  it("tells JSON from YAML", () => {
    expect(dataLanguage('  {"a": 1}')).toBe("json");
    expect(dataLanguage("[1, 2]")).toBe("json");
    expect(dataLanguage("name: x\nlist:\n  - a")).toBe("yaml");
    expect(dataLanguage("- a\n- b")).toBe("yaml");
    expect(dataLanguage("Read the notes, then write a summary.")).toBeNull();
  });

  it("splits JSON into keys, strings, numbers, literals and punctuation", () => {
    expect(show(highlightData(['{"a": 1.5, "b": "x:y", "c": [true, null, -2e3]}', '"open'], "json"))).toBe(
      '[punctuation:{][key:"a"][punctuation::] [number:1.5][punctuation:,] [key:"b"][punctuation::] [string:"x:y"]' +
        "[punctuation:,] " +
        '[key:"c"][punctuation::] [punctuation:[][keyword:true][punctuation:,] [keyword:null][punctuation:,] ' +
        '[number:-2e3][punctuation:]][punctuation:}]\n[string:"open]',
    );
  });

  it("splits YAML into keys, values, list items, comments and block text", () => {
    const yaml = [
      "--- # doc",
      "name: release # c",
      "tools:",
      '  - "quoted: x"',
      "limits: {a: 1}",
      "note: |",
      "  line one: not a key",
      "",
      "  line two",
      "url: http://x.y/z#frag",
      "- key: 3",
      "on: yes",
    ];
    expect(show(highlightData(yaml, "yaml"))).toBe(
      [
        "[punctuation:--- ][comment:# doc]",
        "[key:name][punctuation::] [string:release] [comment:# c]",
        "[key:tools][punctuation::]",
        '  [punctuation:- ][string:"quoted: x"]',
        "[key:limits][punctuation::] [punctuation:{]a[punctuation::] [number:1][punctuation:}]",
        "[key:note][punctuation::] [punctuation:|]",
        "[string:  line one: not a key]",
        "[string:]",
        "[string:  line two]",
        "[key:url][punctuation::] [string:http://x.y/z#frag]",
        "[punctuation:- ][key:key][punctuation::] [number:3]",
        "[key:on][punctuation::] [keyword:yes]",
      ].join("\n"),
    );
  });

  it("highlights files by their kind", () => {
    expect(show(highlightFile("a.ts", ["const x = foo(12) // call"]))).toBe(
      "[keyword:const] x = [function:foo]([number:12]) [comment:// call]",
    );
    expect(show(highlightFile("c.yml", ["a: 1"]))).toBe("[key:a][punctuation::] [number:1]");
    expect(show(highlightFile("d.json", ['{"a": 1}']))).toBe(
      '[punctuation:{][key:"a"][punctuation::] [number:1][punctuation:}]',
    );
    expect(show(highlightFile("r.md", ["# Title", "text"]))).toBe("[heading:# Title]\ntext");
    expect(show(highlightFile("notes.txt", ["if (x) 1"]))).toBe("if (x) 1");
  });

  it("keeps every character, in order", () => {
    const text = '{"a": "\\"q\\"", "b": [1, {"c": null}]}\nkey: value # c\n  - x: "y" # z';
    for (const lang of ["json", "yaml"] as const) {
      const lines = text.split("\n");
      expect(highlightData(lines, lang).map((r) => r.map((s) => s.text).join(""))).toEqual(lines);
    }
  });
});
