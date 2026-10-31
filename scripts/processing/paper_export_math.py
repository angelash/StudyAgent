"""Native MathML to OMML for the explicitly supported, validated subset."""
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from paper_export_content import tag


def element(name, *children, **attributes):
    node = OxmlElement(name)
    for key, value in attributes.items(): node.set(qn('m:' + key), str(value))
    node.extend(children)
    return node


def math_run(value, family='StudyAgent Print Math'):
    fonts = OxmlElement('w:rFonts')
    for name in ['ascii', 'hAnsi', 'eastAsia', 'cs']: fonts.set(qn('w:' + name), family)
    properties = OxmlElement('w:rPr'); properties.append(fonts)
    text = element('m:t'); text.text = value; text.set(qn('xml:space'), 'preserve')
    return element('m:r', element('m:rPr', element('m:sty', val='p')), properties, text)


def convert(node):
    name = tag(node)
    items = list(node)
    if name in {'mi', 'mn', 'mo', 'mtext'}:
        return [math_run(node.text, 'StudyAgent Print Serif' if name == 'mtext' else 'StudyAgent Print Math')]
    if name in {'math', 'mrow'}: return [part for child in items for part in convert(child)]
    if name == 'mfrac': return [element('m:f', element('m:num', *convert(items[0])), element('m:den', *convert(items[1])))]
    if name in {'msup', 'msub', 'msubsup'}:
        suffix = {'msup': 'sSup', 'msub': 'sSub', 'msubsup': 'sSubSup'}[name]
        result = element('m:' + suffix, element('m:e', *convert(items[0])))
        if name != 'msup': result.append(element('m:sub', *convert(items[1])))
        if name != 'msub': result.append(element('m:sup', *convert(items[2 if name == 'msubsup' else 1])))
        return [result]
    if name in {'msqrt', 'mroot'}:
        degree = element('m:deg', *(convert(items[1]) if name == 'mroot' else []))
        body = convert(items[0]) if name == 'mroot' else [part for child in items for part in convert(child)]
        return [element('m:rad', element('m:radPr', element('m:degHide', val=0 if name == 'mroot' else 1)), degree, element('m:e', *body))]
    if name == 'mfenced':
        properties = element('m:dPr', element('m:begChr', val=node.get('open', '(')), element('m:endChr', val=node.get('close', ')')),
                             element('m:sepChr', val=node.get('separators', ',')))
        return [element('m:d', properties, *(element('m:e', *convert(child)) for child in items))]
    raise ValueError('paper_export_unsupported_markup')


def omml(node):
    return element('m:oMath', *convert(node))
