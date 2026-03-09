import { useJmailStore } from '../store.js';
import { InboxView } from '../views/inbox.js';
import { AccountsView, AdminView, OverviewView, ProfileView, UsersView } from '../views/dashboard.js';

const { onBeforeUnmount, onMounted } = window.Vue;

const BootScreen = {
    template: `
    <section class="boot-screen">
        <div class="boot-card glass-panel">
            <div class="brand-mark brand-mark--boot">J</div>
            <p class="section-kicker">JMail</p>
            <h1>{{ t('Preparing workspace') }}</h1>
            <p>{{ t('Accounts, mailboxes and system status are being synchronized.') }}</p>
            <div class="boot-pulse"></div>
        </div>
    </section>
    `,
    setup() {
        return { ...useJmailStore() };
    },
};

const AuthShell = {
    template: `
    <section class="auth-shell">
        <aside class="auth-side auth-side--intro">
            <div class="auth-side__hero glass-panel">
                <button type="button" class="brand-cluster brand-cluster--sidebar" @click="handleBrandGesture">
                    <div class="brand-mark">J</div>
                    <div>
                        <p class="section-kicker">JMail</p>
                        <h1>{{ t('Multi-mail workspace for business operations') }}</h1>
                    </div>
                </button>
                <p class="auth-side__intro">{{ t('The interface focuses on unified processing, account governance and stable onboarding. Decoration is reduced so operational data stays obvious.') }}</p>
                <div class="auth-side__list">
                    <article class="auth-side__item" v-for="pillar in OVERVIEW_PILLARS" :key="pillar.title">
                        <p class="section-kicker">{{ t(pillar.title) }}</p>
                        <h3>{{ t(pillar.copy) }}</h3>
                    </article>
                </div>
            </div>

            <div class="auth-side__metrics">
                <article class="auth-side__metric glass-subpanel">
                    <span>{{ t('Unified mail intake') }}</span>
                    <strong>{{ t('Mail Center') }}</strong>
                    <p>{{ t('Review overall load first, then move into a specific mailbox when necessary.') }}</p>
                </article>
                <article class="auth-side__metric glass-subpanel">
                    <span>{{ t('Standard onboarding') }}</span>
                    <strong>OAuth / IMAP</strong>
                    <p>{{ t('Support provider templates, enterprise mailboxes and custom connection settings.') }}</p>
                </article>
                <article class="auth-side__metric glass-subpanel">
                    <span>{{ t('Operational visibility') }}</span>
                    <strong>{{ t('Stats') }}</strong>
                    <p>{{ t('Unread load, sync alerts, quotas and rules stay visible at all times.') }}</p>
                </article>
            </div>
        </aside>

        <section class="auth-panel glass-panel">
            <div class="auth-panel__head">
                <div>
                    <p class="section-kicker">{{ t('Account Access') }}</p>
                    <h2>{{ state.authMode === 'register' ? t('Create account') : state.authMode === 'reset' ? t('Reset password') : t('Sign in to workspace') }}</h2>
                    <p class="muted-copy">{{ t('Sign in with email or username. Administrators can also create and manage additional accounts after initial deployment.') }}</p>
                </div>
                <div class="auth-panel__toolbar">
                    <div class="mode-switch mode-switch--locale">
                        <button v-for="option in LOCALE_OPTIONS" :key="option.value" type="button" :class="{ 'is-active': state.locale === option.value }" @click="setLocale(option.value)">{{ option.label }}</button>
                    </div>
                    <div class="mode-switch">
                        <button type="button" :class="{ 'is-active': state.authMode === 'login' }" @click="state.authMode = 'login'">{{ t('Sign in') }}</button>
                        <button type="button" :class="{ 'is-active': state.authMode === 'register' }" @click="state.authMode = 'register'">{{ t('Register') }}</button>
                        <button type="button" :class="{ 'is-active': state.authMode === 'reset' }" @click="state.authMode = 'reset'">{{ t('Reset') }}</button>
                    </div>
                </div>
            </div>

            <form v-if="state.authMode === 'login'" class="auth-form" @submit.prevent="submitLogin">
                <div class="form-intro">
                    <p>{{ t('Enter account credentials to continue to the mail workspace.') }}</p>
                </div>
                <label class="field-label">
                    <span>{{ t('Email address or username') }}</span>
                    <el-input v-model="state.authForms.login.username" :placeholder="t('name@example.com / username')" />
                </label>
                <label class="field-label">
                    <span>{{ t('Password') }}</span>
                    <el-input v-model="state.authForms.login.password" type="password" show-password :placeholder="t('Enter password')" />
                </label>
                <div class="inline-check">
                    <el-checkbox v-model="state.authForms.login.remember_me">{{ t('Keep me signed in') }}</el-checkbox>
                    <button type="button" class="text-button" @click="state.authMode = 'reset'">{{ t('Forgot password') }}</button>
                </div>
                <el-button class="auth-submit" type="primary" native-type="submit" :loading="state.authSubmitting">{{ t('Sign in') }}</el-button>
            </form>

            <form v-else-if="state.authMode === 'register'" class="auth-form" @submit.prevent="submitRegister">
                <div class="form-intro">
                    <p>{{ t('Create an account before connecting IMAP or SMTP mailboxes.') }}</p>
                </div>
                <label class="field-label">
                    <span>{{ t('Username') }}</span>
                    <el-input v-model="state.authForms.register.username" :placeholder="t('Username')" />
                </label>
                <label class="field-label">
                    <span>{{ t('Email') }}</span>
                    <el-input v-model="state.authForms.register.email" placeholder="name@example.com" />
                </label>
                <label class="field-label">
                    <span>{{ t('Display name') }}</span>
                    <el-input v-model="state.authForms.register.full_name" :placeholder="t('Optional')" />
                </label>
                <div class="field-grid field-grid--compact">
                    <label class="field-label">
                        <span>{{ t('Password') }}</span>
                        <el-input v-model="state.authForms.register.password" type="password" show-password />
                    </label>
                    <label class="field-label">
                        <span>{{ t('Confirm password') }}</span>
                        <el-input v-model="state.authForms.register.confirm_password" type="password" show-password />
                    </label>
                </div>
                <el-button class="auth-submit" type="primary" native-type="submit" :loading="state.authSubmitting">{{ t('Create account') }}</el-button>
            </form>

            <form v-else class="auth-form" @submit.prevent="submitResetPassword">
                <div class="form-intro">
                    <p>{{ t('Use the recovery code to set a new password and return to the workspace.') }}</p>
                </div>
                <label class="field-label">
                    <span>{{ t('Email') }}</span>
                    <el-input v-model="state.authForms.reset.email" placeholder="name@example.com" />
                </label>
                <label class="field-label">
                    <span>{{ t('Recovery code') }}</span>
                    <el-input v-model="state.authForms.reset.recovery_code" :placeholder="t('8-digit recovery code')" />
                </label>
                <label class="field-label">
                    <span>{{ t('New password') }}</span>
                    <el-input v-model="state.authForms.reset.new_password" type="password" show-password />
                </label>
                <el-button class="auth-submit" type="primary" native-type="submit" :loading="state.authSubmitting">{{ t('Update password') }}</el-button>
            </form>
        </section>
    </section>
    `,
    setup() {
        return { ...useJmailStore() };
    },
};
const WorkspaceShell = {
    components: {
        OverviewView,
        InboxView,
        AccountsView,
        AdminView,
        UsersView,
        ProfileView,
    },
    template: `
    <section class="workspace-shell">
        <button v-if="state.isMobile && state.mobileNavOpen" type="button" class="mobile-scrim" @click="state.mobileNavOpen = false"></button>

        <aside class="workspace-sidebar" :class="{ 'is-open': state.mobileNavOpen }">
            <div class="sidebar-head sidebar-head--stacked">
                <button type="button" class="brand-cluster brand-cluster--sidebar" @click="handleBrandGesture">
                    <div class="brand-mark">J</div>
                    <div>
                        <p class="section-kicker">{{ state.systemInfo?.app_name || 'JMail' }}</p>
                        <h2>{{ state.systemInfo?.app_version || t('Business Mail') }}</h2>
                    </div>
                </button>
                <div class="sidebar-head__actions">
                    <div class="mode-switch mode-switch--locale mode-switch--sidebar">
                        <button v-for="option in LOCALE_OPTIONS" :key="option.value" type="button" :class="{ 'is-active': state.locale === option.value }" @click="setLocale(option.value)">{{ option.label }}</button>
                    </div>
                    <button v-if="state.isMobile" type="button" class="sidebar-close" @click="state.mobileNavOpen = false">{{ t('Close') }}</button>
                </div>
            </div>

            <article class="sidebar-panel glass-subpanel sidebar-panel--identity">
                <div>
                    <p class="section-kicker">{{ t('Current User') }}</p>
                    <h3>{{ userDisplayName }}</h3>
                    <p class="muted-copy">{{ state.user?.email || t('Not signed in') }}</p>
                </div>
                <div class="sidebar-card__stats sidebar-card__stats--compact">
                    <div>
                        <span>{{ t('Unread') }}</span>
                        <strong>{{ aggregateStats.unread || 0 }}</strong>
                    </div>
                    <div>
                        <span>{{ t('Mailboxes') }}</span>
                        <strong>{{ state.mailboxes.length }}</strong>
                    </div>
                    <div>
                        <span>{{ t('Rules') }}</span>
                        <strong>{{ activeRuleCount || 0 }}</strong>
                    </div>
                    <div>
                        <span>{{ t('Alerts') }}</span>
                        <strong>{{ aggregateStats.errors || 0 }}</strong>
                    </div>
                </div>
            </article>

            <div class="nav-group nav-group--compact">
                <p class="nav-group__title">{{ t('Core') }}</p>
                <button v-for="item in PRIMARY_NAV" :key="item.key" type="button" class="nav-button nav-button--compact" :class="{ 'is-active': state.currentView === item.key }" @click="openView(item.key)">
                    <span class="nav-button__marker"></span>
                    <div class="nav-button__meta">
                        <strong>{{ t(item.label) }}</strong>
                    </div>
                </button>
            </div>

            <div class="nav-group nav-group--compact">
                <p class="nav-group__title">{{ t('Personal') }}</p>
                <button v-for="item in SECONDARY_NAV" :key="item.key" type="button" class="nav-button nav-button--compact" :class="{ 'is-active': state.currentView === item.key }" @click="openView(item.key)">
                    <span class="nav-button__marker"></span>
                    <div class="nav-button__meta">
                        <strong>{{ t(item.label) }}</strong>
                    </div>
                </button>
            </div>

            <div v-if="isAdmin" class="nav-group nav-group--compact">
                <p class="nav-group__title">{{ t('Administration') }}</p>
                <button v-for="item in ADMIN_NAV" :key="item.key" type="button" class="nav-button nav-button--compact" :class="{ 'is-active': state.currentView === item.key }" @click="openView(item.key)">
                    <span class="nav-button__marker"></span>
                    <div class="nav-button__meta">
                        <strong>{{ t(item.label) }}</strong>
                    </div>
                </button>
            </div>

            <article class="sidebar-panel glass-subpanel sidebar-panel--quota">
                <div class="sidebar-panel__head">
                    <div>
                        <p class="section-kicker">{{ t('Capacity') }}</p>
                        <h3>{{ state.mailboxes.length }} / {{ state.user?.max_mailboxes || 0 }}</h3>
                    </div>
                    <span class="status-pill" data-tone="info">{{ t('Quota') }}</span>
                </div>
                <div class="quota-bar quota-bar--compact">
                    <span :style="{ width: mailboxUsagePercent + '%' }"></span>
                </div>
                <p class="muted-copy">{{ t('Mailbox quota usage is currently {percent}%.', { percent: mailboxUsagePercent }) }}</p>
            </article>

            <div class="sidebar-footer sidebar-footer--stacked">
                <button type="button" class="ghost-button" @click="refreshCurrentView()">{{ t('Refresh data') }}</button>
                <button type="button" class="ghost-button ghost-button--danger" @click="logout()">{{ t('Sign out') }}</button>
            </div>
        </aside>

        <div class="workspace-main">
            <header class="workspace-topbar workspace-topbar--flat">
                <div class="workspace-topbar__lead">
                    <button v-if="state.isMobile" type="button" class="menu-button" @click="state.mobileNavOpen = true">{{ t('Menu') }}</button>
                    <div>
                        <p class="section-kicker">{{ t(currentViewMeta.kicker) }}</p>
                        <h1>{{ state.currentView === 'inbox' ? currentScopeLabel : t(currentViewMeta.title) }}</h1>
                        <p>{{ state.currentView === 'inbox' ? currentScopeDescription : t(currentViewMeta.description) }}</p>
                    </div>
                </div>
                <div class="workspace-topbar__metrics workspace-topbar__metrics--flat">
                    <article class="topbar-stat topbar-stat--flat" v-for="item in heroStats" :key="item.label">
                        <span>{{ t(item.label) }}</span>
                        <strong>{{ item.value }}</strong>
                        <small>{{ t(item.hint) }}</small>
                    </article>
                </div>
                <div class="workspace-topbar__actions">
                    <el-button @click="refreshCurrentView()" :loading="state.refreshing">{{ t('Refresh') }}</el-button>
                    <el-button type="primary" @click="openCompose()">{{ t('Compose') }}</el-button>
                    <button type="button" class="avatar-button" @click="openView('profile')">
                        <span>{{ userInitial }}</span>
                    </button>
                </div>
            </header>

            <main class="workspace-stage workspace-stage--flat">
                <OverviewView v-if="state.currentView === 'overview'" />
                <InboxView v-else-if="state.currentView === 'inbox'" />
                <AccountsView v-else-if="state.currentView === 'accounts'" />
                <AdminView v-else-if="state.currentView === 'admin'" />
                <UsersView v-else-if="state.currentView === 'users'" />
                <ProfileView v-else />
            </main>
        </div>

        <button v-if="state.isMobile" type="button" class="floating-compose" @click="openCompose()">{{ t('New') }}</button>

        <nav v-if="state.isMobile" class="mobile-dock">
            <button v-for="item in MOBILE_DOCK" :key="item.key" type="button" class="mobile-dock__item" :class="{ 'is-active': state.currentView === item.key }" @click="openView(item.key)">
                <span>{{ t(item.label) }}</span>
            </button>
            <button type="button" class="mobile-dock__item" @click="state.mobileNavOpen = true">
                <span>{{ t('More') }}</span>
            </button>
        </nav>
    </section>
    `,
    setup() {
        return { ...useJmailStore() };
    },
};
const OverlayDrawers = {
    template: `
    <div>
        <el-drawer
            v-model="state.composeOpen"
            :direction="state.isMobile ? 'btt' : 'rtl'"
            :size="state.isMobile ? '94%' : '560px'"
            class="utility-drawer"
            :title="state.composeMode === 'reply' ? 'Reply Email' : 'Compose Email'"
        >
            <div class="drawer-form drawer-form--compose">
                <section class="drawer-section drawer-section--compact">
                    <div class="drawer-section__head">
                        <div>
                            <p class="section-kicker">Message</p>
                            <h3>{{ state.composeMode === 'reply' ? 'Reply draft' : 'New message' }}</h3>
                        </div>
                        <div class="drawer-summary">
                            <div class="drawer-summary__item">
                                <span>Mailboxes</span>
                                <strong>{{ state.mailboxes.length }}</strong>
                            </div>
                            <div class="drawer-summary__item">
                                <span>Attachments</span>
                                <strong>{{ state.composeForm.attachments.length }}</strong>
                            </div>
                        </div>
                    </div>
                    <label class="field-label">
                        <span>From mailbox</span>
                        <el-select v-model="state.composeForm.mailbox_id" placeholder="Select mailbox">
                            <el-option v-for="mailbox in state.mailboxes" :key="mailbox.id" :value="mailbox.id" :label="mailboxOptionLabel(mailbox)" />
                        </el-select>
                    </label>
                    <label class="field-label">
                        <span>To</span>
                        <el-input v-model="state.composeForm.to" placeholder="Separate multiple addresses with commas" />
                    </label>
                    <div class="field-grid field-grid--compact">
                        <label class="field-label">
                            <span>CC</span>
                            <el-input v-model="state.composeForm.cc" placeholder="Optional" />
                        </label>
                        <label class="field-label">
                            <span>BCC</span>
                            <el-input v-model="state.composeForm.bcc" placeholder="Optional" />
                        </label>
                    </div>
                    <label class="field-label">
                        <span>Subject</span>
                        <el-input v-model="state.composeForm.subject" placeholder="Enter message subject" />
                    </label>
                </section>

                <section class="drawer-section">
                    <div class="drawer-section__head">
                        <div>
                            <p class="section-kicker">Body</p>
                            <h3>Content editor</h3>
                        </div>
                        <label class="field-label field-label--inline">
                            <span>Send as HTML</span>
                            <el-switch v-model="state.composeForm.is_html" />
                        </label>
                    </div>
                    <label class="field-label">
                        <span>Message</span>
                        <el-input v-model="state.composeForm.body" type="textarea" :rows="state.isMobile ? 10 : 14" resize="vertical" placeholder="Start writing" />
                    </label>
                </section>

                <section class="drawer-section">
                    <div class="drawer-section__head">
                        <div>
                            <p class="section-kicker">Attachments</p>
                            <h3>Supporting files</h3>
                        </div>
                        <el-button @click="triggerComposeFilePicker()">Add attachment</el-button>
                    </div>
                    <input :ref="bindComposeFileInput" class="file-input" type="file" multiple @change="handleComposeFiles" />
                    <div v-if="state.composeForm.attachments.length" class="attachment-strip">
                        <button type="button" class="attachment-chip attachment-chip--removable" v-for="attachment in state.composeForm.attachments" :key="attachment.id" @click="removeComposeAttachment(attachment.id)">
                            <strong>{{ attachment.filename }}</strong>
                            <span>{{ formatFileSize(attachment.size) }}</span>
                        </button>
                    </div>
                    <div v-else class="empty-inline empty-inline--soft">No attachments yet.</div>
                </section>

                <div class="drawer-actions">
                    <el-button @click="state.composeOpen = false">Cancel</el-button>
                    <el-button type="primary" :loading="state.composeSending" @click="submitCompose()">Send email</el-button>
                </div>
            </div>
        </el-drawer>

        <el-drawer
            v-model="state.mailboxDrawerOpen"
            :direction="state.isMobile ? 'btt' : 'rtl'"
            :size="state.isMobile ? '96%' : '680px'"
            class="utility-drawer"
            :title="state.mailboxFormMode === 'edit' ? 'Mailbox Settings' : 'Add Mailbox'"
        >
            <div class="drawer-form drawer-form--wide">
                <section class="drawer-section">
                    <div class="drawer-section__head">
                        <div>
                            <p class="section-kicker">Identity</p>
                            <h3>Mailbox profile</h3>
                        </div>
                        <p class="field-hint">Choose a provider template before deciding on OAuth or manual settings.</p>
                    </div>
                    <div class="field-grid">
                        <label class="field-label">
                            <span>Email address</span>
                            <el-input v-model="state.mailboxForm.email" placeholder="name@example.com" @input="handleMailboxEmailInput" />
                        </label>
                        <label class="field-label">
                            <span>Display name</span>
                            <el-input v-model="state.mailboxForm.name" placeholder="Example: Work mailbox" />
                        </label>
                    </div>
                    <label class="field-label">
                        <span>Provider template</span>
                        <el-select v-model="state.mailboxForm.provider_template" filterable placeholder="Auto-detect or choose manually" @change="handleProviderTemplateChange()">
                            <el-option v-for="provider in state.providerCatalog" :key="provider.id" :value="provider.id" :label="provider.label" />
                        </el-select>
                    </label>
                </section>

                <article v-if="activeProvider" class="glass-subpanel provider-spotlight">
                    <div>
                        <p class="section-kicker">Suggested method</p>
                        <h3>{{ activeProvider.label }}</h3>
                        <p>{{ activeProvider.description }}</p>
                    </div>
                    <div class="action-row action-row--wrap">
                        <el-button @click="applyCurrentProviderDefaults()">Apply template</el-button>
                        <el-button v-if="activeProvider.oauth?.web_auth_available" type="primary" @click="startProviderOAuth()">{{ activeProvider.oauth.label }}</el-button>
                    </div>
                    <p v-if="state.oauthStatus" class="muted-copy">{{ state.oauthStatus }}</p>
                </article>
                <section class="drawer-section drawer-section--compact">
                    <div class="drawer-section__head">
                        <div>
                            <p class="section-kicker">Sync & Auth</p>
                            <h3>Connection strategy</h3>
                        </div>
                    </div>
                    <div class="drawer-grid drawer-grid--two">
                        <label class="field-label field-label--inline">
                            <span>Prefer OAuth</span>
                            <el-switch v-model="state.mailboxForm.use_oauth" />
                        </label>
                        <label class="field-label">
                            <span>Sync interval (sec)</span>
                            <el-input-number v-model="state.mailboxForm.fetch_interval" :min="60" :max="3600" :step="60" />
                        </label>
                    </div>
                    <div class="drawer-grid drawer-grid--three">
                        <label class="field-label field-label--inline">
                            <span>IMAP SSL</span>
                            <el-switch v-model="state.mailboxForm.imap_use_ssl" />
                        </label>
                        <label class="field-label field-label--inline">
                            <span>SMTP SSL</span>
                            <el-switch v-model="state.mailboxForm.smtp_use_ssl" />
                        </label>
                        <label class="field-label field-label--inline">
                            <span>SMTP TLS</span>
                            <el-switch v-model="state.mailboxForm.smtp_use_tls" />
                        </label>
                    </div>
                </section>

                <section class="drawer-section">
                    <div class="drawer-section__head">
                        <div>
                            <p class="section-kicker">IMAP</p>
                            <h3>Incoming mail settings</h3>
                        </div>
                    </div>
                    <div class="field-grid">
                        <label class="field-label">
                            <span>IMAP server</span>
                            <el-input v-model="state.mailboxForm.imap_server" />
                        </label>
                        <label class="field-label">
                            <span>IMAP port</span>
                            <el-input-number v-model="state.mailboxForm.imap_port" :min="1" :max="65535" />
                        </label>
                        <label class="field-label">
                            <span>IMAP username</span>
                            <el-input v-model="state.mailboxForm.imap_username" />
                        </label>
                        <label class="field-label">
                            <span>IMAP password</span>
                            <el-input v-model="state.mailboxForm.imap_password" type="password" show-password :disabled="state.mailboxForm.use_oauth" placeholder="Leave blank for OAuth" />
                        </label>
                    </div>
                </section>

                <section class="drawer-section">
                    <div class="drawer-section__head">
                        <div>
                            <p class="section-kicker">SMTP</p>
                            <h3>Outgoing mail settings</h3>
                        </div>
                    </div>
                    <div class="field-grid">
                        <label class="field-label">
                            <span>SMTP server</span>
                            <el-input v-model="state.mailboxForm.smtp_server" />
                        </label>
                        <label class="field-label">
                            <span>SMTP port</span>
                            <el-input-number v-model="state.mailboxForm.smtp_port" :min="1" :max="65535" />
                        </label>
                        <label class="field-label">
                            <span>SMTP username</span>
                            <el-input v-model="state.mailboxForm.smtp_username" />
                        </label>
                        <label class="field-label">
                            <span>SMTP password</span>
                            <el-input v-model="state.mailboxForm.smtp_password" type="password" show-password :disabled="state.mailboxForm.use_oauth" placeholder="Leave blank for OAuth" />
                        </label>
                    </div>
                </section>

                <div class="drawer-actions">
                    <el-button @click="state.mailboxDrawerOpen = false">Cancel</el-button>
                    <el-button type="primary" :loading="state.mailboxSaving" @click="submitMailboxForm()">{{ state.mailboxFormMode === 'edit' ? 'Save settings' : 'Create mailbox' }}</el-button>
                </div>
            </div>
        </el-drawer>

        <el-drawer
            v-model="state.createUserDrawerOpen"
            :direction="state.isMobile ? 'btt' : 'rtl'"
            :size="state.isMobile ? '88%' : '460px'"
            class="utility-drawer"
            title="Create User"
        >
            <div class="drawer-form">
                <section class="drawer-section drawer-section--compact">
                    <div class="drawer-section__head">
                        <div>
                            <p class="section-kicker">Account</p>
                            <h3>Basic profile</h3>
                        </div>
                    </div>
                    <label class="field-label">
                        <span>Username</span>
                        <el-input v-model="state.createUserForm.username" />
                    </label>
                    <label class="field-label">
                        <span>Email</span>
                        <el-input v-model="state.createUserForm.email" />
                    </label>
                    <label class="field-label">
                        <span>Display name</span>
                        <el-input v-model="state.createUserForm.full_name" />
                    </label>
                    <label class="field-label">
                        <span>Initial password</span>
                        <el-input v-model="state.createUserForm.password" type="password" show-password />
                    </label>
                </section>

                <section class="drawer-section drawer-section--compact">
                    <div class="drawer-section__head">
                        <div>
                            <p class="section-kicker">Quota</p>
                            <h3>Mailbox limit</h3>
                        </div>
                        <div class="drawer-summary drawer-summary--single">
                            <div class="drawer-summary__item">
                                <span>Current value</span>
                                <strong>{{ state.createUserForm.max_mailboxes }}</strong>
                            </div>
                        </div>
                    </div>
                    <label class="field-label">
                        <span>Mailbox limit</span>
                        <el-input-number v-model="state.createUserForm.max_mailboxes" :min="1" :max="50" />
                    </label>
                </section>

                <div class="drawer-actions">
                    <el-button @click="state.createUserDrawerOpen = false">Cancel</el-button>
                    <el-button type="primary" :loading="state.userCreating" @click="submitCreateUser()">Create user</el-button>
                </div>
            </div>
        </el-drawer>

        <el-drawer
            v-if="state.isMobile"
            v-model="state.mobileDebugOpen"
            direction="btt"
            size="82%"
            class="utility-drawer utility-drawer--debug"
            title="Runtime Info"
        >
            <div class="debug-grid">
                <article class="glass-subpanel">
                    <p class="section-kicker">Current state</p>
                    <div class="info-grid">
                        <div><span>View</span><strong>{{ state.currentView }}</strong></div>
                        <div><span>Scope</span><strong>{{ currentScopeLabel }}</strong></div>
                        <div><span>Version</span><strong>{{ state.systemInfo?.app_version || 'Unknown' }}</strong></div>
                        <div><span>User</span><strong>{{ state.user?.email || 'Anonymous' }}</strong></div>
                    </div>
                </article>
                <article class="glass-subpanel">
                    <p class="section-kicker">Keyboard</p>
                    <div class="shortcut-list">
                        <div class="shortcut-chip" v-for="shortcut in KEYBOARD_SHORTCUTS" :key="shortcut.key">
                            <strong>{{ shortcut.key }}</strong>
                            <span>{{ shortcut.label }}</span>
                        </div>
                    </div>
                </article>
                <el-button type="primary" @click="copyDebugSnapshot()">Copy state snapshot</el-button>
            </div>
        </el-drawer>
    </div>
    `,
    setup() {
        return { ...useJmailStore() };
    },
};

export const JmailRoot = {
    components: {
        BootScreen,
        AuthShell,
        WorkspaceShell,
        OverlayDrawers,
    },
    template: `
    <div class="jmail-app">
        <BootScreen v-if="state.booting" />
        <AuthShell v-else-if="!state.token || !state.user" />
        <WorkspaceShell v-else />
        <OverlayDrawers />
    </div>
    `,
    setup() {
        const store = useJmailStore();
        onMounted(() => {
            void store.init();
        });
        onBeforeUnmount(() => {
            store.destroy();
        });
        return { ...store };
    },
};

