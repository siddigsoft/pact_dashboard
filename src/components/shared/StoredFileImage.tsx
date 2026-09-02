import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { parseR2Ref, resolveStoredFileUrl } from '@/lib/r2Storage';
import { cn } from '@/lib/utils';

interface StoredFileImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

/** <img> that signs Cloudflare R2 refs (r2:...) and passes through legacy public URLs. */
export function StoredFileImage({ src, className, alt, ...rest }: StoredFileImageProps) {
  const [href, setHref] = useState(() => (parseR2Ref(src) ? '' : src));

  useEffect(() => {
    let cancelled = false;
    if (!parseR2Ref(src)) {
      setHref(src);
      return;
    }
    setHref('');
    resolveStoredFileUrl(src)
      .then((url) => {
        if (!cancelled) setHref(url);
      })
      .catch(() => {
        if (!cancelled) setHref('');
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!href) {
    return <div className={cn('bg-muted animate-pulse', className)} aria-hidden />;
  }

  return <img src={href} alt={alt} className={className} {...rest} />;
}
