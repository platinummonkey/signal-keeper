import { useState, useCallback } from 'react';

export interface ContentLine {
  text: string;
  bold?: boolean;
  dim?: boolean;
  color?: string;
  indent?: number;
}

export function useScrollableContent(lines: ContentLine[], visibleRows: number) {
  const [scrollTop, setScrollTop] = useState(0);

  const maxScroll = Math.max(0, lines.length - visibleRows);

  const scrollDown = useCallback((by = 1) => {
    setScrollTop((t) => Math.min(t + by, maxScroll));
  }, [maxScroll]);

  const scrollUp = useCallback((by = 1) => {
    setScrollTop((t) => Math.max(t - by, 0));
  }, []);

  const scrollToTop = useCallback(() => setScrollTop(0), []);
  const scrollToBottom = useCallback(() => setScrollTop(maxScroll), [maxScroll]);

  const visibleLines = lines.slice(scrollTop, scrollTop + visibleRows);
  const canScrollUp = scrollTop > 0;
  const canScrollDown = scrollTop < maxScroll;

  return { visibleLines, scrollTop, maxScroll, canScrollUp, canScrollDown, scrollDown, scrollUp, scrollToTop, scrollToBottom };
}

export function buildDetailLines(
  bodyText: string,
  review: { category: string; summary: string; notes: string[]; suggested_changes: Array<{ file: string; description: string; suggestion: string }> } | null,
  terminalWidth: number,
): ContentLine[] {
  const lines: ContentLine[] = [];
  const wrap = (text: string, indent = 0): ContentLine[] => {
    const maxLen = terminalWidth - indent - 3;
    const words = text.split(' ');
    const result: ContentLine[] = [];
    let current = '';
    for (const word of words) {
      if (current.length + word.length + 1 > maxLen && current.length > 0) {
        result.push({ text: current, indent });
        current = word;
      } else {
        current = current.length > 0 ? `${current} ${word}` : word;
      }
    }
    if (current.length > 0) result.push({ text: current, indent });
    return result.length > 0 ? result : [{ text: '', indent }];
  };

  if (bodyText.trim()) {
    lines.push({ text: 'Description', bold: true, dim: true });
    for (const rawLine of bodyText.split('\n')) {
      const trimmed = rawLine.trimEnd();
      if (trimmed.length === 0) {
        lines.push({ text: '' });
      } else {
        lines.push(...wrap(trimmed, 1));
      }
    }
    lines.push({ text: '' });
  }

  if (review) {
    const categoryColors: Record<string, string> = {
      'auto-merge': 'green', 'needs-attention': 'yellow',
      'needs-changes': 'magenta', 'block': 'red',
    };
    lines.push({ text: `[${review.category.toUpperCase()}]`, bold: true, color: categoryColors[review.category] ?? 'white' });
    lines.push(...wrap(review.summary, 1));
    lines.push({ text: '' });

    if (review.notes.length > 0) {
      lines.push({ text: 'Notes', bold: true });
      for (const note of review.notes) {
        lines.push(...wrap(`• ${note}`, 1));
      }
      lines.push({ text: '' });
    }

    if (review.suggested_changes.length > 0) {
      lines.push({ text: 'Suggested Changes', bold: true });
      for (const sc of review.suggested_changes) {
        lines.push({ text: sc.file, bold: true, color: 'cyan', indent: 1 });
        lines.push(...wrap(sc.description, 2));
        if (sc.suggestion) {
          lines.push(...wrap(`→ ${sc.suggestion}`, 3).map((l) => ({ ...l, dim: true })));
        }
        lines.push({ text: '' });
      }
    }
  } else {
    lines.push({ text: 'No review yet — daemon may still be processing.', dim: true });
  }

  return lines;
}
