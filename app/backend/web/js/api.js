export async function api(url, { method, body, signal } = {}) {
    const options = { method: method || (body === undefined ? 'GET' : 'POST'), cache: 'no-store', signal, headers: {} };
    if (body !== undefined) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    const type = response.headers.get('content-type') || '';
    if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
            const data = await response.json();
            message = data.error || message;
        } catch {}
        throw new Error(message);
    }
    if (response.status === 204) return null;
    return type.includes('application/json') ? response.json() : response.text();
}

export function query(params) {
    return new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null)).toString();
}
