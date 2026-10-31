"""Bounded, public error codes shared by paper workers and capability probes."""
ERROR_CODES = frozenset('paper_export_' + name for name in [
    'byte_limit', 'cancelled', 'duplicate_source', 'font_invalid', 'invalid_input',
    'layout_invalid', 'layout_limit', 'media_invalid', 'missing_glyph', 'page_limit',
    'process_cleanup_failed', 'render_failed', 'render_timeout', 'renderer_unavailable',
    'source_changed', 'source_map_invalid', 'text_limit', 'unsupported_markup',
    'runtime_invalid', 'version_mismatch', 'dependency_missing', 'output_exists', 'empty_question', 'path_limit',
    'content_incomplete',
])


def error_code(error, fallback='paper_export_render_failed'):
    if isinstance(error, ValueError) and str(error) in ERROR_CODES: return str(error)
    if isinstance(error, ValueError) and str(error) == 'studio_file_link_refused': return 'paper_export_invalid_input'
    return fallback
