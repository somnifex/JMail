export const API_BASE = '/api/v1';

export function readStoredToken() {
    return localStorage.getItem('jmail_token') || localStorage.getItem('token') || '';
}

export function writeStoredToken(token) {
    if (!token) {
        localStorage.removeItem('jmail_token');
        localStorage.removeItem('token');
        return;
    }
    localStorage.setItem('jmail_token', token);
    localStorage.setItem('token', token);
}

export async function apiRequest(endpoint, options = {}) {
    const headers = {
        ...(options.headers || {}),
    };
    const token = readStoredToken();

    const isFormData = options.body instanceof FormData;
    if (!isFormData && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }
    if (token && !headers.Authorization) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
    });

    const rawText = await response.text();
    let payload = null;

    if (rawText) {
        try {
            payload = JSON.parse(rawText);
        } catch {
            payload = rawText;
        }
    }

    if (!response.ok) {
        const detail = typeof payload === 'object' && payload !== null
            ? payload.detail?.message || payload.detail || payload.message
            : payload;
        const error = new Error(detail || `Request failed: ${response.status}`);
        error.status = response.status;
        error.payload = payload;
        throw error;
    }

    return payload;
}
