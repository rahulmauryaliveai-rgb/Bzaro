import { describe, expect, it } from "vitest";
import { checkGeneratedArticle, sanitiseBody } from "@/lib/blog/autopilot";
import { BLOG_TOPICS } from "@/lib/blog/topics";

/** D47: what the autopilot lets through to the live site. */

const section = (n: number) =>
  `## Question ${n}\n\n${"Check the specification and ask the supplier for a written quote. ".repeat(14)}`;
const goodBody = [1, 2, 3, 4, 5].map(section).join("\n\n");
const header = `---\ntitle: Choosing LED panels for an office\nslug: led-panels-office\nsummary: What to check.\ncategories: electronics\nmeta_description: What to check.\n---\n\n`;

describe("sanitiseBody", () => {
  it("keeps site links, unwraps others, drops reviewer notes", () => {
    expect(
      sanitiseBody(
        "See [lights](/category/electronics), [x](https://evil.example) and [y](/admin). [Rahul: add example] Done.",
      ),
    ).toBe("See [lights](/category/electronics), x and y. Done.");
  });
});

describe("checkGeneratedArticle", () => {
  it("publishes a clean, well-structured article", () => {
    const result = checkGeneratedArticle(header + goodBody);
    expect(result).toMatchObject({ ok: true, publish: true, notes: [] });
  });

  it("strips a code fence around the answer", () => {
    expect(checkGeneratedArticle("```markdown\n" + header + goodBody + "\n```").ok).toBe(true);
  });

  it("holds back red-flag wording as a draft", () => {
    const result = checkGeneratedArticle(header + goodBody + "\n\nWe are the #1 supplier.");
    expect(result).toMatchObject({ ok: true, publish: false });
  });

  it("holds back thin articles and rejects malformed ones", () => {
    expect(checkGeneratedArticle(header + section(1))).toMatchObject({ ok: true, publish: false });
    expect(checkGeneratedArticle("Here is your article: ...").ok).toBe(false);
  });
});

describe("topics", () => {
  it("have unique keys", () => {
    const keys = BLOG_TOPICS.map((topic) => topic.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
