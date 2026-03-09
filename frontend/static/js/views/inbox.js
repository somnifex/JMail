import { useJmailStore } from '../store.js';
import {
    EMAIL_FILTERS,
    EMAIL_SCOPE_ALL,
    INBOX_VIEW_MODES,
    RULE_ACTION_OPTIONS,
    RULE_FIELD_OPTIONS,
    SEARCH_FIELD_OPTIONS,
} from '../constants.js';
import {
    buildConversationGroups,
    buildConversationKey,
    groupThreadsByDate,
    normalizeThreadSubject,
} from '../utils.js';

const { computed, reactive } = window.Vue;

const RECENT_SEARCHES_KEY = 'jmail_inbox_recent_searches';

const RULE_TEMPLATES = [
    {
        key: 'archive-sender',
        title: '\u6309\u53d1\u4ef6\u4eba\u81ea\u52a8\u5f52\u6863',
        copy: '\u81ea\u52a8\u5c06\u6307\u5b9a\u53d1\u4ef6\u4eba\u7684\u90ae\u4ef6\u79fb\u52a8\u5230\u5f52\u6863\uff0c\u51cf\u5c11\u6536\u4ef6\u7bb1\u5e72\u6270',
        build: () => ({
            name: '\u6309\u53d1\u4ef6\u4eba\u81ea\u52a8\u5f52\u6863',
            match_field: 'sender',
            match_operator: 'contains',
            match_value: '',
            action: 'archive',
            is_active: true,
        }),
    },
    {
        key: 'flag-subject',
        title: '\u6309\u4e3b\u9898\u6807\u8bb0\u91cd\u8981\u90ae\u4ef6',
        copy: '\u5f53\u90ae\u4ef6\u4e3b\u9898\u5305\u542b\u6307\u5b9a\u5173\u952e\u8bcd\u65f6\u81ea\u52a8\u6807\u8bb0\u4e3a\u91cd\u8981\uff0c\u786e\u4fdd\u91cd\u8981\u90ae\u4ef6\u4e0d\u88ab\u9057\u6f0f',
        build: () => ({
            name: '\u6309\u4e3b\u9898\u6807\u8bb0\u91cd\u8981\u90ae\u4ef6',
            match_field: 'subject',
            match_operator: 'contains',
            match_value: '',
            action: 'flag',
            is_active: true,
        }),
    },
    {
        key: 'attachments-read',
        title: '\u9644\u4ef6\u901a\u77e5\u81ea\u52a8\u6807\u4e3a\u5df2\u8bfb',
        copy: '\u81ea\u52a8\u5c06\u7cfb\u7edf\u53d1\u9001\u7684\u9644\u4ef6\u901a\u77e5\u7c7b\u90ae\u4ef6\u6807\u8bb0\u4e3a\u5df2\u8bfb\uff0c\u63d0\u5347\u90ae\u4ef6\u5904\u7406\u6548\u7387',
        build: () => ({
            name: '\u9644\u4ef6\u901a\u77e5\u81ea\u52a8\u6807\u4e3a\u5df2\u8bfb',
            match_field: 'attachments',
            match_operator: 'contains',
            match_value: '',
            action: 'mark_read',
            is_active: true,
        }),
    },
];

const SEARCH_STATUS_OPTIONS = EMAIL_FILTERS.filter((item) => item.key !== 'flagged');

function defaultRuleDraft() {
    return {
        name: '',
        mailbox_id: '',
        match_field: 'sender',
        match_operator: 'contains',
        match_value: '',
        action: 'archive',
        is_active: true,
    };
}

function readRecentSearches() {
    try {
        const payload = localStorage.getItem(RECENT_SEARCHES_KEY);
        const parsed = payload ? JSON.parse(payload) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function persistRecentSearches(items) {
    try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(items.slice(0, 6)));
    } catch {
        // Ignore storage errors.
    }
}

function buildSearchRecord(store) {
    const query = String(store.state.emailQuery || '').trim();
    const fields = Array.isArray(store.state.searchFields) && store.state.searchFields.length
        ? [...store.state.searchFields]
        : ['all'];
    const hasAdvanced = fields.join(',') !== 'all'
        || store.state.searchFlagged !== null
        || store.state.searchHasAttachments !== null
        || Boolean(store.state.searchDateFrom)
        || Boolean(store.state.searchDateTo)
        || store.state.emailScope !== EMAIL_SCOPE_ALL
        || store.state.emailStatus !== 'all';

    if (!query && !hasAdvanced) {
        return null;
    }

    const scopeLabel = store.currentScopeMailbox?.value?.name || store.currentScopeMailbox?.value?.email || store.t('All Mailboxes');
    const statusLabel = store.t(EMAIL_FILTERS.find((item) => item.key === store.state.emailStatus)?.label || 'All Mail');
    const fieldLabel = fields.includes('all')
        ? store.t('All Fields')
        : SEARCH_FIELD_OPTIONS.filter((item) => fields.includes(item.key)).map((item) => store.t(item.label)).join(' / ');
    const extras = [];
    if (store.state.searchFlagged === true) extras.push(store.t('Starred only'));
    if (store.state.searchFlagged === false) extras.push(store.t('Unstarred only'));
    if (store.state.searchHasAttachments === true) extras.push(store.t('With attachments'));
    if (store.state.searchHasAttachments === false) extras.push(store.t('Without attachments'));
    if (store.state.searchDateFrom || store.state.searchDateTo) extras.push(store.t('Date filter'));

    return {
        id: `${query}|${store.state.emailScope}|${store.state.emailStatus}|${fields.join(',')}|${store.state.searchFlagged}|${store.state.searchHasAttachments}|${store.state.searchDateFrom}|${store.state.searchDateTo}`,
        label: query || `${statusLabel} / ${scopeLabel}`,
        query,
        scope: store.state.emailScope,
        status: store.state.emailStatus,
        searchFields: fields,
        isFlagged: store.state.searchFlagged,
        hasAttachments: store.state.searchHasAttachments,
        dateFrom: store.state.searchDateFrom,
        dateTo: store.state.searchDateTo,
        meta: [scopeLabel, statusLabel, fieldLabel, ...extras].filter(Boolean).join(' / '),
    };
}

function buildRuleDraftFromEmail(email) {
    const subject = normalizeThreadSubject(email?.subject);
    const sender = email?.from_address || '';
    const senderName = email?.from_name || sender || 'Sender';
    return {
        name: sender ? `Handle ${senderName}` : `Handle ${subject}`,
        mailbox_id: email?.mailbox_id ? String(email.mailbox_id) : '',
        match_field: sender ? 'sender' : 'subject',
        match_operator: 'contains',
        match_value: sender || subject,
        action: 'archive',
        is_active: true,
    };
}

const inboxUi = reactive({
    searchPanelOpen: false,
    rulesDrawerOpen: false,
    editingRuleId: null,
    ruleDraft: defaultRuleDraft(),
    dragIds: [],
    dragTarget: '',
    dragSeedEmail: null,
    recentSearches: readRecentSearches(),
    branchOpen: {},
});

function useInboxWorkspace() {
    const store = useJmailStore();

    const threadGroups = computed(() => buildConversationGroups(store.state.emails));
    const streamSections = computed(() => store.state.emailViewMode === 'thread'
        ? groupThreadsByDate(threadGroups.value)
        : store.emailGroups.value);
    const selectedConversationKey = computed(() => {
        if (store.state.emailConversationKey) {
            return store.state.emailConversationKey;
        }
        if (store.state.emailDetail) {
            return buildConversationKey(store.state.emailDetail);
        }
        return '';
    });
    const smartFolders = computed(() => EMAIL_FILTERS.map((filter) => ({
        key: `smart:${filter.key}`,
        label: filter.label,
        hint: filter.hint,
        scope: EMAIL_SCOPE_ALL,
        status: filter.key,
        count: store.getFilterCount(filter.key),
        droppable: ['all', 'archived', 'deleted'].includes(filter.key),
        icon: ({
            all: 'IN',
            unread: 'UN',
            flagged: 'FG',
            read: 'RD',
            archived: 'AR',
            deleted: 'DL',
        })[filter.key] || 'MB',
    })));
    const mailboxBranches = computed(() => store.state.mailboxes.map((mailbox) => {
        const stats = store.getMailboxStats(mailbox.id);
        return {
            mailbox,
            expanded: inboxUi.branchOpen[mailbox.id] !== false,
            folders: [
                { key: `mailbox:${mailbox.id}:all`, label: 'Inbox', status: 'all', count: Number(stats.total || 0), droppable: true },
                { key: `mailbox:${mailbox.id}:archived`, label: 'Archived', status: 'archived', count: Number(stats.archived || 0), droppable: true },
                { key: `mailbox:${mailbox.id}:deleted`, label: 'Deleted', status: 'deleted', count: Number(stats.deleted || 0), droppable: true },
            ],
        };
    }));
    const searchSummaryChips = computed(() => {
        const chips = [];
        if (store.state.emailQuery.trim()) {
            chips.push(`${store.t('Query')} ${store.state.emailQuery.trim()}`);
        }
        if (!store.state.searchFields.includes('all')) {
            const fields = SEARCH_FIELD_OPTIONS
                .filter((item) => store.state.searchFields.includes(item.key))
                .map((item) => store.t(item.label))
                .join(' / ');
            if (fields) {
                chips.push(`${store.t('Fields')} ${fields}`);
            }
        }
        if (store.state.searchHasAttachments === true) {
            chips.push(store.t('With attachments'));
        }
        if (store.state.searchHasAttachments === false) {
            chips.push(store.t('Without attachments'));
        }
        if (store.state.searchFlagged === true) {
            chips.push(store.t('Starred only'));
        }
        if (store.state.searchFlagged === false) {
            chips.push(store.t('Unstarred only'));
        }
        if (store.state.searchDateFrom || store.state.searchDateTo) {
            chips.push(`${store.t('Date')} ${store.state.searchDateFrom || store.t('Start')} ${store.t('to')} ${store.state.searchDateTo || store.t('Now')}`);
        }
        if (store.state.emailScope !== EMAIL_SCOPE_ALL) {
            chips.push(`${store.t('Mailbox scope')} ${store.currentScopeLabel.value}`);
        }
        if (store.state.emailStatus !== 'all') {
            chips.push(`${store.t('Folder')} ${store.t(EMAIL_FILTERS.find((item) => item.key === store.state.emailStatus)?.label || store.state.emailStatus)}`);
        }
        return chips;
    });
    const conversationItems = computed(() => [...store.state.emailConversation]
        .sort((left, right) => new Date(right?.received_at || right?.sent_at || 0) - new Date(left?.received_at || left?.sent_at || 0)));
    const ruleCountLabel = computed(() => `${store.activeRuleCount.value || 0} active`);
    const drawerDirection = computed(() => store.state.isMobile ? 'btt' : 'rtl');
    const drawerSize = computed(() => store.state.isMobile ? '92%' : '480px');
    const searchStatusLabel = computed(() => EMAIL_FILTERS.find((item) => item.key === store.state.emailStatus)?.label || 'All Mail');
    const flaggedFilterLabel = computed(() => {
        if (store.state.searchFlagged === true) return 'Starred only';
        if (store.state.searchFlagged === false) return 'Unstarred only';
        return 'Any star state';
    });
    const searchScopeLabel = computed(() => store.state.emailScope === EMAIL_SCOPE_ALL ? 'All Mailboxes' : store.currentScopeLabel.value);

    const mailboxNameById = (mailboxId) => {
        if (!mailboxId) {
            return 'All mailboxes';
        }
        const mailbox = store.state.mailboxes.find((item) => item.id === Number(mailboxId));
        return mailbox?.name || mailbox?.email || 'Selected mailbox';
    };

    const openMailboxBranch = (mailboxId) => {
        inboxUi.branchOpen[mailboxId] = !(inboxUi.branchOpen[mailboxId] !== false);
    };

    const isFolderActive = (node) => ((node.scope === EMAIL_SCOPE_ALL && store.state.emailScope === EMAIL_SCOPE_ALL)
        || Number(store.state.emailScope) === Number(node.scope))
        && store.state.emailStatus === node.status;

    const openFolderNode = async (node) => {
        await store.openFolder({ scope: node.scope, status: node.status });
    };

    const syncSearchToRecent = () => {
        const record = buildSearchRecord(store);
        if (!record) {
            return;
        }
        inboxUi.recentSearches = [record, ...inboxUi.recentSearches.filter((item) => item.id !== record.id)].slice(0, 6);
        persistRecentSearches(inboxUi.recentSearches);
    };

    const applySearch = async () => {
        syncSearchToRecent();
        await store.reloadEmails({ resetPage: true, preserveSelection: false });
    };

    const useRecentSearch = async (item) => {
        store.state.emailQuery = item.query || '';
        store.state.emailScope = item.scope ?? EMAIL_SCOPE_ALL;
        store.state.emailStatus = item.status || 'all';
        store.state.searchFields = Array.isArray(item.searchFields) && item.searchFields.length ? [...item.searchFields] : ['all'];
        store.state.searchFlagged = Object.prototype.hasOwnProperty.call(item, 'isFlagged') ? item.isFlagged : null;
        store.state.searchHasAttachments = Object.prototype.hasOwnProperty.call(item, 'hasAttachments') ? item.hasAttachments : null;
        store.state.searchDateFrom = item.dateFrom || '';
        store.state.searchDateTo = item.dateTo || '';
        await store.reloadEmails({ resetPage: true, preserveSelection: false });
    };

    const toggleSearchField = (key) => {
        if (key === 'all') {
            store.state.searchFields = ['all'];
            return;
        }
        const next = new Set(store.state.searchFields.filter((item) => item !== 'all'));
        if (next.has(key)) {
            next.delete(key);
        } else {
            next.add(key);
        }
        store.state.searchFields = next.size ? Array.from(next) : ['all'];
    };

    const setAttachmentFilter = (value) => {
        store.state.searchHasAttachments = value;
    };

    const setFlaggedFilter = (value) => {
        store.state.searchFlagged = value;
    };

    const setSearchStatus = async (value) => {
        store.state.emailStatus = value;
        await applySearch();
    };

    const setSearchScope = async (value) => {
        store.state.emailScope = value;
        await applySearch();
    };

    const switchViewMode = (mode) => {
        store.state.emailViewMode = mode;
    };

    const resolveDragIds = (fallbackIds = []) => {
        const selected = store.state.selectedEmailIds || [];
        if (selected.length && fallbackIds.some((id) => selected.includes(id))) {
            return [...selected];
        }
        return fallbackIds;
    };

    const startDrag = (ids, seedEmail, event) => {
        inboxUi.dragIds = [...new Set((ids || []).map((item) => Number(item)).filter(Boolean))];
        inboxUi.dragSeedEmail = seedEmail || null;
        if (event?.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', inboxUi.dragIds.join(','));
        }
    };

    const startEmailDrag = (email, event) => {
        startDrag(resolveDragIds([email.id]), email, event);
    };

    const startThreadDrag = (thread, event) => {
        startDrag(resolveDragIds(thread.items.map((item) => item.id)), thread.latest_email || thread.items[0] || null, event);
    };

    const clearDragState = () => {
        inboxUi.dragIds = [];
        inboxUi.dragTarget = '';
        inboxUi.dragSeedEmail = null;
    };

    const canDropToNode = (node) => Boolean(inboxUi.dragIds.length) && (node?.droppable || node?.kind === 'rule');

    const markDropTarget = (nodeKey) => {
        if (!inboxUi.dragIds.length) {
            return;
        }
        inboxUi.dragTarget = nodeKey;
    };

    const openRulesDrawer = (rule = null) => {
        inboxUi.rulesDrawerOpen = true;
        if (!rule) {
            inboxUi.editingRuleId = null;
            inboxUi.ruleDraft = defaultRuleDraft();
            return;
        }
        inboxUi.editingRuleId = rule.id;
        inboxUi.ruleDraft = {
            name: rule.name || '',
            mailbox_id: rule.mailbox_id ? String(rule.mailbox_id) : '',
            match_field: rule.match_field || 'sender',
            match_operator: rule.match_operator || 'contains',
            match_value: rule.match_value || '',
            action: rule.action || 'archive',
            is_active: Boolean(rule.is_active),
        };
    };

    const openRuleSeed = (email) => {
        if (!email) {
            openRulesDrawer();
            return;
        }
        inboxUi.rulesDrawerOpen = true;
        inboxUi.editingRuleId = null;
        inboxUi.ruleDraft = buildRuleDraftFromEmail(email);
    };

    const applyRuleTemplate = (template) => {
        const next = template.build();
        inboxUi.editingRuleId = null;
        inboxUi.ruleDraft = {
            ...defaultRuleDraft(),
            ...next,
        };
        inboxUi.rulesDrawerOpen = true;
    };

    const handleFolderDrop = async (node) => {
        if (!canDropToNode(node)) {
            clearDragState();
            return;
        }
        if (node.kind === 'rule') {
            openRuleSeed(inboxUi.dragSeedEmail || store.state.emailDetail || store.state.emails.find((item) => item.id === inboxUi.dragIds[0]));
            clearDragState();
            return;
        }
        await store.moveEmailsToFolder(inboxUi.dragIds, node.status);
        clearDragState();
    };

    const selectThread = async (thread, openReader = false) => {
        const activeInThread = thread.items.find((item) => item.id === store.state.selectedEmailId);
        await store.selectEmail(activeInThread || thread.latest_email || thread.items[0], openReader);
    };

    const isThreadActive = (thread) => selectedConversationKey.value === thread.key
        || thread.items.some((item) => item.id === store.state.selectedEmailId);

    const selectConversationItem = async (email) => {
        await store.selectEmail(email, store.state.isMobile);
    };

    const submitRuleDraft = async () => {
        const payload = {
            name: String(inboxUi.ruleDraft.name || '').trim(),
            mailbox_id: inboxUi.ruleDraft.mailbox_id ? Number(inboxUi.ruleDraft.mailbox_id) : null,
            match_field: inboxUi.ruleDraft.match_field || 'sender',
            match_operator: inboxUi.ruleDraft.match_operator || 'contains',
            match_value: String(inboxUi.ruleDraft.match_value || '').trim(),
            action: inboxUi.ruleDraft.action || 'archive',
            is_active: Boolean(inboxUi.ruleDraft.is_active),
        };
        if (!payload.name || !payload.match_value) {
            return;
        }
        await store.saveRule({
            ruleId: inboxUi.editingRuleId,
            payload,
        });
        openRulesDrawer();
    };

    const toggleRuleActive = async (rule) => {
        await store.saveRule({
            ruleId: rule.id,
            payload: {
                name: rule.name,
                mailbox_id: rule.mailbox_id,
                match_field: rule.match_field,
                match_operator: rule.match_operator,
                match_value: rule.match_value,
                action: rule.action,
                is_active: !rule.is_active,
            },
        });
    };

    const ruleFieldLabel = (key) => RULE_FIELD_OPTIONS.find((item) => item.key === key)?.label || key || 'Field';
    const ruleActionLabel = (key) => RULE_ACTION_OPTIONS.find((item) => item.key === key)?.label || key || 'Action';
    const ruleOperatorLabel = (key) => ({
        contains: 'Contains',
        equals: 'Equals',
        starts_with: 'Starts with',
        ends_with: 'Ends with',
    })[key] || key || 'Match';

    const messageStatusTone = (email) => {
        if (email?.status === 'deleted') return 'danger';
        if (email?.status === 'archived') return 'info';
        if (email?.status === 'read') return 'muted';
        return 'success';
    };

    const hasInboxFilters = computed(() => Boolean(
        store.state.emailQuery.trim()
        || store.state.emailStatus !== 'all'
        || store.state.emailScope !== EMAIL_SCOPE_ALL
        || !store.state.searchFields.includes('all')
        || store.state.searchFlagged !== null
        || store.state.searchHasAttachments !== null
        || store.state.searchDateFrom
        || store.state.searchDateTo
    ));

    return {
        ...store,
        inboxUi,
        smartFolders,
        mailboxBranches,
        streamSections,
        searchSummaryChips,
        conversationItems,
        ruleCountLabel,
        drawerDirection,
        drawerSize,
        hasInboxFilters,
        mailboxNameById,
        openMailboxBranch,
        isFolderActive,
        openFolderNode,
        applySearch,
        useRecentSearch,
        toggleSearchField,
        setFlaggedFilter,
        setAttachmentFilter,
        setSearchStatus,
        setSearchScope,
        switchViewMode,
        startEmailDrag,
        startThreadDrag,
        clearDragState,
        canDropToNode,
        markDropTarget,
        handleFolderDrop,
        openRulesDrawer,
        openRuleSeed,
        applyRuleTemplate,
        selectThread,
        isThreadActive,
        selectConversationItem,
        submitRuleDraft,
        toggleRuleActive,
        ruleFieldLabel,
        ruleActionLabel,
        ruleOperatorLabel,
        messageStatusTone,
        searchStatusLabel,
        flaggedFilterLabel,
        searchScopeLabel,
        INBOX_VIEW_MODES,
        SEARCH_FIELD_OPTIONS,
        SEARCH_STATUS_OPTIONS,
        EMAIL_SCOPE_ALL,
    };
}

const railTemplate = `
<div class="rail-stack rail-stack--studio">
    <article class="glass-panel rail-panel rail-panel--hero rail-panel--control">
        <div class="section-head section-head--compact">
            <div>
                <p class="section-kicker">{{ t('Scope') }}</p>
                <h3>{{ currentScopeLabel }}</h3>
            </div>
            <span class="status-pill" :data-tone="currentScopeMailbox ? mailboxStatusTone(currentScopeMailbox.status) : 'success'">
                {{ currentScopeMailbox ? mailboxStatusLabel(currentScopeMailbox.status) : t('All Mailboxes') }}
            </span>
        </div>
        <p class="rail-copy">{{ currentScopeDescription }}</p>
        <div class="scope-metrics scope-metrics--studio">
            <div v-for="item in heroStats" :key="item.label">
                <span>{{ t(item.label) }}</span>
                <strong>{{ item.value }}</strong>
            </div>
        </div>
        <div class="rail-actions">
            <el-button type="primary" @click="openCompose()">{{ t('Compose') }}</el-button>
            <el-button :loading="state.syncing" @click="syncCurrentScope()">{{ t('Sync now') }}</el-button>
            <el-button @click="openRulesDrawer()">{{ t('Rules') }}</el-button>
        </div>
    </article>

    <article class="glass-panel rail-panel rail-panel--tree">
        <div class="section-head section-head--compact">
            <div>
                <p class="section-kicker">Mail Structure</p>
                <h3>Folders and accounts</h3>
            </div>
            <el-button text @click="openMailboxDrawer('create')">{{ t('Add Mailbox') }}</el-button>
        </div>

        <div class="folder-tree">
            <section class="folder-tree__group">
                <header class="folder-tree__head">
                    <span>Smart folders</span>
                    <small>Drag to all mail, archive or deleted</small>
                </header>
                <button
                    v-for="node in smartFolders"
                    :key="node.key"
                    type="button"
                    class="folder-node"
                    :class="{
                        'is-active': isFolderActive(node),
                        'is-drop-target': inboxUi.dragTarget === node.key,
                        'is-droppable': node.droppable
                    }"
                    :data-droppable="node.droppable ? 'true' : 'false'"
                    @click="openFolderNode(node)"
                    @dragenter.prevent="markDropTarget(node.key)"
                    @dragover.prevent="canDropToNode(node) ? markDropTarget(node.key) : null"
                    @dragleave="inboxUi.dragTarget = inboxUi.dragTarget === node.key ? '' : inboxUi.dragTarget"
                    @drop.prevent="handleFolderDrop(node)"
                >
                    <span class="folder-node__icon">{{ node.icon }}</span>
                    <div class="folder-node__copy">
                        <strong>{{ node.label }}</strong>
                        <small>{{ node.hint }}</small>
                    </div>
                    <b>{{ node.count }}</b>
                </button>
            </section>

            <section class="folder-tree__group">
                <header class="folder-tree__head">
                    <span>Mailboxes</span>
                    <small>{{ state.mailboxes.length }} accounts</small>
                </header>
                <article v-for="branch in mailboxBranches" :key="branch.mailbox.id" class="folder-branch">
                    <button type="button" class="folder-branch__head" @click="openMailboxBranch(branch.mailbox.id)">
                        <div>
                            <strong>{{ branch.mailbox.name || branch.mailbox.email }}</strong>
                            <small>{{ branch.mailbox.email }}</small>
                        </div>
                        <div class="folder-branch__meta">
                            <span class="status-pill" :data-tone="mailboxStatusTone(branch.mailbox.status)">{{ mailboxStatusLabel(branch.mailbox.status) }}</span>
                            <b>{{ getMailboxStats(branch.mailbox.id).unread || 0 }}</b>
                        </div>
                    </button>
                    <div v-if="branch.expanded" class="folder-branch__body">
                        <button
                            v-for="node in branch.folders"
                            :key="node.key"
                            type="button"
                            class="folder-node folder-node--child"
                            :class="{
                                'is-active': isFolderActive({ scope: branch.mailbox.id, status: node.status }),
                                'is-drop-target': inboxUi.dragTarget === node.key,
                                'is-droppable': node.droppable
                            }"
                            :data-droppable="node.droppable ? 'true' : 'false'"
                            @click="openFolderNode({ scope: branch.mailbox.id, status: node.status })"
                            @dragenter.prevent="markDropTarget(node.key)"
                            @dragover.prevent="canDropToNode(node) ? markDropTarget(node.key) : null"
                            @dragleave="inboxUi.dragTarget = inboxUi.dragTarget === node.key ? '' : inboxUi.dragTarget"
                            @drop.prevent="handleFolderDrop(node)"
                        >
                            <div class="folder-node__copy">
                                <strong>{{ node.label }}</strong>
                                <small>{{ describeLastFetch(branch.mailbox) }}</small>
                            </div>
                            <b>{{ node.count }}</b>
                        </button>
                    </div>
                </article>
            </section>

            <section class="folder-tree__group">
                <header class="folder-tree__head">
                    <span>Automation</span>
                    <small>Drop a message here to seed a rule</small>
                </header>
                <button
                    type="button"
                    class="folder-node folder-node--rule"
                    :class="{ 'is-drop-target': inboxUi.dragTarget === 'rule-drop' }"
                    @click="openRulesDrawer()"
                    @dragenter.prevent="markDropTarget('rule-drop')"
                    @dragover.prevent="markDropTarget('rule-drop')"
                    @dragleave="inboxUi.dragTarget = inboxUi.dragTarget === 'rule-drop' ? '' : inboxUi.dragTarget"
                    @drop.prevent="handleFolderDrop({ key: 'rule-drop', kind: 'rule' })"
                >
                    <span class="folder-node__icon">RL</span>
                    <div class="folder-node__copy">
                        <strong>Rules Center</strong>
                        <small>{{ ruleCountLabel }}</small>
                    </div>
                    <b>{{ state.rules.length }}</b>
                </button>
            </section>
        </div>
    </article>
</div>`;

const searchRailTemplate = `
<div class="rail-stack rail-stack--studio rail-stack--search">
    <article class="glass-panel rail-panel rail-panel--hero rail-panel--control rail-panel--search-overview">
        <div class="section-head section-head--compact">
            <div>
                <p class="section-kicker">{{ t('Global Search') }}</p>
                <h3>{{ t('Search Results') }}</h3>
            </div>
            <span class="status-pill" data-tone="info">{{ state.emailTotal }} {{ t('Results') }}</span>
        </div>
        <p class="rail-copy">{{ t('Search across every connected mailbox, then narrow results with Thunderbird-style facets.') }}</p>
        <div class="scope-metrics scope-metrics--studio">
            <div>
                <span>{{ t('Query') }}</span>
                <strong>{{ state.emailQuery || t('All Mail') }}</strong>
            </div>
            <div>
                <span>{{ t('Mailbox scope') }}</span>
                <strong>{{ t(searchScopeLabel) }}</strong>
            </div>
            <div>
                <span>{{ t('Folder') }}</span>
                <strong>{{ t(searchStatusLabel) }}</strong>
            </div>
            <div>
                <span>{{ t('Flagged') }}</span>
                <strong>{{ t(flaggedFilterLabel) }}</strong>
            </div>
        </div>
    </article>

    <article class="glass-panel rail-panel rail-panel--search-facets">
        <div class="section-head section-head--compact">
            <div>
                <p class="section-kicker">{{ t('Refine Results') }}</p>
                <h3>{{ t('Thunderbird-style facets') }}</h3>
            </div>
            <el-button text @click="applySearch()">{{ t('Search') }}</el-button>
        </div>

        <label class="search-field">
            <span>{{ t('Mailbox scope') }}</span>
            <select :value="state.emailScope" @change="setSearchScope($event.target.value)">
                <option :value="EMAIL_SCOPE_ALL">{{ t('All Mailboxes') }}</option>
                <option v-for="mailbox in state.mailboxes" :key="mailbox.id" :value="String(mailbox.id)">
                    {{ mailbox.name || mailbox.email }}
                </option>
            </select>
        </label>

        <div class="search-panel__section">
            <span class="search-panel__label">{{ t('Folder') }}</span>
            <div class="chip-toggle-row">
                <button
                    v-for="filter in SEARCH_STATUS_OPTIONS"
                    :key="filter.key"
                    type="button"
                    class="chip-toggle"
                    :class="{ 'is-active': state.emailStatus === filter.key }"
                    @click="setSearchStatus(filter.key)"
                >
                    {{ t(filter.label) }}
                </button>
            </div>
        </div>

        <div class="search-panel__section">
            <span class="search-panel__label">{{ t('Flagged') }}</span>
            <div class="chip-toggle-row">
                <button type="button" class="chip-toggle" :class="{ 'is-active': state.searchFlagged === null }" @click="setFlaggedFilter(null); applySearch()">{{ t('Any star state') }}</button>
                <button type="button" class="chip-toggle" :class="{ 'is-active': state.searchFlagged === true }" @click="setFlaggedFilter(true); applySearch()">{{ t('Starred only') }}</button>
                <button type="button" class="chip-toggle" :class="{ 'is-active': state.searchFlagged === false }" @click="setFlaggedFilter(false); applySearch()">{{ t('Unstarred only') }}</button>
            </div>
        </div>

        <div class="search-panel__section">
            <span class="search-panel__label">{{ t('Attachments') }}</span>
            <div class="chip-toggle-row">
                <button type="button" class="chip-toggle" :class="{ 'is-active': state.searchHasAttachments === null }" @click="setAttachmentFilter(null); applySearch()">{{ t('Any attachment state') }}</button>
                <button type="button" class="chip-toggle" :class="{ 'is-active': state.searchHasAttachments === true }" @click="setAttachmentFilter(true); applySearch()">{{ t('Has attachments') }}</button>
                <button type="button" class="chip-toggle" :class="{ 'is-active': state.searchHasAttachments === false }" @click="setAttachmentFilter(false); applySearch()">{{ t('No attachments') }}</button>
            </div>
        </div>

        <div v-if="searchSummaryChips.length" class="search-chip-row">
            <span v-for="chip in searchSummaryChips" :key="chip" class="search-chip">{{ t(chip) }}</span>
        </div>

        <div v-if="inboxUi.recentSearches.length" class="search-recent">
            <span class="search-panel__label">{{ t('Recent searches') }}</span>
            <div class="search-recent__row">
                <button v-for="item in inboxUi.recentSearches" :key="item.id" type="button" class="search-recent__item" @click="useRecentSearch(item)">
                    <strong>{{ item.label }}</strong>
                    <small>{{ item.meta }}</small>
                </button>
            </div>
        </div>
    </article>
</div>`;

const readerTemplate = `<div v-if="state.emailDetail" class="reader-stack" :class="{ 'is-mobile': mobile }">
    <header class="reader-header">
        <div class="reader-header__copy">
            <p class="section-kicker">Message Detail</p>
            <h2>{{ state.emailDetail.subject || '(No subject)' }}</h2>
            <div class="reader-meta-line">
                <span class="status-pill" :data-tone="messageStatusTone(state.emailDetail)">{{ emailStatusLabel(state.emailDetail.status) }}</span>
                <span class="status-pill" v-if="state.emailDetail.is_flagged" data-tone="warning">Flagged</span>
                <span class="status-pill" v-if="state.emailDetail.has_attachments" data-tone="info">Attachment</span>
                <span class="status-pill" data-tone="muted">{{ currentMailboxLabelForEmail(state.emailDetail) }}</span>
            </div>
        </div>
        <div class="reader-header__side">
            <button v-if="mobile" type="button" class="ghost-button" @click="state.mobileReaderOpen = false">Back to list</button>
            <span>{{ formatRelativeTime(state.emailDetail.sent_at || state.emailDetail.received_at) }}</span>
            <span>{{ formatDateTime(state.emailDetail.sent_at || state.emailDetail.received_at) }}</span>
        </div>
    </header>

    <div class="reader-actions" :class="{ 'reader-actions--deleted': state.emailDetail.status === 'deleted' }">
        <template v-if="state.emailDetail.status !== 'deleted'">
            <el-button @click="replyToEmail(state.emailDetail)">Reply</el-button>
            <el-button @click="toggleReadState(state.emailDetail)">{{ state.emailDetail.status === 'read' ? 'Mark unread' : 'Mark read' }}</el-button>
            <el-button @click="toggleStarState(state.emailDetail)">{{ state.emailDetail.is_flagged ? 'Remove flag' : 'Flag' }}</el-button>
            <el-button v-if="state.emailDetail.status !== 'archived'" @click="archiveEmail(state.emailDetail)">Archive</el-button>
            <el-button v-else type="success" plain @click="unarchiveEmail(state.emailDetail)">Move to inbox</el-button>
            <el-button type="danger" plain @click="deleteEmail(state.emailDetail)">Delete</el-button>
        </template>
        <template v-else>
            <el-button type="success" plain @click="restoreEmail(state.emailDetail)">Restore to inbox</el-button>
            <el-button type="danger" plain @click="purgeEmail(state.emailDetail)">Permanently delete</el-button>
            <span class="reader-actions__hint">Deleted messages leave the main workflow until they are restored.</span>
        </template>
    </div>

    <article class="glass-subpanel conversation-panel">
        <div class="section-head section-head--compact">
            <div>
                <p class="section-kicker">Conversation</p>
                <h3>{{ conversationItems.length || 1 }} messages</h3>
            </div>
            <span class="status-pill" data-tone="info">{{ state.conversationLoading ? 'Loading' : 'Grouped' }}</span>
        </div>
        <div class="conversation-list" v-loading="state.conversationLoading">
            <button
                v-for="item in conversationItems"
                :key="item.id"
                type="button"
                class="conversation-item"
                :class="{ 'is-active': state.selectedEmailId === item.id }"
                @click="selectConversationItem(item)"
            >
                <div class="conversation-item__top">
                    <strong>{{ formatSenderLine(item.from_name, item.from_address) }}</strong>
                    <span>{{ formatRelativeTime(item.sent_at || item.received_at) }}</span>
                </div>
                <p>{{ item.preview_text || item.subject || 'No preview available' }}</p>
                <div class="conversation-item__meta">
                    <span>{{ emailStatusLabel(item.status) }}</span>
                    <span v-if="item.has_attachments">Attachment</span>
                    <span v-if="item.is_flagged">Flagged</span>
                </div>
            </button>
            <div v-if="!conversationItems.length" class="conversation-item conversation-item--empty">
                <strong>This conversation contains a single message</strong>
                <p>Future messages with the same thread key will appear here.</p>
            </div>
        </div>
    </article>

    <article class="reader-card">
        <div class="reader-grid">
            <div>
                <span>Sender</span>
                <strong>{{ formatSenderLine(state.emailDetail.from_name, state.emailDetail.from_address) }}</strong>
            </div>
            <div>
                <span>Recipients</span>
                <strong>{{ formatAddressList(state.emailDetail.to_addresses) || 'Not recorded' }}</strong>
            </div>
            <div>
                <span>CC</span>
                <strong>{{ formatAddressList(state.emailDetail.cc_addresses) || 'None' }}</strong>
            </div>
            <div>
                <span>Time</span>
                <strong>{{ formatDateTime(state.emailDetail.sent_at || state.emailDetail.received_at) }}</strong>
            </div>
        </div>

        <div v-if="emailAttachments.length" class="attachment-strip">
            <div class="attachment-chip" v-for="attachment in emailAttachments" :key="attachment.filename + '-' + attachment.size">
                <strong>{{ attachment.filename || 'Attachment' }}</strong>
                <span>{{ formatFileSize(attachment.size || 0) }}</span>
            </div>
        </div>

        <div class="reader-stage" v-loading="state.detailLoading">
            <iframe
                v-if="state.emailDetail.html_content"
                class="reader-iframe"
                :srcdoc="buildEmailIframeDocument(state.emailDetail.html_content)"
                sandbox=""
            ></iframe>
            <pre v-else class="reader-pre">{{ state.emailDetail.text_content || 'No message body available' }}</pre>
        </div>
    </article>
</div>
<div v-else class="empty-panel empty-panel--reader">
    <div class="empty-panel__icon">RD</div>
    <h3>Select a message to start reading</h3>
    <p>The detail pane stays aligned with list selection and conversation context.</p>
</div>`;

const RailColumn = {
    template: railTemplate,
    setup() {
        return useInboxWorkspace();
    },
};

const SearchRail = {
    template: searchRailTemplate,
    setup() {
        return useInboxWorkspace();
    },
};

const messageTemplate = `
<article class="glass-panel lane-panel lane-panel--inbox">
    <header class="lane-toolbar lane-toolbar--inbox">
        <div class="lane-toolbar__search lane-toolbar__search--wide">
            <el-input
                :ref="bindEmailSearchInput"
                v-model="state.emailQuery"
                size="large"
                clearable
                :placeholder="t(state.currentView === 'search' ? 'Search all mailboxes' : 'Search subject, sender, recipients or body')"
                @keyup.enter="applySearch()"
            />
            <el-button type="primary" @click="applySearch()">{{ t('Search') }}</el-button>
        </div>
        <div class="lane-toolbar__actions lane-toolbar__actions--dense">
            <button type="button" class="ghost-button" @click="inboxUi.searchPanelOpen = !inboxUi.searchPanelOpen">
                {{ inboxUi.searchPanelOpen ? t('Hide filters') : t('Advanced filters') }}
            </button>
            <button v-if="state.currentView !== 'search'" type="button" class="ghost-button" @click="openRulesDrawer()">{{ t('Rules') }}</button>
            <button v-if="state.isMobile" type="button" class="ghost-button" @click="state.mobileRailOpen = true">{{ state.currentView === 'search' ? t('Filters') : t('Folders') }}</button>
            <button v-if="state.isMobile && state.selectedEmailId" type="button" class="ghost-button" @click="openSelectedEmailOnMobile()">Open detail</button>
            <button v-if="hasInboxFilters" type="button" class="ghost-button" @click="clearInboxQuery()">{{ t('Clear') }}</button>
        </div>
    </header>

    <section v-if="inboxUi.searchPanelOpen" class="search-panel glass-subpanel">
        <div class="section-head section-head--compact">
            <div>
                <p class="section-kicker">{{ t('Advanced Search') }}</p>
                <h3>{{ t('Combine fields, dates and attachments') }}</h3>
            </div>
            <span class="status-pill" data-tone="info">{{ state.emailScope === EMAIL_SCOPE_ALL ? t('All Mailboxes') : currentScopeLabel }}</span>
        </div>
        <div class="search-panel__grid">
            <div class="search-panel__section">
                <span class="search-panel__label">{{ t('Fields') }}</span>
                <div class="chip-toggle-row">
                    <button
                        v-for="field in SEARCH_FIELD_OPTIONS"
                        :key="field.key"
                        type="button"
                        class="chip-toggle"
                        :class="{ 'is-active': state.searchFields.includes(field.key) }"
                        @click="toggleSearchField(field.key)"
                    >
                        {{ t(field.label) }}
                    </button>
                </div>
            </div>

            <label class="search-field">
                <span>{{ t('Mailbox scope') }}</span>
                <select v-model="state.emailScope">
                    <option :value="EMAIL_SCOPE_ALL">{{ t('All Mailboxes') }}</option>
                    <option v-for="mailbox in state.mailboxes" :key="mailbox.id" :value="String(mailbox.id)">{{ mailbox.name || mailbox.email }}</option>
                </select>
            </label>

            <div class="search-panel__section">
                <span class="search-panel__label">{{ t('Folder') }}</span>
                <div class="chip-toggle-row">
                    <button
                        v-for="filter in SEARCH_STATUS_OPTIONS"
                        :key="filter.key"
                        type="button"
                        class="chip-toggle"
                        :class="{ 'is-active': state.emailStatus === filter.key }"
                        @click="state.emailStatus = filter.key"
                    >
                        {{ t(filter.label) }}
                    </button>
                </div>
            </div>

            <div class="search-panel__section">
                <span class="search-panel__label">{{ t('Flagged') }}</span>
                <div class="chip-toggle-row">
                    <button type="button" class="chip-toggle" :class="{ 'is-active': state.searchFlagged === null }" @click="setFlaggedFilter(null)">{{ t('Any star state') }}</button>
                    <button type="button" class="chip-toggle" :class="{ 'is-active': state.searchFlagged === true }" @click="setFlaggedFilter(true)">{{ t('Starred only') }}</button>
                    <button type="button" class="chip-toggle" :class="{ 'is-active': state.searchFlagged === false }" @click="setFlaggedFilter(false)">{{ t('Unstarred only') }}</button>
                </div>
            </div>

            <div class="search-panel__section">
                <span class="search-panel__label">{{ t('Attachments') }}</span>
                <div class="chip-toggle-row">
                    <button type="button" class="chip-toggle" :class="{ 'is-active': state.searchHasAttachments === null }" @click="setAttachmentFilter(null)">{{ t('Any attachment state') }}</button>
                    <button type="button" class="chip-toggle" :class="{ 'is-active': state.searchHasAttachments === true }" @click="setAttachmentFilter(true)">{{ t('Has attachments') }}</button>
                    <button type="button" class="chip-toggle" :class="{ 'is-active': state.searchHasAttachments === false }" @click="setAttachmentFilter(false)">{{ t('No attachments') }}</button>
                </div>
            </div>

            <label class="search-field">
                <span>{{ t('Start date') }}</span>
                <input v-model="state.searchDateFrom" type="date" />
            </label>

            <label class="search-field">
                <span>{{ t('End date') }}</span>
                <input v-model="state.searchDateTo" type="date" />
            </label>
        </div>

        <div v-if="searchSummaryChips.length" class="search-chip-row">
            <span v-for="chip in searchSummaryChips" :key="chip" class="search-chip">{{ chip }}</span>
        </div>

        <div v-if="inboxUi.recentSearches.length" class="search-recent">
            <span class="search-panel__label">{{ t('Recent searches') }}</span>
            <div class="search-recent__row">
                <button v-for="item in inboxUi.recentSearches" :key="item.id" type="button" class="search-recent__item" @click="useRecentSearch(item)">
                    <strong>{{ item.label }}</strong>
                    <small>{{ item.meta }}</small>
                </button>
            </div>
        </div>
    </section>

    <div class="lane-summary lane-summary--inbox">
        <div>
            <span>{{ t('Scope') }}</span>
            <strong>{{ currentScopeLabel }}</strong>
        </div>
        <div>
            <span>{{ t('View') }}</span>
            <strong>{{ t(INBOX_VIEW_MODES.find((item) => item.key === state.emailViewMode)?.label || 'Threads') }}</strong>
        </div>
        <div>
            <span>{{ t('Total') }}</span>
            <strong>{{ state.emailTotal }}</strong>
        </div>
        <div>
            <span>{{ t('Unread') }}</span>
            <strong>{{ currentScopeStats.unread || 0 }}</strong>
        </div>
        <div>
            <span>{{ t('Archived') }}</span>
            <strong>{{ currentScopeStats.archived || 0 }}</strong>
        </div>
    </div>

    <div class="view-switch-row">
        <button
            v-for="item in INBOX_VIEW_MODES"
            :key="item.key"
            type="button"
            class="chip-toggle view-switch"
            :class="{ 'is-active': state.emailViewMode === item.key }"
            @click="switchViewMode(item.key)"
        >
            {{ t(item.label) }}
        </button>
    </div>

    <div v-if="inboxUi.dragIds.length" class="drop-hint">
        Dragging {{ inboxUi.dragIds.length }} messages. Drop them on folders or the rules center.
    </div>

    <div v-if="state.emails.length" class="lane-bulkbar">
        <div class="lane-bulkbar__meta">
            <span>{{ state.emailViewMode === 'thread' ? 'Thread workflow' : 'Message workflow' }}</span>
            <strong>{{ selectedEmailCount ? ('Selected ' + selectedEmailCount) : ('Current page ' + state.emails.length) }}</strong>
        </div>
        <div class="lane-bulkbar__actions">
            <button type="button" class="ghost-button" @click="togglePageSelection()">
                {{ isPageSelectionFull ? 'Clear page' : 'Select page' }}
            </button>
            <template v-if="selectedEmailCount">
                <template v-if="state.emailStatus === 'deleted'">
                    <button type="button" class="ghost-button" @click="bulkRestoreSelected()">Restore selected</button>
                    <button type="button" class="ghost-button ghost-button--danger" @click="bulkPurgeSelected()">Permanently delete</button>
                </template>
                <template v-else-if="state.emailStatus === 'archived'">
                    <button type="button" class="ghost-button" @click="moveEmailsToFolder(state.selectedEmailIds, 'all')">Move to inbox</button>
                    <button type="button" class="ghost-button ghost-button--danger" @click="bulkDeleteSelected()">Delete selected</button>
                </template>
                <template v-else>
                    <button type="button" class="ghost-button" @click="bulkMarkRead(true)">Mark read</button>
                    <button type="button" class="ghost-button" @click="bulkMarkRead(false)">Mark unread</button>
                    <button type="button" class="ghost-button" @click="bulkArchiveSelected()">Archive selected</button>
                    <button type="button" class="ghost-button ghost-button--danger" @click="bulkDeleteSelected()">Delete selected</button>
                </template>
                <button type="button" class="ghost-button" @click="openRuleSeed(selectedEmails[0] || state.emailDetail)">Create rule</button>
                <button type="button" class="ghost-button" @click="clearEmailSelection()">Clear selection</button>
            </template>
        </div>
    </div>

    <div class="message-stream" v-loading="state.inboxLoading">
        <template v-if="streamSections.length">
            <section class="mail-group" v-for="group in streamSections" :key="group.key">
                <header class="mail-group__head">{{ group.label }}</header>

                <template v-if="state.emailViewMode === 'thread'">
                    <article
                        v-for="thread in group.items"
                        :key="thread.key"
                        class="thread-card glass-subpanel"
                        :class="{ 'is-active': isThreadActive(thread), 'is-unread': thread.unread_count > 0 }"
                        draggable="true"
                        @dragstart="startThreadDrag(thread, $event)"
                        @dragend="clearDragState()"
                    >
                        <button type="button" class="thread-card__shell" @click="selectThread(thread, state.isMobile)">
                            <div class="thread-card__top">
                                <div>
                                    <strong>{{ thread.subject }}</strong>
                                    <p>{{ thread.participants.join(' / ') || 'Unknown participants' }}</p>
                                </div>
                                <div class="thread-card__meta">
                                    <span>{{ formatRelativeTime(thread.latest_received_at) }}</span>
                                    <span class="thread-card__count">{{ thread.count }} messages</span>
                                </div>
                            </div>
                            <p class="thread-card__preview">{{ thread.preview_text || 'No preview available' }}</p>
                            <div class="thread-card__footer">
                                <span>{{ currentMailboxLabelForEmail(thread.latest_email) }}</span>
                                <span v-if="thread.unread_count">Unread {{ thread.unread_count }}</span>
                                <span v-if="thread.has_attachments">Attachment</span>
                                <span v-if="thread.is_flagged">Flagged</span>
                            </div>
                        </button>
                    </article>
                </template>

                <template v-else>
                    <article
                        v-for="email in group.items"
                        :key="email.id"
                        class="message-card"
                        :class="{
                            'is-active': state.selectedEmailId === email.id,
                            'is-selected': isEmailSelected(email.id),
                            'is-unread': email.status !== 'read' && email.status !== 'deleted' && email.status !== 'archived',
                            'is-deleted': email.status === 'deleted',
                            'is-archived': email.status === 'archived'
                        }"
                        draggable="true"
                        @dragstart="startEmailDrag(email, $event)"
                        @dragend="clearDragState()"
                    >
                        <div class="message-card__frame">
                            <button type="button" class="message-card__select" :class="{ 'is-selected': isEmailSelected(email.id) }" @click.stop="toggleEmailSelection(email.id)">
                                <span></span>
                            </button>
                            <button type="button" class="message-card__shell" @click="selectEmail(email, state.isMobile)">
                                <div class="message-card__top">
                                    <strong>{{ formatSenderLine(email.from_name, email.from_address) }}</strong>
                                    <div class="message-card__time">
                                        <span>{{ formatRelativeTime(email.sent_at || email.received_at) }}</span>
                                        <span v-if="email.status === 'deleted'" class="message-card__badge">Deleted</span>
                                        <span v-else-if="email.status === 'archived'" class="message-card__badge message-card__badge--archived">Archived</span>
                                    </div>
                                </div>
                                <h3>{{ email.subject || '(No subject)' }}</h3>
                                <p>{{ email.preview_text || 'No preview available' }}</p>
                                <div class="message-card__meta">
                                    <span>{{ currentMailboxLabelForEmail(email) }}</span>
                                    <span v-if="email.has_attachments">Attachment</span>
                                    <span v-if="email.is_flagged">Flagged</span>
                                </div>
                            </button>
                        </div>
                    </article>
                </template>
            </section>
        </template>
        <div v-else class="empty-panel empty-panel--stream">
            <div class="empty-panel__icon">IN</div>
            <h3>No messages in this scope</h3>
            <p>Change folders, adjust filters or sync mailboxes to load more content.</p>
        </div>
    </div>

    <div class="pagination-wrap" v-if="state.emailTotal > 0">
        <el-pagination
            background
            :layout="state.isMobile ? 'prev, pager, next' : 'total, sizes, prev, pager, next'"
            :page-sizes="[20, 40, 80, 120]"
            :page-size="state.emailPageSize"
            :current-page="state.emailPage"
            :total="state.emailTotal"
            @current-change="handleEmailPageChange"
            @size-change="handleEmailPageSizeChange"
        />
    </div>
</article>`;

const MessageColumn = {
    template: messageTemplate,
    setup() {
        return useInboxWorkspace();
    },
};

const ReaderSurface = {
    props: {
        mobile: {
            type: Boolean,
            default: false,
        },
    },
    template: readerTemplate,
    setup() {
        return useInboxWorkspace();
    },
};

const RulesDrawer = {
    template: `
    <el-drawer
        v-model="inboxUi.rulesDrawerOpen"
        :direction="drawerDirection"
        :size="drawerSize"
        class="utility-drawer utility-drawer--rules"
        title="Rules Center"
    >
        <div class="rules-shell">
            <section class="glass-subpanel">
                <div class="section-head section-head--compact">
                    <div>
                        <p class="section-kicker">Templates</p>
                        <h3>Quick start</h3>
                    </div>
                    <span class="status-pill" data-tone="info">{{ state.rules.length }} rules</span>
                </div>
                <div class="rule-template-grid">
                    <button v-for="template in RULE_TEMPLATES" :key="template.key" type="button" class="rule-template" @click="applyRuleTemplate(template)">
                        <strong>{{ template.title }}</strong>
                        <p>{{ template.copy }}</p>
                    </button>
                </div>
            </section>

            <form class="glass-subpanel rules-form" @submit.prevent="submitRuleDraft()">
                <div class="section-head section-head--compact">
                    <div>
                        <p class="section-kicker">Rule Editor</p>
                        <h3>{{ inboxUi.editingRuleId ? 'Update rule' : 'Create rule' }}</h3>
                    </div>
                    <button type="button" class="ghost-button" @click="openRulesDrawer()">Reset</button>
                </div>

                <label class="search-field">
                    <span>Rule name</span>
                    <input v-model="inboxUi.ruleDraft.name" type="text" placeholder="Example: Archive billing notifications" />
                </label>
                <label class="search-field">
                    <span>Mailbox scope</span>
                    <select v-model="inboxUi.ruleDraft.mailbox_id">
                        <option value="">All mailboxes</option>
                        <option v-for="mailbox in state.mailboxes" :key="mailbox.id" :value="String(mailbox.id)">
                            {{ mailbox.name || mailbox.email }}
                        </option>
                    </select>
                </label>
                <div class="search-panel__grid search-panel__grid--rules">
                    <label class="search-field">
                        <span>Match field</span>
                        <select v-model="inboxUi.ruleDraft.match_field">
                            <option v-for="field in RULE_FIELD_OPTIONS" :key="field.key" :value="field.key">{{ field.label }}</option>
                        </select>
                    </label>
                    <label class="search-field">
                        <span>Operator</span>
                        <select v-model="inboxUi.ruleDraft.match_operator">
                            <option value="contains">Contains</option>
                            <option value="equals">Equals</option>
                            <option value="starts_with">Starts with</option>
                            <option value="ends_with">Ends with</option>
                        </select>
                    </label>
                </div>
                <label class="search-field">
                    <span>Match value</span>
                    <input v-model="inboxUi.ruleDraft.match_value" type="text" placeholder="Example: newsletter@example.com" />
                </label>
                <label class="search-field">
                    <span>Action</span>
                    <select v-model="inboxUi.ruleDraft.action">
                        <option v-for="action in RULE_ACTION_OPTIONS" :key="action.key" :value="action.key">{{ action.label }}</option>
                    </select>
                </label>
                <label class="rule-toggle">
                    <input v-model="inboxUi.ruleDraft.is_active" type="checkbox" />
                    <span>Enable immediately after saving</span>
                </label>
                <el-button native-type="submit" type="primary" :loading="state.rulesSaving">
                    {{ inboxUi.editingRuleId ? 'Save rule' : 'Create rule' }}
                </el-button>
            </form>

            <section class="glass-subpanel rules-list">
                <div class="section-head section-head--compact">
                    <div>
                        <p class="section-kicker">Existing Rules</p>
                        <h3>Automation list</h3>
                    </div>
                </div>
                <div v-if="state.rules.length" class="rules-list__grid">
                    <article v-for="rule in state.rules" :key="rule.id" class="rule-card">
                        <div class="rule-card__top">
                            <div>
                                <strong>{{ rule.name }}</strong>
                                <p>{{ mailboxNameById(rule.mailbox_id) }}</p>
                            </div>
                            <span class="status-pill" :data-tone="rule.is_active ? 'success' : 'muted'">
                                {{ rule.is_active ? 'Enabled' : 'Disabled' }}
                            </span>
                        </div>
                        <div class="rule-card__meta">
                            <span>{{ ruleFieldLabel(rule.match_field) }}</span>
                            <span>{{ ruleOperatorLabel(rule.match_operator) }}</span>
                            <strong>{{ rule.match_value }}</strong>
                        </div>
                        <div class="rule-card__meta">
                            <span>Action</span>
                            <strong>{{ ruleActionLabel(rule.action) }}</strong>
                        </div>
                        <div class="rule-card__actions">
                            <button type="button" class="ghost-button" @click="openRulesDrawer(rule)">Edit</button>
                            <button type="button" class="ghost-button" @click="toggleRuleActive(rule)">{{ rule.is_active ? 'Disable' : 'Enable' }}</button>
                            <button type="button" class="ghost-button ghost-button--danger" @click="deleteRuleEntry(rule)">Delete</button>
                        </div>
                    </article>
                </div>
                <div v-else class="empty-panel empty-panel--grid">
                    <div class="empty-panel__icon">RL</div>
                    <h3>No automation rules yet</h3>
                    <p>Start from a template or drag a message into the rules center to seed a draft.</p>
                </div>
            </section>
        </div>
    </el-drawer>
    `,
    setup() {
        return {
            ...useInboxWorkspace(),
            RULE_TEMPLATES,
            RULE_FIELD_OPTIONS,
            RULE_ACTION_OPTIONS,
        };
    },
};

export const InboxView = {
    components: {
        RailColumn,
        MessageColumn,
        ReaderSurface,
        RulesDrawer,
    },
    template: `
    <section class="desk-shell inbox-shell inbox-shell--studio">
        <aside class="desk-rail" v-if="!state.isMobile">
            <RailColumn />
        </aside>
        <div class="desk-stream">
            <MessageColumn />
        </div>
        <div class="desk-reader" v-if="!state.isMobile">
            <ReaderSurface />
        </div>

        <section v-if="state.isMobile && state.mobileReaderOpen" class="reader-overlay">
            <ReaderSurface :mobile="true" />
        </section>

        <el-drawer v-if="state.isMobile" v-model="state.mobileRailOpen" direction="btt" size="88%" class="utility-drawer utility-drawer--rail" title="Folders & Accounts">
            <RailColumn />
        </el-drawer>

        <RulesDrawer />
    </section>
    `,
    setup() {
        return useInboxWorkspace();
    },
};

export const SearchView = {
    components: {
        SearchRail,
        MessageColumn,
        ReaderSurface,
    },
    template: `
    <section class="desk-shell inbox-shell inbox-shell--studio inbox-shell--search">
        <aside class="desk-rail" v-if="!state.isMobile">
            <SearchRail />
        </aside>
        <div class="desk-stream">
            <MessageColumn />
        </div>
        <div class="desk-reader" v-if="!state.isMobile">
            <ReaderSurface />
        </div>

        <section v-if="state.isMobile && state.mobileReaderOpen" class="reader-overlay">
            <ReaderSurface :mobile="true" />
        </section>

        <el-drawer v-if="state.isMobile" v-model="state.mobileRailOpen" direction="btt" size="88%" class="utility-drawer utility-drawer--rail" :title="t('Refine Results')">
            <SearchRail />
        </el-drawer>
    </section>
    `,
    setup() {
        return useInboxWorkspace();
    },
};
