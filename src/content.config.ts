import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Posts are Markdown so a CMS can edit them. The frontmatter here is also
// what drives the CMS form — keep the two in step, or Sveltia will happily
// write a field the build then rejects.
const blog = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.md" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    eyebrow: z.string().default("Durable execution"),
    date: z.coerce.date(),
    /** Shown under the title; usually the repo the post is about. */
    sourceUrl: z.string().url().optional(),
    sourceLabel: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
