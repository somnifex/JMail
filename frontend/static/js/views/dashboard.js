import { useJmailStore } from '../store.js';

const { computed } = window.Vue;

export const OverviewView = {
    template: `
    <section class="page-shell page-shell--overview">
        <section class="summary-strip summary-strip--dashboard">
            <article class="summary-item summary-item--dashboard" v-for="card in summaryCards" :key="card.label">
                <span>{{ t(card.label) }}</span>
                <strong>{{ card.value }}</strong>
                <p>{{ t(card.copy) }}</p>
            </article>
        </section>

        <section class="page-grid page-grid--overview-studio">
            <article class="page-card page-card--span-two">
                <div class="section-head">
                    <div>
                        <p class="section-kicker">{{ t('Mailbox Health') }}</p>
                        <h3>{{ t('Account status') }}</h3>
                    </div>
                    <el-button text @click="openView('accounts')">{{ t('Manage accounts') }}</el-button>
                </div>
                <div class="line-list line-list--soft">
                    <div class="line-item" v-for="mailbox in mailboxHealthCards.slice(0, 6)" :key="mailbox.id">
                        <div class="line-item__copy">
                            <strong>{{ mailbox.name || mailbox.email }}</strong>
                            <p>{{ mailbox.email }}</p>
                        </div>
                        <div class="line-item__meta">
                            <span class="status-pill" :data-tone="mailboxStatusTone(mailbox.status)">{{ mailboxStatusLabel(mailbox.status) }}</span>
                            <b>{{ getMailboxStats(mailbox.id).unread || 0 }} {{ t('Unread') }}</b>
                        </div>
                    </div>
                    <div v-if="!mailboxHealthCards.length" class="empty-inline">{{ t('No mailbox is connected yet. Start with Gmail, Outlook or a custom IMAP server.') }}</div>
                </div>
            </article>

            <article class="page-card">
                <div class="section-head">
                    <div>
                        <p class="section-kicker">{{ t('System') }}</p>
                        <h3>{{ t('Sync and capacity') }}</h3>
                    </div>
                </div>
                <div class="info-grid info-grid--dashboard">
                    <div><span>{{ t('Version') }}</span><strong>{{ state.systemInfo?.app_version || t('Not recorded') }}</strong></div>
                    <div><span>{{ t('Mailbox limit') }}</span><strong>{{ state.user?.max_mailboxes || 0 }}</strong></div>
                    <div><span>{{ t('Connected') }}</span><strong>{{ state.mailboxes.length }}</strong></div>
                    <div><span>{{ t('Total unread') }}</span><strong>{{ state.systemStats?.stats?.unread_emails || aggregateStats.unread || 0 }}</strong></div>
                </div>
                <div class="quota-bar"><span :style="{ width: mailboxUsagePercent + '%' }"></span></div>
                <p class="muted-copy">{{ t('Mailbox quota usage is {percent}%. Increase limits from system policy if the team needs more capacity.', { percent: mailboxUsagePercent }) }}</p>
            </article>

            <article class="page-card">
                <div class="section-head">
                    <div>
                        <p class="section-kicker">{{ t('Recommended Next Steps') }}</p>
                        <h3>{{ t("Today's priorities") }}</h3>
                    </div>
                </div>
                <div class="agenda-list agenda-list--soft">
                    <div class="agenda-item">
                        <strong>{{ t('1. Triage unread messages') }}</strong>
                        <p>{{ t('Start from the unified queue to understand volume before diving into a single mailbox.') }}</p>
                    </div>
                    <div class="agenda-item">
                        <strong>{{ t('2. Resolve sync alerts') }}</strong>
                        <p>{{ t('Fix broken mailbox connections early to avoid blind spots in the message stream.') }}</p>
                    </div>
                    <div class="agenda-item">
                        <strong>{{ t('3. Expand automation') }}</strong>
                        <p>{{ t('Turn repetitive notification flows into rules so the inbox stays manageable.') }}</p>
                    </div>
                </div>
            </article>

            <article v-if="isAdmin" class="page-card">
                <div class="section-head">
                    <div>
                        <p class="section-kicker">{{ t('Admin View') }}</p>
                        <h3>{{ t('System scale') }}</h3>
                    </div>
                    <el-button text @click="openView('admin')">{{ t('Open system policy') }}</el-button>
                </div>
                <div class="info-grid info-grid--dashboard">
                    <div><span>{{ t('Users') }}</span><strong>{{ state.adminStats?.total_users || 0 }}</strong></div>
                    <div><span>{{ t('Mailboxes') }}</span><strong>{{ state.adminStats?.total_mailboxes || 0 }}</strong></div>
                    <div><span>{{ t('Messages') }}</span><strong>{{ state.adminStats?.total_emails || 0 }}</strong></div>
                    <div><span>{{ t('Today') }}</span><strong>{{ state.adminStats?.today_emails || 0 }}</strong></div>
                </div>
            </article>
        </section>
    </section>
    `,
    setup() {
        const store = useJmailStore();
        const summaryCards = computed(() => [
            { label: 'Unread backlog', value: `${store.aggregateStats.value.unread || 0}`, copy: 'Use the unified queue to understand how much work is waiting across all accounts.' },
            { label: 'Flagged threads', value: store.aggregateStats.value.flagged || 0, copy: 'Keep high-value conversations visible and protected from daily inbox noise.' },
            { label: 'Mailbox alerts', value: `${store.aggregateStats.value.errors || 0}`, copy: 'Sync failures affect visibility and should be addressed before routine mail handling.' },
            { label: 'Automation rules', value: `${store.activeRuleCount.value || 0}`, copy: 'Rules help remove repetitive notifications from the manual workflow.' },
        ]);
        return { ...store, summaryCards };
    },
};

export const AccountsView = {
    template: `
    <section class="page-shell page-shell--accounts">
        <section v-if="state.providerCatalog.length" class="quick-provider-grid">
            <button type="button" class="quick-provider" v-for="provider in state.providerCatalog.slice(0, 4)" :key="provider.id" @click="startMailboxOnboarding(provider)">
                <span>{{ provider.recommended_auth_mode === 'oauth' ? t('OAuth first') : t('Manual setup') }}</span>
                <strong>{{ provider.label }}</strong>
            </button>
        </section>

        <section class="page-card">
            <div class="section-head">
                <div>
                    <p class="section-kicker">{{ t('Connected Accounts') }}</p>
                    <h3>{{ t('Mailbox list') }}</h3>
                </div>
                <el-button text @click="openView('inbox')">{{ t('Back to mail center') }}</el-button>
            </div>
            <div class="resource-table">
                <article class="resource-row" v-for="mailbox in state.mailboxes" :key="mailbox.id">
                    <div class="resource-row__main">
                        <strong>{{ mailbox.name || mailbox.email }}</strong>
                        <p>{{ mailbox.email }}</p>
                    </div>
                    <div class="resource-row__stats">
                        <span>{{ t('Unread') }} {{ getMailboxStats(mailbox.id).unread || 0 }}</span>
                        <span>{{ t('Total') }} {{ getMailboxStats(mailbox.id).total || 0 }}</span>
                        <span>{{ t('Auth mode') }} {{ mailboxAuthLabel(mailbox) }}</span>
                        <span>{{ t('Last sync') }} {{ describeLastFetch(mailbox) }}</span>
                    </div>
                    <div class="resource-row__actions">
                        <span class="status-pill" :data-tone="mailboxStatusTone(mailbox.status)">{{ mailboxStatusLabel(mailbox.status) }}</span>
                        <el-button @click="openMailboxInbox(mailbox)">{{ t('Open mailbox') }}</el-button>
                        <el-button @click="syncMailbox(mailbox)" :loading="state.syncing">{{ t('Sync now') }}</el-button>
                        <el-button @click="openMailboxDrawer('edit', mailbox)">{{ t('Edit') }}</el-button>
                        <el-button type="danger" plain @click="deleteMailbox(mailbox)">{{ t('Delete') }}</el-button>
                    </div>
                </article>
                <div v-if="!state.mailboxes.length" class="empty-panel empty-panel--dashboard">
                    <div class="empty-panel__icon">MB</div>
                    <h3>{{ t('No mailbox connected yet') }}</h3>
                    <p>{{ t('Choose a provider template or start with manual IMAP / SMTP settings.') }}</p>
                </div>
            </div>
        </section>
    </section>
    `,
    setup() {
        return { ...useJmailStore() };
    },
};

export const AdminView = {
    template: `
    <section class="page-shell page-shell--admin">
        <section class="page-grid page-grid--admin-studio">
            <article class="page-card page-card--form">
                <div class="section-head">
                    <div>
                        <p class="section-kicker">{{ t('Policy') }}</p>
                        <h3>{{ t('System defaults') }}</h3>
                    </div>
                </div>
                <div class="form-stack form-stack--narrow">
                    <label class="field-label field-label--inline"><span>{{ t('Allow registration') }}</span><el-switch v-model="state.adminSettings.allow_registration" /></label>
                    <label class="field-label"><span>{{ t('Default mailbox limit') }}</span><el-input-number v-model="state.adminSettings.default_max_mailboxes_per_user" :min="1" :max="50" /></label>
                    <label class="field-label"><span>{{ t('Default sync interval (sec)') }}</span><el-input-number v-model="state.adminSettings.default_fetch_interval" :min="60" :max="3600" :step="60" /></label>
                    <label class="field-label"><span>{{ t('Max messages per user') }}</span><el-input-number v-model="state.adminSettings.max_emails_per_user" :min="100" :max="10000" :step="100" /></label>
                    <el-button type="primary" :loading="state.adminSaving" @click="submitAdminSettings()">{{ t('Save settings') }}</el-button>
                </div>
            </article>

            <div class="page-stack">
                <article class="page-card">
                    <div class="section-head">
                        <div>
                            <p class="section-kicker">{{ t('Admin View') }}</p>
                            <h3>{{ t('System scale') }}</h3>
                        </div>
                    </div>
                    <div class="info-grid info-grid--dashboard">
                        <div><span>{{ t('Users') }}</span><strong>{{ state.adminStats?.total_users || 0 }}</strong></div>
                        <div><span>{{ t('Mailboxes') }}</span><strong>{{ state.adminStats?.total_mailboxes || 0 }}</strong></div>
                        <div><span>{{ t('Messages') }}</span><strong>{{ state.adminStats?.total_emails || 0 }}</strong></div>
                        <div><span>{{ t('Today') }}</span><strong>{{ state.adminStats?.today_emails || 0 }}</strong></div>
                    </div>
                </article>

                <article class="page-card">
                    <div class="section-head">
                        <div>
                            <p class="section-kicker">{{ t('Recent Users') }}</p>
                            <h3>{{ t('Activity snapshot') }}</h3>
                        </div>
                        <el-button text @click="openView('users')">{{ t('Open user management') }}</el-button>
                    </div>
                    <div class="line-list line-list--soft">
                        <div class="line-item" v-for="user in state.adminStats?.recent_users || []" :key="user.id">
                            <div class="line-item__copy"><strong>{{ user.full_name || user.username }}</strong><p>{{ user.email }}</p></div>
                            <div class="line-item__meta"><span>{{ userRoleLabel(user.role) }}</span><b>{{ userStatusLabel(user.status) }}</b></div>
                        </div>
                    </div>
                </article>
            </div>
        </section>
    </section>
    `,
    setup() {
        return { ...useJmailStore() };
    },
};

export const UsersView = {
    template: `
    <section class="page-shell page-shell--users">
        <section class="page-card">
            <div class="section-head">
                <div>
                    <p class="section-kicker">{{ t('Users') }}</p>
                    <h3>{{ t('Manage profiles, mailbox limits and recovery actions from one screen.') }}</h3>
                </div>
                <el-button text @click="loadAdminUsers(true)">{{ t('Refresh list') }}</el-button>
            </div>
            <div class="resource-table">
                <article class="resource-row" v-for="user in state.adminUsers" :key="user.id">
                    <div class="resource-row__main"><strong>{{ user.full_name || user.username }}</strong><p>{{ user.email }}</p></div>
                    <div class="resource-row__stats"><span>{{ t('Role') }} {{ userRoleLabel(user.role) }}</span><span>{{ t('Mailbox limit') }} {{ user.max_mailboxes }}</span><span>{{ t('Created') }} {{ formatDateTime(user.created_at) }}</span><span>{{ t('Status') }} {{ userStatusLabel(user.status) }}</span></div>
                    <div class="resource-row__actions"><span class="status-pill" :data-tone="user.status === 'active' ? 'success' : 'muted'">{{ userStatusLabel(user.status) }}</span><el-button @click="generateRecoveryCode(user)">{{ t('Recovery code') }}</el-button><el-button @click="resetUserPassword(user)">{{ t('Reset password') }}</el-button><el-button type="danger" plain @click="deleteUser(user)">{{ t('Delete') }}</el-button></div>
                </article>
            </div>
        </section>
    </section>
    `,
    setup() {
        return { ...useJmailStore() };
    },
};

export const ProfileView = {
    template: `
    <section class="page-shell page-shell--profile">
        <section class="page-grid page-grid--profile-studio">
            <article class="page-card page-card--form">
                <div class="section-head"><div><p class="section-kicker">{{ t('Profile') }}</p><h3>{{ t('Display information') }}</h3></div></div>
                <div class="form-stack form-stack--narrow">
                    <label class="field-label"><span>{{ t('Email') }}</span><el-input :model-value="state.user?.email || ''" disabled /></label>
                    <label class="field-label"><span>{{ t('Username') }}</span><el-input :model-value="state.user?.username || ''" disabled /></label>
                    <label class="field-label"><span>{{ t('Display name') }}</span><el-input v-model="state.profileForm.full_name" :placeholder="t('Display name')" /></label>
                    <el-button type="primary" :loading="state.profileSaving" @click="submitProfile()">{{ t('Save profile') }}</el-button>
                </div>
            </article>
            <article class="page-card page-card--form">
                <div class="section-head"><div><p class="section-kicker">{{ t('Security') }}</p><h3>{{ t('Change password') }}</h3></div></div>
                <div class="form-stack form-stack--narrow">
                    <label class="field-label"><span>{{ t('Current password') }}</span><el-input v-model="state.passwordForm.current_password" type="password" show-password /></label>
                    <label class="field-label"><span>{{ t('New password') }}</span><el-input v-model="state.passwordForm.new_password" type="password" show-password /></label>
                    <label class="field-label"><span>{{ t('Confirm new password') }}</span><el-input v-model="state.passwordForm.confirm_password" type="password" show-password /></label>
                    <el-button type="primary" :loading="state.passwordSaving" @click="submitPassword()">{{ t('Update password') }}</el-button>
                </div>
            </article>
        </section>
    </section>
    `,
    setup() {
        return { ...useJmailStore() };
    },
};