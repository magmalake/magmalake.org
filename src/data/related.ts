import type { CollectionEntry } from "astro:content";

type Post = CollectionEntry<"blog">;

/** Most a post offers, in the bar and in the end-of-post block. */
const MAX_RELATED = 2;

/**
 * May this post be shown to someone who did not ask for it — on the index, or
 * as a recommendation from another post?
 *
 * The one place `unlisted` is interpreted. Note what it does not touch:
 * whether the post builds, renders, appears in the sitemap, or gets
 * recommendations of its own. Unlisted is a statement about other pages'
 * links, not about the post.
 */
export const listed = (post: Post): boolean => !post.data.unlisted;

/**
 * The posts to offer from inside `post`, most relevant first.
 *
 * Two sources, in order:
 *
 * 1. `related:` in the frontmatter — an explicit, editorial list of slugs.
 *    This is the one that matters: the two multithreading posts are a
 *    sequence, and only a human knows that. An unknown slug throws, so the
 *    build fails rather than the link rotting silently.
 * 2. Nothing set, or nothing left after filtering — the posts either side of
 *    this one by date, newer first. Deterministic, needs no upkeep, and gives
 *    every post a route out even before anyone has thought about what it
 *    relates to.
 *
 * Deliberately not a scored "similar posts" function. With four posts, a rule
 * you can hold in your head beats one that is right slightly more often.
 *
 * Unlisted posts are removed from the candidates once, at the top, so every
 * path below inherits it and the rule stays a single sentence: a post is never
 * recommended, whoever is asking and however they asked. `post` itself may be
 * unlisted — it is excluded from its own candidates but still gets a full set
 * back, which is the asymmetry the field exists for.
 */
export function relatedPosts(post: Post, all: Post[]): Post[] {
  const byDate = [...all].sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
  const pool = byDate.filter((p) => p.id !== post.id && listed(p));
  const inPool = new Set(pool.map((p) => p.id));

  // An unknown slug is a typo and should stop the build; an unlisted one is a
  // decision someone made on purpose, and is dropped quietly. Only the first
  // deserves an exception.
  const explicit = post.data.related
    .map((id) => {
      const found = byDate.find((p) => p.id === id);
      if (!found) {
        throw new Error(
          `${post.id}: related post "${id}" is not a published post. ` +
            `Fix the \`related:\` list in src/content/blog/${post.id}.md.`,
        );
      }
      return found;
    })
    .filter((p) => inPool.has(p.id));

  if (explicit.length > 0) return explicit.slice(0, MAX_RELATED);

  // Neighbours by date, drawn from the pool rather than from every post, so an
  // unlisted neighbour is stepped over rather than leaving a hole. Both lists
  // are nearest-first.
  const newer = pool.filter((p) => p.data.date > post.data.date).reverse();
  const older = pool.filter((p) => p.data.date <= post.data.date);

  // One from each side before a second from either, so this reads as
  // previous/next when both sides exist and simply carries on down the near
  // side when one of them is empty — which is what happens to a post whose
  // only neighbour was the unlisted one.
  const candidates: Post[] = [];
  for (let i = 0; i < Math.max(newer.length, older.length); i++) {
    if (newer[i]) candidates.push(newer[i]);
    if (older[i]) candidates.push(older[i]);
  }
  return candidates.slice(0, MAX_RELATED);
}
