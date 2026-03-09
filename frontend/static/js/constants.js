export const MOBILE_QUERY = '(max-width: 1024px)';
export const UI_PREFS_KEY = 'jmail_ui_prefs';
export const EMAIL_SCOPE_ALL = 'all';

export const VIEW_META = {
    search: {
        kicker: 'Global Search',
        title: 'Search Results',
        description: 'Search every mailbox, then narrow results with mailbox, folder, attachment and date facets.',
    },
    inbox: {
        kicker: 'Mail Center',
        title: 'Mail Center',
        description: 'Handle all inbox traffic in one place and switch by account or status when needed.',
    },
    overview: {
        kicker: 'Overview',
        title: 'Operations Summary',
        description: 'Review workload, sync health and capacity from one landing page.',
    },
    accounts: {
        kicker: 'Accounts',
        title: 'Mailbox Operations',
        description: 'Manage onboarding, sync and connection status from one workbench.',
    },
    admin: {
        kicker: 'Administration',
        title: 'System Administration',
        description: 'Control registration policy, default quotas and sync parameters from one page.',
    },
    users: {
        kicker: 'Users',
        title: 'Users & Access',
        description: 'Day-to-day access control stays direct: create users, reset credentials and review account status quickly.',
    },
    profile: {
        kicker: 'Profile',
        title: 'Account Settings',
        description: 'Keep profile details and account security in one clear settings page.',
    },
};

export const PRIMARY_NAV = [
    { key: 'overview', label: 'Overview', short: 'OV' },
    { key: 'inbox', label: 'Mail Center', short: 'MC' },
    { key: 'accounts', label: 'Mailboxes', short: 'MB' },
];

export const SECONDARY_NAV = [
    { key: 'profile', label: 'Account Settings', short: 'ME' },
];

export const ADMIN_NAV = [
    { key: 'admin', label: 'System Policy', short: 'AD' },
    { key: 'users', label: 'Users & Access', short: 'US' },
];

export const MOBILE_DOCK = [
    { key: 'overview', label: 'Overview' },
    { key: 'inbox', label: 'Mail' },
    { key: 'accounts', label: 'Boxes' },
];

export const EMAIL_FILTERS = [
    { key: 'all', label: 'All Mail', hint: 'View all mail in the current scope' },
    { key: 'unread', label: 'Unread', hint: 'Focus on unread mail first' },
    { key: 'flagged', label: 'Flagged', hint: 'Review conversations marked as important' },
    { key: 'read', label: 'Read', hint: 'Review messages that were already handled' },
    { key: 'archived', label: 'Archived', hint: 'Review stored mail history' },
    { key: 'deleted', label: 'Deleted', hint: 'Restore or purge deleted mail' },
];

export const INBOX_VIEW_MODES = [
    { key: 'thread', label: 'Threads' },
    { key: 'message', label: 'Messages' },
];

export const SEARCH_FIELD_OPTIONS = [
    { key: 'all', label: 'All Fields' },
    { key: 'subject', label: 'Subject' },
    { key: 'sender', label: 'Sender' },
    { key: 'recipients', label: 'Recipients' },
    { key: 'content', label: 'Body' },
    { key: 'attachments', label: 'Attachments' },
];

export const RULE_FIELD_OPTIONS = [
    { key: 'sender', label: 'Sender' },
    { key: 'subject', label: 'Subject' },
    { key: 'content', label: 'Body Keyword' },
    { key: 'attachments', label: 'Attachment Name' },
];

export const RULE_ACTION_OPTIONS = [
    { key: 'archive', label: 'Archive' },
    { key: 'mark_read', label: 'Mark Read' },
    { key: 'flag', label: 'Flag' },
    { key: 'delete', label: 'Delete' },
];

export const OVERVIEW_PILLARS = [
    {
        title: 'Unified Entry',
        copy: 'Process multiple mailboxes from one consistent interface.',
    },
    {
        title: 'Reliable Flow',
        copy: 'List, detail, conversation and search follow one stable workflow.',
    },
    {
        title: 'Standard Onboarding',
        copy: 'Use templates, OAuth and custom settings with equal clarity.',
    },
];
