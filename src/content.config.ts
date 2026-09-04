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
    /**
     * Reachable at its URL, but never listed and never recommended.
     *
     * The weaker sibling of `draft`, and spelled the same way round on
     * purpose: both default to false, so an absent field means "an ordinary
     * post" for both, and `unlisted: true` sits next to `draft: true` reading
     * as the milder of the two. `listed: false` would have to default to true,
     * and a CMS checkbox you must *un*tick to hide something is a double
     * negative every editor gets wrong once.
     *
     * Deliberately asymmetric, and this is the whole point of the field: it
     * describes what *other* pages may do with this post, not what the post
     * is. So it removes the post from the index and from everyone's
     * recommendations (see src/data/related.ts), and it changes nothing about
     * how the post itself builds, renders, or recommends — an unlisted post
     * still gets its own "Keep reading" block and bar, which for a corrected
     * post is the job it has left.
     *
     * It is not a robots directive either: the page stays in the sitemap. It
     * is live and getting search traffic, and the correction at the top is
     * what those readers need. Hiding it from search would strand exactly the
     * people it exists to redirect. Use `draft` to take a post off the site.
     */
    unlisted: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
