/**
 * Formats an ISO date string for display.
 * @param {string} iso       - ISO date string
 * @param {boolean} withTime - Include hours and minutes (default: false)
 * @returns {string}         - Formatted date string
 */
export function formatDate(iso: string, withTime = false): string {
    return new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    });
}