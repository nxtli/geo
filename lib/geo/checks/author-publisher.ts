import type { CheckDefinition } from "./types";
import { notFetched } from "./types";

const PUBLISHER_TYPES = /^(Organization|LocalBusiness|Corporation|Brand|WebSite)$/;
const AUTHOR_TYPES = /^(Person|Article|NewsArticle|BlogPosting)$/;

/**
 * Who stands behind the page: a publisher (JSON-LD organisation name, else
 * og:site_name) and an author (JSON-LD author, else meta name="author").
 * Pass when at least one is named, attention when neither is.
 */
export const authorPublisherCheck: CheckDefinition = {
  id: "author_publisher",
  label: "Author and publisher",
  run({ facts }) {
    if (!facts) return notFetched("author_publisher");
    const publisher = facts.jsonLd.orgName || facts.siteName || null;
    const publisherSource = facts.jsonLd.orgName ? "json_ld" : facts.siteName ? "og:site_name" : null;
    const author = facts.jsonLd.authorName || facts.metaAuthor || null;
    const authorSource = facts.jsonLd.authorName ? "json_ld" : facts.metaAuthor ? "meta_author" : null;
    const types = facts.jsonLd.types;
    const result = {
      publisher,
      publisher_source: publisherSource,
      author,
      author_source: authorSource,
      publisher_types: types.filter((t) => PUBLISHER_TYPES.test(t)),
      author_types: types.filter((t) => AUTHOR_TYPES.test(t)),
    };
    if (publisher && author) {
      return { id: "author_publisher", status: "pass", summary: `Published by ${publisher}; author ${author}.`, facts: result };
    }
    if (publisher || author) {
      const summary = publisher ? `Published by ${publisher}; no author named.` : `Author ${author}; no publisher named.`;
      return { id: "author_publisher", status: "pass", summary, facts: result };
    }
    return {
      id: "author_publisher",
      status: "attention",
      summary: "No publisher or author found in structured data or meta tags.",
      facts: result,
    };
  },
};
