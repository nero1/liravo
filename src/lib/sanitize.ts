import DOMPurify from 'isomorphic-dompurify';

// Strip all HTML — for plain text fields (short reviews, quotes, bios)
export function sanitizeText(input: string): string {
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
}

// Allow safe rich text tags — for long-form reviews and author posts
export function sanitizeRichText(input: string): string {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'h2', 'h3', 'h4'],
    ALLOWED_ATTR: [],
    FORBID_ATTR: ['style', 'class', 'id'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input'],
  }).trim();
}

export function hasVisibleText(input:string):boolean {
  const fragment=DOMPurify.sanitize(input,{ALLOWED_TAGS:[],ALLOWED_ATTR:[],RETURN_DOM_FRAGMENT:true});
  return (fragment.textContent??'').replace(/\p{Default_Ignorable_Code_Point}/gu,'').trim().length>0;
}

export function sanitizeExcerpt(input:string):string {
  return (DOMPurify.sanitize(input,{ALLOWED_TAGS:[],ALLOWED_ATTR:[],RETURN_DOM_FRAGMENT:true}).textContent??'').trim().slice(0,500);
}
