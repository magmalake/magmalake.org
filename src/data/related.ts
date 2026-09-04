import type { CollectionEntry } from "astro:content";

type Post = CollectionEntry<"blog">;

/** Most a post offers, in the bar and in the end-of-post block. */
const MAX_RELATED = 2;

/**
 * The posts to offer from inside `post`, most relevant first.
 *
 * Two sources, in order:
 *
 * 1. `related:` in the frontmatter — an explicit, editorial list of slugs.
 *    This is the one that matters: the two multithreading posts are a
 *    sequence, and only a human knows that. An unknown slug throws, so the
 *    build fails rather than the link rotting silently.
 * 2. Nothing set — the posts either side of this one by date, newer first.
 *    Deterministic, needs no upkeep, and gives every post a route out even
 *    before anyone has thought about what it relates to.
 *
 * Deliberately not a scored "similar posts" function. With four posts, a rule
 * you can hold in your head beats one that is right slightly more often.
 */
export function relatedPosts(post: Post, all: Post[]): Post[] {
  const byDate = [...all].sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

  const explicit = post.data.related.map((id) => {
    const found = byDate.find((p) => p.id === id);
    if (!found) {
      throw new Error(
        `${post.id}: related post "${id}" is not a published post. ` +
          `Fix the \`related:\` list in src/content/blog/${post.id}.md.`,
      );
    }
    return found;
  });
  if (explicit.length > 0) return explicit.slice(0, MAX_RELATED);

  const i = byDate.findIndex((p) => p.id === post.id);
  return [byDate[i - 1], byDate[i + 1]].filter((p): p is Post => Boolean(p)).slice(0, MAX_RELATED);
}
