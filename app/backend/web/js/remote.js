import { state } from './store.js';

export function isRemote(project) {
    return /^ssh:\/\//i.test(String(project || ''));
}

export function parseRemote(project) {
    const match = String(project || '').match(/^ssh:\/\/([^/]+)(\/.*)$/i);
    if (!match) return null;
    const path = /^\/[A-Za-z]:/.test(match[2]) ? match[2].slice(1) : match[2];
    return { id: match[1], path };
}

export function remoteProject(id, path) {
    const clean = String(path || '/').replace(/\\/g, '/');
    return `ssh://${id}${clean.startsWith('/') ? '' : '/'}${clean}`;
}

export function sshConnections() {
    return Array.isArray(state.sshConnections) ? state.sshConnections : [];
}

export function setSSHConnections(list) {
    state.sshConnections = Array.isArray(list) ? list : [];
}

export function sshConnection(id) {
    return sshConnections().find(c => c.id === id) || null;
}

export function projectLabel(project) {
    const remote = parseRemote(project);
    if (!remote) return project || '';
    return `${sshConnection(remote.id)?.name || 'SSH'}:${remote.path}`;
}
