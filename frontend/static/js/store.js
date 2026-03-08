import { apiRequest, readStoredToken, writeStoredToken } from './api.js';
import {
    ADMIN_NAV,
    DEBUG_TAP_TARGET,
    EMAIL_FILTERS,
    EMAIL_SCOPE_ALL,
    KEYBOARD_SHORTCUTS,
    MOBILE_DOCK,
    MOBILE_QUERY,
    OVERVIEW_PILLARS,
    PRIMARY_NAV,
    SECONDARY_NAV,
    UI_PREFS_KEY,
    VIEW_META,
} from './constants.js';
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
    let mediaQueryList = null;
    let initialized = false;

    const state = reactive({
        booting: true,
        token: readStoredToken(),
        user: null,
        currentView: uiPrefs.currentView || 'overview',
        authMode: 'login',
        authForms: defaultAuthForms(),
        authSubmitting: false,
        mobileNavOpen: false,
        mobileRailOpen: false,
        mobileReaderOpen: false,
        mobileDebugOpen: false,
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
        adminSettings: {
            allow_registration: true,
            default_max_mailboxes_per_user: 5,
            default_fetch_interval: 300,
            max_emails_per_user: 1000,
        },
        isMobile: typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY).matches : false,
        debugTapCount: 0,
        lastDebugTapAt: 0,
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
                ElMessage.error('登录状态已失效，请重新登录。');
            }
            throw error;
        }
    };

    const isAdmin = computed(() => state.user?.role === 'admin');
    const currentViewMeta = computed(() => VIEW_META[state.currentView] || VIEW_META.inbox);
    const userDisplayName = computed(() => state.user?.full_name || state.user?.username || '用户');
    const userInitial = computed(() => String(userDisplayName.value || 'U').trim().charAt(0).toUpperCase() || 'U');
    const currentScopeMailbox = computed(() => state.emailScope === EMAIL_SCOPE_ALL
        ? null
        : state.mailboxes.find((item) => item.id === Number(state.emailScope)) || null);
    const currentScopeLabel = computed(() => currentScopeMailbox.value ? (currentScopeMailbox.value.name || currentScopeMailbox.value.email) : '统一收件箱');
    const currentScopeDescription = computed(() => currentScopeMailbox.value
        ? `${currentScopeMailbox.value.email} 的独立邮件视图，更适合精确处理单个邮箱。`
        : '把全部邮箱邮件流放进同一条处理链中，先看整体，再切到局部。');
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
    const activeRuleCount = computed(() => state.rules.filter((item) => item.is_active).length);
    const heroStats = computed(() => [
        { label: '未读压力', value: currentScopeStats.value.unread || 0, hint: '优先处理' },
        { label: '已归档', value: currentScopeStats.value.archived || 0, hint: '沉淀邮件' },
        { label: '活跃规则', value: activeRuleCount.value || 0, hint: '自动策略' },
        { label: '同步异常', value: aggregateStats.value.errors || 0, hint: '需要修复' },
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
                searchHasAttachments: state.searchHasAttachments,
                searchDateFrom: state.searchDateFrom,
                searchDateTo: state.searchDateTo,
                emailViewMode: state.emailViewMode,
            }));
        } catch {
            // Ignore storage errors.
        }
    };

    const updateDocumentTitle = () => {
        const authTitleMap = {
            login: '欢迎回来',
            register: '创建账户',
            reset: '重置密码',
        };
        const title = state.user
            ? (state.currentView === 'inbox' ? currentScopeLabel.value : currentViewMeta.value.title)
            : authTitleMap[state.authMode] || '欢迎';
        document.title = `JMail | ${title}`;
    };

    const showError = (error, fallback = '操作失败') => {
        ElMessage.error(error?.message || fallback);
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
    const currentMailboxLabelForEmail = (email) => email?.mailbox_name || email?.mailbox_email || '未知邮箱';
    const buildEmailIframeDocument = (html) => buildEmailDocument(html);
    const describeLastFetch = (mailbox) => mailbox?.last_fetch ? formatRelativeTime(mailbox.last_fetch, '未同步') : '未同步';

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
        state.adminSettings = await request('/admin/settings');
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
            showError(error, '加载规则失败');
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
            showError(error, '加载会话失败');
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
            showError(error, '加载邮件失败');
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
        if (state.currentView === 'inbox') {
            await loadRules(force);
            await reloadEmails({ preserveSelection: true, selectFirst: true });
        }
    };

    const openView = async (view) => {
        if (view === 'admin' || view === 'users') {
            if (!isAdmin.value) return;
            await ensureAdminWorkspace(false);
        }
        if (view === 'profile') {
            syncProfileForms();
        }
        if (view === 'inbox' && !state.mailboxes.length) {
            state.currentView = 'accounts';
            state.mobileNavOpen = false;
            return;
        }
        state.currentView = view;
        state.mobileNavOpen = false;
        state.mobileReaderOpen = false;
        if (view === 'inbox') {
            await loadRules(false);
            await reloadEmails({ preserveSelection: true, selectFirst: true });
        }
    };

    const refreshCurrentView = async () => {
        state.refreshing = true;
        try {
            if (!state.user) return;
            await bootstrapWorkspace(true);
            if (state.currentView === 'users' || state.currentView === 'admin') {
                await ensureAdminWorkspace(true);
            }
            showSuccess('当前视图已刷新。');
        } catch (error) {
            showError(error, '刷新失败');
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
            showSuccess('登录成功。');
        } catch (error) {
            showError(error, '登录失败');
        } finally {
            state.authSubmitting = false;
            state.booting = false;
        }
    };

    const submitRegister = async () => {
        if (!state.authForms.register.username.trim() || !state.authForms.register.email.trim()) {
            ElMessage.warning('请完整填写用户名和邮箱。');
            return;
        }
        if (state.authForms.register.password !== state.authForms.register.confirm_password) {
            ElMessage.warning('两次密码不一致。');
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
            showSuccess('注册成功。');
        } catch (error) {
            showError(error, '注册失败');
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
            showSuccess('密码已更新，请重新登录。');
        } catch (error) {
            showError(error, '重置失败');
        } finally {
            state.authSubmitting = false;
        }
    };

    const logout = () => {
        writeStoredToken('');
        state.token = '';
        state.user = null;
        state.currentView = 'overview';
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
        state.mobileDebugOpen = false;
        state.authForms = defaultAuthForms();
        state.authMode = 'login';
        showSuccess('已退出登录。');
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
            showError(error, '加载邮件详情失败');
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
            showSuccess(shouldRead ? '已标记为已读。' : '已标记为未读。');
        } catch (error) {
            showError(error, '更新阅读状态失败');
        }
    };

    const toggleStarState = async (email) => {
        try {
            await request(`/emails/${email.id}/star`, { method: 'POST' });
            await loadMailboxStats(email.mailbox_id, true);
            await reloadEmails({ preserveSelection: true, selectFirst: true, forceStats: true });
            showSuccess(email.is_flagged ? '已取消星标。' : '已设为星标。');
        } catch (error) {
            showError(error, '更新星标失败');
        }
    };

    const archiveEmail = async (email) => {
        try {
            await request(`/emails/${email.id}/archive`, { method: 'POST' });
            await loadMailboxStats(email.mailbox_id, true);
            await loadSystemStats(true);
            clearEmailSelection();
            await reloadEmails({ preserveSelection: false, selectFirst: true, forceStats: true });
            showSuccess('邮件已归档。');
        } catch (error) {
            showError(error, '归档失败');
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
            showSuccess('已批量归档邮件。');
        } catch (error) {
            showError(error, '批量归档失败');
        }
    };

    const unarchiveEmail = async (email) => {
        try {
            await request(`/emails/${email.id}/unarchive`, { method: 'POST' });
            await loadMailboxStats(email.mailbox_id, true);
            await loadSystemStats(true);
            clearEmailSelection();
            await reloadEmails({ preserveSelection: false, selectFirst: true, forceStats: true });
            showSuccess('邮件已移回收件箱。');
        } catch (error) {
            showError(error, '移回收件箱失败');
        }
    };

    const ensureSelectedEmails = () => {
        if (!selectedEmails.value.length) {
            ElMessage.warning('请先选择邮件。');
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
            showSuccess(markRead ? '已批量标记为已读。' : '已批量标记为未读。');
        } catch (error) {
            showError(error, '批量更新阅读状态失败');
        }
    };

    const deleteEmail = async (email) => {
        try {
            await ElMessageBox.confirm(`确认删除「${email.subject || '(无主题)'}」？`, '删除邮件', { type: 'warning' });
            await request(`/emails/${email.id}`, { method: 'DELETE' });
            await loadMailboxStats(email.mailbox_id, true);
            await loadSystemStats(true);
            clearEmailSelection();
            await reloadEmails({ preserveSelection: false, selectFirst: true, forceStats: true });
            showSuccess('邮件已删除。');
        } catch (error) {
            if (error !== 'cancel') {
                showError(error, '删除失败');
            }
        }
    };

    const bulkDeleteSelected = async () => {
        const emails = ensureSelectedEmails();
        if (!emails) {
            return;
        }
        try {
            await ElMessageBox.confirm(`确认删除已选择的 ${emails.length} 封邮件？`, '批量删除', { type: 'warning' });
            for (const email of emails) {
                await request(`/emails/${email.id}`, { method: 'DELETE' });
            }
            clearEmailSelection();
            await loadAllMailboxStats(true);
            await loadSystemStats(true);
            await reloadEmails({ preserveSelection: false, selectFirst: true, forceStats: true });
            showSuccess('已批量删除邮件。');
        } catch (error) {
            if (error !== 'cancel') {
                showError(error, '批量删除失败');
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
            showSuccess('邮件已恢复。');
        } catch (error) {
            showError(error, '恢复失败');
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
            showSuccess('已批量恢复邮件。');
        } catch (error) {
            showError(error, '批量恢复失败');
        }
    };

    const purgeEmail = async (email) => {
        try {
            await ElMessageBox.confirm(`确认彻底删除「${email.subject || '(无主题)'}」？此操作不可恢复。`, '彻底删除', { type: 'warning' });
            await request(`/emails/${email.id}?permanent=true`, { method: 'DELETE' });
            await loadMailboxStats(email.mailbox_id, true);
            await loadSystemStats(true);
            clearEmailSelection();
            await reloadEmails({ preserveSelection: false, selectFirst: true, forceStats: true });
            showSuccess('邮件已彻底删除。');
        } catch (error) {
            if (error !== 'cancel') {
                showError(error, '彻底删除失败');
            }
        }
    };

    const bulkPurgeSelected = async () => {
        const emails = ensureSelectedEmails();
        if (!emails) {
            return;
        }
        try {
            await ElMessageBox.confirm(`确认彻底删除已选择的 ${emails.length} 封邮件？此操作不可恢复。`, '彻底删除', { type: 'warning' });
            for (const email of emails) {
                await request(`/emails/${email.id}?permanent=true`, { method: 'DELETE' });
            }
            clearEmailSelection();
            await loadAllMailboxStats(true);
            await loadSystemStats(true);
            await reloadEmails({ preserveSelection: false, selectFirst: true, forceStats: true });
            showSuccess('已批量彻底删除邮件。');
        } catch (error) {
            if (error !== 'cancel') {
                showError(error, '批量彻底删除失败');
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
            showSuccess(ruleId ? '规则已更新。' : '规则已创建。');
        } catch (error) {
            showError(error, ruleId ? '更新规则失败' : '创建规则失败');
            throw error;
        } finally {
            state.rulesSaving = false;
        }
    };

    const deleteRuleEntry = async (rule) => {
        try {
            await ElMessageBox.confirm(`确认删除规则「${rule.name}」？`, '删除规则', { type: 'warning' });
            await request(`/rules/${rule.id}`, { method: 'DELETE' });
            await loadRules(true);
            showSuccess('规则已删除。');
        } catch (error) {
            if (error !== 'cancel') {
                showError(error, '删除规则失败');
                throw error;
            }
        }
    };

    const moveEmailsToFolder = async (emailIds, targetStatus) => {
        const ids = Array.from(new Set((emailIds || []).map((item) => Number(item)).filter(Boolean)));
        if (!ids.length) {
            ElMessage.warning('请先拖动或选择邮件。');
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
            showSuccess(targetStatus === 'archived' ? '邮件已拖入归档。' : (targetStatus === 'deleted' ? '邮件已拖入已删除。' : '邮件已移回收件箱。'));
        } catch (error) {
            showError(error, '拖拽处理失败');
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
        const replySubject = email.subject?.toLowerCase().startsWith('re:') ? email.subject : `Re: ${email.subject || '(无主题)'}`;
        const quote = [
            '',
            '',
            '--- 原始邮件 ---',
            `发件人: ${formatSenderLine(email.from_name, email.from_address)}`,
            `发送时间: ${formatDateTime(email.sent_at || email.received_at)}`,
            `主题: ${email.subject || '(无主题)'}`,
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
            showError(error, '添加附件失败');
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
            ElMessage.warning('请选择发信邮箱。');
            return;
        }
        if (!recipients.length) {
            ElMessage.warning('请至少填写一个收件人。');
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
            showSuccess('邮件已发送。');
        } catch (error) {
            showError(error, '发送失败');
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
            showError(error, '识别服务商失败');
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
        state.oauthStatus = '';
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
            ElMessage.warning('请先填写邮箱地址。');
            return;
        }
        if (!provider?.oauth?.start_endpoint) {
            ElMessage.warning('当前服务商没有可用的 OAuth 流程。');
            return;
        }
        try {
            const params = new URLSearchParams({ email });
            if (state.editingMailboxId) {
                params.set('mailbox_id', String(state.editingMailboxId));
            }
            state.oauthStatus = `正在打开 ${provider.label} 授权窗口...`;
            const payload = await request(`${provider.oauth.start_endpoint}?${params.toString()}`);
            const popup = window.open(payload.authorization_url, `jmail-${payload.provider}-oauth`, 'width=760,height=820,resizable=yes,scrollbars=yes');
            if (!popup) {
                state.oauthStatus = '授权窗口被拦截，请允许弹窗后重试。';
                ElMessage.warning(state.oauthStatus);
                return;
            }
            state.oauthStatus = `${provider.label} 授权窗口已打开。`;
        } catch (error) {
            state.oauthStatus = error?.message || 'OAuth 启动失败';
            showError(error, '授权失败');
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
            status: state.mailboxForm.status,
            use_oauth: Boolean(state.mailboxForm.use_oauth),
            oauth_provider: state.mailboxForm.oauth_provider || null,
        };

        if (!payload.email || !payload.imap_server || !payload.smtp_server || !payload.imap_username || !payload.smtp_username) {
            ElMessage.warning('请完整填写邮箱地址、服务器和用户名。');
            return;
        }
        if (state.mailboxForm.use_oauth && state.mailboxFormMode !== 'edit') {
            ElMessage.warning('新建 OAuth 邮箱请使用上方授权按钮完成接入。');
            return;
        }
        if (state.mailboxFormMode !== 'edit' && !payload.use_oauth && (!payload.imap_password || !payload.smtp_password)) {
            ElMessage.warning('新建手动邮箱时需要填写 IMAP 和 SMTP 密码。');
            return;
        }

        state.mailboxSaving = true;
        try {
            if (state.mailboxFormMode === 'edit' && state.editingMailboxId) {
                await request(`/mailboxes/${state.editingMailboxId}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload),
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
            showSuccess(state.mailboxFormMode === 'edit' ? '邮箱配置已更新。' : '邮箱已创建。');
        } catch (error) {
            showError(error, '保存邮箱失败');
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
            showSuccess(`${mailbox.name || mailbox.email} 已同步。`);
        } catch (error) {
            showError(error, '同步失败');
        } finally {
            state.syncing = false;
        }
    };

    const syncCurrentScope = async () => {
        if (!state.mailboxes.length) {
            ElMessage.warning('请先接入邮箱。');
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
            showSuccess(mailboxIds.length > 1 ? '全部邮箱已同步。' : '邮箱已同步。');
        } catch (error) {
            showError(error, '同步失败');
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
            await ElMessageBox.confirm(`确认删除邮箱 ${mailbox.email}？相关邮件也会删除。`, '删除邮箱', { type: 'warning' });
            await request(`/mailboxes/${mailbox.id}`, { method: 'DELETE' });
            await loadMailboxes();
            await loadAllMailboxStats(true);
            await loadSystemStats(true);
            if (state.currentView === 'inbox') {
                await reloadEmails({ preserveSelection: false, selectFirst: true, forceStats: true });
            }
            showSuccess('邮箱已删除。');
        } catch (error) {
            if (error !== 'cancel') {
                showError(error, '删除失败');
            }
        }
    };

    const submitAdminSettings = async () => {
        state.adminSaving = true;
        try {
            state.adminSettings = await request('/admin/settings', {
                method: 'PUT',
                body: JSON.stringify(state.adminSettings),
            });
            state.adminSettingsLoaded = true;
            showSuccess('系统设置已保存。');
        } catch (error) {
            showError(error, '保存设置失败');
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
            showSuccess('用户已创建。');
        } catch (error) {
            showError(error, '创建用户失败');
        } finally {
            state.userCreating = false;
        }
    };

    const generateRecoveryCode = async (user) => {
        try {
            const payload = await request(`/admin/users/${user.id}/recovery-code`, { method: 'POST' });
            await ElMessageBox.alert(`恢复码：${payload.recovery_code}<br>有效期至：${formatDateTime(payload.expires_at)}`, '恢复码', {
                dangerouslyUseHTMLString: true,
                confirmButtonText: '关闭',
            });
        } catch (error) {
            showError(error, '生成恢复码失败');
        }
    };

    const resetUserPassword = async (user) => {
        try {
            const { value } = await ElMessageBox.prompt(`为 ${user.email} 设置新密码`, '重置密码', {
                inputType: 'password',
                inputPattern: /^.{6,}$/,
                inputErrorMessage: '密码至少 6 位',
                confirmButtonText: '提交',
                cancelButtonText: '取消',
            });
            const payload = await request(`/admin/users/${user.id}/password?new_password=${encodeURIComponent(value)}&generate_recovery=true`, { method: 'POST' });
            await ElMessageBox.alert(payload.recovery_code ? `密码已更新。新的恢复码：${payload.recovery_code}` : '密码已更新。', '完成');
        } catch (error) {
            if (error !== 'cancel') {
                showError(error, '重置密码失败');
            }
        }
    };

    const deleteUser = async (user) => {
        try {
            await ElMessageBox.confirm(`确认删除用户 ${user.email}？`, '删除用户', { type: 'warning' });
            await request(`/admin/users/${user.id}`, { method: 'DELETE' });
            await ensureAdminWorkspace(true);
            showSuccess('用户已删除。');
        } catch (error) {
            if (error !== 'cancel') {
                showError(error, '删除用户失败');
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
            showSuccess('个人资料已保存。');
        } catch (error) {
            showError(error, '保存资料失败');
        } finally {
            state.profileSaving = false;
        }
    };

    const submitPassword = async () => {
        if (state.passwordForm.new_password !== state.passwordForm.confirm_password) {
            ElMessage.warning('两次新密码不一致。');
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
            showSuccess('密码已更新。');
        } catch (error) {
            showError(error, '修改密码失败');
        } finally {
            state.passwordSaving = false;
        }
    };

    const handleBrandGesture = () => {
        if (!state.isMobile) return;
        const now = Date.now();
        if (now - state.lastDebugTapAt > 1600) {
            state.debugTapCount = 0;
        }
        state.lastDebugTapAt = now;
        state.debugTapCount += 1;
        if (state.debugTapCount >= DEBUG_TAP_TARGET) {
            state.debugTapCount = 0;
            state.mobileDebugOpen = true;
            showSuccess('开发者神域已开启。');
        }
    };

    const copyDebugSnapshot = async () => {
        const snapshot = {
            view: state.currentView,
            emailScope: state.emailScope,
            selectedMailboxId: state.selectedMailboxId,
            selectedEmailId: state.selectedEmailId,
            mailboxes: state.mailboxes.length,
            unread: aggregateStats.value.unread,
            version: state.systemInfo?.app_version || null,
            user: state.user?.email || null,
        };
        try {
            await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
            showSuccess('状态快照已复制。');
        } catch {
            ElMessage.warning('当前环境无法复制到剪贴板。');
        }
    };

    const handleOAuthMessage = async (event) => {
        const payload = event.data;
        if (!payload || payload.source !== 'jmail-mailbox-oauth') return;
        if (!payload.success) {
            state.oauthStatus = payload.error_description || payload.error || 'OAuth 未完成。';
            ElMessage.warning(state.oauthStatus);
            return;
        }
        state.oauthStatus = `${payload.email || '邮箱'} 已完成 ${payload.provider} 授权。`;
        state.mailboxDrawerOpen = false;
        await loadMailboxes();
        await loadAllMailboxStats(true);
        await loadSystemStats(true);
        if (state.currentView === 'inbox') {
            await reloadEmails({ preserveSelection: true, selectFirst: true, forceStats: true });
        }
        showSuccess(state.oauthStatus);
    };

    const handleMediaChange = (event) => {
        state.isMobile = event.matches;
        if (!state.isMobile) {
            state.mobileNavOpen = false;
            state.mobileRailOpen = false;
            state.mobileReaderOpen = false;
            state.mobileDebugOpen = false;
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
        mediaQueryList = window.matchMedia(MOBILE_QUERY);
        state.isMobile = mediaQueryList.matches;
        if (mediaQueryList.addEventListener) {
            mediaQueryList.addEventListener('change', handleMediaChange);
        } else {
            mediaQueryList.addListener(handleMediaChange);
        }
        window.addEventListener('message', handleOAuthMessage);
        window.addEventListener('keydown', handleKeyboardShortcuts);

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
            showError(error, '登录已失效');
        } finally {
            state.booting = false;
        }
    };

    const destroy = () => {
        if (providerDetectTimer) {
            clearTimeout(providerDetectTimer);
        }
        if (mediaQueryList) {
            if (mediaQueryList.removeEventListener) {
                mediaQueryList.removeEventListener('change', handleMediaChange);
            } else {
                mediaQueryList.removeListener(handleMediaChange);
            }
        }
        window.removeEventListener('message', handleOAuthMessage);
        window.removeEventListener('keydown', handleKeyboardShortcuts);
        initialized = false;
    };

    watch(() => [state.user?.id || null, state.currentView, state.authMode, currentScopeLabel.value], updateDocumentTitle, { immediate: true });
    watch(() => [state.currentView, state.emailScope, state.emailStatus, state.emailPageSize, JSON.stringify(state.searchFields), state.searchHasAttachments, state.searchDateFrom, state.searchDateTo, state.emailViewMode], persistUiPrefs, { immediate: true });

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
        state,
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
        handleBrandGesture,
        copyDebugSnapshot,
    };
}




















