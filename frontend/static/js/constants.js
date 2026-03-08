export const MOBILE_QUERY = '(max-width: 1024px)';
export const DEBUG_TAP_TARGET = 5;
export const UI_PREFS_KEY = 'jmail_ui_prefs';
export const EMAIL_SCOPE_ALL = 'all';

export const VIEW_META = {
    inbox: {
        kicker: 'Unified Inbox',
        title: '统一收件箱',
        description: '先总览全部邮箱，再下沉到单邮箱处理，阅读和决策始终保持在一条连续工作流中。',
    },
    overview: {
        kicker: 'Mission Control',
        title: '邮件总控台',
        description: '把未读压力、邮箱健康、同步状态和配额集中在一个入口里先看清楚。',
    },
    accounts: {
        kicker: 'Mailbox Studio',
        title: '邮箱接入与同步',
        description: '用更顺手的引导流程接入 Gmail、Outlook、QQ 或自定义 IMAP / SMTP。',
    },
    admin: {
        kicker: 'System Control',
        title: '系统参数',
        description: '控制注册、配额和默认同步策略，确保整个邮件系统的边界清晰可控。',
    },
    users: {
        kicker: 'People',
        title: '用户与权限',
        description: '集中管理账号、密码重置和恢复码，让系统运维动作更直接。',
    },
    profile: {
        kicker: 'Identity',
        title: '个人资料',
        description: '在一个安静的空间里维护身份信息与登录安全。',
    },
};

export const PRIMARY_NAV = [
    { key: 'inbox', label: '收件箱', short: '箱' },
    { key: 'overview', label: '总览', short: '览' },
    { key: 'accounts', label: '邮箱', short: '户' },
];

export const SECONDARY_NAV = [
    { key: 'profile', label: '我的', short: '我' },
];

export const ADMIN_NAV = [
    { key: 'admin', label: '系统', short: '设' },
    { key: 'users', label: '用户', short: '人' },
];

export const MOBILE_DOCK = [
    { key: 'inbox', label: '收件箱' },
    { key: 'overview', label: '总览' },
    { key: 'accounts', label: '邮箱' },
];

export const EMAIL_FILTERS = [
    { key: 'all', label: '收件箱', hint: '查看当前范围内待处理的收件箱邮件' },
    { key: 'unread', label: '未读', hint: '优先处理还没读过的邮件' },
    { key: 'flagged', label: '星标', hint: '查看被重点标记的对话' },
    { key: 'read', label: '已读', hint: '回看已经处理过的内容' },
    { key: 'archived', label: '已归档', hint: '查看沉淀后的历史邮件' },
    { key: 'deleted', label: '已删除', hint: '查看已删除邮件并执行恢复或清理' },
];

export const INBOX_VIEW_MODES = [
    { key: 'thread', label: '会话视图' },
    { key: 'message', label: '邮件视图' },
];

export const SEARCH_FIELD_OPTIONS = [
    { key: 'all', label: '全部字段' },
    { key: 'subject', label: '主题' },
    { key: 'sender', label: '发件人' },
    { key: 'recipients', label: '收件人' },
    { key: 'content', label: '正文' },
    { key: 'attachments', label: '附件' },
];

export const RULE_FIELD_OPTIONS = [
    { key: 'sender', label: '发件人' },
    { key: 'subject', label: '主题' },
    { key: 'content', label: '正文关键词' },
    { key: 'attachments', label: '附件名称' },
];

export const RULE_ACTION_OPTIONS = [
    { key: 'archive', label: '归档' },
    { key: 'mark_read', label: '标记已读' },
    { key: 'flag', label: '设为星标' },
    { key: 'delete', label: '移到已删除' },
];

export const OVERVIEW_PILLARS = [
    {
        title: '统一入口',
        copy: '把所有邮箱收束到同一条邮件流里，避免在多个账户之间来回切屏。',
    },
    {
        title: '焦点阅读',
        copy: '列表、摘要和阅读窗格始终联动，在桌面和手机上都能维持连续专注。',
    },
    {
        title: '顺手接入',
        copy: '从邮箱识别、OAuth 到手动服务器配置，整个接入过程收进一套更短路径。',
    },
];

export const KEYBOARD_SHORTCUTS = [
    { key: '/', label: '定位搜索' },
    { key: 'J', label: '下一封邮件' },
    { key: 'K', label: '上一封邮件' },
    { key: 'R', label: '回复当前邮件' },
    { key: 'C', label: '写新邮件' },
];
