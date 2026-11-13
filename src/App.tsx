import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ExternalLink,
  Instagram,
  PawPrint,
  Ruler,
  Search,
  X,
  Youtube,
} from "lucide-react";

/*
 * ============================================================================
 * CONFIGURATION — Edit these constants to connect your Google Sheet & socials
 * ============================================================================
 * 1. Publish your Google Sheet to the web as CSV:
 *    File -> Share -> Publish to web -> Choose sheet -> "Comma-separated values (.csv)"
 * 2. Paste the published CSV URL into SHEET_CSV_URL below.
 * 3. Sheet columns expected:
 *    active, featured, title, category, description, size_tip, image_url, amazon_link
 * 4. Leave INSTAGRAM_URL or YOUTUBE_URL empty ("") to hide their Follow buttons.
 */
const SITE_NAME = "Pet Fashion World";
const SHEET_CSV_URL = "";
const INSTAGRAM_URL = "";
const YOUTUBE_URL = "";

interface Product {
  id: string;
  active: boolean;
  featured: boolean;
  title: string;
  category: string;
  description: string;
  sizeTip: string;
  imageUrl: string;
  amazonLink: string;
}

type LoadStatus = "loading" | "ready" | "sample" | "error";

const SAMPLE_PRODUCTS: Product[] = [
  {
    id: "sample-1",
    active: true,
    featured: true,
    title: "Lightweight Ripstop Pet Raincoat",
    category: "Raincoats",
    description:
      "Water-resistant shell with an adjustable belly strap, breathable mesh lining, and leash-hole flap for rainy neighborhood walks.",
    sizeTip: "Between sizes? Order one size up.",
    imageUrl: "",
    amazonLink: "#",
  },
  {
    id: "sample-2",
    active: true,
    featured: false,
    title: "Breathable Mesh Summer Tee",
    category: "Summer Wear",
    description:
      "Airy stretch jersey shirt that keeps short-haired dogs and cats comfortable in warm weather and sunny afternoon outings.",
    sizeTip: "Measure chest girth with two fingers of breathing room.",
    imageUrl: "",
    amazonLink: "#",
  },
  {
    id: "sample-3",
    active: true,
    featured: false,
    title: "Everyday French Terry Hoodie",
    category: "Hoodies",
    description:
      "Soft cotton-blend pullover with ribbed cuffs and a relaxed hood made for breezy mornings, park strolls, and couch naps.",
    sizeTip: "Prioritize chest width over back length for deeper chests.",
    imageUrl: "",
    amazonLink: "#",
  },
];

const FAQ_ITEMS = [
  {
    id: "faq-size",
    question: "How do I pick the right size?",
    answer:
      "Grab a soft measuring tape and measure your pet's chest at the widest point right behind their front legs, then check neck and back length against our 3-step chart above. Between sizes? Order one size up.",
  },
  {
    id: "faq-buy",
    question: "Where do I buy?",
    answer:
      'Every "Check on Amazon" button links directly to the item listing on Amazon. You review seller details, pick your size, and complete your order through your Amazon account.',
  },
  {
    id: "faq-videos",
    question: "Are the videos real?",
    answer:
      "Videos and images on this site may be AI-generated to help illustrate outfit styles and silhouettes. Always check real customer photos and product details on Amazon before ordering.",
  },
  {
    id: "faq-returns",
    question: "How do returns work?",
    answer:
      "Handled by Amazon. All orders, exchanges, and size returns follow Amazon's standard return policy directly inside your Amazon orders page.",
  },
];

const SIZE_ROWS = [
  { size: "XS", chest: "11–13 in", neck: "7–9 in", back: "7–9 in", pets: "Toy breeds, kittens" },
  { size: "S", chest: "13–16 in", neck: "9–11 in", back: "9–11 in", pets: "Chihuahua, Yorkie, small cats" },
  { size: "M", chest: "16–20 in", neck: "11–13 in", back: "11–14 in", pets: "Pug, Maltese, adult cats" },
  { size: "L", chest: "20–24 in", neck: "13–16 in", back: "14–17 in", pets: "French Bulldog, Corgi, Beagle" },
  { size: "XL", chest: "24–29 in", neck: "16–19 in", back: "17–21 in", pets: "Spaniel, Shiba, medium dogs" },
];

/**
 * RFC-4180 compatible CSV parser supporting quoted fields, escaped quotes (""),
 * embedded commas, and embedded newlines.
 */
function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && next === "\n") {
        i += 1;
      }
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

/**
 * Converts Google Drive share URLs into direct high-resolution thumbnail URLs.
 */
function normalizeImageUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  if (trimmed.includes("drive.google.com")) {
    const pathMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (pathMatch?.[1]) {
      return `https://drive.google.com/thumbnail?id=${pathMatch[1]}&sz=w1000`;
    }
    const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (queryMatch?.[1]) {
      return `https://drive.google.com/thumbnail?id=${queryMatch[1]}&sz=w1000`;
    }
  }

  return trimmed;
}

function mapCsvToProducts(rows: string[][]): Product[] {
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) =>
    header.trim().toLowerCase().replace(/[\s-]+/g, "_")
  );

  const indexOf = (name: string) => headers.indexOf(name);
  const idxActive = indexOf("active");
  const idxFeatured = indexOf("featured");
  const idxTitle = indexOf("title");
  const idxCategory = indexOf("category");
  const idxDescription = indexOf("description");
  const idxSizeTip = indexOf("size_tip");
  const idxImageUrl = indexOf("image_url");
  const idxAmazonLink = indexOf("amazon_link");

  const parsed: Product[] = [];

  for (let i = 1; i < rows.length; i += 1) {
    const cols = rows[i];
    const read = (idx: number) => (idx >= 0 && idx < cols.length ? cols[idx].trim() : "");

    const active = read(idxActive).toLowerCase() === "yes";
    const title = read(idxTitle);
    if (!active || !title) continue;

    parsed.push({
      id: `sheet-row-${i}`,
      active,
      featured: read(idxFeatured).toLowerCase() === "yes",
      title,
      category: read(idxCategory) || "Apparel",
      description: read(idxDescription),
      sizeTip: read(idxSizeTip) || "Between sizes? Order one size up.",
      imageUrl: normalizeImageUrl(read(idxImageUrl)),
      amazonLink: read(idxAmazonLink) || "#",
    });
  }

  // Show newest (last) rows first
  return parsed.reverse();
}

function ProductImage({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string>("");
  const showPlaceholder = !src || failedSrc === src;

  if (showPlaceholder) {
    return (
      <div
        className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-[#F6EDE2] p-6 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/80 text-[#2F5D50]/55 shadow-sm">
          <PawPrint className="h-8 w-8" strokeWidth={1.8} aria-hidden="true" />
        </div>
        <span className="text-xs font-medium text-[#5C544E]">Outfit preview</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
      className={`h-full w-full object-cover ${className}`}
    />
  );
}

function ProductSkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="overflow-hidden rounded-2xl bg-white shadow-[0_6px_24px_rgba(43,43,43,0.06)]"
        >
          <div className="aspect-[4/3] animate-pulse bg-[#F2E7D9]" />
          <div className="space-y-3 p-5">
            <div className="h-3 w-20 animate-pulse rounded bg-[#F2E7D9]" />
            <div className="h-5 w-3/4 animate-pulse rounded bg-[#F2E7D9]" />
            <div className="space-y-2">
              <div className="h-3.5 w-full animate-pulse rounded bg-[#F2E7D9]" />
              <div className="h-3.5 w-5/6 animate-pulse rounded bg-[#F2E7D9]" />
            </div>
            <div className="h-12 w-full animate-pulse rounded-xl bg-[#F2E7D9]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [products, setProducts] = useState<Product[]>(SAMPLE_PRODUCTS);
  const [status, setStatus] = useState<LoadStatus>(
    SHEET_CSV_URL.trim() ? "loading" : "sample"
  );
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [openFaqId, setOpenFaqId] = useState<string | null>(FAQ_ITEMS[0].id);

  useEffect(() => {
    const csvUrl = SHEET_CSV_URL.trim();
    if (!csvUrl) {
      setProducts(SAMPLE_PRODUCTS);
      setStatus("sample");
      return;
    }

    const controller = new AbortController();
    setStatus("loading");

    fetch(csvUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Sheet request failed with status ${response.status}`);
        }
        return response.text();
      })
      .then((csvText) => {
        const parsed = mapCsvToProducts(parseCsv(csvText));
        if (parsed.length === 0) {
          setProducts(SAMPLE_PRODUCTS);
          setStatus("error");
          return;
        }
        setProducts(parsed);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setProducts(SAMPLE_PRODUCTS);
        setStatus("error");
      });

    return () => controller.abort();
  }, []);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = ["All"];
    for (const product of products) {
      const cat = product.category.trim();
      if (cat && !seen.has(cat)) {
        seen.add(cat);
        list.push(cat);
      }
    }
    return list;
  }, [products]);

  const activeCategory = categories.includes(selectedCategory) ? selectedCategory : "All";

  const featuredProduct = useMemo(() => {
    return products.find((item) => item.featured) || products[0] || SAMPLE_PRODUCTS[0];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return products.filter((item) => {
      const matchesCategory = activeCategory === "All" || item.category === activeCategory;
      if (!matchesCategory) return false;
      if (!query) return true;
      return (
        item.title.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query)
      );
    });
  }, [products, activeCategory, searchQuery]);

  const hasInstagram = INSTAGRAM_URL.trim().length > 0;
  const hasYoutube = YOUTUBE_URL.trim().length > 0;
  const showFollowSection = hasInstagram || hasYoutube;

  const scrollToPicks = () => {
    const target = document.getElementById("picks");
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF8F0] text-[#2B2B2B]">
      {/* 1. Sticky Header */}
      <header className="sticky top-0 z-40 border-b border-[#2B2B2B]/10 bg-[#FFF8F0]/95 backdrop-blur-md">
        <div className="mx-auto flex h-[60px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a
            href="#top"
            className="font-heading shrink-0 whitespace-nowrap text-xl font-bold tracking-tight text-[#2B2B2B] focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F5D50]"
          >
            {SITE_NAME} 🐾
          </a>

          <a
            href={hasInstagram ? INSTAGRAM_URL : "#picks"}
            target={hasInstagram ? "_blank" : undefined}
            rel={hasInstagram ? "noopener noreferrer" : undefined}
            aria-label={hasInstagram ? `${SITE_NAME} on Instagram` : "Jump to outfit picks"}
            className="inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl text-[#2B2B2B] transition-colors duration-150 hover:bg-[#F6EDE2] hover:text-[#C8372D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F5D50]"
          >
            <Instagram className="h-5 w-5" aria-hidden="true" />
          </a>
        </div>
      </header>

      <main id="top">
        {/* 2. Hero + Featured Product Card */}
        <section className="py-8 sm:py-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold tracking-wide text-[#2F5D50]">
                Hand-picked outfits for dogs &amp; cats
              </p>
              <h1 className="mt-2 text-4xl font-bold leading-[1.12] text-[#2B2B2B] sm:text-5xl">
                Dress your best friend in something adorable
              </h1>
              <p className="mt-3 text-base text-[#5C544E] sm:text-lg">
                Cozy, cute and fun picks for every season and every mood.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={scrollToPicks}
                  className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[#C8372D] px-6 py-3 text-base font-semibold whitespace-nowrap text-white shadow-[0_4px_14px_rgba(200,55,45,0.25)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-[#B02E25] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F5D50] sm:w-auto"
                >
                  See all picks
                </button>
              </div>
            </div>

            {/* Featured Pick Card */}
            <div className="mt-8 sm:mt-10">
              {status === "loading" ? (
                <div
                  className="overflow-hidden rounded-2xl bg-white shadow-[0_6px_24px_rgba(43,43,43,0.06)] md:grid md:grid-cols-2"
                  aria-busy="true"
                >
                  <div className="aspect-[4/3] animate-pulse bg-[#F2E7D9] md:aspect-auto md:min-h-[320px]" />
                  <div className="space-y-4 p-6 sm:p-8">
                    <div className="h-3.5 w-28 animate-pulse rounded bg-[#F2E7D9]" />
                    <div className="h-7 w-3/4 animate-pulse rounded bg-[#F2E7D9]" />
                    <div className="h-4 w-full animate-pulse rounded bg-[#F2E7D9]" />
                    <div className="h-4 w-4/5 animate-pulse rounded bg-[#F2E7D9]" />
                    <div className="h-12 w-full animate-pulse rounded-xl bg-[#F2E7D9]" />
                  </div>
                </div>
              ) : (
                <article className="overflow-hidden rounded-2xl bg-white shadow-[0_6px_24px_rgba(43,43,43,0.06)] md:grid md:grid-cols-2 md:items-stretch">
                  <div className="aspect-[4/3] w-full overflow-hidden md:aspect-auto md:min-h-[340px]">
                    <ProductImage
                      src={featuredProduct.imageUrl}
                      alt={`${featuredProduct.title} pet outfit`}
                    />
                  </div>

                  <div className="flex flex-col justify-center gap-4 p-6 sm:p-8">
                    <div>
                      <span className="text-xs font-semibold tracking-wide text-[#C8372D]">
                        Featured pick · {featuredProduct.category}
                      </span>
                      <h2 className="mt-1 text-2xl font-bold text-[#2B2B2B] sm:text-3xl">
                        {featuredProduct.title}
                      </h2>
                    </div>

                    <p className="text-sm leading-relaxed text-[#5C544E] sm:text-base">
                      {featuredProduct.description}
                    </p>

                    <p className="rounded-xl bg-[#F6EDE2] px-4 py-3 text-sm text-[#2B2B2B]">
                      <strong className="font-semibold text-[#2F5D50]">Size tip:</strong>{" "}
                      {featuredProduct.sizeTip}
                    </p>

                    <div className="pt-1">
                      <a
                        href={featuredProduct.amazonLink}
                        target="_blank"
                        rel="sponsored nofollow noopener"
                        className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#C8372D] px-6 py-3 text-base font-semibold whitespace-nowrap text-white shadow-[0_4px_14px_rgba(200,55,45,0.22)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-[#B02E25] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F5D50]"
                      >
                        <span>Check on Amazon</span>
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                </article>
              )}
            </div>
          </div>
        </section>

        {/* 3. Picks Grid */}
        <section id="picks" className="py-10 sm:py-14" aria-labelledby="picks-heading">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-6">
              <p className="text-sm font-semibold text-[#2F5D50]">All-season wardrobe</p>
              <h2 id="picks-heading" className="mt-1 text-2xl font-bold text-[#2B2B2B] sm:text-3xl">
                Outfit picks by style
              </h2>
            </div>

            {(status === "sample" || status === "error") && (
              <div
                role="status"
                className="mb-6 rounded-2xl border border-[#2B2B2B]/10 bg-[#F6EDE2] px-4 py-3.5 text-sm text-[#2B2B2B]"
              >
                {status === "error"
                  ? "We could not load your Google Sheet right now, so sample outfits are shown below. Check that the sheet is published as CSV."
                  : "Showing 3 sample all-season outfits. Paste your published Google Sheet CSV link into SHEET_CSV_URL at the top of the code to display your live catalog."}
              </div>
            )}

            {/* Search & Category Controls */}
            <div className="mb-7 space-y-4">
              <div className="relative max-w-md">
                <label htmlFor="product-search" className="sr-only">
                  Search outfits by title or description
                </label>
                <Search
                  className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-[#5C544E]"
                  aria-hidden="true"
                />
                <input
                  id="product-search"
                  type="text"
                  inputMode="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search outfits by title or description..."
                  className="min-h-[48px] w-full rounded-xl border border-[#2B2B2B]/12 bg-white py-3 pr-12 pl-11 text-sm text-[#2B2B2B] shadow-[0_2px_10px_rgba(43,43,43,0.04)] placeholder:text-[#5C544E]/75 focus:border-[#2F5D50] focus:outline-2 focus:outline-offset-0 focus:outline-[#2F5D50]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                    className="absolute top-1/2 right-1 inline-flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-lg text-[#5C544E] transition-colors hover:bg-[#F6EDE2] hover:text-[#2B2B2B] focus-visible:outline-2 focus-visible:outline-[#2F5D50]"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>

              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Filter outfits by category"
              >
                {categories.map((category) => {
                  const isSelected = activeCategory === category;
                  return (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedCategory(category)}
                      className={`min-h-[48px] shrink-0 rounded-xl px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F5D50] ${
                        isSelected
                          ? "bg-[#2F5D50] text-white shadow-sm"
                          : "border border-[#2B2B2B]/10 bg-white text-[#2B2B2B] hover:bg-[#F6EDE2]"
                      }`}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
            </div>

            {status === "loading" ? (
              <ProductSkeletonGrid />
            ) : filteredProducts.length === 0 ? (
              <div
                className="rounded-2xl bg-white px-6 py-10 text-center shadow-[0_6px_24px_rgba(43,43,43,0.06)]"
                aria-live="polite"
              >
                <p className="font-heading text-xl font-semibold text-[#2B2B2B]">
                  No outfits match "{searchQuery.trim()}"
                </p>
                <p className="mt-1.5 text-sm text-[#5C544E]">
                  Try another keyword or reset your filters to view all picks.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory("All");
                  }}
                  className="mt-4 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-[#2F5D50] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#24493E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C8372D]"
                >
                  Reset filters
                </button>
              </div>
            ) : (
              <div
                className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
                aria-live="polite"
              >
                {filteredProducts.map((product) => (
                  <article
                    key={product.id}
                    className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_6px_24px_rgba(43,43,43,0.06)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(43,43,43,0.1)]"
                  >
                    <div className="aspect-[4/3] w-full overflow-hidden">
                      <ProductImage
                        src={product.imageUrl}
                        alt={`${product.title} — ${product.category}`}
                      />
                    </div>

                    <div className="flex flex-1 flex-col gap-2.5 p-5">
                      <span className="text-xs font-semibold tracking-wide text-[#2F5D50]">
                        {product.category}
                      </span>

                      <h3 className="text-xl font-semibold text-[#2B2B2B]">{product.title}</h3>

                      <p className="line-clamp-3 text-sm leading-relaxed text-[#5C544E]">
                        {product.description}
                      </p>

                      <p className="pt-1 text-sm text-[#2B2B2B]">
                        <strong className="font-semibold text-[#2F5D50]">Size tip:</strong>{" "}
                        {product.sizeTip}
                      </p>

                      <div className="mt-auto pt-3">
                        <a
                          href={product.amazonLink}
                          target="_blank"
                          rel="sponsored nofollow noopener"
                          aria-label={`Check ${product.title} on Amazon`}
                          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#2F5D50] px-5 py-3 text-sm font-semibold whitespace-nowrap text-white transition-colors duration-150 hover:bg-[#24493E] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C8372D]"
                        >
                          <span>Check on Amazon</span>
                          <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        </a>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 4. Size Guide */}
        <section id="size-guide" className="py-10 sm:py-14" aria-labelledby="size-heading">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-6">
              <p className="text-sm font-semibold text-[#2F5D50]">Easy fit check</p>
              <h2 id="size-heading" className="mt-1 text-2xl font-bold text-[#2B2B2B] sm:text-3xl">
                Measure your pet in 3 steps
              </h2>
              <p className="mt-2 max-w-xl text-sm text-[#5C544E] sm:text-base">
                Use a soft tape measure while your dog or cat is standing comfortably.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
              <div className="space-y-3.5 lg:col-span-5">
                <div className="flex items-start gap-3.5 rounded-2xl bg-white p-4 shadow-[0_6px_24px_rgba(43,43,43,0.06)]">
                  <span className="font-heading flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#2F5D50] text-base font-semibold text-white">
                    1
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-[#2B2B2B]">Chest</h3>
                    <p className="mt-0.5 text-sm text-[#5C544E]">
                      Wrap around the widest part of the ribcage just behind the front legs, leaving
                      room for two fingers.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 rounded-2xl bg-white p-4 shadow-[0_6px_24px_rgba(43,43,43,0.06)]">
                  <span className="font-heading flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#2F5D50] text-base font-semibold text-white">
                    2
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-[#2B2B2B]">Neck</h3>
                    <p className="mt-0.5 text-sm text-[#5C544E]">
                      Measure around the base of the neck where a regular collar naturally rests.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 rounded-2xl bg-white p-4 shadow-[0_6px_24px_rgba(43,43,43,0.06)]">
                  <span className="font-heading flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#2F5D50] text-base font-semibold text-white">
                    3
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-[#2B2B2B]">Back length</h3>
                    <p className="mt-0.5 text-sm text-[#5C544E]">
                      Measure straight along the spine from the base of the neck to the base of the
                      tail.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-2xl bg-[#F6EDE2] px-4 py-3.5 text-sm font-medium text-[#2B2B2B]">
                  <Ruler className="h-5 w-5 shrink-0 text-[#C8372D]" aria-hidden="true" />
                  <span>Between sizes? Order one size up.</span>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl bg-white shadow-[0_6px_24px_rgba(43,43,43,0.06)] lg:col-span-7">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm tabular-nums">
                    <thead>
                      <tr className="bg-[#F6EDE2] text-[#2B2B2B]">
                        <th scope="col" className="px-4 py-3.5 font-semibold whitespace-nowrap">
                          Size
                        </th>
                        <th scope="col" className="px-4 py-3.5 font-semibold whitespace-nowrap">
                          Chest
                        </th>
                        <th scope="col" className="px-4 py-3.5 font-semibold whitespace-nowrap">
                          Neck
                        </th>
                        <th scope="col" className="px-4 py-3.5 font-semibold whitespace-nowrap">
                          Back length
                        </th>
                        <th scope="col" className="px-4 py-3.5 font-semibold whitespace-nowrap">
                          Common fit
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {SIZE_ROWS.map((row) => (
                        <tr key={row.size} className="border-t border-[#2B2B2B]/10">
                          <td className="font-heading px-4 py-3 font-semibold whitespace-nowrap text-[#2F5D50]">
                            {row.size}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-[#2B2B2B]">{row.chest}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-[#2B2B2B]">{row.neck}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-[#2B2B2B]">{row.back}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-[#5C544E]">{row.pets}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Follow Section (hidden when both URLs are empty; individual buttons hidden if empty) */}
        {showFollowSection && (
          <section id="follow" className="py-10 sm:py-14" aria-labelledby="follow-heading">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <div className="flex flex-col justify-between gap-6 rounded-2xl bg-white p-6 shadow-[0_6px_24px_rgba(43,43,43,0.06)] sm:flex-row sm:items-center sm:p-8">
                <div>
                  <p className="text-sm font-semibold text-[#2F5D50]">Follow along</p>
                  <h2
                    id="follow-heading"
                    className="mt-1 text-2xl font-bold text-[#2B2B2B] sm:text-3xl"
                  >
                    See more outfit clips
                  </h2>
                  <p className="mt-1.5 text-sm text-[#5C544E]">
                    Watch short try-ons and daily pet style inspiration on our social channels.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  {hasInstagram && (
                    <a
                      href={INSTAGRAM_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#C8372D] px-5 py-3 text-sm font-semibold whitespace-nowrap text-white transition-colors duration-150 hover:bg-[#B02E25] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F5D50]"
                    >
                      <Instagram className="h-4 w-4" aria-hidden="true" />
                      <span>Instagram</span>
                    </a>
                  )}
                  {hasYoutube && (
                    <a
                      href={YOUTUBE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#2F5D50] px-5 py-3 text-sm font-semibold whitespace-nowrap text-white transition-colors duration-150 hover:bg-[#24493E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C8372D]"
                    >
                      <Youtube className="h-4 w-4" aria-hidden="true" />
                      <span>YouTube</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 6. FAQ (Collapsible) */}
        <section id="faq" className="py-10 sm:py-14" aria-labelledby="faq-heading">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-6">
              <p className="text-sm font-semibold text-[#2F5D50]">Quick answers</p>
              <h2 id="faq-heading" className="mt-1 text-2xl font-bold text-[#2B2B2B] sm:text-3xl">
                Frequently asked questions
              </h2>
            </div>

            <div className="max-w-3xl space-y-3">
              {FAQ_ITEMS.map((item) => {
                const isOpen = openFaqId === item.id;
                return (
                  <div
                    key={item.id}
                    className="overflow-hidden rounded-2xl bg-white shadow-[0_6px_24px_rgba(43,43,43,0.06)]"
                  >
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`${item.id}-panel`}
                      onClick={() => setOpenFaqId(isOpen ? null : item.id)}
                      className="font-heading flex min-h-[56px] w-full items-center justify-between gap-4 px-5 py-4 text-left text-lg font-semibold text-[#2B2B2B] transition-colors duration-150 hover:bg-[#FFF8F0]/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#2F5D50]"
                    >
                      <span>{item.question}</span>
                      <ChevronDown
                        className={`h-5 w-5 shrink-0 text-[#2F5D50] transition-transform duration-150 ${
                          isOpen ? "rotate-180" : ""
                        }`}
                        aria-hidden="true"
                      />
                    </button>

                    {isOpen && (
                      <div
                        id={`${item.id}-panel`}
                        className="px-5 pb-5 text-sm leading-relaxed text-[#5C544E] sm:text-base"
                      >
                        {item.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      {/* 7. Footer */}
      <footer className="mt-8 border-t border-[#2B2B2B]/10 bg-[#F6EDE2] py-10">
        <div className="mx-auto max-w-6xl space-y-2.5 px-4 text-sm text-[#5C544E] sm:px-6">
          <p className="font-heading text-lg font-bold text-[#2B2B2B]">{SITE_NAME} 🐾</p>
          <p className="font-medium text-[#2B2B2B]">
            As an Amazon Associate I earn from qualifying purchases.
          </p>
          <p className="font-medium text-[#2B2B2B]">
            Videos and images on this site may be AI-generated.
          </p>
        </div>
      </footer>
    </div>
  );
}
