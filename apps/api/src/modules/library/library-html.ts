import sanitize from 'sanitize-html';

/** Source markup is untrusted. No remote fetches, handlers, embeds or arbitrary CSS. */
export function cleanPaperHtml(input: string, media: (url: string) => string | null): string {
  return sanitize(input, {
    allowedTags: ['p', 'br', 'span', 'div', 'b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup',
      'table', 'thead', 'tbody', 'tr', 'td', 'th', 'ul', 'ol', 'li', 'img', 'hr', 'ruby', 'rt',
      'math', 'mi', 'mn', 'mo', 'mrow', 'mfrac', 'msup', 'msub', 'msqrt', 'mtext'],
    allowedAttributes: { '*': ['style'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'],
      img: ['src', 'alt', 'width', 'height', 'loading'] },
    allowedStyles: { '*': { 'text-align': [/^(left|right|center)$/],
      'vertical-align': [/^(top|middle|bottom|baseline)$/], 'white-space': [/^(normal|pre-wrap)$/],
      'font-weight': [/^(bold|normal|[1-9]00)$/], 'text-decoration': [/^(underline|line-through)$/] } },
    allowedSchemes: [], allowProtocolRelative: false,
    transformTags: {
      img: (_tag, attrs): sanitize.Tag => {
        const local = media(attrs.src ?? '');
        const size: Record<string, string> = {};
        for (const key of ['width', 'height']) if (/^\d{1,4}$/.test(attrs[key] ?? '') && Number(attrs[key]) > 0) size[key] = String(Math.min(Number(attrs[key]), 2000));
        return local ? { tagName: 'img', attribs: { src: local, alt: (attrs.alt ?? '题目插图').slice(0, 200), loading: 'lazy', ...size } }
          : { tagName: 'span', attribs: {}, text: '【插图暂不可用】' };
      },
    },
    // The generated local URLs are the only image sources that can survive.
    allowedSchemesByTag: { img: ['http', 'https'] },
    enforceHtmlBoundary: true,
  });
}
