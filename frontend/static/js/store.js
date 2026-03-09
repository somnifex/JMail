import { apiRequest, readStoredToken, writeStoredToken } from './api.js';
import {
    ADMIN_NAV,
    EMAIL_FILTERS,
    EMAIL_SCOPE_ALL,
    MOBILE_DOCK,
    MOBILE_QUERY,
    OVERVIEW_PILLARS,
    PRIMARY_NAV,
    SECONDARY_NAV,
    UI_PREFS_KEY,
    VIEW_META,
} from './constants.js';
import { LOCALE_OPTIONS, readStoredLocale, translate, writeStoredLocale } from './i18n.js';
import {
    buildEmailDocument,
    EMAIL_SCOPE_ALL as EMAIL_SCOPE_ALL_ALIAS,
    emailStatusLabel,
    fileToAttachmentPayload,
    formatAddressList,
    formatDateTime,
    formatFileSize,
    formatRelativeTime,
    formatSenderLine,
    groupEmailsByDate,
    mailboxAuthLabel,
    mailboxOptionLabel,
    mailboxStatusLabel,
    mailboxStatusTone,
    normalizeEmailScope,
    parseRecipients,
    safeJsonParse,
    userRoleLabel,
    userStatusLabel,
} from './utils.js';

const { reactive, computed, watch, nextTick, ref } = window.Vue;
const { ElMessage, ElMessageBox } = window.ElementPlus;

const THEME_OPTIONS = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'Follow System' },
];

const BYTES_PER_GB = 1024 * 1024 * 1024;

const ADMIN_SETTINGS_DEFAULTS = {
    allow_registration: true,
    default_max_mailboxes_per_user: 5,
    default_fetch_interval: 300,
    default_storage_quota_bytes: 10 * BYTES_PER_GB,
};

function normalizeThemeMode(value) {
    return THEME_OPTIONS.some((option) => option.value === value) ? value : 'system';
}

function resolveThemeColor(theme) {
    return theme === 'dark' ? '#08111d' : '#f3f7fb';
}

function defaultAuthForms() {
    return {
        login: {
            username: '',
            password: '',
            remember_me: true,
        },
        register: {
            username: '',
            email: '',
            full_name: '',
            password: '',
            confirm_password: '',
        },
        reset: {
            email: '',
            recovery_code: '',
            new_password: '',
        },
    };
}

function defaultMailboxForm() {
    return {
        email: '',
        name: '',
        provider_template: '',
        fetch_interval: 300,
        imap_server: '',
        imap_port: 993,
        imap_use_ssl: true,
        imap_username: '',
        imap_password: '',
        smtp_server: '',
        smtp_port: 587,
        smtp_use_ssl: false,
        smtp_use_tls: true,
        smtp_username: '',
        smtp_password: '',
        status: 'active',
        use_oauth: false,
        oauth_provider: '',
    };
}

function defaultComposeForm() {
    return {
        mailbox_id: null,
        to: '',
        cc: '',
        bcc: '',
        subject: '',
        body: '',
        is_html: false,
        attachments: [],
    };
}

function defaultCreateUserForm() {
    return {
        username: '',
        email: '',
        full_name: '',
        password: '',
        max_mailboxes: 5,
    };
}

function defaultProfileForm(user = null) {
    return {
        full_name: user?.full_name || '',
    };
}

function defaultPasswordForm() {
    return {
        current_password: '',
        new_password: '',
        confirm_password: '',
    };
}

function readUiPrefs() {
    try {
        const payload = localStorage.getItem(UI_PREFS_KEY);
        return payload ? JSON.parse(payload) : {};
    } catch {
        return {};
    }
}

function resolveMailboxTemplate(mailbox) {
    if (!mailbox) {
        return '';
    }
    if (mailbox.oauth_provider === 'google') {
        return 'gmail';
    }
    if (mailbox.oauth_provider === 'microsoft') {
        return 'microsoft';
    }
    return mailbox.oauth_provider || 'custom';
}

function isEditableTarget(target) {
    const tag = target?.tagName?.toLowerCase();
    return Boolean(
        target?.isContentEditable ||
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.closest?.('.el-textarea') ||
        target?.closest?.('.el-input')
    );
}

let storeInstance = null;

export function useJmailStore() {
    if (!storeInstance) {
        storeInstance = createStore();
    }
    return storeInstance;
}

function createStore() {
    const uiPrefs = readUiPrefs();
    const composeFileInput = ref(null);
    const emailSearchInput = ref(null);
    let providerDetectTimer = null;
    let mobileMediaQueryList = null;
    let themeMediaQueryList = null;
    let initialized = false;
    const initialThemeMode = normalizeThemeMode(uiPrefs.themeMode);

    const detectSystemTheme = () => {
        if (themeMediaQueryList) {
            return themeMediaQueryList.matches ? 'dark' : 'light';
        }
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return 'light';
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    };

    const state = reactive({
        booting: true,
        token: readStoredToken(),
        user: null,
        locale: readStoredLocale(),
        themeMode: initialThemeMode,
        resolvedTheme: initialThemeMode === 'system' ? detectSystemTheme() : initialThemeMode,
        localeMenuOpen: false,
        themeMenuOpen: false,
        currentView: uiPrefs.currentView || 'overview',
        userMenuOpen: false,
        authMode: 'login',
        authForms: defaultAuthForms(),
        authSubmitting: false,
        mobileNavOpen: false,
        mobileRailOpen: false,
        mobileReaderOpen: false,
        composeOpen: false,
        composeMode: 'new',
        composeForm: defaultComposeForm(),
        composeSending: false,
        mailboxDrawerOpen: false,
        mailboxFormMode: 'create',
        mailboxForm: defaultMailboxForm(),
        mailboxSaving: false,
        providerSelectionMode: 'auto',
        detectedProvider: null,
        mailboxDetecting: false,
        oauthStatus: '',
        editingMailboxId: null,
        createUserDrawerOpen: false,
        createUserForm: defaultCreateUserForm(),
        userCreating: false,
        profileForm: defaultProfileForm(),
        profileSaving: false,
        passwordForm: defaultPasswordForm(),
        passwordSaving: false,
        adminSaving: false,
        refreshing: false,
        syncing: false,
        inboxLoading: false,
        detailLoading: false,
        emailQuery: '',
        searchFields: Array.isArray(uiPrefs.searchFields) && uiPrefs.searchFields.length ? uiPrefs.searchFields : ['all'],
        searchFlagged: Object.prototype.hasOwnProperty.call(uiPrefs, 'searchFlagged') ? uiPrefs.searchFlagged : null,
        searchHasAttachments: Object.prototype.hasOwnProperty.call(uiPrefs, 'searchHasAttachments') ? uiPrefs.searchHasAttachments : null,
        searchDateFrom: uiPrefs.searchDateFrom || '',
        searchDateTo: uiPrefs.searchDateTo || '',
        emailViewMode: uiPrefs.emailViewMode || 'thread',
        emailStatus: uiPrefs.emailStatus || 'all',
        emailScope: normalizeEmailScope(uiPrefs.emailScope),
        emailPage: 1,
        emailPageSize: Number(uiPrefs.emailPageSize) || 40,
        emailTotal: 0,
        conversationLoading: false,
        emailConversation: [],
        emailConversationKey: '',
        rules: [],
        rulesLoading: false,
        rulesSaving: false,
        selectedMailboxId: null,
        selectedEmailId: null,
        selectedEmailIds: [],
        emailDetail: null,
        mailboxes: [],
        mailboxStats: {},
        providerCatalog: [],
        emails: [],
        systemInfo: null,
        systemStats: null,
        adminStats: null,
        adminUsers: [],
        adminSettingsLoaded: false,
        adminSettings: { ...ADMIN_SETTINGS_DEFAULTS },
        isMobile: typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY).matches : false,
    });

    const request = async (endpoint, options = {}) => {
        try {
            return await apiRequest(endpoint, options);
        } catch (error) {
            if (error.status === 401 && state.token) {
                writeStoredToken('');
                state.token = '';
                state.user = null;
                state.booting = false;
                state.authMode = 'login';
                ElMessage.error('Session expired. Please sign in again.');
            }
            throw error;
        }
    };

    const t = (key, params = {}) => translate(state.locale, key, params);
    const setLocale = (locale) => {
        state.locale = locale === 'en-US' ? 'en-US' : 'zh-CN';
        writeStoredLocale(state.locale);
        updateDocumentTitle();
    };
    const applyThemeMode = () => {
        const resolvedTheme = state.themeMode === 'system' ? detectSystemTheme() : state.themeMode;
        state.resolvedTheme = resolvedTheme;
        if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-theme', resolvedTheme);
            document.documentElement.setAttribute('data-theme-mode', state.themeMode);
            const themeColorMeta = document.querySelector('meta[name="theme-color"]');
            if (themeColorMeta) {
                themeColorMeta.setAttribute('content', resolveThemeColor(resolvedTheme));
            }
        }
    };
    const setThemeMode = (mode) => {
        state.themeMode = normalizeThemeMode(mode);
        applyThemeMode();
    };
    const isAdmin = computed(() => state.user?.role === 'admin');
    const currentViewMeta = computed(() => VIEW_META[state.currentView] || VIEW_META.inbox);
    const userDisplayName = computed(() => state.user?.full_name || state.user?.username || 'User');
    const userInitial = computed(() => String(userDisplayName.value || 'U').trim().charAt(0).toUpperCase() || 'U');
    const currentScopeMailbox = computed(() => state.emailScope === EMAIL_SCOPE_ALL
        ? null
        : state.mailboxes.find((item) => item.id === Number(state.emailScope)) || null);
    const currentScopeLabel = computed(() => currentScopeMailbox.value ? (currentScopeMailbox.value.name || currentScopeMailbox.value.email) : t('All Mailboxes'));
    const currentScopeDescription = computed(() => currentScopeMailbox.value
        ? t('{email} sync, message volume and handling status are shown together for focused work.', { email: currentScopeMailbox.value.email })
        : t('Review mail flow, alerts and processing status across all connected mailboxes.'));
    const activeProvider = computed(() => state.providerCatalog.find((item) => item.id === state.mailboxForm.provider_template) || state.detectedProvider || null);
    const emailAttachments = computed(() => safeJsonParse(state.emailDetail?.attachments, []));
    const aggregateStats = computed(() => state.mailboxes.reduce((summary, mailbox) => {
        const stats = state.mailboxStats[mailbox.id] || {};
        summary.total += Number(stats.total || 0);
        summary.unread += Number(stats.unread || 0);
        summary.read += Number(stats.read || 0);
        summary.flagged += Number(stats.flagged || 0);
        summary.archived += Number(stats.archived || 0);
        summary.deleted += Number(stats.deleted || 0);
        summary.active += mailbox.status === 'active' ? 1 : 0;
        summary.errors += mailbox.status === 'error' ? 1 : 0;
        return summary;
    }, {
        total: 0,
        unread: 0,
        read: 0,
        flagged: 0,
        archived: 0,
        deleted: 0,
        active: 0,
        errors: 0,
    }));
    const currentScopeStats = computed(() => currentScopeMailbox.value
        ? (state.mailboxStats[currentScopeMailbox.value.id] || { total: 0, unread: 0, read: 0, flagged: 0, archived: 0, deleted: 0 })
        : aggregateStats.value);
    const mailboxHealthCards = computed(() => [...state.mailboxes]
        .sort((left, right) => {
            const toneDelta = Number(mailboxStatusTone(right.status) === 'danger') - Number(mailboxStatusTone(left.status) === 'danger');
            if (toneDelta !== 0) {
                return toneDelta;
            }
            return Number((state.mailboxStats[right.id] || {}).unread || 0) - Number((state.mailboxStats[left.id] || {}).unread || 0);
        }));
    const mailboxUsagePercent = computed(() => {
        const limit = Number(state.user?.max_mailboxes || 0);
        if (!limit) {
            return 0;
        }
        return Math.min(100, Math.round((state.mailboxes.length / limit) * 100));
    });
    const adminStorageQuotaGb = computed({
        get: () => {
            const bytes = Number(state.adminSettings.default_storage_quota_bytes || ADMIN_SETTINGS_DEFAULTS.default_storage_quota_bytes);
            return Math.max(1, Math.round(bytes / BYTES_PER_GB));
        },
        set: (value) => {
            const quotaGb = Math.max(1, Math.round(Number(value) || 1));
            state.adminSettings.default_storage_quota_bytes = quotaGb * BYTES_PER_GB;
        },
    });
    const activeRuleCount = computed(() => state.rules.filter((item) => item.is_active).length);
    const heroStats = computed(() => [
        { label: 'Unread', value: currentScopeStats.value.unread || 0, hint: 'Needs action' },
        { label: 'Archived', value: currentScopeStats.value.archived || 0, hint: 'Stored history' },
        { label: 'Rules', value: activeRuleCount.value || 0, hint: 'Automation' },
        { label: 'Alerts', value: aggregateStats.value.errors || 0, hint: 'Needs review' },
    ]);
    const emailGroups = computed(() => groupEmailsByDate(state.emails));
    const selectedEmails = computed(() => state.emails.filter((item) => state.selectedEmailIds.includes(item.id)));
    const selectedEmailCount = computed(() => state.selectedEmailIds.length);
    const isPageSelectionFull = computed(() => state.emails.length > 0 && state.emails.every((item) => state.selectedEmailIds.includes(item.id)));

    const persistUiPrefs = () => {
        try {
            localStorage.setItem(UI_PREFS_KEY, JSON.stringify({
                currentView: state.currentView,
                emailScope: state.emailScope,
                emailStatus: state.emailStatus,
                emailPageSize: state.emailPageSize,
                searchFields: state.searchFields,
                searchFlagged: state.searchFlagged,
                searchHasAttachments: state.searchHasAttachments,
                searchDateFrom: state.searchDateFrom,
                searchDateTo: state.searchDateTo,
                emailViewMode: state.emailViewMode,
                themeMode: state.themeMode,
            }));
        } catch {
            // Ignore storage errors.
        }
    };

    const handleSystemThemeChange = () => {
        if (state.themeMode === 'system') {
            applyThemeMode();
        }
    };

    const handleThemeContextSync = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            return;
        }
        handleSystemThemeChange();
    };

    const updateDocumentTitle = () => {
        const authTitleMap = {
            login: 'Sign in',
            register: 'Create account',
            reset: 'Reset password',
        };
        const title = state.user
            ? (state.currentView === 'inbox' ? currentScopeLabel.value : t(currentViewMeta.value.title))
            : t(authTitleMap[state.authMode] || 'Welcome');
        document.title = `JMail | ${title}`;
    };

    const showError = (error, fallback = 'Operation failed') => {
        ElMessage.error('Session expired. Please sign in again.');
    };

    const showSuccess = (message) => {
        ElMessage.success(message);
    };

    const syncMailboxSelection = () => {
        if (!state.mailboxes.length) {
            state.emailScope = EMAIL_SCOPE_ALL;
            state.selectedMailboxId = null;
            return;
        }
        if (state.emailScope !== EMAIL_SCOPE_ALL) {
            const exists = state.mailboxes.some((item) => item.id === Number(state.emailScope));
            if (!exists) {
                state.emailScope = EMAIL_SCOPE_ALL;
            }
        }
        if (!state.selectedMailboxId) {
            state.selectedMailboxId = state.mailboxes[0].id;
        }
    };

    const syncProfileForms = () => {
        state.profileForm = defaultProfileForm(state.user);
        state.passwordForm = defaultPasswordForm();
    };

    const resetComposeForm = () => {
        state.composeForm = defaultComposeForm();
        const preferredMailboxId = currentScopeMailbox.value?.id || state.mailboxes[0]?.id || null;
        state.composeForm.mailbox_id = preferredMailboxId;
    };

    const resetMailboxForm = (mailbox = null) => {
        state.mailboxForm = {
            ...defaultMailboxForm(),
            email: mailbox?.email || '',
            name: mailbox?.name || '',
            provider_template: resolveMailboxTemplate(mailbox),
            fetch_interval: mailbox?.fetch_interval || state.adminSettings.default_fetch_interval || 300,
            imap_server: mailbox?.imap_server || '',
            imap_port: mailbox?.imap_port || 993,
            imap_use_ssl: mailbox?.imap_use_ssl ?? true,
            imap_username: mailbox?.imap_username || mailbox?.email || '',
            smtp_server: mailbox?.smtp_server || '',
            smtp_port: mailbox?.smtp_port || 587,
            smtp_use_ssl: mailbox?.smtp_use_ssl ?? false,
            smtp_use_tls: mailbox?.smtp_use_tls ?? true,
            smtp_username: mailbox?.smtp_username || mailbox?.email || '',
            status: mailbox?.status || 'active',
            use_oauth: Boolean(mailbox?.use_oauth),
            oauth_provider: mailbox?.oauth_provider || '',
        };
    };

    const getMailboxStats = (mailboxId) => state.mailboxStats[mailboxId] || { total: 0, unread: 0, read: 0, flagged: 0, archived: 0, deleted: 0 };
    const getFilterCount = (key) => {
        const stats = currentScopeStats.value;
        if (key === 'unread') return Number(stats.unread || 0);
        if (key === 'flagged') return Number(stats.flagged || 0);
        if (key === 'read') return Number(stats.read || 0);
        if (key === 'archived') return Number(stats.archived || 0);
        if (key === 'deleted') return Number(stats.deleted || 0);
        return Number(stats.total || state.emailTotal || 0);
    };
    const currentMailboxLabelForEmail = (email) => email?.mailbox_name || email?.mailbox_email || 'Unknown mailbox';
    const buildEmailIframeDocument = (html) => buildEmailDocument(html);
    const describeLastFetch = (mailbox) => mailbox?.last_fetch ? formatRelativeTime(mailbox.last_fetch, 'Not synced') : 'Not synced';

    const mergeEmailIntoList = (emailPatch) => {
        state.emails = state.emails.map((item) => item.id === emailPatch.id ? { ...item, ...emailPatch } : item);
        if (state.emailDetail?.id === emailPatch.id) {
            state.emailDetail = {
                ...state.emailDetail,
                ...emailPatch,
            };
        }
    };

    const loadSystemInfo = async (force = false) => {
        if (state.systemInfo && !force) return state.systemInfo;
        state.systemInfo = await request('/system/info');
        return state.systemInfo;
    };

    const loadSystemStats = async (force = false) => {
        if (state.systemStats && !force) return state.systemStats;
        state.systemStats = await request('/system/stats');
        return state.systemStats;
    };

    const loadProviderCatalog = async (force = false) => {
        if (state.providerCatalog.length && !force) return state.providerCatalog;
        const providers = await request('/mailboxes/providers/catalog');
        state.providerCatalog = Array.isArray(providers) ? providers : [];
        return state.providerCatalog;
    };

    const loadMailboxes = async () => {
        const mailboxes = await request('/mailboxes');
        state.mailboxes = Array.isArray(mailboxes) ? mailboxes : [];
        syncMailboxSelection();
        return state.mailboxes;
    };

    const loadMailboxStats = async (mailboxId, force = false) => {
        if (!mailboxId) return null;
        if (state.mailboxStats[mailboxId] && !force) {
            return state.mailboxStats[mailboxId];
        }
        const stats = await request(`/mailboxes/${mailboxId}/stats`);
        state.mailboxStats = {
            ...state.mailboxStats,
            [mailboxId]: stats,
        };
        return stats;
    };

    const loadAllMailboxStats = async (force = false) => {
        if (!state.mailboxes.length) {
            return {};
        }
        await Promise.all(state.mailboxes.map((mailbox) => loadMailboxStats(mailbox.id, force)));
        return state.mailboxStats;
    };

    const loadAdminStats = async (force = false) => {
        if (state.adminStats && !force) return state.adminStats;
        state.adminStats = await request('/admin/dashboard/stats');
        return state.adminStats;
    };

    const loadAdminUsers = async (force = false) => {
        if (state.adminUsers.length && !force) return state.adminUsers;
        const users = await request('/admin/users');
        state.adminUsers = Array.isArray(users) ? users : [];
        return state.adminUsers;
    };

    const loadAdminSettings = async (force = false) => {
        if (state.adminSettingsLoaded && !force) return state.adminSettings;
        state.adminSettings = {
            ...ADMIN_SETTINGS_DEFAULTS,
            ...(await request('/admin/settings')),
        };
        state.adminSettingsLoaded = true;
        return state.adminSettings;
    };

    const ensureAdminWorkspace = async (force = false) => {
        if (!isAdmin.value) return;
        await Promise.all([
            loadAdminStats(force),
            loadAdminUsers(force),
            loadAdminSettings(force),
        ]);
    };

    const loadRules = async (force = false) => {
        if (state.rules.length && !force) return state.rules;
        state.rulesLoading = true;
        try {
            const rules = await request('/rules');
            state.rules = Array.isArray(rules) ? rules : [];
            return state.rules;
        } catch (error) {
            showError(error, 'Operation failed');
            return [];
        } finally {
            state.rulesLoading = false;
        }
    };

    const loadConversationForEmail = async (emailId) => {
        if (!emailId) {
            state.emailConversation = [];
            state.emailConversationKey = '';
            return [];
        }
        state.conversationLoading = true;
        try {
            const payload = await request(`/emails/${emailId}/conversation`);
            state.emailConversation = Array.isArray(payload?.items) ? payload.items : [];
            state.emailConversationKey = payload?.thread_key || '';
            return state.emailConversation;
        } catch (error) {
            state.emailConversation = [];
            state.emailConversationKey = '';
            showError(error, 'Operation failed');
            return [];
        } finally {
            state.conversationLoading = false;
        }
    };
    const loadEmailDetail = async (emailId, { openReader = false, refreshStats = true } = {}) => {
        if (!emailId) {
            state.selectedEmailId = null;
            state.emailDetail = null;
            state.emailConversation = [];
            state.emailConversationKey = '';
            return null;
        }
        state.detailLoading = true;
        try {
            const email = await request(`/emails/${emailId}`);
            state.selectedEmailId = email.id;
            state.emailDetail = email;
            await loadConversationForEmail(email.id);
            mergeEmailIntoList({
                id: email.id,
                status: email.status,
                is_flagged: email.is_flagged,
                mailbox_id: email.mailbox_id,
                mailbox_name: email.mailbox_name,
                mailbox_email: email.mailbox_email,
                received_at: email.received_at,
                has_attachments: email.has_attachments,
            });
            if (email.mailbox_id) {
                state.selectedMailboxId = email.mailbox_id;
                if (refreshStats) {
                    await loadMailboxStats(email.mailbox_id, true);
                }
            }
            if (openReader && state.isMobile) {
                state.mobileReaderOpen = true;
            }
            return email;
        } finally {
            state.detailLoading = false;
        }
    };

    const reloadEmails = async ({ resetPage = false, preserveSelection = true, selectFirst = true, forceStats = false } = {}) => {
        if (!state.mailboxes.length) {
            state.emails = [];
            state.emailTotal = 0;
            state.selectedEmailId = null;
            state.selectedEmailIds = [];
            state.emailDetail = null;
            state.emailConversation = [];
            state.emailConversationKey = '';
            return;
        }
        if (resetPage) {
            state.emailPage = 1;
        }
        if (state.searchFlagged !== null && state.emailStatus === 'flagged') {
            state.emailStatus = 'all';
        }
        const retainedId = preserveSelection ? state.selectedEmailId : null;
        state.inboxLoading = true;
        try {
            if (forceStats) {
                await loadAllMailboxStats(true);
            }
            const params = new URLSearchParams();
            params.set('skip', String((state.emailPage - 1) * state.emailPageSize));
            params.set('limit', String(state.emailPageSize));
            if (state.emailScope !== EMAIL_SCOPE_ALL_ALIAS) {
                params.set('mailbox_id', String(Number(state.emailScope)));
                state.selectedMailboxId = Number(state.emailScope);
            }
            if (state.emailStatus && state.emailStatus !== 'all') {
                params.set('status', state.emailStatus);
            }
            if (state.emailQuery.trim()) {
                params.set('q', state.emailQuery.trim());
            }
            if (Array.isArray(state.searchFields) && state.searchFields.length && !state.searchFields.includes('all')) {
                params.set('search_fields', state.searchFields.join(','));
            }
            if (state.searchFlagged !== null) {
                params.set('is_flagged', String(Boolean(state.searchFlagged)));
            }
            if (state.searchHasAttachments !== null) {
                params.set('has_attachments', String(Boolean(state.searchHasAttachments)));
            }
            if (state.searchDateFrom) {
                params.set('date_from', state.searchDateFrom);
            }
            if (state.searchDateTo) {
                params.set('date_to', state.searchDateTo);
            }
            const payload = await request(`/emails?${params.toString()}`);
            state.emails = Array.isArray(payload?.items) ? payload.items : [];
            state.emailTotal = Number(payload?.total || state.emails.length || 0);
            state.selectedEmailIds = state.selectedEmailIds.filter((id) => state.emails.some((item) => item.id === id));

            const nextEmailId = retainedId && state.emails.some((item) => item.id === retainedId)
                ? retainedId
                : (selectFirst ? state.emails[0]?.id || null : null);

            if (nextEmailId) {
                await loadEmailDetail(nextEmailId, { openReader: false, refreshStats: false });
            } else {
                state.selectedEmailId = null;
                state.emailDetail = null;
                state.emailConversation = [];
                state.emailConversationKey = '';
                state.mobileReaderOpen = false;
            }
        } catch (error) {
            showError(error, 'Operation failed');
        } finally {
            state.inboxLoading = false;
        }
    };

    const bootstrapWorkspace = async (force = false) => {
        await Promise.all([
            loadSystemInfo(force),
            loadSystemStats(force),
            loadProviderCatalog(force),
            loadMailboxes(),
        ]);
        await loadAllMailboxStats(force);
        if (isAdmin.value) {
            await ensureAdminWorkspace(force);
        }
        if (!isAdmin.value && ADMIN_NAV.some((item) => item.key === state.currentView)) {
            state.currentView = 'overview';
        }
        if (!state.mailboxes.length) {
            state.currentView = 'accounts';
            return;
        }
        if (!VIEW_META[state.currentView]) {
            state.currentView = 'overview';
        }
        if (state.currentView === 'profile') {
            syncProfileForms();
        }
        if (state.currentView === 'inbox' || state.currentView === 'search') {
            await loadRules(force);
            await reloadEmails({ preserveSelection: true, selectFirst: true });
        }
    };

    const openView = async (view) => {
        state.userMenuOpen = false;
        if (view === 'admin' || view === 'users') {
            if (!isAdmin.value) return;
            await ensureAdminWorkspace(false);
        }
        if (view === 'profile') {
            syncProfileForms();
        }
        if ((view === 'inbox' || view === 'search') && !state.mailboxes.length) {
            state.currentView = 'accounts';
            state.mobileNavOpen = false;
            return;
        }
        state.currentView = view;
        state.mobileNavOpen = false;
        state.mobileReaderOpen = false;
        if (view === 'inbox' || view === 'search') {
            await loadRules(false);
            await reloadEmails({ preserveSelection: true, selectFirst: true });
        }
    };

    const openGlobalSearch = async (query = state.emailQuery) => {
        state.emailQuery = String(query || '').trim();
        state.emailScope = EMAIL_SCOPE_ALL;
        state.emailStatus = 'all';
        state.searchFields = ['all'];
        state.searchFlagged = null;
        state.searchHasAttachments = null;
        state.searchDateFrom = '';
        state.searchDateTo = '';
        state.currentView = 'search';
        state.mobileNavOpen = false;
        state.mobileReaderOpen = false;

        if (!state.mailboxes.length) {
            state.currentView = 'accounts';
            return;
        }

        await reloadEmails({ resetPage: true, preserveSelection: false });
    };

    const refreshCurrentView = async () => {
        state.refreshing = true;
        try {
            if (!state.user) return;
            await bootstrapWorkspace(true);
            if (state.currentView === 'users' || state.currentView === 'admin') {
                await ensureAdminWorkspace(true);
            }
            showSuccess('Completed.');
        } catch (error) {
            showError(error, 'Operation failed');
        } finally {
            state.refreshing = false;
        }
    };

    const submitLogin = async () => {
        state.authSubmitting = true;
        try {
            const payload = await request('/auth/login', {
                method: 'POST',
                body: JSON.stringify(state.authForms.login),
            });
            state.token = payload.access_token;
            state.user = payload.user;
            writeStoredToken(payload.access_token);
            syncProfileForms();
            await bootstrapWorkspace(true);
            showSuccess('Completed.');
        } catch (error) {
            showError(error, 'Operation failed');
        } finally {
            state.authSubmitting = false;
            state.booting = false;
        }
    };

    const submitRegister = async () => {
        if (!state.authForms.register.username.trim() || !state.authForms.register.email.trim()) {
            ElMessage.warning('Please review the required fields.');
            return;
        }
        if (state.authForms.register.password !== state.authForms.register.confirm_password) {
            ElMessage.warning('Please review the required fields.');
            return;
        }
        state.authSubmitting = true;
        try {
            const payload = await request('/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    username: state.authForms.register.username.trim(),
                    email: state.authForms.register.email.trim(),
                    full_name: state.authForms.register.full_name.trim() || null,
                    password: state.authForms.register.password,
                }),
            });
            state.token = payload.access_token;
            state.user = payload.user;
            writeStoredToken(payload.access_token);
            syncProfileForms();
            await bootstrapWorkspace(true);
            showSuccess('Completed.');
        } catch (error) {
            showError(error, 'Operation failed');
        } finally {
            state.authSubmitting = false;
            state.booting = false;
        }
    };

    const submitResetPassword = async () => {
        state.authSubmitting = true;
        try {
            await request('/auth/reset-password', {
                method: 'POST',
                body: JSON.stringify({
                    email: state.authForms.reset.email.trim(),
                    recovery_code: state.authForms.reset.recovery_code.trim(),
                    new_password: state.authForms.reset.new_password,
                }),
            });
            state.authMode = 'login';
            state.authForms.reset = defaultAuthForms().reset;
            showSuccess('Completed.');
        } catch (error) {
            showError(error, 'Operation failed');
        } finally {
            state.authSubmitting = false;
        }
    };

    const logout = () => {
        writeStoredToken('');
        state.token = '';
        state.user = null;
        state.currentView = 'overview';
        state.userMenuOpen = false;
        state.mailboxes = [];
        state.mailboxStats = {};
        state.emails = [];
        state.emailTotal = 0;
        state.selectedEmailId = null;
        state.selectedEmailIds = [];
        state.emailDetail = null;
        state.emailConversation = [];
        state.emailConversationKey = '';
        state.rules = [];
        state.mobileNavOpen = false;
        state.mobileRailOpen = false;
        state.mobileReaderOpen = false;
        state.authForms = defaultAuthForms();
        state.authMode = 'login';
        showSuccess('Completed.');
    };

    const openFolder = async ({ scope = state.emailScope, status = state.emailStatus } = {}) => {
        state.emailScope = normalizeEmailScope(scope);
        state.emailStatus = status || 'all';
        state.mobileRailOpen = false;
        state.mobileReaderOpen = false;
        state.selectedEmailIds = [];
        if (state.emailScope !== EMAIL_SCOPE_ALL) {
            state.selectedMailboxId = Number(state.emailScope);
        }
        await reloadEmails({ resetPage: true, preserveSelection: false });
    };

    const applyQuickStatus = async (status) => {
        await openFolder({ scope: state.emailScope, status });
    };

    const selectScope = async (scope) => {
        await openFolder({ scope, status: state.emailStatus });
    };

    const clearInboxQuery = async () => {
        state.emailQuery = '';
        state.searchFields = ['all'];
        state.searchFlagged = null;
        state.searchHasAttachments = null;
        state.searchDateFrom = '';
        state.searchDateTo = '';
        state.emailStatus = 'all';
        state.emailScope = EMAIL_SCOPE_ALL;
        state.selectedEmailIds = [];
        await reloadEmails({ resetPage: true, preserveSelection: false });
    };

    const handleEmailPageChange = async (page) => {
        state.emailPage = page;
        state.selectedEmailIds = [];
        await reloadEmails({ preserveSelection: false });
    };

    const handleEmailPageSizeChange = async (size) => {
        state.emailPageSize = size;
        state.emailPage = 1;
        state.selectedEmailIds = [];
        await reloadEmails({ preserveSelection: false });
    };

    const selectEmail = async (email, openReader = false) => {
        try {
            await loadEmailDetail(email.id, { openReader, refreshStats: true });
        } catch (error) {
            showError(error, 'Operation failed');
        }
    };

    const openSelectedEmailOnMobile = () => {
        if (!state.selectedEmailId && state.emails[0]) {
            void selectEmail(state.emails[0], true);
            return;
        }
        if (state.selectedEmailId) {
            state.mobileReaderOpen = true;
        }
    };

    const stepEmailSelection = async (direction) => {
        if (!state.emails.length) {
            return;
        }
        const currentIndex = state.emails.findIndex((item) => item.id === state.selectedEmailId);
        const nextIndex = currentIndex < 0 ? 0 : Math.min(state.emails.length - 1, Math.max(0, currentIndex + direction));
        const email = state.emails[nextIndex];
        if (email) {
            await selectEmail(email, state.isMobile && state.mobileReaderOpen);
        }
    };

    const isEmailSelected = (emailId) => state.selectedEmailIds.includes(emailId);

    const toggleEmailSelection = (emailId) => {
        if (isEmailSelected(emailId)) {
            state.selectedEmailIds = state.selectedEmailIds.filter((id) => id !== emailId);
            return;
        }
        state.selectedEmailIds = [...state.selectedEmailIds, emailId];
    };

    const clearEmailSelection = () => {
        state.selectedEmailIds = [];
    };

    const togglePageSelection = () => {
        if (isPageSelectionFull.value) {
            clearEmailSelection();
            return;
        }
        const merged = new Set([...state.selectedEmailIds, ...state.emails.map((item) => item.id)]);
        state.selectedEmailIds = Array.from(merged);
    };

    const bindEmailSearchInput = (element) => {
        emailSearchInput.value = element;
    };

    const focusInboxSearch = async () => {
        if (state.currentView !== 'inbox') {
            await openView('inbox');
        }
        await nextTick();
        emailSearchInput.value?.focus?.();
    };

    const toggleReadState = async (email) => {
        const shouldRead = email.status !== 'read';
        try {
            await request(`/emails/${email.id}/${shouldRead ? 'read' : 'unread'}`, { method: 'POST' });
            await loadMailboxStats(email.mailbox_id, true);
            await loadSystemStats(true);
            await reloadEmails({ preserveSelection: true, selectFirst: true, forceStats: true });
            showSuccess('Completed.');
        } catch (error) {
            showError(error, 'Operation failed');
        }
    };

    const toggleStarState = async (email) => {
        try {
            await request(`/emails/${email.id}/star`, { method: 'POST' });
            await loadMailboxStats(email.mailbox_id, true);
            await reloadEmails({ preserveSelection: true, selectFirst: true, forceStats: true });
            showSuccess('Completed.');
        } catch (error) {
            showError(error, 'Operation failed');
        }
    };

    const archiveEmail = async (email) => {
        try {
            await request(`/emails/${email.id}/archive`, { method: 'POST' });
            await loadMailboxStats(email.mailbox_id, true);
            await loadSystemStats(true);
            clearEmailSelection();
            await reloadEmails({ preserveSelection: false, selectFirst: true, forceStats: true });
            showSuccess('Completed.');
        } catch (error) {
            showError(error, 'Operation failed');
        }
    };

    const bulkArchiveSelected = async () => {
        const emails = ensureSelectedEmails();
        if (!emails) {
            return;
        }
        try {
            for (const email of emails) {
                await request(`/emails/${email.id}/archive`, { method: 'POST' });
            }
            clearEmailSelection();
            await loadAllMailboxStats(true);
            await loadSystemStats(true);
            await reloadEmails({ preserveSelection: false, selectFirst: true, forceStats: true });
            showSuccess('Completed.');
        } catch (error) {
            showError(error, 'Operation failed');
        }
    };

    const unarchiveEmail = async (email) => {
        try {
            await request(`/emails/${email.id}/unarchive`, { method: 'POST' });
            await loadMailboxStats(email.mailbox_id, true);
            await loadSystemStats(true);
            clearEmailSelection();
            await reloadEmails({ preserveSelection: false, selectFirst: true, forceStats: true });
            showSuccess('Completed.');
        } catch (error) {
            showError(error, 'Operation failed');
        }
    };

    const ensureSelectedEmails = () => {
        if (!selectedEmails.value.length) {
            ElMessage.warning('Please review the required fields.');
            return null;
        }
        return selectedEmails.value;
    };

    const bulkMarkRead = async (markRead = true) => {
        const emails = ensureSelectedEmails();
        if (!emails) {
            return;
        }
        try {
            for (const email of emails) {
                await request(`/emails/${email.id}/${markRead ? 'read' : 'unread'}`, { method: 'POST' });
            }
            clearEmailSelection();
            await loadAllMailboxStats(true);
            await loadSystemStats(true);
            await reloadEmails({ preserveSelection: false, selectFirst: true, forceStats: true });
            showSuccess('Completed.');
        } catch (error) {
            showError(error, 'Operation failed');
        }
    };

    const deleteEmail = async (email) => {
        try {
            await ElMessageBox.confirm('Please confirm this action.', 'Confirm', { type: 'warning' });
            await request(`/emails/${email.id}`, { method: 'DELETE' });
            await loadMailboxStats(email.mailbox_id, true);
            await loadSystemStats(true);
            clearEmailSelection();
            await reloadEmails({ preserveSelection: false, selectFirst: true, forceStats: true });
            showSuccess('Completed.');
        } catch (error) {
            if (error !== 'cancel') {
                showError(error, 'Operation failed');
            }
        }
    };

    const bulkDeleteSelected = async () => {
        const emails = ensureSelectedEmails();
        if (!emails) {
            return;
        }
        try {
            await ElMessageBox.confirm('Please confirm this action.', 'Confirm', { type: 'warning' });
            for (const email of emails) {
                await request(`/emails/${email.id}`, { method: 'DELETE' });
            }
            clearEmailSelection();
            await loadAllMailboxStats(true);
            await loadSystemStats(true);
            await reloadEmails({ preserveSelection: false, selectFirst: true, forceStats: true });
            showSuccess('Completed.');
        } catch (error) {
            if (error !== 'cancel') {
                showError(error, 'Operation failed');
            }
        }
    };

    const restoreEmail = async (email) => {
        try {
            await request(`/emails/${email.id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    is_deleted: false,
                }),
            });
            await loadMailboxStats(email.mailbox_id, true);
            await loadSystemStats(true);
            clearEmailSelection();
            await reloadEmails({ preserveSelection: false, selectFirst: true, forceStats: true });
            showSuccess('Completed.');
        } catch (error) {
            showError(error, 'Operation failed');
        }
    };

    const bulkRestoreSelected = async () => {
        const emails = ensureSelectedEmails();
        if (!emails) {
            return;
        }
        try {
            for (const email of emails) {
                await request(`/emails/${email.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        is_deleted: false,
                    }),
                });
            }
            clearEmailSelection();
            await loadAllMailboxStats(true);
            await loadSystemStats(true);
            await reloadEmails({ preserveSelection: false, selectFirst: true, forceStats: true });
            showSuccess('Completed.');
        } catch (error) {
            showError(error, 'Operation failed');
        }
    };

    const purgeEmail = async (email) => {
        try {
            await ElMessageBox.confirm('Please confirm this action.', 'Confirm', { type: 'warning' });
            await request(`/emails/${email.id}?permanent=true`, { method: 'DELETE' });
            await loadMailboxStats(email.mailbox_id, true);
            await loadSystemStats(true);
            clearEmailSelection();
            await reloadEmails({ preserveSelection: false, selectFirst: true, forceStats: true });
            showSuccess('Completed.');
        } catch (error) {
            if (error !== 'cancel') {
                showError(error, 'Operation failed');
            }
        }
    };

    const bulkPurgeSelected = async () => {
        const emails = ensureSelectedEmails();
        if (!emails) {
            return;
        }
        try {
            await ElMessageBox.confirm('Please confirm this action.', 'Confirm', { type: 'warning' });
            for (const email of emails) {
                await request(`/emails/${email.id}?permanent=true`, { method: 'DELETE' });
            }
            clearEmailSelection();
            await loadAllMailboxStats(true);
            await loadSystemStats(true);
            await reloadEmails({ preserveSelection: false, selectFirst: true, forceStats: true });
            showSuccess('Completed.');
        } catch (error) {
            if (error !== 'cancel') {
                showError(error, 'Operation failed');
            }
        }
    };

    const saveRule = async ({ ruleId = null, payload }) => {
        state.rulesSaving = true;
        try {
            if (ruleId) {
                await request(`/rules/${ruleId}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload),
                });
            } else {
                await request('/rules', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
            }
            await loadRules(true);
            showSuccess('Completed.');
        } catch (error) {
            showError(error, 'Operation failed');
            throw error;
        } finally {
            state.rulesSaving = false;
        }
    };

    const deleteRuleEntry = async (rule) => {
        try {
            await ElMessageBox.confirm('Please confirm this action.', 'Confirm', { type: 'warning' });
            await request(`/rules/${rule.id}`, { method: 'DELETE' });
            await loadRules(true);
            showSuccess('Completed.');
        } catch (error) {
            if (error !== 'cancel') {
                showError(error, 'Operation failed');
                throw error;
            }
        }
    };

    const moveEmailsToFolder = async (emailIds, targetStatus) => {
        const ids = Array.from(new Set((emailIds || []).map((item) => Number(item)).filter(Boolean)));
        if (!ids.length) {
            ElMessage.warning('Please review the required fields.');
            return;
        }
        const resolveEmail = (id) => state.emails.find((item) => item.id === id)
            || state.emailConversation.find((item) => item.id === id)
            || (state.emailDetail?.id === id ? state.emailDetail : null);

        try {
            for (const id of ids) {
                const email = resolveEmail(id);
                if (targetStatus === 'archived') {
                    await request(`/emails/${id}/archive`, { method: 'POST' });
                } else if (targetStatus === 'deleted') {
                    await request(`/emails/${id}`, { method: 'DELETE' });
                } else if (targetStatus === 'all') {
                    if (email?.status === 'deleted') {
                        await request(`/emails/${id}`, {
                            method: 'PUT',
                            body: JSON.stringify({ is_deleted: false }),
                        });
                    } else {
                        await request(`/emails/${id}/unarchive`, { method: 'POST' });
                    }
                }
            }
            clearEmailSelection();
            await loadAllMailboxStats(true);
            await loadSystemStats(true);
            await reloadEmails({ preserveSelection: false, selectFirst: true, forceStats: true });
            showSuccess('Completed.');
        } catch (error) {
            showError(error, 'Operation failed');
        }
    };

    const openCompose = (preset = null) => {
        resetComposeForm();
        state.composeMode = preset?.mode || 'new';
        if (preset) {
            state.composeForm = {
                ...state.composeForm,
                ...preset,
            };
        }
        if (!state.composeForm.mailbox_id) {
            state.composeForm.mailbox_id = currentScopeMailbox.value?.id || state.mailboxes[0]?.id || null;
        }
        state.composeOpen = true;
    };

    const replyToEmail = (email) => {
        const target = email.reply_to || email.from_address;
        const replySubject = email.subject?.toLowerCase().startsWith('re:') ? email.subject : `Re: ${email.subject || '(闂傚倸鍊搁崐鎼佸磹閹间礁纾归柟闂寸绾惧綊鏌熼梻瀵割槮缁惧墽鎳撻—鍐偓锝庝簼閹癸綁鏌ｉ鐐搭棞闁靛棙甯掗～婵嬫晲閸涱剙顥氬┑掳鍊楁慨鐑藉磻閻愮儤鍋嬮柣妯荤湽閳ь兛绶氬鎾閳╁啯鐝栭梻渚€鈧偛鑻晶鎾煙椤斿吋鍋ユい銏″哺閸┾偓妞ゆ帒瀚拑鐔兼煥濠靛棙鍟掗柡鍐ㄧ墕閻掑灚銇勯幒鎴濐仾闁稿顑呴埞鎴︽偐閸欏鎮欓梺娲诲幗椤ㄥ﹪鎮￠锕€鐐婇柕濠忓閿涙洟姊虹粙娆惧剱闁规悂绠栭獮澶愬箻椤旇偐顦板銈嗗笒閸嬪棗危椤掍胶绡€闁汇垽娼ф禒鈺呮倶韫囨梻鎳勭紒缁樼洴閸┾偓妞ゆ帒鍊甸崑鎾舵喆閸曨剛顦ㄩ梺鎼炲妼濞硷繝鎮伴鍢夌喖鎳栭埡鍐跨床婵犳鍠楅〃鍛涘▎鎾嶅宕奸悢铏圭槇闂佹眹鍨藉褎绂掗敃鍌涚厱闁靛鍎抽崺锝夋煙椤旀儳鍘撮柡浣稿暣瀹曟帒顫濇鏍ф暩闂傚倸鍊风欢锟犲礈濞嗘垹鐭撻柣銏㈩焾閻?'}`;
        const quote = [
            '',
            '',
            '--- 闂傚倸鍊搁崐鎼佸磹閹间礁纾归柟闂寸绾惧綊鏌熼梻瀵割槮缁惧墽鎳撻—鍐偓锝庝簼閹癸綁鏌ｉ鐐搭棞闁靛棙甯掗～婵嬫晲閸涱剙顥氬┑掳鍊楁慨鐑藉磻濞戔懞鍥偨缁嬫寧鐎梺鐟板⒔缁垶宕戦幇顓滀簻闁归偊鍠栭弸搴∶瑰鍫㈢暫闁哄被鍔戝鎾倷濞村浜鹃柟闂寸劍閸婂嘲鈹戦悩鎻掓殧濞存粍绮撻弻鐔煎传閸曨剦妫炴繛瀛樼矊婢х晫妲愰幘瀛樺闁荤喐婢橀～宥咁渻閵堝啫濡奸柨鏇ㄤ邯閹即顢氶埀顒€顕ｆ禒瀣垫晣闁绘劖顔栭崯鍥ㄤ繆閻愵亜鈧牠骞愰悙顒佸弿閻庨潧鎲￠弳婊堟煏婵炑冩噽閿涙繈姊虹粙鎸庢拱婵ǜ鍔嶉悧搴ㄦ⒒娴ｈ櫣甯涙い銊ョ墛缁绘盯鍩€椤掑倵鍋撳▓鍨灈妞ゎ厾鍏橀獮鍐閵堝棗浜楅柟鑹版彧缂嶅棝宕ョ€ｎ偂绻嗛柣鎰典簻閳ь剚鐗曢～蹇旂節濮橆剛鍘遍梺鍓插亖閸庡崬效閸欏浜滈柟鎯у船閻忣亪鏌嶉柨瀣仼缂佽鲸鎸婚幏鍛叏閹搭厺绨界紒顕呭弮閸┾剝鎷呴崣澶嬫澑婵＄偑鍊栭弻銊╁箹椤愶箑鐒垫い鎺嶈兌缁犳牕菐閸パ嶈含闁诡喚鏅划娆戞崉椤垶效濠碉紕鍋戦崐鏍偋濡も偓椤繈濡搁埡鍌氬壍闂佸憡娲﹂崹閬嶅煕閹寸姷纾奸悗锝庡亜椤曟粍绻濋埀顒勫箥椤斿墽锛滃銈嗘閸嬫劙鎮樻潏鈺冪＜妞ゆ洖鎳庡顕€鏌涢妸鈺冪暫妤犵偛娲﹂幏鍛存偡閹殿喗袙?---',
            `闂傚倸鍊搁崐鎼佸磹閹间礁纾归柟闂寸绾惧綊鏌熼梻瀵割槮缁惧墽鎳撻—鍐偓锝庝簼閹癸綁鏌ｉ鐐搭棞闁靛棙甯掗～婵嬫晲閸涱剙顥氬┑掳鍊楁慨鐑藉磻濞戔懞鍥偨缁嬫寧鐎梺鐟板⒔缁垶宕戦幇鐗堢厱闁归偊鍨扮槐锕傛煟閵忕媭鐓兼慨濠勭帛閹峰懘鎮烽柇锕€娈濇繝鐢靛仜瀵爼鎮ч悩鑼殾闁圭増婢樼粻鐟懊归敐鍥剁劸闁诲寒鍙冨铏圭矙鐠恒劎浼囬梺绋款儑閸嬨倝骞冮敓鐘插嵆闁靛骏绱曢崢鐢告⒒娓氬洤寮跨紒鐘冲灴閻涱喖顫滈埀顒勫蓟閺囥垹閱囬柣鏃傤焾閸炲姊洪崫鍕効缂佽鲸娲熼崺鈧い鎺戯功缁夐潧霉濠婂簼閭€规洩缍佸畷鐔碱敍濞戞艾骞愰梺璇茬箳閸嬬喖宕戦幘鍓佺焼濠㈣泛鐬肩壕濂告煟濡櫣锛嶆繛鍙夋綑閳规垿鏁嶉崟顒傚姽濡炪倧闄勯幐鎶藉蓟閵娿儮妲堟慨姗嗗墯閻庤顪? ${formatSenderLine(email.from_name, email.from_address)}`,
            `闂傚倸鍊搁崐鎼佸磹閹间礁纾归柟闂寸绾惧綊鏌熼梻瀵割槮缁惧墽鎳撻—鍐偓锝庝簼閹癸綁鏌ｉ鐐搭棞闁靛棙甯掗～婵嬫晲閸涱剙顥氬┑掳鍊楁慨鐑藉磻濞戔懞鍥偨缁嬫寧鐎梺鐟板⒔缁垶宕戦幇鐗堢厱闁归偊鍨扮槐锕傛煟閵忕媭鐓兼慨濠勭帛閹峰懘鎮烽柇锕€娈濇繝鐢靛仜瀵爼鎮ч悩鑼殾闁圭増婢樼粻鐟懊归敐鍥剁劸闁诲寒鍙冨铏圭矙鐠恒劎浼囬梺绋款儑閸嬨倝骞冮敓鐘插嵆闁绘ê鍟块弸鎴︽煙閸忚偐鏆橀柛鏂匡躬閸┾偓妞ゆ巻鍋撻柛鐔告綑閻ｇ兘濡歌閸嬫挸鈽夊▍顓т邯閸┾偓妞ゆ巻鍋撴繛纭风節瀵鈽夐埗鈹惧亾閿曞倸绠ｆ繝闈涙噽閹稿鈹戦悙鑼憼缂侇喖绉堕崚鎺楀箻鐠囪尪鎽曢梺缁樻煥閹诧紕绱為崶顒佺厱闁圭偓顨呴幆娆撳箣閻樼數锛滅紓鍌欓檷閸ㄥ綊鐛弽顓熺厽闁哄诞浣镐划閻庢鍠涢褔鍩ユ径鎰潊闁绘ɑ鍓氬Λ鐔兼⒑閼姐倕校濞存粈绮欏畷婊堟焼瀹ュ棙娅滈梺鍛婅壘閸熷潡鏌婇敐鍛殾闁诡垶鍋婂顏堟⒒婵犲骸澧婚柛鎾跺枛瀵鎮㈢喊杈ㄦ櫓闂佷紮绲介張顒勫闯閺夎鏃堟偐闂堟稐娌梺鍦嚀濞差參鎮伴鈧獮鎺懳旈埀顒勭嵁閵忊€茬箚闁绘劖娼欓崝銈嗐亜閵夛箑鍝烘慨濠勭帛閹峰懐绮欏▎鐐棏闂備胶绮幐鎼佹偋閹惧磭鏆﹂柟鍓佺摂閺佸﹦鐥幏灞煎惈闁? ${formatDateTime(email.sent_at || email.received_at)}`,
            `婵犵數濮烽弫鍛婃叏閻戣棄鏋侀柛娑橈攻閸欏繘鏌ｉ幋锝嗩棄闁哄绶氶弻鐔兼⒒鐎靛壊妲紒鐐劤椤兘寮婚敐澶婄疀妞ゆ帊鐒﹂崕鎾绘⒑閹肩偛濡奸柛濠傛健瀵鈽夐姀鈺傛櫇闂佹寧绻傚Λ娑⑺囬妷褏纾藉ù锝呮惈灏忛梺鍛婎殕婵炲﹤顕ｆ繝姘亜闁稿繐鐨烽幏鑽ょ磼閻愵剙鍔ゆい鎴炲姍瀹曨剝銇愰幒鎾嫼闂備緡鍋嗛崑娑㈡嚐椤栨稒娅犻柛鎾楀懐锛滈梺缁橆焾濞呮洖鐣风仦缁㈡闁绘劖褰冮弳娆愩亜椤撴粌濮傜€规洜鍠栭、妤呭焵椤掆偓椤曪綁宕稿Δ浣叉嫼缂佺虎鍘奸幊搴ㄦ倿娴犲鐓曢柡鍌涘濠€鎵磼? ${email.subject || '(闂傚倸鍊搁崐鎼佸磹閹间礁纾归柟闂寸绾惧綊鏌熼梻瀵割槮缁惧墽鎳撻—鍐偓锝庝簼閹癸綁鏌ｉ鐐搭棞闁靛棙甯掗～婵嬫晲閸涱剙顥氬┑掳鍊楁慨鐑藉磻閻愮儤鍋嬮柣妯荤湽閳ь兛绶氬鎾閳╁啯鐝栭梻渚€鈧偛鑻晶鎾煙椤斿吋鍋ユい銏″哺閸┾偓妞ゆ帒瀚拑鐔兼煥濠靛棙鍟掗柡鍐ㄧ墕閻掑灚銇勯幒鎴濐仾闁稿顑呴埞鎴︽偐閸欏鎮欓梺娲诲幗椤ㄥ﹪鎮￠锕€鐐婇柕濠忓閿涙洟姊虹粙娆惧剱闁规悂绠栭獮澶愬箻椤旇偐顦板銈嗗笒閸嬪棗危椤掍胶绡€闁汇垽娼ф禒鈺呮倶韫囨梻鎳勭紒缁樼洴閸┾偓妞ゆ帒鍊甸崑鎾舵喆閸曨剛顦ㄩ梺鎼炲妼濞硷繝鎮伴鍢夌喖鎳栭埡鍐跨床婵犳鍠楅〃鍛涘▎鎾嶅宕奸悢铏圭槇闂佹眹鍨藉褎绂掗敃鍌涚厱闁靛鍎抽崺锝夋煙椤旀儳鍘撮柡浣稿暣瀹曟帒顫濇鏍ф暩闂傚倸鍊风欢锟犲礈濞嗘垹鐭撻柣銏㈩焾閻?'}`,
            '',
            email.text_content || '',
        ].join('\n');

        openCompose({
            mode: 'reply',
            mailbox_id: email.mailbox_id,
            to: target,
            subject: replySubject,
            body: quote,
            is_html: false,
        });
    };

    const bindComposeFileInput = (element) => {
        composeFileInput.value = element;
    };

    const triggerComposeFilePicker = () => {
        composeFileInput.value?.click?.();
    };

    const handleComposeFiles = async (event) => {
        const files = Array.from(event?.target?.files || []);
        if (!files.length) {
            return;
        }
        try {
            const attachments = await Promise.all(files.map((file) => fileToAttachmentPayload(file)));
            state.composeForm.attachments = [
                ...state.composeForm.attachments,
                ...attachments.filter((attachment) => !state.composeForm.attachments.some((existing) => existing.id === attachment.id)),
            ];
        } catch (error) {
            showError(error, 'Operation failed');
        } finally {
            if (event?.target) {
                event.target.value = '';
            }
        }
    };

    const removeComposeAttachment = (attachmentId) => {
        state.composeForm.attachments = state.composeForm.attachments.filter((item) => item.id !== attachmentId);
    };

    const submitCompose = async () => {
        const recipients = parseRecipients(state.composeForm.to);
        if (!state.composeForm.mailbox_id) {
            ElMessage.warning('Please review the required fields.');
            return;
        }
        if (!recipients.length) {
            ElMessage.warning('Please review the required fields.');
            return;
        }

        state.composeSending = true;
        const mailboxId = Number(state.composeForm.mailbox_id);
        try {
            await request('/emails/send', {
                method: 'POST',
                body: JSON.stringify({
                    mailbox_id: mailboxId,
                    to: recipients,
                    cc: parseRecipients(state.composeForm.cc),
                    bcc: parseRecipients(state.composeForm.bcc),
                    subject: state.composeForm.subject.trim(),
                    body: state.composeForm.body,
                    is_html: Boolean(state.composeForm.is_html),
                    attachments: state.composeForm.attachments.map(({ id, ...attachment }) => attachment),
                }),
            });
            state.composeOpen = false;
            resetComposeForm();
            await loadMailboxStats(mailboxId, true);
            if (state.currentView === 'inbox') {
                await reloadEmails({ preserveSelection: true, selectFirst: true, forceStats: true });
            }
            showSuccess('Completed.');
        } catch (error) {
            showError(error, 'Operation failed');
        } finally {
            state.composeSending = false;
        }
    };

    const getProviderById = (providerId) => state.providerCatalog.find((item) => item.id === providerId) || null;

    const applyProviderDefaults = (provider) => {
        const defaults = provider?.manual_defaults || {};
        state.mailboxForm.imap_server = defaults.imap_server || state.mailboxForm.imap_server;
        state.mailboxForm.imap_port = Number(defaults.imap_port || state.mailboxForm.imap_port || 993);
        state.mailboxForm.imap_use_ssl = defaults.imap_use_ssl ?? state.mailboxForm.imap_use_ssl;
        state.mailboxForm.smtp_server = defaults.smtp_server || state.mailboxForm.smtp_server;
        state.mailboxForm.smtp_port = Number(defaults.smtp_port || state.mailboxForm.smtp_port || 587);
        state.mailboxForm.smtp_use_ssl = defaults.smtp_use_ssl ?? state.mailboxForm.smtp_use_ssl;
        state.mailboxForm.smtp_use_tls = defaults.smtp_use_tls ?? state.mailboxForm.smtp_use_tls;
        if (state.mailboxForm.email) {
            state.mailboxForm.imap_username = state.mailboxForm.email;
            state.mailboxForm.smtp_username = state.mailboxForm.email;
        }
    };

    const detectMailboxProvider = async (autoApply = false) => {
        const email = state.mailboxForm.email.trim().toLowerCase();
        if (!email || !email.includes('@')) {
            state.detectedProvider = null;
            return null;
        }
        state.mailboxDetecting = true;
        try {
            const payload = await request(`/mailboxes/providers/detect?email=${encodeURIComponent(email)}`);
            state.detectedProvider = payload;
            if (autoApply && payload) {
                state.mailboxForm.provider_template = payload.id;
                applyProviderDefaults(payload);
                state.providerSelectionMode = payload.matched ? 'detected' : 'manual';
                if (!state.editingMailboxId) {
                    const shouldUseOAuth = payload.recommended_auth_mode === 'oauth' && payload.oauth?.web_auth_available;
                    state.mailboxForm.use_oauth = Boolean(shouldUseOAuth);
                    state.mailboxForm.oauth_provider = shouldUseOAuth ? payload.oauth.provider : '';
                }
            }
            return payload;
        } catch (error) {
            showError(error, 'Operation failed');
            return null;
        } finally {
            state.mailboxDetecting = false;
        }
    };

    const handleMailboxEmailInput = () => {
        if (providerDetectTimer) {
            clearTimeout(providerDetectTimer);
        }
        providerDetectTimer = window.setTimeout(() => {
            void detectMailboxProvider(true);
        }, 260);
    };

    const handleProviderTemplateChange = () => {
        const provider = getProviderById(state.mailboxForm.provider_template);
        if (!provider) {
            return;
        }
        state.detectedProvider = provider;
        state.providerSelectionMode = 'manual';
        applyProviderDefaults(provider);
        if (!state.editingMailboxId) {
            const shouldUseOAuth = provider.recommended_auth_mode === 'oauth' && provider.oauth?.web_auth_available;
            state.mailboxForm.use_oauth = Boolean(shouldUseOAuth);
            state.mailboxForm.oauth_provider = shouldUseOAuth ? provider.oauth.provider : '';
        }
    };

    const applyCurrentProviderDefaults = () => {
        if (activeProvider.value) {
            applyProviderDefaults(activeProvider.value);
        }
    };

    const openMailboxDrawer = async (mode = 'create', mailbox = null) => {
        state.mailboxFormMode = mode;
        state.editingMailboxId = mailbox?.id || null;
        state.oauthStatus = 'OAuth window is blocked. Allow popups and try again.';
        state.detectedProvider = null;
        state.providerSelectionMode = mode === 'edit' ? 'manual' : 'auto';
        resetMailboxForm(mailbox);
        state.mailboxDrawerOpen = true;
        await nextTick();
        if (state.mailboxForm.email) {
            await detectMailboxProvider(mode !== 'edit');
        }
    };

    const startMailboxOnboarding = async (provider = null) => {
        await openMailboxDrawer('create');
        if (provider) {
            state.mailboxForm.provider_template = provider.id;
            state.detectedProvider = provider;
            applyProviderDefaults(provider);
            const shouldUseOAuth = provider.recommended_auth_mode === 'oauth' && provider.oauth?.web_auth_available;
            state.mailboxForm.use_oauth = Boolean(shouldUseOAuth);
            state.mailboxForm.oauth_provider = shouldUseOAuth ? provider.oauth.provider : '';
        }
    };

    const startProviderOAuth = async () => {
        const provider = activeProvider.value;
        const email = state.mailboxForm.email.trim().toLowerCase();
        if (!email) {
            ElMessage.warning('Please review the required fields.');
            return;
        }
        if (!provider?.oauth?.start_endpoint) {
            ElMessage.warning('Please review the required fields.');
            return;
        }
        try {
            const params = new URLSearchParams({ email });
            if (state.editingMailboxId) {
                params.set('mailbox_id', String(state.editingMailboxId));
            }
            state.oauthStatus = provider.label + ' authorization window opened.';
            const payload = await request(`${provider.oauth.start_endpoint}?${params.toString()}`);
            const popup = window.open(payload.authorization_url, `jmail-${payload.provider}-oauth`, 'width=760,height=820,resizable=yes,scrollbars=yes');
            if (!popup) {
                state.oauthStatus = 'OAuth window is blocked. Allow popups and try again.';
                ElMessage.warning('Please review the required fields.');
                return;
            }
            state.oauthStatus = provider.label + ' authorization window opened.';
        } catch (error) {
            state.oauthStatus = error?.message || 'OAuth start failed';
            showError(error, 'Operation failed');
        }
    };

    const submitMailboxForm = async () => {
        const payload = {
            email: state.mailboxForm.email.trim().toLowerCase(),
            name: state.mailboxForm.name.trim() || null,
            imap_server: state.mailboxForm.imap_server.trim(),
            imap_port: Number(state.mailboxForm.imap_port),
            imap_use_ssl: Boolean(state.mailboxForm.imap_use_ssl),
            imap_username: state.mailboxForm.imap_username.trim(),
            imap_password: state.mailboxForm.imap_password || null,
            smtp_server: state.mailboxForm.smtp_server.trim(),
            smtp_port: Number(state.mailboxForm.smtp_port),
            smtp_use_ssl: Boolean(state.mailboxForm.smtp_use_ssl),
            smtp_use_tls: Boolean(state.mailboxForm.smtp_use_tls),
            smtp_username: state.mailboxForm.smtp_username.trim(),
            smtp_password: state.mailboxForm.smtp_password || null,
            fetch_interval: Number(state.mailboxForm.fetch_interval),
            use_oauth: Boolean(state.mailboxForm.use_oauth),
            oauth_provider: state.mailboxForm.oauth_provider || null,
        };

        if (!payload.email || !payload.imap_server || !payload.smtp_server || !payload.imap_username || !payload.smtp_username) {
            ElMessage.warning('Please review the required fields.');
            return;
        }
        if (state.mailboxForm.use_oauth && state.mailboxFormMode !== 'edit') {
            ElMessage.warning('Please review the required fields.');
            return;
        }
        if (state.mailboxFormMode !== 'edit' && !payload.use_oauth && (!payload.imap_password || !payload.smtp_password)) {
            ElMessage.warning('Please review the required fields.');
            return;
        }

        state.mailboxSaving = true;
        try {
            if (state.mailboxFormMode === 'edit' && state.editingMailboxId) {
                await request(`/mailboxes/${state.editingMailboxId}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        ...payload,
                        status: state.mailboxForm.status,
                    }),
                });
            } else {
                payload.use_oauth = false;
                await request('/mailboxes', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
            }
            state.mailboxDrawerOpen = false;
            await loadMailboxes();
            await loadAllMailboxStats(true);
            await loadSystemStats(true);
            if (state.currentView === 'inbox') {
                await reloadEmails({ preserveSelection: true, selectFirst: true, forceStats: true });
            }
            showSuccess('Completed.');
        } catch (error) {
            showError(error, 'Operation failed');
        } finally {
            state.mailboxSaving = false;
        }
    };

    const syncMailbox = async (mailbox) => {
        state.syncing = true;
        try {
            await request(`/mailboxes/${mailbox.id}/fetch`, { method: 'POST' });
            await loadMailboxes();
            await loadMailboxStats(mailbox.id, true);
            await loadSystemStats(true);
            if (state.currentView === 'inbox') {
                await reloadEmails({ preserveSelection: true, selectFirst: true, forceStats: true });
            }
            showSuccess('Completed.');
        } catch (error) {
            showError(error, 'Operation failed');
        } finally {
            state.syncing = false;
        }
    };

    const syncCurrentScope = async () => {
        if (!state.mailboxes.length) {
            ElMessage.warning('Please review the required fields.');
            return;
        }
        state.syncing = true;
        try {
            const mailboxIds = state.emailScope === EMAIL_SCOPE_ALL ? state.mailboxes.map((item) => item.id) : [Number(state.emailScope)];
            for (const mailboxId of mailboxIds) {
                await request(`/mailboxes/${mailboxId}/fetch`, { method: 'POST' });
            }
            await loadMailboxes();
            await loadAllMailboxStats(true);
            await loadSystemStats(true);
            if (state.currentView === 'inbox') {
                await reloadEmails({ preserveSelection: true, selectFirst: true, forceStats: true });
            }
            showSuccess('Completed.');
        } catch (error) {
            showError(error, 'Operation failed');
        } finally {
            state.syncing = false;
        }
    };

    const openMailboxInbox = async (mailbox) => {
        state.currentView = 'inbox';
        await selectScope(mailbox.id);
    };

    const deleteMailbox = async (mailbox) => {
        try {
            await ElMessageBox.confirm('Please confirm this action.', 'Confirm', { type: 'warning' });
            await request(`/mailboxes/${mailbox.id}`, { method: 'DELETE' });
            await loadMailboxes();
            await loadAllMailboxStats(true);
            await loadSystemStats(true);
            if (state.currentView === 'inbox') {
                await reloadEmails({ preserveSelection: false, selectFirst: true, forceStats: true });
            }
            showSuccess('Completed.');
        } catch (error) {
            if (error !== 'cancel') {
                showError(error, 'Operation failed');
            }
        }
    };

    const submitAdminSettings = async () => {
        state.adminSaving = true;
        try {
            const payload = {
                allow_registration: state.adminSettings.allow_registration,
                default_max_mailboxes_per_user: Number(state.adminSettings.default_max_mailboxes_per_user),
                default_fetch_interval: Number(state.adminSettings.default_fetch_interval),
                default_storage_quota_bytes: Number(state.adminSettings.default_storage_quota_bytes),
            };
            state.adminSettings = await request('/admin/settings', {
                method: 'PUT',
                body: JSON.stringify(payload),
            });
            state.adminSettings = {
                ...ADMIN_SETTINGS_DEFAULTS,
                ...state.adminSettings,
            };
            state.adminSettingsLoaded = true;
            showSuccess('Completed.');
        } catch (error) {
            showError(error, 'Operation failed');
        } finally {
            state.adminSaving = false;
        }
    };

    const openCreateUserDrawer = () => {
        state.createUserForm = defaultCreateUserForm();
        state.createUserDrawerOpen = true;
    };

    const submitCreateUser = async () => {
        state.userCreating = true;
        try {
            await request(`/users?max_mailboxes=${Number(state.createUserForm.max_mailboxes)}`, {
                method: 'POST',
                body: JSON.stringify({
                    username: state.createUserForm.username.trim(),
                    email: state.createUserForm.email.trim(),
                    full_name: state.createUserForm.full_name.trim() || null,
                    password: state.createUserForm.password,
                }),
            });
            state.createUserDrawerOpen = false;
            await ensureAdminWorkspace(true);
            showSuccess('Completed.');
        } catch (error) {
            showError(error, 'Operation failed');
        } finally {
            state.userCreating = false;
        }
    };

    const generateRecoveryCode = async (user) => {
        try {
            await request('/admin/users/' + user.id + '/recovery-code', { method: 'POST' });
            await ElMessageBox.alert('Recovery code generated.', 'Notice', { confirmButtonText: 'Close' });
        } catch (error) {
            showError(error, 'Operation failed');
        }
    };

    const resetUserPassword = async (user) => {
        try {
            const { value } = await ElMessageBox.prompt('Enter a new value', 'Prompt', {
                inputType: 'password',
                inputPattern: /^.{6,}$/,
                inputErrorMessage: 'Value is too short',
                confirmButtonText: 'Confirm',
                cancelButtonText: 'Cancel',
            });
            const payload = await request(`/admin/users/${user.id}/password?new_password=${encodeURIComponent(value)}&generate_recovery=true`, { method: 'POST' });
            await ElMessageBox.alert('Action completed.', 'Notice', { confirmButtonText: 'Close' });
        } catch (error) {
            if (error !== 'cancel') {
                showError(error, 'Operation failed');
            }
        }
    };

    const deleteUser = async (user) => {
        try {
            await ElMessageBox.confirm('Please confirm this action.', 'Confirm', { type: 'warning' });
            await request(`/admin/users/${user.id}`, { method: 'DELETE' });
            await ensureAdminWorkspace(true);
            showSuccess('Completed.');
        } catch (error) {
            if (error !== 'cancel') {
                showError(error, 'Operation failed');
            }
        }
    };

    const submitProfile = async () => {
        state.profileSaving = true;
        try {
            state.user = await request('/users/me', {
                method: 'PUT',
                body: JSON.stringify({
                    full_name: state.profileForm.full_name.trim() || null,
                }),
            });
            syncProfileForms();
            showSuccess('Completed.');
        } catch (error) {
            showError(error, 'Operation failed');
        } finally {
            state.profileSaving = false;
        }
    };

    const submitPassword = async () => {
        if (state.passwordForm.new_password !== state.passwordForm.confirm_password) {
            ElMessage.warning('Please review the required fields.');
            return;
        }
        state.passwordSaving = true;
        try {
            await request('/users/me/password', {
                method: 'POST',
                body: JSON.stringify({
                    current_password: state.passwordForm.current_password,
                    new_password: state.passwordForm.new_password,
                }),
            });
            state.passwordForm = defaultPasswordForm();
            showSuccess('Completed.');
        } catch (error) {
            showError(error, 'Operation failed');
        } finally {
            state.passwordSaving = false;
        }
    };

    const handleOAuthMessage = async (event) => {
        const payload = event.data;
        if (!payload || payload.source !== 'jmail-mailbox-oauth') return;
        if (!payload.success) {
            state.oauthStatus = payload.error_description || payload.error || 'OAuth did not complete.';
            ElMessage.warning('Please review the required fields.');
            return;
        }
        state.oauthStatus = (payload.email || 'Mailbox') + ' completed ' + payload.provider + ' authorization.';
        state.mailboxDrawerOpen = false;
        await loadMailboxes();
        await loadAllMailboxStats(true);
        await loadSystemStats(true);
        if (state.currentView === 'inbox') {
            await reloadEmails({ preserveSelection: true, selectFirst: true, forceStats: true });
        }
        showSuccess('Completed.');
    };

    const handleMediaChange = (event) => {
        state.isMobile = event.matches;
        if (!state.isMobile) {
            state.mobileNavOpen = false;
            state.mobileRailOpen = false;
            state.mobileReaderOpen = false;
        }
    };

    const handleKeyboardShortcuts = (event) => {
        if (!state.user || state.isMobile || event.metaKey || event.ctrlKey || event.altKey) {
            return;
        }
        const key = String(event.key || '').toLowerCase();
        if (key === '/' && !isEditableTarget(event.target)) {
            event.preventDefault();
            void focusInboxSearch();
            return;
        }
        if (isEditableTarget(event.target)) {
            return;
        }
        if (key === 'c') {
            event.preventDefault();
            openCompose();
            return;
        }
        if (state.currentView !== 'inbox') {
            return;
        }
        if (key === 'j') {
            event.preventDefault();
            void stepEmailSelection(1);
        } else if (key === 'k') {
            event.preventDefault();
            void stepEmailSelection(-1);
        } else if (key === 'r' && state.emailDetail) {
            event.preventDefault();
            replyToEmail(state.emailDetail);
        }
    };

    const init = async () => {
        if (initialized) {
            return;
        }
        initialized = true;
        mobileMediaQueryList = window.matchMedia(MOBILE_QUERY);
        themeMediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
        state.isMobile = mobileMediaQueryList.matches;
        applyThemeMode();
        if (mobileMediaQueryList.addEventListener) {
            mobileMediaQueryList.addEventListener('change', handleMediaChange);
        } else {
            mobileMediaQueryList.addListener(handleMediaChange);
        }
        if (themeMediaQueryList.addEventListener) {
            themeMediaQueryList.addEventListener('change', handleSystemThemeChange);
        } else {
            themeMediaQueryList.addListener(handleSystemThemeChange);
        }
        window.addEventListener('message', handleOAuthMessage);
        window.addEventListener('keydown', handleKeyboardShortcuts);
        window.addEventListener('focus', handleThemeContextSync);
        document.addEventListener('visibilitychange', handleThemeContextSync);

        if (!state.token) {
            state.booting = false;
            return;
        }

        try {
            state.user = await request('/auth/me');
            syncProfileForms();
            await bootstrapWorkspace(true);
        } catch (error) {
            writeStoredToken('');
            state.token = '';
            state.user = null;
            showError(error, 'Operation failed');
        } finally {
            state.booting = false;
        }
    };

    const destroy = () => {
        if (providerDetectTimer) {
            clearTimeout(providerDetectTimer);
        }
        if (mobileMediaQueryList) {
            if (mobileMediaQueryList.removeEventListener) {
                mobileMediaQueryList.removeEventListener('change', handleMediaChange);
            } else {
                mobileMediaQueryList.removeListener(handleMediaChange);
            }
        }
        if (themeMediaQueryList) {
            if (themeMediaQueryList.removeEventListener) {
                themeMediaQueryList.removeEventListener('change', handleSystemThemeChange);
            } else {
                themeMediaQueryList.removeListener(handleSystemThemeChange);
            }
        }
        window.removeEventListener('message', handleOAuthMessage);
        window.removeEventListener('keydown', handleKeyboardShortcuts);
        window.removeEventListener('focus', handleThemeContextSync);
        document.removeEventListener('visibilitychange', handleThemeContextSync);
        initialized = false;
    };

    watch(() => [state.user?.id || null, state.currentView, state.authMode, currentScopeLabel.value], updateDocumentTitle, { immediate: true });
    watch(() => [state.currentView, state.emailScope, state.emailStatus, state.emailPageSize, JSON.stringify(state.searchFields), state.searchFlagged, state.searchHasAttachments, state.searchDateFrom, state.searchDateTo, state.emailViewMode, state.themeMode], persistUiPrefs, { immediate: true });
    watch(() => state.themeMode, applyThemeMode, { immediate: true });

    return {
        ADMIN_NAV,
        EMAIL_FILTERS,
        EMAIL_SCOPE_ALL,
        KEYBOARD_SHORTCUTS,
        MOBILE_DOCK,
        OVERVIEW_PILLARS,
        PRIMARY_NAV,
        SECONDARY_NAV,
        VIEW_META,
        LOCALE_OPTIONS,
        THEME_OPTIONS,
        state,
        t,
        setLocale,
        setThemeMode,
        composeFileInput,
        isAdmin,
        currentViewMeta,
        userDisplayName,
        userInitial,
        currentScopeMailbox,
        currentScopeLabel,
        currentScopeDescription,
        activeProvider,
        emailAttachments,
        aggregateStats,
        currentScopeStats,
        mailboxHealthCards,
        mailboxUsagePercent,
        adminStorageQuotaGb,
        heroStats,
        activeRuleCount,
        emailGroups,
        selectedEmails,
        selectedEmailCount,
        isPageSelectionFull,
        formatAddressList,
        formatDateTime,
        formatFileSize,
        formatRelativeTime,
        formatSenderLine,
        mailboxAuthLabel,
        mailboxOptionLabel,
        mailboxStatusLabel,
        mailboxStatusTone,
        emailStatusLabel,
        userRoleLabel,
        userStatusLabel,
        getMailboxStats,
        getFilterCount,
        currentMailboxLabelForEmail,
        buildEmailIframeDocument,
        describeLastFetch,
        init,
        destroy,
        loadAdminUsers,
        loadRules,
        loadConversationForEmail,
        openView,
        openGlobalSearch,
        refreshCurrentView,
        reloadEmails,
        submitLogin,
        submitRegister,
        submitResetPassword,
        logout,
        openFolder,
        applyQuickStatus,
        selectScope,
        clearInboxQuery,
        handleEmailPageChange,
        handleEmailPageSizeChange,
        selectEmail,
        openSelectedEmailOnMobile,
        stepEmailSelection,
        isEmailSelected,
        toggleEmailSelection,
        clearEmailSelection,
        togglePageSelection,
        bindEmailSearchInput,
        focusInboxSearch,
        toggleReadState,
        toggleStarState,
        archiveEmail,
        bulkArchiveSelected,
        unarchiveEmail,
        bulkMarkRead,
        deleteEmail,
        bulkDeleteSelected,
        restoreEmail,
        bulkRestoreSelected,
        purgeEmail,
        bulkPurgeSelected,
        saveRule,
        deleteRuleEntry,
        moveEmailsToFolder,
        openCompose,
        replyToEmail,
        bindComposeFileInput,
        triggerComposeFilePicker,
        handleComposeFiles,
        removeComposeAttachment,
        submitCompose,
        handleMailboxEmailInput,
        detectMailboxProvider,
        handleProviderTemplateChange,
        applyCurrentProviderDefaults,
        openMailboxDrawer,
        startMailboxOnboarding,
        startProviderOAuth,
        submitMailboxForm,
        syncMailbox,
        syncCurrentScope,
        openMailboxInbox,
        deleteMailbox,
        submitAdminSettings,
        openCreateUserDrawer,
        submitCreateUser,
        generateRecoveryCode,
        resetUserPassword,
        deleteUser,
        submitProfile,
        submitPassword,
    };
}





















