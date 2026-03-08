import { EMAIL_SCOPE_ALL } from './constants.js';

export { EMAIL_SCOPE_ALL };

const THREAD_PREFIX_RE = /^(?:(?:re|fw|fwd|答复|回复|转发)\s*[:：]\s*)+/i;

export function safeJsonParse(value, fallback = []) {
    if (!value) {
        return fallback;
    }
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

export function formatDateTime(value, fallback = '未记录') {
    if (!value) {
        return fallback;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return fallback;
    }
    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

export function formatCompactDate(value, fallback = '未记录') {
    if (!value) {
        return fallback;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return fallback;
    }
    return new Intl.DateTimeFormat('zh-CN', {
        month: 'short',
        day: 'numeric',
    }).format(date);
}

export function formatRelativeTime(value, fallback = '刚刚') {
    if (!value) {
        return fallback;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return fallback;
    }

    const delta = Math.floor((Date.now() - date.getTime()) / 1000);
    if (delta < 60) return `${Math.max(delta, 1)} 秒前`;
    if (delta < 3600) return `${Math.floor(delta / 60)} 分钟前`;
    if (delta < 86400) return `${Math.floor(delta / 3600)} 小时前`;
    if (delta < 86400 * 7) return `${Math.floor(delta / 86400)} 天前`;

    return formatCompactDate(value, fallback);
}

export function formatFileSize(size) {
    const value = Number(size) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function mailboxStatusLabel(status) {
    return {
        active: '运行中',
        inactive: '已停用',
        error: '需要处理',
    }[status] || status || '未知状态';
}

export function mailboxStatusTone(status) {
    return {
        active: 'success',
        inactive: 'muted',
        error: 'danger',
    }[status] || 'muted';
}

export function emailStatusLabel(status) {
    return {
        unread: '未读',
        read: '已读',
        flagged: '星标',
        archived: '已归档',
        deleted: '已删除',
    }[status] || status || '邮件';
}

export function userRoleLabel(role) {
    return role === 'admin' ? '管理员' : '普通用户';
}

export function userStatusLabel(status) {
    return {
        active: '活跃',
        inactive: '停用',
        suspended: '冻结',
    }[status] || status || '未知';
}

export function normalizeEmailScope(scope) {
    if (scope === null || scope === undefined || scope === '' || scope === EMAIL_SCOPE_ALL) {
        return EMAIL_SCOPE_ALL;
    }
    const numericScope = Number(scope);
    return Number.isFinite(numericScope) ? numericScope : EMAIL_SCOPE_ALL;
}

export function parseRecipients(text) {
    return String(text || '')
        .split(/[;,]/g)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((address) => ({ address }));
}

export async function fileToAttachmentPayload(file) {
    const content = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || '');
            const base64 = result.includes(',') ? result.split(',')[1] : result;
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    return {
        id: `${file.name}-${file.size}-${file.lastModified}`,
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
        size: file.size || 0,
        content,
    };
}

export function formatAddressList(value) {
    return safeJsonParse(value, [])
        .map((item) => item?.name ? `${item.name} <${item.address}>` : item?.address)
        .filter(Boolean)
        .join(', ');
}

export function formatSenderLine(name, address) {
    return name ? `${name} <${address}>` : address || '未知发件人';
}

export function mailboxAuthLabel(mailbox) {
    return mailbox?.use_oauth ? `${mailbox.oauth_provider || 'OAuth'} 授权` : '手动密码';
}

export function mailboxOptionLabel(mailbox) {
    return `${mailbox?.name || mailbox?.email || '邮箱'} · ${mailbox?.email || ''}`;
}

export function normalizeThreadSubject(subject) {
    const cleaned = String(subject || '').trim().replace(THREAD_PREFIX_RE, '').replace(/\s+/g, ' ').trim();
    return cleaned || '(无主题)';
}

export function buildConversationKey(email) {
    return `${email?.mailbox_id || 'all'}:${normalizeThreadSubject(email?.subject).toLowerCase()}`;
}

export function buildConversationGroups(emails = []) {
    const map = new Map();
    for (const email of emails) {
        const key = buildConversationKey(email);
        const current = map.get(key) || {
            key,
            subject: normalizeThreadSubject(email?.subject),
            latest_email_id: email?.id,
            latest_email: email,
            latest_received_at: email?.received_at || email?.sent_at,
            preview_text: email?.preview_text || '暂无预览',
            participants: new Set(),
            count: 0,
            unread_count: 0,
            has_attachments: false,
            is_flagged: false,
            items: [],
        };

        current.count += 1;
        current.items.push(email);
        current.has_attachments = current.has_attachments || Boolean(email?.has_attachments);
        current.is_flagged = current.is_flagged || Boolean(email?.is_flagged);
        if (email?.status !== 'read') {
            current.unread_count += 1;
        }
        current.participants.add(formatSenderLine(email?.from_name, email?.from_address));

        const latestTime = new Date(current.latest_received_at || 0).getTime();
        const candidateTime = new Date(email?.received_at || email?.sent_at || 0).getTime();
        if (candidateTime >= latestTime) {
            current.latest_email_id = email?.id;
            current.latest_email = email;
            current.latest_received_at = email?.received_at || email?.sent_at;
            current.preview_text = email?.preview_text || current.preview_text;
        }

        map.set(key, current);
    }

    return Array.from(map.values())
        .map((item) => ({
            ...item,
            participants: Array.from(item.participants).slice(0, 3),
            items: [...item.items].sort((left, right) => new Date(right?.received_at || right?.sent_at || 0) - new Date(left?.received_at || left?.sent_at || 0)),
        }))
        .sort((left, right) => new Date(right.latest_received_at || 0) - new Date(left.latest_received_at || 0));
}

export function groupEmailsByDate(emails = []) {
    return groupByTimeline(emails, (email) => email?.received_at || email?.sent_at);
}

export function groupThreadsByDate(threads = []) {
    return groupByTimeline(threads, (thread) => thread?.latest_received_at);
}

function groupByTimeline(items, getter) {
    const sections = [];
    for (const item of items) {
        const rawDate = getter(item);
        const label = resolveTimelineLabel(rawDate);
        const key = `${label}-${rawDate || 'na'}`;
        const last = sections[sections.length - 1];
        if (!last || last.label !== label) {
            sections.push({ key, label, items: [item] });
        } else {
            last.items.push(item);
        }
    }
    return sections;
}

function resolveTimelineLabel(value) {
    if (!value) {
        return '更早';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '更早';
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((todayStart.getTime() - targetStart.getTime()) / 86400000);

    if (diffDays <= 0) {
        return '今天';
    }
    if (diffDays === 1) {
        return '昨天';
    }
    if (diffDays < 7) {
        return '本周较早';
    }
    if (now.getFullYear() === date.getFullYear()) {
        return new Intl.DateTimeFormat('zh-CN', {
            month: 'long',
            day: 'numeric',
        }).format(date);
    }
    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    }).format(date);
}

export function buildEmailDocument(html) {
    const content = html || '<p>暂无 HTML 正文</p>';
    return `<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        :root {
            color-scheme: light;
            --page-bg: #f6efe5;
            --page-surface: #fffdf8;
            --page-ink: #1a262a;
            --page-muted: #5f6f76;
            --page-border: rgba(20, 32, 38, 0.08);
            --page-accent: #0f766e;
        }
        * {
            box-sizing: border-box;
        }
        html, body {
            margin: 0;
            min-height: 100%;
            background:
                radial-gradient(circle at top right, rgba(255, 191, 128, 0.28), transparent 34%),
                linear-gradient(180deg, #fbf5eb 0%, #f4efe7 100%);
            color: var(--page-ink);
            font-family: "Aptos", "Segoe UI Variable Text", "PingFang SC", "Microsoft YaHei UI", sans-serif;
            line-height: 1.75;
        }
        body {
            padding: clamp(18px, 3vw, 34px);
        }
        article {
            width: min(100%, 900px);
            margin: 0 auto;
            padding: clamp(18px, 3vw, 32px);
            background: color-mix(in srgb, var(--page-surface) 92%, white 8%);
            border: 1px solid var(--page-border);
            border-radius: 24px;
            box-shadow: 0 18px 42px rgba(16, 28, 32, 0.08);
            overflow-wrap: anywhere;
        }
        a {
            color: var(--page-accent);
        }
        img, table, iframe, video {
            max-width: 100%;
        }
        pre {
            white-space: pre-wrap;
            word-break: break-word;
            padding: 16px;
            border-radius: 18px;
            background: rgba(15, 118, 110, 0.06);
        }
        blockquote {
            margin: 1.5em 0;
            padding: 0.4em 1.2em;
            border-left: 4px solid rgba(15, 118, 110, 0.32);
            color: var(--page-muted);
        }
    </style>
</head>
<body>
    <article>${content}</article>
</body>
</html>`;
}
