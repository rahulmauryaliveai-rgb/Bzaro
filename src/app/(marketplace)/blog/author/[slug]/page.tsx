import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAuthorWithPosts } from "@/server/services/blog.service";
import { BlogCard } from "@/components/blog/BlogCards";
import { MarketplaceBreadcrumbs } from "@/components/marketplace/ResultsPagination";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { clip } from "@/lib/seo/templates";
import { marketplaceUrl } from "@/lib/utils/url";

/** An author's page (D45): who they are and everything they have written. */

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const author = await getAuthorWithPosts(slug);
  if (!author) return { title: "Author not found", robots: { index: false, follow: false } };
  const url = marketplaceUrl(`/blog/author/${author.slug}`);
  return {
    title: `${author.name}${author.role ? `, ${author.role}` : ""}`,
    description: author.bio ? clip(author.bio) : `Buying guides by ${author.name} on Bzaro.`,
    alternates: { canonical: url },
    // An author with no live articles is an empty page.
    robots:
      author.posts.length > 0 ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { type: "profile", title: author.name, url },
  };
}

export default async function BlogAuthorPage({ params }: Props) {
  const { slug } = await params;
  const author = await getAuthorWithPosts(slug);
  if (!author) notFound();

  const url = marketplaceUrl(`/blog/author/${author.slug}`);
  const trail = [
    { href: "/", label: "Home" },
    { href: "/blog", label: "Guides" },
    { href: `/blog/author/${author.slug}`, label: author.name },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "ProfilePage",
            url,
            mainEntity: {
              "@type": "Person",
              name: author.name,
              ...(author.role ? { jobTitle: author.role } : {}),
              ...(author.bio ? { description: author.bio } : {}),
              ...(author.avatarUrl ? { image: author.avatarUrl } : {}),
              ...(author.linkedinUrl ? { sameAs: [author.linkedinUrl] } : {}),
            },
          },
          breadcrumbJsonLd(trail, marketplaceUrl()),
        ]}
      />
      <MarketplaceBreadcrumbs trail={trail} />

      <header className="flex max-w-3xl gap-5">
        {author.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={author.avatarUrl}
            alt=""
            className="h-20 w-20 shrink-0 rounded-full object-cover"
          />
        ) : null}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{author.name}</h1>
          {author.role ? <p className="mt-1 text-neutral-600">{author.role}</p> : null}
          {author.bio ? (
            <p className="mt-3 leading-relaxed text-neutral-700">{author.bio}</p>
          ) : null}
          {author.linkedinUrl ? (
            <a
              href={author.linkedinUrl}
              rel="noopener noreferrer me"
              className="mt-3 inline-block text-sm underline underline-offset-2"
            >
              LinkedIn
            </a>
          ) : null}
        </div>
      </header>

      <h2 className="mt-12 mb-5 text-lg font-semibold">Guides by {author.name}</h2>
      {author.posts.length === 0 ? (
        <p className="text-neutral-600">No published guides yet.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {author.posts.map((post) => (
            <BlogCard key={post.id} post={post} headingLevel={3} />
          ))}
        </div>
      )}
    </div>
  );
}
