// Escapes HTML to prevent XSS attacks.
export function escapeHtml(text) {
    if (text === null || typeof text === 'undefined') return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.toString().replace(/[&<>"']/g, m => map[m]);
}

// Escapes special characters for use in a regular expression.
export function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Calculates a similarity score between two strings (0 to 1).
function calculateSimilarity(a, b) {
    const matrix = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    const maxLen = Math.max(a.length, b.length);
    return maxLen > 0 ? 1 - (matrix[a.length][b.length] / maxLen) : 1;
}

// Performs a fuzzy search, returning true if similarity is above a threshold.
export function fuzzySearch(query, text, threshold = 0.6) {
    if (!query || !text) return { matches: false, score: 0 };
    query = query.toLowerCase();
    text = text.toLowerCase();
    if (text.includes(query)) return { matches: true, score: 1 };
    const score = calculateSimilarity(query, text);
    return { matches: score >= threshold, score };
}

// Wraps search terms in a string with a <span class="highlight">.
export function highlightSearchTerms(text, searchTerm) {
    if (!searchTerm || !text) return escapeHtml(text);
    let highlighted = escapeHtml(text);
    const terms = searchTerm.toLowerCase().split(' ').filter(t => t.trim());
    terms.forEach(term => {
        const regex = new RegExp(`(${escapeRegExp(term)})`, 'gi');
        highlighted = highlighted.replace(regex, '<span class="highlight">$1</span>');
    });
    return highlighted;
}

// Triggers a file download in the browser.
export function downloadFile(data, filename, mimeType) {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Displays a temporary success message toast.
export function showSuccessMessage(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 transform translate-x-full transition-transform duration-300 ease-out';
    successDiv.textContent = message;
    document.body.appendChild(successDiv);
    
    setTimeout(() => {
        successDiv.style.transform = 'translateX(0)';
    }, 10);
    
    setTimeout(() => {
        successDiv.style.transform = 'translateX(calc(100% + 1rem))';
        setTimeout(() => {
            if (document.body.contains(successDiv)) {
                document.body.removeChild(successDiv);
            }
        }, 300);
    }, 3000);
}

export function generateSearchSuggestions(query, interfaces) {
    if (query.length < 2) return [];

    const suggestions = new Set();
    const queryLower = query.toLowerCase();

    interfaces.forEach(item => {
        if (item.name.toLowerCase().includes(queryLower)) suggestions.add(item.name);
        if (item.id.toLowerCase().includes(queryLower)) suggestions.add(item.id);
    });

    return Array.from(suggestions).slice(0, 8).sort();
}
