"use client";

// Links and thumbnails for files in SeatMe's private storage buckets
// (floor plans, menus). The buckets aren't public, so each file is shown
// through a short-lived signed URL that only someone with access to the
// event (or location) can create — storage RLS checks that.

import { useEffect, useState, type AnchorHTMLAttributes, type ImgHTMLAttributes, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

type Bucket = "floor-plans" | "menus";

/** Signed links last an hour; they're re-created whenever the page renders the file again. */
const SIGNED_URL_SECONDS = 60 * 60;

export function useSignedUrl(bucket: Bucket, path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!path) {
      setUrl(null);
      return;
    }
    createClient()
      .storage.from(bucket)
      .createSignedUrl(path, SIGNED_URL_SECONDS)
      .then(({ data }) => {
        if (alive) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      alive = false;
    };
  }, [bucket, path]);
  return url;
}

export function SignedLink({
  bucket,
  path,
  children,
  ...rest
}: { bucket: Bucket; path: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const url = useSignedUrl(bucket, path);
  return (
    <a href={url ?? undefined} aria-disabled={!url} {...rest}>
      {children}
    </a>
  );
}

export function SignedImg({
  bucket,
  path,
  alt,
  ...rest
}: { bucket: Bucket; path: string } & Omit<ImgHTMLAttributes<HTMLImageElement>, "src">) {
  const url = useSignedUrl(bucket, path);
  if (!url) return <span className={rest.className} style={rest.style} aria-hidden />;
  return <img src={url} alt={alt ?? ""} {...rest} />;
}
