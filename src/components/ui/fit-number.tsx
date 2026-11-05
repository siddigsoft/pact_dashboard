import { useLayoutEffect, useRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type FitNumberProps = HTMLAttributes<HTMLSpanElement> & {
  value: string | number;
};

/** Keeps a financial or count value on one line within its available width. */
export function FitNumber({ value, className, style, ...props }: FitNumberProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const text = valueRef.current;
    if (!container || !text) return;

    const fit = () => {
      text.style.fontSize = '1em';
      const available = container.clientWidth;
      const required = text.getBoundingClientRect().width;
      if (available > 0 && required > available) {
        text.style.fontSize = `${Math.max(0.01, available / required) * 0.98}em`;
      }
    };

    const observer = new ResizeObserver(fit);
    observer.observe(container);
    fit();
    return () => observer.disconnect();
  }, [value]);

  return (
    <span ref={containerRef} className={cn('block min-w-0 max-w-full whitespace-nowrap tabular-nums', className)} style={style} {...props}>
      <span ref={valueRef} className="inline-block origin-left align-baseline">{value}</span>
    </span>
  );
}
