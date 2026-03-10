/**
 * Strips common Markdown syntax from a string to make it cleaner for Text-to-Speech.
 */
export function stripMarkdown(text: string): string {
  if (!text) return "";

  let clean = text;

  // Headers (e.g. # Header)
  clean = clean.replace(/^#+\s+/gm, "");

  // Bold/Italic (**bold**, *italic*, __bold__, _italic_)
  clean = clean.replace(/(\*\*|__)(.*?)\1/g, "$2");
  clean = clean.replace(/(\*|_)(.*?)\1/g, "$2");

  // Strikethrough (~~text~~)
  clean = clean.replace(/~~(.*?)~~/g, "$1");

  // Links [text](url) -> text
  clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // Images ![alt](url) -> alt (or remove entirely if you prefer)
  clean = clean.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");

  // Code blocks (```code```) -> code
  clean = clean.replace(/```[\s\S]*?```/g, (match) => {
    // Remove the backticks and language identifier
    return match.replace(/^```.*\n?|```$/g, "");
  });

  // Inline code (`code`) -> code
  clean = clean.replace(/`([^`]+)`/g, "$1");

  // Blockquotes (> text)
  clean = clean.replace(/^>\s+/gm, "");

  // Lists (* item, - item, 1. item)
  clean = clean.replace(/^[\*\-\+]\s+/gm, "");
  clean = clean.replace(/^\d+\.\s+/gm, "");

  // Horizontal rules (---, ***, ___)
  clean = clean.replace(/^[\*\-_]{3,}$/gm, "");

  // Remove extra newlines/spaces
  clean = clean.replace(/\n{2,}/g, "\n");
  clean = clean.trim();

  return clean;
}
