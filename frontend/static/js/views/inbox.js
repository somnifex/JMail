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
        title: '同发件人归档',
        copy: '把固定发件人的通知自动沉到归档。',
        build: () => ({
            name: '同发件人自动归档',
            match_field: 'sender',
            match_operator: 'contains',
            match_value: '',
            action: 'archive',
            is_active: true,
        }),
    },
    {
        key: 'flag-subject',
        title: '主题命中星标',
        copy: '含关键字的会话自动提级为重点。',
        build: () => ({
            name: '主题关键字星标',
            match_field: 'subject',
            match_operator: 'contains',
            match_value: '',
            action: 'flag',
            is_active: true,
        }),
    },
    {
        key: 'attachments-read',
        title: '附件邮件已读',
        copy: '对批量附件通知做自动清理。',
        build: () => ({
            name: '附件类邮件自动已读',
            match_field: 'attachments',
            match_operator: 'contains',
            match_value: '',
            action: 'mark_read',
            is_active: true,
        }),
    },
];

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
        || store.state.searchHasAttachments !== null
        || Boolean(store.state.searchDateFrom)
        || Boolean(store.state.searchDateTo)
        || store.state.emailScope !== EMAIL_SCOPE_ALL
        || store.state.emailStatus !== 'all';

    if (!query && !hasAdvanced) {
        return null;
    }

    const scopeLabel = store.currentScopeMailbox?.value?.name || store.currentScopeMailbox?.value?.email || '全部邮箱';
    const statusLabel = EMAIL_FILTERS.find((item) => item.key === store.state.emailStatus)?.label || '收件箱';
    const fieldLabel = fields.includes('all')
        ? '全部字段'
        : SEARCH_FIELD_OPTIONS.filter((item) => fields.includes(item.key)).map((item) => item.label).join(' / ');
    const extras = [];
    if (store.state.searchHasAttachments === true) extras.push('仅附件');
    if (store.state.searchHasAttachments === false) extras.push('排除附件');
    if (store.state.searchDateFrom || store.state.searchDateTo) extras.push('时间筛选');

    return {
        id: `${query}|${store.state.emailScope}|${store.state.emailStatus}|${fields.join(',')}|${store.state.searchHasAttachments}|${store.state.searchDateFrom}|${store.state.searchDateTo}`,
        label: query || `${statusLabel} · ${scopeLabel}`,
        query,
        scope: store.state.emailScope,
        status: store.state.emailStatus,
        searchFields: fields,
        hasAttachments: store.state.searchHasAttachments,
        dateFrom: store.state.searchDateFrom,
        dateTo: store.state.searchDateTo,
        meta: [scopeLabel, statusLabel, fieldLabel, ...extras].filter(Boolean).join(' · '),
    };
}

function buildRuleDraftFromEmail(email) {
    const subject = normalizeThreadSubject(email?.subject);
    const sender = email?.from_address || '';
    const senderName = email?.from_name || sender || '来信';
    return {
        name: sender ? `处理 ${senderName}` : `处理 ${subject}`,
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
            all: '收',
            unread: '未',
            flagged: '星',
            read: '读',
            archived: '档',
            deleted: '删',
        })[filter.key] || '箱',
    })));
    const mailboxBranches = computed(() => store.state.mailboxes.map((mailbox) => {
        const stats = store.getMailboxStats(mailbox.id);
        return {
            mailbox,
            expanded: inboxUi.branchOpen[mailbox.id] !== false,
            folders: [
                { key: `mailbox:${mailbox.id}:all`, label: '收件箱', status: 'all', count: Number(stats.total || 0), droppable: true },
                { key: `mailbox:${mailbox.id}:archived`, label: '已归档', status: 'archived', count: Number(stats.archived || 0), droppable: true },
                { key: `mailbox:${mailbox.id}:deleted`, label: '已删除', status: 'deleted', count: Number(stats.deleted || 0), droppable: true },
            ],
        };
    }));
    const searchSummaryChips = computed(() => {
        const chips = [];
        if (store.state.emailQuery.trim()) {
            chips.push(`关键词 ${store.state.emailQuery.trim()}`);
        }
        if (!store.state.searchFields.includes('all')) {
            const fields = SEARCH_FIELD_OPTIONS
                .filter((item) => store.state.searchFields.includes(item.key))
                .map((item) => item.label)
                .join(' / ');
            if (fields) {
                chips.push(`字段 ${fields}`);
            }
        }
        if (store.state.searchHasAttachments === true) {
            chips.push('仅附件邮件');
        }
        if (store.state.searchHasAttachments === false) {
            chips.push('排除附件');
        }
        if (store.state.searchDateFrom || store.state.searchDateTo) {
            chips.push(`时间 ${store.state.searchDateFrom || '开始'} 至 ${store.state.searchDateTo || '现在'}`);
        }
        if (store.state.emailScope !== EMAIL_SCOPE_ALL) {
            chips.push(`邮箱 ${store.currentScopeLabel.value}`);
        }
        if (store.state.emailStatus !== 'all') {
            chips.push(`文件夹 ${EMAIL_FILTERS.find((item) => item.key === store.state.emailStatus)?.label || store.state.emailStatus}`);
        }
        return chips;
    });
    const conversationItems = computed(() => [...store.state.emailConversation]
        .sort((left, right) => new Date(right?.received_at || right?.sent_at || 0) - new Date(left?.received_at || left?.sent_at || 0)));
    const ruleCountLabel = computed(() => `${store.activeRuleCount.value || 0} 条运行中`);
    const drawerDirection = computed(() => store.state.isMobile ? 'btt' : 'rtl');
    const drawerSize = computed(() => store.state.isMobile ? '92%' : '480px');

    const mailboxNameById = (mailboxId) => {
        if (!mailboxId) {
            return '全部邮箱';
        }
        const mailbox = store.state.mailboxes.find((item) => item.id === Number(mailboxId));
        return mailbox?.name || mailbox?.email || '指定邮箱';
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

    const ruleFieldLabel = (key) => RULE_FIELD_OPTIONS.find((item) => item.key === key)?.label || key || '字段';
    const ruleActionLabel = (key) => RULE_ACTION_OPTIONS.find((item) => item.key === key)?.label || key || '动作';
    const ruleOperatorLabel = (key) => ({
        contains: '包含',
        equals: '完全匹配',
        starts_with: '开头匹配',
        ends_with: '结尾匹配',
    })[key] || key || '匹配';

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
        setAttachmentFilter,
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
        INBOX_VIEW_MODES,
        SEARCH_FIELD_OPTIONS,
        EMAIL_SCOPE_ALL,
    };
}

const railTemplate = `
<div class="rail-stack">
    <article class="glass-panel rail-panel rail-panel--hero">
        <div class="section-head section-head--compact">
            <div>
                <p class="section-kicker">当前范围</p>
                <h3>{{ currentScopeLabel }}</h3>
            </div>
            <span class="status-pill" :data-tone="currentScopeMailbox ? mailboxStatusTone(currentScopeMailbox.status) : 'success'">
                {{ currentScopeMailbox ? mailboxStatusLabel(currentScopeMailbox.status) : '全部邮箱' }}
            </span>
        </div>
        <p class="rail-copy">{{ currentScopeDescription }}</p>
        <div class="scope-metrics">
            <div v-for="item in heroStats.slice(0, 3)" :key="item.label">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
            </div>
        </div>
        <div class="action-row action-row--stacked">
            <el-button type="primary" round @click="openCompose()">写邮件</el-button>
            <el-button round :loading="state.syncing" @click="syncCurrentScope()">{{ currentScopeMailbox ? '同步当前邮箱' : '同步全部邮箱' }}</el-button>
            <el-button round plain @click="openRulesDrawer()">
                规则入口
                <span class="action-row__hint">{{ ruleCountLabel }}</span>
            </el-button>
        </div>
    </article>

    <article class="glass-panel rail-panel">
        <div class="section-head section-head--compact">
            <div>
                <p class="section-kicker">文件夹树</p>
                <h3>统一与分账户</h3>
            </div>
            <el-button text @click="openMailboxDrawer('create')">新增邮箱</el-button>
        </div>

        <div class="folder-tree">
            <section class="folder-tree__group">
                <header class="folder-tree__head">
                    <span>智能文件夹</span>
                    <small>拖放支持收件箱 / 归档 / 已删除</small>
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
                    <span>邮箱分支</span>
                    <small>{{ state.mailboxes.length }} 个账户</small>
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
                    <span>规则入口</span>
                    <small>可拖入当前邮件生成草案</small>
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
                    <span class="folder-node__icon">规</span>
                    <div class="folder-node__copy">
                        <strong>规则工作台</strong>
                        <small>{{ ruleCountLabel }}</small>
                    </div>
                    <b>{{ state.rules.length }}</b>
                </button>
            </section>
        </div>
    </article>

    <article class="glass-panel rail-panel rail-panel--micro">
        <div class="section-head section-head--compact">
            <div>
                <p class="section-kicker">当前配额</p>
                <h3>{{ state.mailboxes.length }} / {{ state.user?.max_mailboxes || 0 }}</h3>
            </div>
        </div>
        <div class="quota-bar">
            <span :style="{ width: mailboxUsagePercent + '%' }"></span>
        </div>
        <p class="rail-copy">统一收件箱先让你看清全局，文件夹树再负责把处理动作落到每个邮箱。</p>
    </article>
</div>`;

const readerTemplate = `
<div v-if="state.emailDetail" class="reader-stack" :class="{ 'is-mobile': mobile }">
    <header class="reader-header">
        <div class="reader-header__copy">
            <p class="section-kicker">阅读窗格</p>
            <h2>{{ state.emailDetail.subject || '(无主题)' }}</h2>
            <div class="reader-meta-line">
                <span class="status-pill" :data-tone="messageStatusTone(state.emailDetail)">
                    {{ emailStatusLabel(state.emailDetail.status) }}
                </span>
                <span class="status-pill" v-if="state.emailDetail.is_flagged" data-tone="warning">星标</span>
                <span class="status-pill" v-if="state.emailDetail.has_attachments" data-tone="info">附件</span>
                <span class="status-pill" data-tone="muted">{{ currentMailboxLabelForEmail(state.emailDetail) }}</span>
            </div>
        </div>
        <div class="reader-header__side">
            <button v-if="mobile" type="button" class="ghost-button" @click="state.mobileReaderOpen = false">返回列表</button>
            <span>{{ formatRelativeTime(state.emailDetail.sent_at || state.emailDetail.received_at) }}</span>
            <span>{{ formatDateTime(state.emailDetail.sent_at || state.emailDetail.received_at) }}</span>
        </div>
    </header>

    <div class="reader-actions" :class="{ 'reader-actions--deleted': state.emailDetail.status === 'deleted' }">
        <template v-if="state.emailDetail.status !== 'deleted'">
            <el-button round @click="replyToEmail(state.emailDetail)">回复</el-button>
            <el-button round @click="toggleReadState(state.emailDetail)">{{ state.emailDetail.status === 'read' ? '标记未读' : '标记已读' }}</el-button>
            <el-button round @click="toggleStarState(state.emailDetail)">{{ state.emailDetail.is_flagged ? '取消星标' : '设为星标' }}</el-button>
            <el-button v-if="state.emailDetail.status !== 'archived'" round @click="archiveEmail(state.emailDetail)">归档</el-button>
            <el-button v-else round type="success" plain @click="unarchiveEmail(state.emailDetail)">移回收件箱</el-button>
            <el-button round type="danger" plain @click="deleteEmail(state.emailDetail)">删除</el-button>
        </template>
        <template v-else>
            <el-button round type="success" plain @click="restoreEmail(state.emailDetail)">恢复到收件箱</el-button>
            <el-button round type="danger" plain @click="purgeEmail(state.emailDetail)">彻底删除</el-button>
            <span class="reader-actions__hint">已删除邮件会被隔离出主工作流，恢复后才能再次归档、回复或标记。</span>
        </template>
    </div>

    <article class="glass-subpanel conversation-panel">
        <div class="section-head section-head--compact">
            <div>
                <p class="section-kicker">会话时间线</p>
                <h3>{{ conversationItems.length || 1 }} 封邮件</h3>
            </div>
            <span class="status-pill" data-tone="info">{{ state.conversationLoading ? '载入中' : '已聚合' }}</span>
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
                <p>{{ item.preview_text || item.subject || '暂无预览' }}</p>
                <div class="conversation-item__meta">
                    <span>{{ emailStatusLabel(item.status) }}</span>
                    <span v-if="item.has_attachments">附件</span>
                    <span v-if="item.is_flagged">星标</span>
                </div>
            </button>
            <div v-if="!conversationItems.length" class="conversation-item conversation-item--empty">
                <strong>当前会话只有这一封邮件</strong>
                <p>后续同主题来信会自动聚合到这里。</p>
            </div>
        </div>
    </article>

    <article class="reader-card">
        <div class="reader-grid">
            <div>
                <span>发件人</span>
                <strong>{{ formatSenderLine(state.emailDetail.from_name, state.emailDetail.from_address) }}</strong>
            </div>
            <div>
                <span>收件人</span>
                <strong>{{ formatAddressList(state.emailDetail.to_addresses) || '未记录' }}</strong>
            </div>
            <div>
                <span>抄送</span>
                <strong>{{ formatAddressList(state.emailDetail.cc_addresses) || '无' }}</strong>
            </div>
            <div>
                <span>时间</span>
                <strong>{{ formatDateTime(state.emailDetail.sent_at || state.emailDetail.received_at) }}</strong>
            </div>
        </div>

        <div v-if="emailAttachments.length" class="attachment-strip">
            <div class="attachment-chip" v-for="attachment in emailAttachments" :key="attachment.filename + '-' + attachment.size">
                <strong>{{ attachment.filename || '附件' }}</strong>
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
            <pre v-else class="reader-pre">{{ state.emailDetail.text_content || '暂无正文' }}</pre>
        </div>
    </article>
</div>
<div v-else class="empty-panel empty-panel--reader">
    <div class="empty-panel__icon">阅</div>
    <h3>选择一封邮件开始阅读</h3>
    <p>左侧文件夹树可切换统一收件箱、单邮箱文件夹与规则入口，阅读窗格会自动保持会话上下文。</p>
</div>`;

const RailColumn = {
    template: railTemplate,
    setup() {
        return useInboxWorkspace();
    },
};

const MessageColumn = {
    template: `
    <article class="glass-panel lane-panel lane-panel--inbox">
        <header class="lane-toolbar lane-toolbar--inbox">
            <div class="lane-toolbar__search lane-toolbar__search--wide">
                <el-input
                    :ref="bindEmailSearchInput"
                    v-model="state.emailQuery"
                    size="large"
                    clearable
                    placeholder="统一搜索全部邮箱、主题、发件人和正文"
                    @keyup.enter="applySearch()"
                />
                <el-button round type="primary" @click="applySearch()">搜索</el-button>
            </div>
            <div class="lane-toolbar__actions lane-toolbar__actions--dense">
                <button type="button" class="ghost-button" @click="inboxUi.searchPanelOpen = !inboxUi.searchPanelOpen">
                    {{ inboxUi.searchPanelOpen ? '收起搜索器' : '高级搜索' }}
                </button>
                <button type="button" class="ghost-button" @click="openRulesDrawer()">规则</button>
                <button v-if="state.isMobile" type="button" class="ghost-button" @click="state.mobileRailOpen = true">文件夹树</button>
                <button v-if="state.isMobile && state.selectedEmailId" type="button" class="ghost-button" @click="openSelectedEmailOnMobile()">打开阅读</button>
                <button v-if="hasInboxFilters" type="button" class="ghost-button" @click="clearInboxQuery()">清空</button>
            </div>
        </header>

        <section v-if="inboxUi.searchPanelOpen" class="search-panel glass-subpanel">
            <div class="section-head section-head--compact">
                <div>
                    <p class="section-kicker">跨邮箱统一搜索</p>
                    <h3>字段、时间与附件联合筛选</h3>
                </div>
                <span class="status-pill" data-tone="info">{{ state.emailScope === EMAIL_SCOPE_ALL ? '全部邮箱' : currentScopeLabel }}</span>
            </div>

            <div class="search-panel__grid">
                <div class="search-panel__section">
                    <span class="search-panel__label">搜索字段</span>
                    <div class="chip-toggle-row">
                        <button
                            v-for="field in SEARCH_FIELD_OPTIONS"
                            :key="field.key"
                            type="button"
                            class="chip-toggle"
                            :class="{ 'is-active': state.searchFields.includes(field.key) }"
                            @click="toggleSearchField(field.key)"
                        >
                            {{ field.label }}
                        </button>
                    </div>
                </div>

                <div class="search-panel__section">
                    <span class="search-panel__label">附件条件</span>
                    <div class="chip-toggle-row">
                        <button type="button" class="chip-toggle" :class="{ 'is-active': state.searchHasAttachments === null }" @click="setAttachmentFilter(null)">不限</button>
                        <button type="button" class="chip-toggle" :class="{ 'is-active': state.searchHasAttachments === true }" @click="setAttachmentFilter(true)">仅附件</button>
                        <button type="button" class="chip-toggle" :class="{ 'is-active': state.searchHasAttachments === false }" @click="setAttachmentFilter(false)">无附件</button>
                    </div>
                </div>

                <label class="search-field">
                    <span>开始日期</span>
                    <input v-model="state.searchDateFrom" type="date" />
                </label>

                <label class="search-field">
                    <span>结束日期</span>
                    <input v-model="state.searchDateTo" type="date" />
                </label>
            </div>

            <div v-if="searchSummaryChips.length" class="search-chip-row">
                <span v-for="chip in searchSummaryChips" :key="chip" class="search-chip">{{ chip }}</span>
            </div>

            <div v-if="inboxUi.recentSearches.length" class="search-recent">
                <span class="search-panel__label">最近搜索</span>
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
                <span>当前范围</span>
                <strong>{{ currentScopeLabel }}</strong>
            </div>
            <div>
                <span>视图模式</span>
                <strong>{{ INBOX_VIEW_MODES.find((item) => item.key === state.emailViewMode)?.label || '会话视图' }}</strong>
            </div>
            <div>
                <span>结果</span>
                <strong>{{ state.emailTotal }}</strong>
            </div>
            <div>
                <span>未读</span>
                <strong>{{ currentScopeStats.unread || 0 }}</strong>
            </div>
            <div>
                <span>已归档</span>
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
                {{ item.label }}
            </button>
        </div>

        <div v-if="inboxUi.dragIds.length" class="drop-hint">
            正在拖动 {{ inboxUi.dragIds.length }} 封邮件，可拖到左侧的收件箱、已归档、已删除或规则入口。
        </div>

        <div v-if="state.emails.length" class="lane-bulkbar">
            <div class="lane-bulkbar__meta">
                <span>{{ state.emailViewMode === 'thread' ? '会话工作流' : '邮件工作流' }}</span>
                <strong>{{ selectedEmailCount ? ('已选 ' + selectedEmailCount + ' 封') : ('本页 ' + state.emails.length + ' 封，可批量处理') }}</strong>
            </div>
            <div class="lane-bulkbar__actions">
                <button type="button" class="ghost-button" @click="togglePageSelection()">
                    {{ isPageSelectionFull ? '取消本页' : '全选本页' }}
                </button>
                <template v-if="selectedEmailCount">
                    <template v-if="state.emailStatus === 'deleted'">
                        <button type="button" class="ghost-button" @click="bulkRestoreSelected()">批量恢复</button>
                        <button type="button" class="ghost-button ghost-button--danger" @click="bulkPurgeSelected()">彻底删除</button>
                    </template>
                    <template v-else-if="state.emailStatus === 'archived'">
                        <button type="button" class="ghost-button" @click="moveEmailsToFolder(state.selectedEmailIds, 'all')">移回收件箱</button>
                        <button type="button" class="ghost-button ghost-button--danger" @click="bulkDeleteSelected()">批量删除</button>
                    </template>
                    <template v-else>
                        <button type="button" class="ghost-button" @click="bulkMarkRead(true)">批量已读</button>
                        <button type="button" class="ghost-button" @click="bulkMarkRead(false)">批量未读</button>
                        <button type="button" class="ghost-button" @click="bulkArchiveSelected()">批量归档</button>
                        <button type="button" class="ghost-button ghost-button--danger" @click="bulkDeleteSelected()">批量删除</button>
                    </template>
                    <button type="button" class="ghost-button" @click="openRuleSeed(selectedEmails[0] || state.emailDetail)">生成规则</button>
                    <button type="button" class="ghost-button" @click="clearEmailSelection()">清空勾选</button>
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
                            :class="{
                                'is-active': isThreadActive(thread),
                                'is-unread': thread.unread_count > 0
                            }"
                            draggable="true"
                            @dragstart="startThreadDrag(thread, $event)"
                            @dragend="clearDragState()"
                        >
                            <button type="button" class="thread-card__shell" @click="selectThread(thread, state.isMobile)">
                                <div class="thread-card__top">
                                    <div>
                                        <strong>{{ thread.subject }}</strong>
                                        <p>{{ thread.participants.join(' · ') || '未知参与者' }}</p>
                                    </div>
                                    <div class="thread-card__meta">
                                        <span>{{ formatRelativeTime(thread.latest_received_at) }}</span>
                                        <span class="thread-card__count">{{ thread.count }} 封</span>
                                    </div>
                                </div>
                                <p class="thread-card__preview">{{ thread.preview_text || '暂无预览' }}</p>
                                <div class="thread-card__footer">
                                    <span>{{ currentMailboxLabelForEmail(thread.latest_email) }}</span>
                                    <span v-if="thread.unread_count">未读 {{ thread.unread_count }}</span>
                                    <span v-if="thread.has_attachments">附件</span>
                                    <span v-if="thread.is_flagged">星标</span>
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
                                <button
                                    type="button"
                                    class="message-card__select"
                                    :class="{ 'is-selected': isEmailSelected(email.id) }"
                                    @click.stop="toggleEmailSelection(email.id)"
                                >
                                    <span></span>
                                </button>
                                <button
                                    type="button"
                                    class="message-card__shell"
                                    @click="selectEmail(email, state.isMobile)"
                                >
                                    <div class="message-card__top">
                                        <strong>{{ formatSenderLine(email.from_name, email.from_address) }}</strong>
                                        <div class="message-card__time">
                                            <span>{{ formatRelativeTime(email.sent_at || email.received_at) }}</span>
                                            <span v-if="email.status === 'deleted'" class="message-card__badge">已删除</span>
                                            <span v-else-if="email.status === 'archived'" class="message-card__badge message-card__badge--archived">已归档</span>
                                        </div>
                                    </div>
                                    <h3>{{ email.subject || '(无主题)' }}</h3>
                                    <p>{{ email.preview_text || '暂无预览' }}</p>
                                    <div class="message-card__meta">
                                        <span>{{ currentMailboxLabelForEmail(email) }}</span>
                                        <span v-if="email.has_attachments">附件</span>
                                        <span v-if="email.is_flagged">星标</span>
                                    </div>
                                </button>
                            </div>
                        </article>
                    </template>
                </section>
            </template>
            <div v-else class="empty-panel empty-panel--stream">
                <div class="empty-panel__icon">箱</div>
                <h3>这个范围里暂时没有邮件</h3>
                <p>可以切换文件夹树、调整高级搜索，或先同步当前邮箱。</p>
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
    </article>
    `,
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
        title="规则工作台"
    >
        <div class="rules-shell">
            <section class="glass-subpanel">
                <div class="section-head section-head--compact">
                    <div>
                        <p class="section-kicker">规则模板</p>
                        <h3>快速起草</h3>
                    </div>
                    <span class="status-pill" data-tone="info">{{ state.rules.length }} 条规则</span>
                </div>
                <div class="rule-template-grid">
                    <button
                        v-for="template in RULE_TEMPLATES"
                        :key="template.key"
                        type="button"
                        class="rule-template"
                        @click="applyRuleTemplate(template)"
                    >
                        <strong>{{ template.title }}</strong>
                        <p>{{ template.copy }}</p>
                    </button>
                </div>
            </section>

            <form class="glass-subpanel rules-form" @submit.prevent="submitRuleDraft()">
                <div class="section-head section-head--compact">
                    <div>
                        <p class="section-kicker">规则编辑器</p>
                        <h3>{{ inboxUi.editingRuleId ? '更新规则' : '新建规则' }}</h3>
                    </div>
                    <button type="button" class="ghost-button" @click="openRulesDrawer()">重置</button>
                </div>

                <label class="search-field">
                    <span>规则名称</span>
                    <input v-model="inboxUi.ruleDraft.name" type="text" placeholder="例如：账单类邮件自动归档" />
                </label>

                <label class="search-field">
                    <span>作用邮箱</span>
                    <select v-model="inboxUi.ruleDraft.mailbox_id">
                        <option value="">全部邮箱</option>
                        <option v-for="mailbox in state.mailboxes" :key="mailbox.id" :value="String(mailbox.id)">
                            {{ mailbox.name || mailbox.email }}
                        </option>
                    </select>
                </label>

                <div class="search-panel__grid search-panel__grid--rules">
                    <label class="search-field">
                        <span>匹配字段</span>
                        <select v-model="inboxUi.ruleDraft.match_field">
                            <option v-for="field in RULE_FIELD_OPTIONS" :key="field.key" :value="field.key">{{ field.label }}</option>
                        </select>
                    </label>

                    <label class="search-field">
                        <span>匹配方式</span>
                        <select v-model="inboxUi.ruleDraft.match_operator">
                            <option value="contains">包含</option>
                            <option value="equals">完全匹配</option>
                            <option value="starts_with">开头匹配</option>
                            <option value="ends_with">结尾匹配</option>
                        </select>
                    </label>
                </div>

                <label class="search-field">
                    <span>匹配值</span>
                    <input v-model="inboxUi.ruleDraft.match_value" type="text" placeholder="例如：newsletter@example.com" />
                </label>

                <label class="search-field">
                    <span>执行动作</span>
                    <select v-model="inboxUi.ruleDraft.action">
                        <option v-for="action in RULE_ACTION_OPTIONS" :key="action.key" :value="action.key">{{ action.label }}</option>
                    </select>
                </label>

                <label class="rule-toggle">
                    <input v-model="inboxUi.ruleDraft.is_active" type="checkbox" />
                    <span>保存后立即启用</span>
                </label>

                <el-button native-type="submit" type="primary" round :loading="state.rulesSaving">
                    {{ inboxUi.editingRuleId ? '保存规则' : '创建规则' }}
                </el-button>
            </form>

            <section class="glass-subpanel rules-list">
                <div class="section-head section-head--compact">
                    <div>
                        <p class="section-kicker">已存在规则</p>
                        <h3>自动策略列表</h3>
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
                                {{ rule.is_active ? '启用中' : '已停用' }}
                            </span>
                        </div>
                        <div class="rule-card__meta">
                            <span>{{ ruleFieldLabel(rule.match_field) }}</span>
                            <span>{{ ruleOperatorLabel(rule.match_operator) }}</span>
                            <strong>{{ rule.match_value }}</strong>
                        </div>
                        <div class="rule-card__meta">
                            <span>动作</span>
                            <strong>{{ ruleActionLabel(rule.action) }}</strong>
                        </div>
                        <div class="rule-card__actions">
                            <button type="button" class="ghost-button" @click="openRulesDrawer(rule)">编辑</button>
                            <button type="button" class="ghost-button" @click="toggleRuleActive(rule)">{{ rule.is_active ? '停用' : '启用' }}</button>
                            <button type="button" class="ghost-button ghost-button--danger" @click="deleteRuleEntry(rule)">删除</button>
                        </div>
                    </article>
                </div>

                <div v-else class="empty-panel empty-panel--grid">
                    <div class="empty-panel__icon">规</div>
                    <h3>还没有自动规则</h3>
                    <p>可以从模板开始，也可以把邮件拖到左侧规则入口快速生成草案。</p>
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
    <section class="desk-shell inbox-shell">
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

        <el-drawer
            v-if="state.isMobile"
            v-model="state.mobileRailOpen"
            direction="btt"
            size="88%"
            class="utility-drawer utility-drawer--rail"
            title="文件夹树"
        >
            <RailColumn />
        </el-drawer>

        <RulesDrawer />
    </section>
    `,
    setup() {
        return useInboxWorkspace();
    },
};


