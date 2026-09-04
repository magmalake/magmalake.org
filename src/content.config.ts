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
    /**
     * Slugs of other posts to offer the reader, most relevant first.
     *
     * Explicit slugs rather than a shared tag, deliberately. `eyebrow` already
     * groups by topic, but a topic is not a relation: the two multithreading
     * posts are a *sequence*, and a tag would silently reshuffle what each one
     * points at the moment a fifth "Concurrency" post lands. A list of slugs
     * says the same thing a year from now, and an unknown slug fails the build
     * (see src/data/related.ts) instead of quietly linking nowhere.
     *
     * Posts that set nothing fall back to their neighbours by date.
     */
    related: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
